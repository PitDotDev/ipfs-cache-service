const { hex2a, logger } = require('../utils');
const store = require('../store');

class Repo {
    constructor({ id, hashes, cid, api, color, title, dbKey }) {
        this._id = id;
        this._cid = cid;
        this._api = api;
        this._hashes = hashes;
        this._color = color;
        this._title = title;
        this._dbKey = dbKey;
        this._inPin = false;
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

    __create_status(is_pending) {
        const status = {
            id: this._id,
            title: this._title,
            pending: is_pending
        };
        return status;
    }

    async __setRepoHashes(gitHash, ipfsHash) {
        let hashes;
        try {
            hashes = await store.getRepoHashes(this._dbKey);
        } catch (error) {
            hashes = {}
        }
        hashes[gitHash] = ipfsHash;
        store.setRepoHashes(this._dbKey, hashes);
    }

    startPin() {
        this._inPin = true;
        this._reconnect = false;
        this.console(`start pinning in repo ${this._id}`);
        this.__continue_pin();
        store.setRepoStatus(this._dbKey, this.__create_status(true))
        logger(`${this._title} start pinning in repo ${this._id}`);
    }

    console(msg) {
        console.log(this._color, `${this._title}: ${msg}`, '\x1b[0m')
    }

    __pin_meta(ipfsHash, gitHash) {
        logger(`${this._title} repo-${this._id} ${gitHash} ${ipfsHash} start pin`);
        this._api.call('ipfs_pin', { hash: ipfsHash }, (err) => {
            if (err) {
                this.console(`${this._dbKey} failed`);
                logger(`${this._title} ${this._dbKey} failed`);
                return;
            };
            this._hashes.delete(gitHash);
            this.__setRepoHashes(gitHash, ipfsHash)
            logger(`${this._title} repo-${this._id} ${gitHash} ${ipfsHash} successfuly pinned`);
            this.__continue_pin();
        });
    }



    async __continue_pin() {
        const gitHash = this.__last_key();
        if (gitHash) {
            logger(`${this._title} repo-${this._id} ${gitHash} get data`);
            const timeoutId = setTimeout(() => this.__continue_pin(), 20000);
            this._api.contract(`cid=${this._cid},role=user,action=repo_get_data,repo_id=${this._id},obj_id=${gitHash}`,
                (err, { object_data }) => {
                    clearTimeout(timeoutId);
                    logger(`${this._title} repo-${this._id} ${gitHash} data recieved`);

                    if (err) {
                        this.console(`Failed to load repo data: \n\t${err}`)
                        logger(`${this._title} Failed to load repo data: \n\t${err}`);
                        return;
                    }
                    const ipfs_hash = hex2a(object_data);
                    this.__pin_meta(ipfs_hash, gitHash);
                }
            );
            return;
        }
        let status = {};
        try {
            status = await store.getRepoStatus(this._dbKey);
        } catch (err) { this.console(err) }

        this._inPin = false;

        store.setRepoStatus(this._dbKey, this.__create_status(false))
        this.console(`all hashes pinned in repo ${this._id}`);
        logger(`${this._title} all hashes pinned in repo ${this._id}`);
    }

    __last_key() {
        return [...this._hashes.keys()].pop();
    }

    addHashes(hashes) {
        hashes.forEach((el) => this._hashes.add(el));
        this.console(`something new in repo ${this._id}`);
        logger(`${this._title} something new in repo ${this._id}`);
        if (this._reconnect || !this._inPin) this.startPin();
    }
}

module.exports = Repo;
