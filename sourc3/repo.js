const { hex2a, logger } = require('../utils');
const store = require('../store');

const PENDING_REPO = "pending-repo"

class Repo {
    constructor({ id, hashes, cid, api, color, title }) {
        this._id = id;
        this._cid = cid;
        this._api = api;
        this._hashes = hashes;
        this._color = color;
        this._title = title;
        this._dbKey = [PENDING_REPO, this._cid, this._id].join('-');
        this._inPin = false;
        this.startPin();
    }

    get inPin() {
        return this._inPin;
    }

    __create_status(is_pending) {
        return {
            id: this._id,
            title: this._title,
            pending: is_pending
        }
    }

    startPin() {
        this._inPin = true;
        this.__continue_pin();
        store.setRepoStatus(this._dbKey, this.__create_status(true))
        this.console(`something new in repo ${this._id}`);
        logger(`${this._title} something new in repo ${this._id}`);
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

    __continue_pin() {
        const gitHash = this.__last_key();
        if (gitHash) {
            this._api.contract(`cid = ${this._cid}, role = user, action = repo_get_data, repo_id = ${this._id}, obj_id = ${gitHash}`,
                (err, { object_data }) => {
                    if (err) {
                        this.console(`Failed to load repo data: \n\t${err}`)
                        logger(`${this._title} Failed to load repo data: \n\t${err}`);
                        return
                    }
                    const ipfs_hash = hex2a(object_data);
                    this.__pin_meta(this._id, ipfs_hash, gitHash);
                }
            );
            return;
        }
        store.setRepoStatus(this._dbKey, this.__create_status(false))
        this.console(`all hashes pinned in repo ${this._id}`);
        logger(`${this._title} all hashes pinned in repo ${this._id}`);
        this._inPin = false;
    }

    __last_key() {
        return [...this._hashes.keys()].pop();
    }

    addHashes(hashes) {
        hashes.forEach((el) => this._hashes.add(el));
        this.console(`something new in repo ${this._id}`);
        logger(`${this._title} something new in repo ${this._id}`);
    }
}

module.exports = Repo;
