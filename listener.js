const WalletApi = require("./wallet-api");
const config = require('./config');
const { fatal } = require('./utils');

class Listener {
    observers = [];

    async connect(...args) {
        this.api = new WalletApi(config.WalletAPI.Address, config.WalletAPI.ReconnectInterval);
        const connects = [];
        args.forEach((Element) => {
            const instance = new Element(this.api);
            this.__attach(instance.on_api_result.bind(instance));
            connects.push(instance.on_connect.bind(instance));
        });

        this.api.on('connect', () => this.__on_connect(connects));
        this.api.on('result', (...args) => this.__on_api_result(...args));
        await this.api.connect();
    }

    async __on_connect(connects) {
        await Promise.all(connects.map(el => el()))
        this.api.call("ev_subunsub", { ev_system_state: true }, (err, res) => {
            if (err) return fatal(err);

            if (!res) fatal("failed to subscibe to status update event")
        })
    }

    __on_api_result(err, res, full) {
        if (err) return fatal(err);

        if (full.id === "ev_system_state") return this.__notifyAll(res);

        fatal(`Unexpected Wallet API result call ${full}`)
    }

    __attach(arg) { this.observers.push(arg) };

    __notifyAll(res) { this.observers.forEach((onApiResult) => onApiResult(res)) };
}


module.exports = Listener;