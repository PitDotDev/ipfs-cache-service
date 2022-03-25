const { hex2a, logger } = require('../utils');

class Repo {
    constructor({ id, lastIndex, hashes, cid, pendingKey, api, shader }) {
        this._id = id;
        this._pending_key = pendingKey;
        this._cid = cid;
        this._lastIndex = lastIndex;
        this._api = api;
        this._hashes = Array.from(hashes);
        this._shader = shader;
        this.startPin();
    }

    get inPin() {
        return Boolean(this._hashes.length);
    }

    get lastIndex() {
        return this._lastIndex;
    }

    startPin() {
        this.__continue_pin();
    }

    __pin_meta(id, ipfs_hash) {
        this._api.call("ipfs_pin", { hash: ipfs_hash }, (err) => {
            if (err) {
                console.log(`id ${id} hash ${ipfs_hash} failed`);
                return;
            };
            logger(`${ipfs_hash} pinned`);
            this.__continue_pin();
        });
    }

    __continue_pin() {
        const gitHash = this._hashes.shift();
        if (gitHash) {
            this._api.contract(`cid=${this._cid},role=user,action=repo_get_data,repo_id=${this._id},obj_id=${gitHash}`,
                (err, { object_data }) => {
                    if (err) {
                        logger(`Failed to load repo data:\n\t${err}`);
                        return
                    }
                    const ipfs_hash = hex2a(object_data);
                    this.__pin_meta(this._id, ipfs_hash);
                }, this._shader
            );
            return;
        }
        console.log(`all hashes pinned in repo ${this._id}`)
    }

    addHashes(lastIndex, hashes) {
        this._lastIndex = lastIndex;
        this._hashes.concat(hashes);
    }
}

module.exports = Repo;
