const config = require('./config');
const status = require('./status');
const store = require('./store');
const fs = require('fs');
const { fatal } = require('./utils');

const CID = 'fda210a4af51fdd2ce1d2a1c0307734ce6fef30b3eec4c04c4d7494041f2dd10';
const SHADER = 'app.wasm';
const MAX_CALL = 1000;

const LAST_REPO_HASH = "pit-repo-"
const PENDING_REPO_HASH = "pending-repo-"
const FAILED_REPO_PREFIX = "failed-repo-"

class PitHandler {
    constructor(api) {
        this.api = api;
        this.shader = [...fs.readFileSync(SHADER)];
        this.restartPending = config.RestartPending;
        this.callQueue = [];
        this.inPin = 0;
        this.status = { pinned: 0, failed: 0 }
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
                if (val.ipfs_hash) this.__add_to_queue(val.id, val.ipfs_hash);
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

    __reset_status() {
        this.status.failed = 0;
        this.status.pinned = 0;
    }

    async __on_get_repos(err, { repos }) {
        if (err) return console.log(`Failed to load repo meta:\n\t${err}`);

        if (!repos.length) return console.log('no repos in contract');

        const lastRepoId = repos[repos.length - 1].repo_id;
        this.__build_queue(repos, lastRepoId);
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
            console.log(err.message);
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
            lastHashId = null;
        }

        if (lastHashId === objects[index].object_hash) {
            if (config.Debug) console.log(`nothing to pin in repo №${id}`);
            return;
        }

        store.setLastHash(LAST_REPO_HASH, { id, ipfs_hash: objects[index].object_hash });


        while (index >= 0 && objects[index].object_hash !== lastHashId) {
            const type = objects[index].object_type & 0x80;
            if (type !== 0) {
                this.__add_to_queue(['pit', id, index].join('-'), objects[index].object_hash)
            }
            index--;
        }
    }

    __start_pin() {
        const repo = this.callQueue.shift();
        if (repo) {
            if (config.Debug) console.log('=============NEXT_QUEUE=============')
            this.inPin = repo.length;
            return repo.forEach(({ id, hash }) => this.__pin_meta(id, hash));
        }
        console.log(`pinned: ${this.status.pinned}\nfailed: ${this.status.failed}`);
        this.__reset_status();
    }

    __pin_meta(id, ipfs_hash) {
        store.registerPending(PENDING_REPO_HASH, { id, ipfs_hash });

        this.api.call("ipfs_pin", { hash: ipfs_hash }, (err) => {
            this.inPin--;
            if (!this.inPin) setTimeout(this.__start_pin.bind(this));

            if (err) {
                store.registerFailed(FAILED_REPO_PREFIX, { id, ipfs_hash });
                this.status.failed++;
                if (config.Debug) console.log(`Failed to pin meta ${id}/${ipfs_hash}, ${JSON.stringify(err)}`);
                return
            }

            store.removePending(PENDING_REPO_HASH, id);
            this.status.pinned++;
            if (config.Debug) console.log(`Meta hash ${id}/${ipfs_hash} successfully pinned`);
            return;
        });
    }

    async __build_queue(repos, lastRepoId) {
        const { repo_id } = repos.shift();

        this.api.contract(
            `cid=${CID},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            async (...args) => {
                await this.__on_repo_meta(repo_id, ...args);
                if (repo_id === lastRepoId) return this.__start_pin();
                else this.__build_queue(repos, lastRepoId)
            })
    }

    __add_to_queue(id, hash) {
        const { length } = this.callQueue;
        if (!length || this.callQueue[length - 1].length === MAX_CALL) {
            this.callQueue.push(new Array())
        };
        const req = { id, hash };
        this.callQueue[this.callQueue.length - 1].push(req);
    }

}


module.exports = PitHandler
