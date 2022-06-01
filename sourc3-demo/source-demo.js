
const Pit = require('../pit/pit');
const CreepingPit = require('../pit/creeping-pit')
const fs = require('fs')
const path = require('path');

const SHADER = path.join(__dirname, './app.wasm');


const connect = () => Promise.resolve();

const CID = 'ec90c6258019107543e0726c415f8b92c78805afcdb1336a61345b97486d2832';

class PitDemo extends Pit {
    constructor(api) {
        super(api);
        this.cid = CID;
        this.shader = [...fs.readFileSync(SHADER)];
        this.title = 'SR3-DEMO';
        this.color = '\x1b[34m';
    }

    on_connect = connect;
}

class CreepingPitDemo extends CreepingPit {
    constructor(api) {
        super(api);
        this.cid = CID;
        this.title = 'C_SR3-DEMO';
        this.color = '\x1b[34m';
    }

    on_connect = connect;

}

module.exports = { PitDemo, CreepingPitDemo }