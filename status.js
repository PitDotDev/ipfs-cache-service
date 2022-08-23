const config = require('./config');
const store = require('./store');



class Status {
    constructor(api) {
        this.api = api;
        this.Config = config
    }

    async getRepoStatus(req, res, url) {
        try {
            const q = url.parse(req.url, true).query
            if (!q['key']) throw new Error()
            const status = await store.__get(q['key']); //TODO: make secure
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify(status))
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            return res.end("failed to get repo status")
        }

    }


    async uploadImage(req, res, url) {
        if (req.method !== 'POST') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end("not correct method");
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk.toString()));
        req.on("end", async () => {
            this.api.call('ipfs_add', JSON.parse(body), (err, result) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end("failed to get add data to ipfs");
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            });
        });
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

module.exports = Status
