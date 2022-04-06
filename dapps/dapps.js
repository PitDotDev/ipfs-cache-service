const config = require('../config');
const status = require('../status');
const store = require('../store');
const fs = require('fs');
const path = require('path');

const { fatal, logger } = require('../utils');

const CID = 'b76ca089082e38b23d5e68feeb8b6f459ae74f5012eb520c87169f88ced307e3';
const ADMIN_SHADER = path.join(__dirname, './dapps_store_admin_app.wasm');
const SHADER = path.join(__dirname, './dapps_store_app.wasm');
const MAX_CALL = 50;
// const TIMEOUT = 120000;

const LAST_DAPP_HASH = "last-dapp-"
const PENDING_DAPPS = "pending-dapp-"
const FAILED_DAPPS = "failed-dapp-"

class DappHandler {
    constructor(api) {
        this.api = api;
        this.shader = [...fs.readFileSync(SHADER)];
        this.restartPending = config.RestartPending;
        this.callQueue = [];
        this.inPin = 0;
        this.status = { pinned: 0, pending: 0, failed: 0 }
    }

    on_connect() {
        return new Promise(resolve => {
            this.api.contract(
                `action=view`,
                (err, res) => {
                    if (err) return fatal(err)
                    if (!res.contracts.some(el => el.cid === CID)) {
                        return fatal(`CID not found '${CID}'`)
                    } resolve()
                },
                [...fs.readFileSync(ADMIN_SHADER)]
            )
        })
    }

    on_api_result(res) {
        return this.__on_system_state(res);
    }

    async __on_system_state(state) {
        status.SystemState = state;
        if (!state.is_in_sync || state.tip_height !== state.current_height) {
            // we're not in sync, wait
            return
        }

        if (this.restartPending) {
            console.log('Restarting pending metas');
            this.restartPending = false;

            for await (const [_, val] of store.getPending(PENDING_DAPPS)) {
                if (config.Debug) console.log(val);
                if (val.hash) this.__add_to_queue(val.hash);
            }
            if (this.callQueue.length) return this.__start_pin();
        }

        // if (!this.callQueue.length) {
        this.api.contract(
            `cid=${CID},action=view_dapps`,
            (...args) => this.__on_get_daaps(...args),
            this.shader
        )
        //  }
    }

    async __on_get_daaps(err, { dapps }) {
        if (err) {
            logger(err.message);
            return;
        }

        let index = dapps.length - 1;

        let lastHash;
        try {
            lastHash = await store.getLastHash(LAST_DAPP_HASH);
            // throw new Error();
        } catch (error) {
            lastHash = null;
        }

        if (lastHash === dapps[index].ipfs_id) {
            if (config.Debug) console.log('nothing to pin in dapps');
            return this.__show_status();
        }

        store.setLastHash(LAST_DAPP_HASH, dapps[index].ipfs_id);

        while (index >= 0 && dapps[index].ipfs_id !== lastHash) {
            this.__add_to_queue(dapps[index].ipfs_id);
            index--;
        }

        this.__start_pin();
    }

    __pin_dapp(hash) {
        this.status.pending++;
        store.registerPending(PENDING_DAPPS, hash);
        this.api.call("ipfs_pin", { hash }, (err) => {

            this.inPin--;
            if (!this.inPin) setTimeout(this.__start_pin.bind(this));

            if (err) {
                store.registerFailed(FAILED_DAPPS, hash);
                this.status.failed++;
                logger(`Failed to pin dapp ${hash}, ${JSON.stringify(err)}`);
                return
            }

            store.removePending(PENDING_DAPPS, hash);
            this.status.pending--;
            this.status.pinned++;
            logger(`dapp ${hash} successfully pinned`);
            return;
        }, this.shader);
    }


    __start_pin() {
        const queue = this.callQueue.shift();
        if (queue) {
            if (config.Debug) console.log('=============NEXT_QUEUE=============')
            this.inPin = queue.length;
            return queue.forEach(hash => this.__pin_dapp(hash));
        }
        this.__show_status();
    }

    __show_status() {
        const args = [
            '=============DAPPS=============',
            `pending: ${this.status.pending}`,
            `pinned: ${this.status.pinned}`,
            `failed: ${this.status.failed}`
        ].join('\n');
        console.log(args);
    }

    __add_to_queue(hash) {
        const { length } = this.callQueue;
        if (!length || this.callQueue[length - 1].length === MAX_CALL) {
            this.callQueue.push(new Array())
        };
        this.callQueue[this.callQueue.length - 1].push(hash);
    }

}


module.exports = DappHandler
