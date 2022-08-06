const level = require('level');
const config = require('./config');
const status = require('./status');

const PENDING_REPO = "pending-repo";
const HASHES = "hashes"

function fatal(err) {
    if (err) {
        console.error(err)
        process.exit(1)
    }
}

class Store {
    constructor() {
    }

    async init() {
        console.log("Database", config.DBFolder)
        this.db = level(config.DBFolder, { valueEncoding: 'json' })

        if (!this.db.supports.permanence) {
            throw new Error('Persistent storage is required')
        }

        // await this.__ensure(LASTRQ_ID, 0)
    }

    async __ensure(key, defval) {
        try {
            let val = await this.db.get(key)
            console.log(`\t${key} is ${defval}`)
            status[key] = val
            return val
        }
        catch (err) {
            if (!err.notFound) {
                throw err
            }
            this.__put_async(key, defval)
            console.log(`\t${key} initialized to ${defval}`)
            status[key] = defval
            return defval
        }
    }

    async __get(key) {
        return this.db.get(key)
    }

    __put_async(key, val) {
        this.db.put(key, val, err => fatal(err))
    }

    __del_async(key) {
        this.db.del(key, err => fatal(err))
    }
    //sourc3
    setRepoStatus(key, val) {
        return this.__put_async([PENDING_REPO, key].join('-'), val);
    }

    getRepoStatus(key) {
        return this.__get([PENDING_REPO, key].join('-'));
    }

    setRepoHashes(key, val) {
        return this.__put_async([HASHES, key].join('-'), val);
    }

    getRepoHashes(key) {
        return this.__get([HASHES, key].join('-'));
    }

}

module.exports = new Store()
