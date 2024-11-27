const express = require('express');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken'); // Switched to jsonwebtoken library
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

    console.log('Access token missing, waiting for auth...');
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
app.use(bodyParser.json());

// Session management
app.use(
    session({
        name: 'mcisv',
        secret: process.env.SESSION_SECRET || 'fallback-secret-for-dev',
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            secure: process.env.NODE_ENV === 'production',
        },
        saveUninitialized: true,
        resave: false,
    })
);

// Serve static assets
app.use('/dist', express.static(path.join(__dirname, '../dist')));
app.use('*/icon.png', express.static(path.join(__dirname, '../dist/icon.png')));
app.use('*/favicon.png', express.static(path.join(__dirname, '../dist/favicon.png')));
app.use('*/favicon.ico', express.static(path.join(__dirname, '../dist/favicon.ico')));
app.use('*/dragIcon.png', express.static(path.join(__dirname, '../dist/dragIcon.png')));
app.use('/assets', express.static(path.join(__dirname, '../node_modules/@salesforce-ux/design-system/assets')));

// Render block with assetId
app.get(['/', '/block/:assetId(\d+)'], (req, res) => {
    console.log('Rendering index with app:', {
        appID,
        ...req.params,
    });
    res.render('index', {
        app: JSON.stringify({
            appID,
            ...req.params,
        }),
    });
});

// Proxy middleware for API calls
app.use('/proxy',
    (req, res, next) => {
        console.log(`Proxy request received: ${req.method} ${req.url}`);
        next();
    },
    verifyAuth,
    createProxyMiddleware({
        logLevel: 'debug',
        changeOrigin: true,
        target: 'https://mcrqbn2cd382pvnr8mnczbsrx5n8.rest.marketingcloudapis.com/',
        onError: (err) => console.error('Proxy error:', err),
        pathRewrite: { '^/proxy': '' },
        secure: false,
        onProxyReq: (proxyReq, req, res) => {
            if (!req.session || !req.session.accessToken) {
                console.error('Missing accessToken');
                return res.sendStatus(401);
            }
            console.log('Proxying with accessToken:', req.session.accessToken);
            proxyReq.setHeader('Authorization', `Bearer ${req.session.accessToken}`);
            proxyReq.setHeader('Content-Type', 'application/json');
        },
    })
);

// Login endpoint for JWT decoding and token exchange
app.post('/login', (req, res) => {
    const encodedJWT = req.body.jwt;

    if (!encodedJWT) {
        console.error('No JWT supplied in request body');
        return res.status(400).send('JWT is required');
    }

    try {
        const decodedJWT = jwt.verify(encodedJWT, secret); // Using jsonwebtoken to verify
        console.log('Decoded JWT:', decodedJWT);

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
                    console.log('Login successful, setting session:', result);
                    req.session.refreshToken = result.refreshToken;
                    req.session.accessToken = result.accessToken;
                    req.session.save((err) => {
                        if (err) {
                            console.error('Error saving session:', err);
                        } else {
                            authEmitter.emit('authed', {
                                sessionID: req.sessionID,
                                accessToken: result.accessToken,
                            });
                        }
                    });
                    res.redirect('/');
                } else {
                    console.error('Failed to authenticate:', error || body);
                    res.status(500).send('Failed to authenticate');
                }
            }
        );
    } catch (error) {
        console.error('Error decoding JWT:', error);
        return res.status(400).send('Invalid JWT');
    }
});

// HTTPS setup for local development
if (process.env.NODE_ENV === 'development') {
    const httpsOptions = {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert'),
    };

    https.createServer(httpsOptions, app).listen(process.env.PORT || 3000, () => {
        console.log('App listening securely on port ' + (process.env.PORT || 3000));
    });
}

// Export the Express app for Vercel compatibility
module.exports = app;
