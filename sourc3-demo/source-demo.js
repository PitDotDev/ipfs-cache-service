const CreepingPit = require('../sourc3/creeping_sourc3')

const connect = () => Promise.resolve();

const CID = 'e95c0ab0b2ccbd79f542ea307bf6aa6f1898dcc607a4faedf187e7309e8d38b9';

class CreepingPitDemo extends CreepingPit {
    constructor(api) {
        super(api);
        this.cid = CID;
        this.title = 'SOURC3_DEMO';
        this.color = '\x1b[44m';
    }

    on_connect = connect;

}

module.exports = CreepingPitDemo;