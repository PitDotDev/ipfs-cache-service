const cors = require('cors');
const express = require('express');
const request = require('request');

const PORT = 14000;

const CACHE_PORT = 13000;

const TIMEOUT = 5000;

const networks = new Map()
    .set('dappnet', 'http://127.0.0.1')
    .set('masternet', 'http://3.209.99.179')

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(cors());

app.get('/', (_, res) => {
    res.send('beam-proxi is running!');
})

app.get('/status', (req, res) => {
    try {
        const { secret } = req.query;
        if (!secret) throw new Error();
        const options = {
            uri: [`${networks.get('dappnet')}:${CACHE_PORT}`, `status?secret=${secret}`].join('/'),
        };
        request(options,
            function (err, _, body) {
                if (err) {
                    return res.status(404)
                        .set('Content-Type', 'application/json')
                        .send({ message: err.code === 'ESOCKETTIMEDOUT' ? 'timeout' : 'secret error' })
                }
                return res
                    .set('Content-Type', 'application/json')
                    .send(body);
            });
    } catch (err) {
        if (err) return res.status(404)
            .set('Content-Type', 'application/json')
            .send({ message: 'secret key error' })
    }
})

app.get('/ipfs/:network/:id', (req, res) => {
    const currentNetwork = networks.get(req.params.network) || networks.get('masternet');
    const options = {
        uri: [`${currentNetwork}:8070`, 'ipfs', req.params.id].join('/'),
        encoding: null,
        timeout: TIMEOUT
    };
    request(options,
        function (err, _, body) {
            try {
                if (err) {
                    return res.status(404)
                        .set('Content-Type', 'application/json')
                        .send({ message: err.code === 'ESOCKETTIMEDOUT' ? 'hash not found' : 'invalid hash' })
                }
                return res
                    .set('Content-Type', 'application/octet-stream')
                    .send(body);
            } catch (error) {
                console.log(error);
            }

        });
});


app.get('/repo/:network/:key', (req, res) => {
    const currentNetwork = networks.get(req.params.network) || networks.get('masternet');
    console.log([currentNetwork, `repo?key=${req.params.key}`].join('/'));
    request(
        { uri: [`${currentNetwork}:13000`, `repo?key=${req.params.key}`].join('/') },
        function (err, response, body) {
            if (err) return res.status(500)
                .set('Content-Type', 'application/json')
                .send({ message: 'server error' });

            return res.status(response.statusCode)
                .set('Content-Type', 'application/json')
                .send(body);
        });
});


app.options('/upload', cors());

app.post('/upload', (req, res) => {
    console.log('upload:', req.body);
    request(
        {
            method: 'POST',
            uri: [`${networks.get('dappnet')}:13000`, 'upload'].join('/'),
            body: JSON.stringify(req.body)
        },
        function (err, response, body) {
            if (err) return res.status(500)
                .set('Content-Type', 'application/json')
                .send({ message: 'server error' });

            return res.status(response.statusCode)
                .set('Content-Type', 'application/json')
                .send(body);
        });
});
//

app.listen(PORT, () =>
    console.log(`Beam-proxy is running on http://localhost:${PORT}`)
);