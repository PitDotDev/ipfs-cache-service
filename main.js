const http = require('http')
const Router = require('./router')
const Listener = require('./listener')
const config = require('./config')

async function main() {
    console.log("Starting IPFS cache service...")
    console.log("Mode is", config.Debug ? "Debug" : "Release")

    // initialize, order is important
    const store = require('./store')
    await store.init()

    const status = require('./status')

    const Pit = require('./pit/pit');
    const Dapps = require('./dapps/dapps');
    const CreepingPit = require('./pit/creeping-pit')

    await new Listener().connect(Pit, CreepingPit, Dapps);

    // setup routes
    const router = new Router();

    router.register("/status", (...args) => status.report(...args))
    router.register("/", (req, res) => {
        res.writeHead(200);
        res.end('Hi! This is the IPFS cache service.');
    })

    // Start everything
    console.log("Listening on port", config.Port)
    const server = http.createServer((...args) => router.route(...args))
    server.listen(config.Port)
}
setTimeout(() => {
    main().catch(err => {
        console.error("IPFS cache service critical failure. The following error has been reported:")
        console.error(err)
        process.exit(1)
    })
}, 10000);

