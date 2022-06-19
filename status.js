const config = require('./config');
const store = require('./store');

class Status {
    constructor() {
        this.Config = config
    }

    async getRepoStatus(req, res, url) {
        try {
            const q = url.parse(req.url, true).query
            if (!q['key']) throw new Error()
            const status = await store.getRepoStatus(q['key']);
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify(status))
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            return res.end("failed to get repo status")
        }

    }

    report(req, res, url) {
        const q = url.parse(req.url, true).query
        if (q['secret'] !== config.Secret) {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end("I'm still alive")
            return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(this, null, "\t"))
    }
}

module.exports = new Status()
