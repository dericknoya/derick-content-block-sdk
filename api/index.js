const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const axios = require('axios');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const https = require('https');

// Load environment variables
if (process.env.NODE_ENV === 'development') {
    require('dotenv').config();
}

const secret = process.env.APP_SIGNATURE;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const appID = process.env.APP_ID;
const authEmitter = new EventEmitter();

function waitForAuth(req, ttl) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.log('Auth timeout expired for session:', req.sessionID);
            removeListener();
            reject('Auth timeout expired');
        }, ttl);

        const listener = (authData) => {
            if (authData.sessionID === req.sessionID) {
                req.session.accessToken = authData.accessToken;
                clearTimeout(timeout);
                removeListener();
                console.log('Auth data received and session updated:', authData);
                resolve();
            }
        };

        const removeListener = () => {
            authEmitter.removeListener('authed', listener);
            console.log('Auth listener removed for session:', req.sessionID);
        };

        authEmitter.addListener('authed', listener);
        console.log('Auth listener added for session:', req.sessionID);
    });
}

function verifyAuth(req, res, next) {
    console.log('Verifying authentication for session:', req.sessionID);
    if (req.session && req.session.accessToken) {
        next();
        return;
    }

    waitForAuth(req, 10000)
        .then(next)
        .catch((error) => {
            console.error('Auth verification failed:', error);
            res.status(401).send('Unauthorized');
        });
}

const app = express();
app.set('view engine', 'ejs');

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    name: 'mcisv',
    secret: 'my-app-super-secret-session-token',
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: false,
    },
    saveUninitialized: true,
    resave: false,
}));
app.use('/public', express.static('dist'));

// Routes
app.get(['/', '/block/:assetId(\\d+)'], (req, res) => {
    console.log('Render route accessed for:', req.params);
    res.render('index', {
        app: JSON.stringify({
            appID,
            ...req.params,
        }),
    });
});

// Login route with detailed logs
app.post('/login', async (req, res, next) => {
    console.log('Login route triggered with body:', req.body);
    try {
        const encodedJWT = req.body.jwt;
        console.log('Received JWT:', encodedJWT);

        const decodedJWT = jwt.decode(encodedJWT, secret);
        console.log('Decoded JWT:', decodedJWT);

        const restInfo = decodedJWT.request.rest;
        console.log('REST Info:', restInfo);

        const response = await axios.post(restInfo.authEndpoint, {
            clientId,
            clientSecret,
            refreshToken: restInfo.refreshToken,
            accessType: 'offline',
        });

        console.log('Token response:', response.data);

        req.session.refreshToken = response.data.refreshToken;
        req.session.accessToken = response.data.accessToken;
        req.session.save();

        authEmitter.emit('authed', {
            sessionID: req.sessionID,
            accessToken: response.data.accessToken,
        });

        res.redirect('/');
        next();
    } catch (error) {
        console.error('Error during token fetch:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Export for serverless environments
const serverless = require('serverless-http');
module.exports = serverless(app);