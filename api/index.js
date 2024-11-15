const express = require('express');
const session = require('express-session');
const proxy = require('http-proxy-middleware');
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const request = require('request');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const https = require('https');

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
		next();
		return;
	}

	waitForAuth(req, 10000)
		.then(next)
		.catch((error) => {
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
		maxAge: 1000 * 60 * 60 * 24,
		secure: false,
	},
	saveUninitialized: true,
	resave: false,
}));
app.use('/public', express.static('dist'));
app.use('*/icon.png', express.static('dist/icon.png'));
app.use('*/dragIcon.png', express.static('dist/dragIcon.png'));
app.use('/assets', express.static('node_modules/@salesforce-ux/design-system/assets'));

// Routes
app.get(['/', '/block/:assetId(\\d+)'], (req, res) => {
	res.render('index', {
		app: JSON.stringify({
			appID,
			...req.params,
		}),
	});
});

app.use('/proxy',
	verifyAuth,
	proxy({
		logLevel: 'debug',
		changeOrigin: true,
		target: 'https://www.exacttargetapis.com/',
		protocolRewrite: 'https',
		pathRewrite: {
			'^/proxy': '',
		},
		secure: false,
		onProxyReq: (proxyReq, req, res) => {
			if (!req.session || !req.session.accessToken) {
				res.status(401).send('Unauthorized');
			}

			proxyReq.setHeader('Authorization', `Bearer ${req.session.accessToken}`);
			proxyReq.setHeader('Content-Type', 'application/json');
		},
	})
);

app.post('/login', (req, res, next) => {
	const encodedJWT = req.body.jwt;
	const decodedJWT = jwt.decode(encodedJWT, secret);
	const restInfo = decodedJWT.request.rest;

	request.post(restInfo.authEndpoint, {
		form: {
			clientId,
			clientSecret,
			refreshToken: restInfo.refreshToken,
			accessType: 'offline',
		},
	}, (error, response, body) => {
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
	});
});

// Export the app for serverless environments
const serverless = require('serverless-http');
module.exports = serverless(app);

// Local development
if (process.env.NODE_ENV === 'development') {
	https.createServer({
		key: fs.readFileSync('server.key'),
		cert: fs.readFileSync('server.cert'),
	}, app).listen(process.env.PORT || 3003, () => {
		console.log('App listening on port ' + (process.env.PORT || 3003));
	});
} else {
	// Fallback server
	app.listen(process.env.PORT || 3003, () => {
		console.log('App listening on port ' + (process.env.PORT || 3003));
	});
}
