const { hex2a, logger } = require('../utils');
const store = require('../store');

class Repo {
    constructor({ id, hashes, cid, api, color, title, dbKey, count, stableCount }) {
        this._id = id;
        this._cid = cid;
        this._api = api;
        this._hashes = hashes;
        this._color = color;
        this._title = title;
        this._dbKey = dbKey;
        this._inPin = false;
        this._count = count;
        this._stable_count = stableCount;
        this.startPin();
        this._reconnect = false;
    }

    get inPin() {
        return this._inPin;
    }

    get reconnect() {
        return this._reconnect;
    }

    set reconnect(bool) {
        this._reconnect = bool;
    }

    __create_status(is_pending, is_final_pin) {
        const status = {
            id: this._id,
            title: this._title,
            pending: is_pending,
            count: this._stable_count
        };

        if (is_final_pin) {
            status.count = this._count;
            this._stable_count = status.count;
        }
        return status;
    }

    startPin() {
        this._inPin = true;
        this._reconnect = false;
        this.__continue_pin();
        store.setRepoStatus(this._dbKey, this.__create_status(true))
        this.console(`start pinning in repo ${this._id}`);
        logger(`${this._title} start pinning in repo ${this._id}`);
    }

    console(msg) {
        console.log(this._color, `${this._title}: ${msg}`, '\x1b[0m')
    }

    __pin_meta(id, ipfs_hash, gitHash) {
        logger(`${this._title} repo-${this._id} ${gitHash} ${ipfs_hash} start pin`);
        this._api.call('ipfs_pin', { hash: ipfs_hash }, (err) => {
            if (err) {
                this.console(`${this._dbKey} failed`);
                logger(`${this._title} ${this._dbKey} failed`);
                return;
            };
            this._hashes.delete(gitHash);
            logger(`${this._title} repo-${this._id} ${gitHash} ${ipfs_hash} successfuly pinned`);
            this.__continue_pin();
        });
    }

    async __continue_pin() {
        const gitHash = this.__last_key();
        logger(`${this._title} repo-${this._id} ${gitHash} get data`);
        if (gitHash) {
            this._api.contract(`cid=${this._cid},role=user,action=repo_get_data,repo_id=${this._id},obj_id=${gitHash}`,
                (err, { object_data }) => {
                    logger(`${this._title} repo-${this._id} ${gitHash} data recieved`);

                    if (err) {
                        this.console(`Failed to load repo data: \n\t${err}`)
                        logger(`${this._title} Failed to load repo data: \n\t${err}`);
                        return;
                    }
                    const ipfs_hash = hex2a(object_data);
                    this.__pin_meta(this._id, ipfs_hash, gitHash);
                }
            );
            return;
        }
        let status = {};
        try {
            status = await store.getRepoStatus(this._dbKey);
        } catch (err) { this.console(err) }

        this._inPin = false;

        store.setRepoStatus(this._dbKey, { ...status, ... this.__create_status(false, 1) })
        this.console(`all hashes pinned in repo ${this._id}`);
        logger(`${this._title} all hashes pinned in repo ${this._id}`);
    }

    __last_key() {
        return [...this._hashes.keys()].pop();
    }

    addHashes(hashes, count) {
        hashes.forEach((el) => this._hashes.add(el));

        if (this._count !== count) {
            this.console(`something new in repo ${this._id}`);
            logger(`${this._title} something new in repo ${this._id}`);
        }
        if (this._reconnect || !this._inPin) this.startPin();

        this._count = count;
    }
}

module.exports = Repo;
