const fs = require('fs');
const config = require('./config');
const path = require('path');

function err2str(err) {
    if (typeof err === 'string') {
        return err
    }

    let jstr = JSON.stringify(err)
    return jstr === "{}" ? err.toString() : jstr
}

function hexDecodeU8A(hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function fatal(err) {
    console.error(`Fatal Wallet API error:\n\t${JSON.stringify(err)}`)
    process.exit(1)
}

function hex2a(hexx) {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function getTimestamp () {
    const pad = (n,s=2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    
    return `${pad(d.getFullYear(),4)}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }


const logger = (function () {
    const dir = path.join(__dirname, './logs')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    const filepath = `./logs/log-${getTimestamp()}.txt`
    return function (data_to_append) {
        if (!data_to_append) debugger;
        // if (config.Debug) console.log(data_to_append);
        fs.appendFile(filepath, `\n${data_to_append}`, (err) => {
            if (err) console.log(err);
        });
    }
})()

module.exports = {
    err2str, hexDecodeU8A, fatal, hex2a, logger
}