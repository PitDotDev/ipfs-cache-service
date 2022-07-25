const config = require("../config");

class Base {
    constructor(args) {
        const { title, cid, shader } = args
        this.title = title;
        this.cid = cid;
        this.shader = shader;
        this.restartPending = config.RestartPending;
        this.color = '\x1b[36m%s\x1b[0m';
    }

    console(msg) {
        if (config.Debug) {
            console.log(this.color, `${this.title}: ${msg}`, '\x1b[0m')
        }
    }
}

module.exports = Base;