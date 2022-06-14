
const Pit = require('../sourc3/pit');
const CreepingPit = require('../sourc3/creeping-pit')
const fs = require('fs')
const path = require('path');

const SHADER = path.join(__dirname, './app.wasm');


const connect = () => Promise.resolve();

const CID = '17885447b4c5f78b65ac01bfa5d63d6bc2dd7b239c6cd7ef57a918adba2071d3';

class PitDemo extends Pit {
    constructor(api) {
        super(api);
        this.cid = CID;
        this.shader = [...fs.readFileSync(SHADER)];
        this.title = 'SR3-DAPPNET';
        this.color = '\x1b[34m';
    }

    on_connect = connect;
}

class CreepingPitDemo extends CreepingPit {
    constructor(api) {
        super(api);
        this.cid = CID;
        this.title = 'C_SR3-DAPPNET';
        this.color = '\x1b[34m';
    }

    on_connect = connect;

}

module.exports = { PitDemo, CreepingPitDemo }