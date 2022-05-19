const config = require('../config');
const status = require('../status');
const store = require('../store');
const fs = require('fs');
const path = require('path');
const { fatal, hex2a, logger } = require('../utils');

const Base = require('../base/base');


const CID = '7aaec975d0348348d82e72bd66d508ac93cb6f9e683bd136d2a879f41c32e8d8';
const SHADER = path.join(__dirname, './app.wasm');
const MAX_CALL = 300;
const START_POINT = 0;
const TIMEOUT = 2000;

const LAST_REPO_HASH = "pit-repo-"
const PENDING_REPO_HASH = "pending-repo-"
const FAILED_REPO = "failed-repo-";
const LAST_FAILED_INDEX = "last-failed-index-"


const args = {
    cid: CID,
    title: 'SR3',
    shader: [...fs.readFileSync(SHADER)]
}

class PitHandler extends Base {
    constructor(api) {
        super(args)
        this.api = api;
        this.callQueue = [];
        this.inPin = 0;
        this.status = { pinned: 0, pending: 0, failed: 0 }
        this.color = "\x1b[32m";
    }

    on_connect() {
        return new Promise(resolve => {
            this.api.contract(
                `role=manager,action=view_contracts`,
                (err, res) => {
                    if (err) return fatal(err);
                    if (!res.contracts.some(el => el.cid === this.cid)) {
                        return fatal(`CID not found '${this.cid}'`)
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
        if (!state.is_in_sync || state.tip_height !== state.current_height) {
            // we're not in sync, wait
            return
        }
        this.api.contract(
            `cid=${this.cid},role=user,action=all_repos`,
            (...args) => this.__on_get_repos(...args),
            this.shader
        );
    }

    __pin_meta(id, ipfs_hash, git_hash, index) {
        this.status.pending++;

        this.api.call("ipfs_pin", { hash: ipfs_hash, timeout: TIMEOUT }, (err) => {
            this.status.pending--;
            this.inPin--;
            if (!this.inPin) setTimeout(this.__start_pin.bind(this));

            if (err) {
                store.registerFailed(`${this.title}-FAILED_REPO`, git_hash, { id, index });
                this.status.failed++;
                logger(`${this.title}: Failed to pin meta ${id}/${ipfs_hash}, ${JSON.stringify(err)}`);
                return
            }

            store.removePending(`${this.title}-PENDING_REPO_HASH`, git_hash, id, index);
            this.status.pinned++;
            logger(`${this.title}: Meta hash ${id}/${ipfs_hash} successfully pinned`);
            return;
        });
    }

    __on_get_data(id, git_hash, index) {
        this.api.contract(
            `cid=${this.cid},role=user,action=repo_get_data,repo_id=${id},obj_id=${git_hash}`,
            (err, { object_data }) => {
                if (err) {
                    this.status.failed++;
                    let lastFailedHash;
                    try {
                        store.getLastHash(`${this.title}-LAST_FAILED_HASH`, id);
                    } catch (error) {
                        lastFailedHash = index;
                        store.registerFailed(`${this.title}-LAST_FAILED_INDEX`, index, { id });
                    }

                    if (lastFailedHash < index) {
                        store.registerFailed(`${this.title}-LAST_FAILED_INDEX`, index, { id });
                    }
                    return logger(`Failed to load repo data:\n\t${err}`);
                }
                store.registerPending(`${this.title}-PENDING_REPO_HASH`, git_hash, { id, index });
                const ipfs_hash = hex2a(object_data);
                this.__pin_meta(id, ipfs_hash, git_hash, index);
            }, this.shader);

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
            `cid=${this.cid},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            (...args) => this.__on_repo_meta(repo_id, ...args),
            this.shader
        )
    }


    async __on_repo_meta(id, err, answer) {
        if (err) {
            logger(err.message);
            return;
        }

        const { objects } = answer;
        if (!objects.length) {
            // this.console(`nothing to pin in repo №${id}`);
            return;
        }
        let index = objects.length - 1;

        let lastHashId;
        try {
            lastHashId = await store.getLastHash(`${this.title}-LAST_REPO_HASH`, id);
            if (lastHashId === objects[index].object_hash) {
                // this.console(`nothing to pin in repo №${id}`);
                return;
            }
            this.console(`something new in repo ${id}`)
            // this.console(`nothing to pin in repo №${id}`);
            // throw new Error();
        } catch (error) {
            lastHashId = objects[index].object_hash;
            // lastHashId = null;
        }

        store.setLastHash(`${this.title}-LAST_REPO_HASH`, objects[index].object_hash, { id });

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
            this.inPin = repo.length;
            return repo.forEach(({ id, hash, index }) => this.__on_get_data(id, hash, index));
        }
        this.__show_status();
    }

    __show_status() {
        const args = [
            `pending: ${this.status.pending}`,
            `pinned: ${this.status.pinned}`,
            `failed: ${this.status.failed}`
        ].join('\n');
        this.console(['\n', args].join(''));
    }

    async __build_queue(repos, lastRepoId) {
        const { repo_id } = repos.shift();

        this.api.contract(
            `cid=${this.cid},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            async (...args) => {
                await this.__on_repo_meta(repo_id, ...args);
                if (repo_id === lastRepoId) return this.__start_pin();
                this.__build_queue(repos, lastRepoId)
            }, this.shader)
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
