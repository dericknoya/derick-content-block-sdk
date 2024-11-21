const express = require('express');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const request = require('request');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const https = require('https');
const path = require('path');

if (process.env.NODE_ENV === 'development') {
    require('dotenv').config();
}

// Environment variables
const secret = process.env.APP_SIGNATURE;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const appID = process.env.APP_ID;
const authEmitter = new EventEmitter();



function waitForAuth(req, ttl) {
    return new Promise(function (resolve, reject) {
        const timeout = setTimeout(() => {
            removeListener();
            reject('auth timeout expired');
        }, ttl);

        const listener = function (authData) {
            if (authData.sessionID === req.sessionID) {
                req.session.accessToken = authData.accessToken;
                clearTimeout(timeout);
                removeListener();
                resolve();
            }
        };

        const removeListener = function () {
            authEmitter.removeListener('authed', listener);
        };

        authEmitter.addListener('authed', listener);
    });
}

function verifyAuth(req, res, next) {
    if (req.session && req.session.accessToken) {
        return next();
    }

    waitForAuth(req, 10000)
        .then(next)
        .catch(() => res.sendStatus(401));
}

const app = express();

// Set views directory explicitly
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// Body parser for POST
app.use(bodyParser.urlencoded({ extended: true }));

// Session management
app.use(
    session({
        name: 'mcisv',
        secret: 'my-app-super-secret-session-token',
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            secure: false,
        },
        saveUninitialized: true,
        resave: false,
    })
);

// Serve static assets
app.use('/public', express.static('dist'));
app.use('*/icon.png', express.static('dist/icon.png'));
app.use('*/dragIcon.png', express.static('dist/dragIcon.png'));
// app.use('/assets', express.static('node_modules/@salesforce-ux/design-system/assets'));
app.use('/assets', express.static(path.join(__dirname, '../node_modules/@salesforce-ux/design-system/assets')));


// Render block with assetId
app.get(['/', '/block/:assetId(\\d+)'], (req, res) => {
    res.render('index', {
        app: JSON.stringify({
            appID,
            ...req.params,
        }),
    });
});

// Proxy middleware for API calls
app.use(
    '/proxy',
    verifyAuth,
    createProxyMiddleware({
        logLevel: 'debug',
        changeOrigin: true,
        target: 'https://www.exacttargetapis.com/',
        onError: console.log,
        protocolRewrite: 'https',
        pathRewrite: {
            '^/proxy': '',
        },
        secure: false,
        onProxyReq: (proxyReq, req, res) => {
            if (!req.session || !req.session.accessToken) {
                res.sendStatus(401);
            }
            proxyReq.setHeader('Authorization', `Bearer ${req.session.accessToken}`);
            proxyReq.setHeader('Content-Type', 'application/json');
        },
    })
);

// Login endpoint for JWT decoding and token exchange
app.post('/login', (req, res, next) => {
    const encodedJWT = req.body.jwt;
    const decodedJWT = jwt.decode(encodedJWT, secret);
    const restInfo = decodedJWT.request.rest;

    request.post(
        restInfo.authEndpoint,
        {
            form: {
                clientId: clientId,
                clientSecret: clientSecret,
                refreshToken: restInfo.refreshToken,
                accessType: 'offline',
            },
        },
        (error, response, body) => {
            if (!error && response.statusCode === 200) {
                const result = JSON.parse(body);
                req.session.refreshToken = result.refreshToken;
                req.session.accessToken = result.accessToken;
                req.session.save();
                authEmitter.emit('authed', {
                    sessionID: req.sessionID,
                    accessToken: result.accessToken,
                });
            }
            res.redirect('/');
            next();
        }
    );
});

// HTTPS setup for local development
if (process.env.NODE_ENV === 'development') {
    const httpsOptions = {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert'),
    };

    https.createServer(httpsOptions, app).listen(process.env.PORT || 3003, () => {
        console.log('App listening securely on port ' + (process.env.PORT || 3003));
    });
}

// Export the Express app for Vercel compatibility
module.exports = app;
