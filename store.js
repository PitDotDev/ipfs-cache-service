const level = require('level')
const config = require('./config')
const status = require('./status')

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
    // Pit
    setLastHash(prefix, hash, params) {
        const arr = params ? Object.entries(params) : []
        const key = [prefix, ...arr].join('');
        this.__put_async(key, hash);
    }

    getLastHash(...args) {
        return this.__get(args.join(''));
    }

    registerFailed(prefix, hash, params) {
        const arr = params ? Object.entries(params) : []
        const key = [prefix, hash, ...arr].join('');
        this.__put_async(key, { hash, ...params });
    }

    registerPending(prefix, hash, params) {
        const arr = params ? Object.entries(params) : []
        const key = [prefix, hash, ...arr].join('');
        this.__put_async(key, { hash, ...params });
    }

    removePending(prefix, ...args) {
        const key = [prefix, ...args].join('');
        this.__del_async(key);
    }

    getPending(prefix) {
        return this.db.iterator({
            gte: `${prefix}`,
            lte: `${prefix}~`
        });
    }

}

module.exports = new Store()
