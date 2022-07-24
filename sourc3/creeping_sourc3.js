const status = require('../status');
const store = require('../store');
const Repo = require('./repo');
const fs = require('fs');
const path = require('path');
const { fatal, hex2a, logger } = require('../utils');
const Base = require('../base/base');

const CID = '17885447b4c5f78b65ac01bfa5d63d6bc2dd7b239c6cd7ef57a918adba2071d3';
const SHADER = path.join(__dirname, './app.wasm');
const START_POINT = 0;
const PENDING_REPO = "pending-repo";

// const PENDING_REPO_HASH = "pending-repo-"
// const LAST_FAILED_INDEX = "last-failed-index-"

const args = {
    cid: CID,
    title: 'SOURC3',
    shader: [...fs.readFileSync(SHADER)]
}

class PitCreepingHandler extends Base {
    constructor(api) {
        super(args)
        this.hashMap = new Map();
        this.api = api;
        this.watcher = {};
        this.inPin = 0;
        this.status = { pinned: 0, pending: 0, failed: 0 };
        this.color = "\x1b[34m";
    }

    on_connect() {
        return new Promise(resolve => {
            this.api.contract(
                `role=manager,action=view_contracts`,
                (err, res) => {
                    if (err) return fatal(err)
                    // if (!res.contracts.some(el => el.cid === this.cid)) {
                    //     return fatal(`CID not found '${this.cid}'`)
                    // }
                    resolve()
                }, this.shader
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
            (...args) => this.__on_get_repos(...args)
        )
    }

    __on_get_data(id, git_hash, index) {
        this.api.contract(
            `cid=${this.cid},role=user,action=repo_get_data,repo_id=${id},obj_id=${git_hash}`,
            (err, { object_data }) => {
                if (err) {
                    this.status.failed++;
                    // store.registerFailed(`${this.title}-FAILED_REPO`, git_hash, { id, index });
                    return logger(`${this.title}: Failed to load repo data:\n\t${err}`);
                }
                // store.registerPending(`${this.title}-PENDING_REPO_HASH`, git_hash, { id, index });
                const ipfs_hash = hex2a(object_data);
                this.__pin_meta(id, ipfs_hash, git_hash, index);
            });

    }

    async __on_get_repos(err, obj) {
        const repos = obj.repos;
        if (err) return this.console(`Failed to load repo meta:\n\t${err}`);

        if (!repos.length) return this.console('no repos in contract');

        const lastRepoId = repos[repos.length - 1].repo_id;
        const minimizedRepos = repos.filter((el) => el.repo_id >= START_POINT)
        this.__build_queue(minimizedRepos, lastRepoId);
    }

    __on_get_meta() {
        this.api.contract(
            `cid=${this.cid},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            (...args) => this.__on_repo_meta(repo_id, ...args)
        )
    }

    async __on_repo_meta(id, err, response) {
        if (err) {
            logger(`${this.title}: err.message`);
            return;
        }

        const { objects } = response;

        if (!objects.length) return;

        const dbKey = [PENDING_REPO, this.cid, id].join('-');
        let repoStatus = {};
        try {
            repoStatus = await store.getRepoStatus(dbKey);
            if (objects.length === repoStatus.count) return;
        } catch (error) {
            repoStatus.count = 0;
            this.console(`repo ${id} not found in local database`);
        }

        const interimCount = this.hashMap.get(id);
        if (interimCount === objects.length && !this.watcher[id]?.reconnect) return;
        this.hashMap.set(id, objects.length);

        if (!this.watcher[id]) {
            const toIpfs = new Set(objects
                .slice(repoStatus.count)
                .filter((el) => el.object_type & 0x80)
                .map((el) => el.object_hash)
            );

            const params = {
                id,
                dbKey,
                stableCount: repoStatus.count,
                api: this.api,
                hashes: toIpfs,
                cid: this.cid,
                title: this.title,
                color: this.color,
                count: objects.length
            }
            this.watcher[id] = new Repo(params);
            return;
        }


        const toIpfs = objects
            .slice(repoStatus.count)
            .filter((el) => el.object_type & 0x80)
            .map((el) => el.object_hash);

        this.watcher[id].addHashes(toIpfs, objects.length);
    }

    async __build_queue(repos, lastRepoId) {
        const { repo_id } = repos.shift();

        this.api.contract(
            `cid=${this.cid},role=user,action=repo_get_meta,repo_id=${repo_id}`,
            async (...args) => {
                await this.__on_repo_meta(repo_id, ...args);
                if (repo_id === lastRepoId) return this.__show_status();
                this.__build_queue(repos, lastRepoId)
            })
    }

    __show_status() {
        const arr = Object.values(this.watcher);
        const pending = arr.reduce((acc, el) => acc + Number(el.inPin), 0);
        const args = [
            `pending: ${pending}`,
        ].join('\n');
        this.console([`\n`, args].join(''));
        status.Config.Contracts[this.title] = args;
    }

}


module.exports = PitCreepingHandler
