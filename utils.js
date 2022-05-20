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


const logger = (function () {
    const dir = path.join(__dirname, './logs')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    const data = String(new Date()).split('(')[0];
    return function (data_to_append) {
        fs.appendFile(`./logs/log-${data}.txt`, `\n${data_to_append}`, (err) => {
            if (err) console.log(err);
        });
    }
})()

module.exports = {
    err2str, hexDecodeU8A, fatal, hex2a, logger
}