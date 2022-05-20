const fs = require('fs')
const path = require('path')

// this.CID = 'fda210a4af51fdd2ce1d2a1c0307734ce6fef30b3eec4c04c4d7494041f2dd10'
// this.ShaderFile = 'app.wasm'

class Config {
    constructor(fname) {
        this.Debug = true
        this.Port = 14000
        this.Secret = "secret"
        // this.CID = 'fda210a4af51fdd2ce1d2a1c0307734ce6fef30b3eec4c04c4d7494041f2dd10'
        // this.ShaderFile = 'app.wasm'
        this.DBFolder = 'data.db'
        this.RestartPending = true
        this.WalletAPI = {
            Address: "127.0.0.1:10006",
            ReconnectInterval: 5000
        }

        let raw = fs.readFileSync(fname)
        let parsed = JSON.parse(raw.toString())
        Object.assign(this, parsed)

        this.DBFile = path.resolve(this.DBFolder)
        // TODO: add periodical GC
    }
}

module.exports = new Config('config.json')
