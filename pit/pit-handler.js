const config = require('../config');
const status = require('../status');
const store = require('../store');
const fs = require('fs');
const path = require('path');
const { fatal, hex2a } = require('../utils');

const CID = 'fda210a4af51fdd2ce1d2a1c0307734ce6fef30b3eec4c04c4d7494041f2dd10';
const SHADER = path.join(__dirname, './app.wasm');
const MAX_CALL = 300;
const START_POINT = 0;
const TIMEOUT = 1000;

const LAST_REPO_HASH = "pit-repo-"
const PENDING_REPO_HASH = "pending-repo-"
const FAILED_REPO = "failed-repo-"

class PitHandler {
    constructor(api) {
        this.api = api;
        this.shader = [...fs.readFileSync(SHADER)];
        this.restartPending = config.RestartPending;
        this.callQueue = [];
        this.inPin = 0;
        this.status = { pinned: 0, pending: 0, failed: 0 }
    }

    on_connect() {
        return new Promise(resolve => {
            this.api.contract(
                `role=manager,action=view_contracts`,
                (err, res) => {
                    if (err) return fatal(err)
                    if (!res.contracts.some(el => el.cid === CID)) {
                        return fatal(`CID not found '${CID}'`)
                    } resolve()
                },
                this.shader
            )
        })
    }

    on_api_result(res) {
        return this.__on_system_state(res);
    }

    async __on_system_state(state) {
        status.SystemState = state;
        console.log(state)
        if (!state.is_in_sync || state.tip_height !== state.current_height) {
            // we're not in sync, wait
            return
        }

        if (this.restartPending) {
            console.log('Restarting pending metas');
            this.restartPending = false;

            for await (const [_, val] of store.getPending(PENDING_REPO_HASH)) {
                if (config.Debug) console.log(val);
                if (val.hash) this.__add_to_queue(val.id, val.hash);
            }
            if (this.callQueue.length) this.__start_pin();
        }

        if (!this.callQueue.length) {
            this.api.contract(
                `cid=${CID},role=user,action=all_repos`,
                (...args) => this.__on_get_repos(...args),
                this.shader
            )
        }
    }

    __pin_meta(id, ipfs_hash, git_hash) {
        this.status.pending++;

        this.api.call("ipfs_pin", { hash: ipfs_hash, timeout: TIMEOUT }, (err) => {
            this.status.pending--;
            this.inPin--;
            if (!this.inPin) setTimeout(this.__start_pin.bind(this));

            if (err) {
                store.registerFailed(FAILED_REPO, { id, hash: git_hash });
                this.status.failed++;
                this.__logger(`Failed to pin meta ${id}/${ipfs_hash}, ${JSON.stringify(err)}`);
                return
            }

            store.removePending(PENDING_REPO_HASH, id, git_hash);
            this.status.pinned++;
            this.__logger(`Meta hash ${id}/${ipfs_hash} successfully pinned`);
            return;
        });
    }


    __logger(data_to_append) {
        if (config.Debug) console.log(data_to_append);
        fs.appendFile('./log.txt', `\n${data_to_append}`, (err) => {
            if (err) console.log(err);
        });
    }

    __on_get_data(id, git_hash) {
        this.api.contract(
            `cid=${CID},role=user,action=repo_get_data,repo_id=${id},obj_id=${git_hash}`,
            (err, { object_data }) => {
                if (err) {
                    this.status.failed++;
                    store.registerFailed(FAILED_REPO, { id, hash: git_hash });
                    return this.__logger(`Failed to load repo data:\n\t${err}`);
                }
                store.registerPending(PENDING_REPO_HASH, { id, hash: git_hash });
                const ipfs_hash = hex2a(object_data);
                this.__pin_meta(id, ipfs_hash, git_hash);
            });

    }

    async __on_get_repos(err, { repos }) {
        if (err) return console.log(`Failed to load repo meta:\n\t${err}`);

        if (!repos.length) return console.log('no repos in contract');

        const lastRepoId = repos[repos.length - 1].repo_id;
        const minimizedRepos = repos.filter((el) => el.repo_id >= START_POINT)
        this.__build_queue(minimizedRepos, lastRepoId);
    }

    __on_get_meta() {
        this.api.contract(
            `cid=${CID},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            (...args) => this.__on_repo_meta(repo_id, ...args),
            this.shader
        )
    }


    async __on_repo_meta(id, err, answer) {
        if (err) {
            this.__logger(err.message);
            return;
        }

        const { objects } = answer;
        if (!objects.length) {
            if (config.Debug) console.log(`nothing to pin in repo №${id}`);
            return;
        }
        let index = objects.length - 1;

        let lastHashId;
        try {
            lastHashId = await store.getLastHash(LAST_REPO_HASH, id);
            // throw new Error();
        } catch (error) {
            // lastHashId = objects[index].object_hash;
            lastHashId = null;
        }

        if (lastHashId === objects[index].object_hash) {
            if (config.Debug) console.log(`nothing to pin in repo №${id}`);
            return;
        }

        store.setLastHash(LAST_REPO_HASH, { id, hash: objects[index].object_hash });

        while (index >= 0 && objects[index].object_hash !== lastHashId) {
            const type = objects[index].object_type & 0x80;
            if (type !== 0) {
                this.__add_to_queue(id, objects[index].object_hash, index)
            }
            index--;
        }
    }

    __start_pin() {
        const repo = this.callQueue.shift();
        if (repo) {
            if (config.Debug) console.log('=============NEXT_QUEUE=============')
            this.inPin = repo.length;
            return repo.forEach(({ id, hash }) => this.__on_get_data(id, hash));
        }
        this.__show_status();
    }

    __show_status() {
        console.log(`pending:${this.status.pending}\npinned: ${this.status.pinned}\nfailed: ${this.status.failed}`);
    }

    async __build_queue(repos, lastRepoId) {
        const { repo_id } = repos.shift();

        this.api.contract(
            `cid=${CID},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            async (...args) => {
                await this.__on_repo_meta(repo_id, ...args);
                if (repo_id === lastRepoId) return this.__start_pin();
                this.__build_queue(repos, lastRepoId)
            })
    }

    __add_to_queue(id, hash, index) {
        const { length } = this.callQueue;
        if (!length || this.callQueue[length - 1].length === MAX_CALL) {
            this.callQueue.push(new Array())
        };
        const req = { id, hash, index };
        this.callQueue[this.callQueue.length - 1].push(req);
    }

}


module.exports = PitHandler
