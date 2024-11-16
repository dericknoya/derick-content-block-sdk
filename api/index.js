const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const axios = require('axios'); // Switched to axios for cleaner HTTP handling
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const https = require('https');

// Load environment variables
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
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			removeListener();
			reject('Auth timeout expired');
		}, ttl);

		const listener = (authData) => {
			if (authData.sessionID === req.sessionID) {
				req.session.accessToken = authData.accessToken;
				clearTimeout(timeout);
				removeListener();
				resolve();
			}
		};

		const removeListener = () => {
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
	res.render('index', {
		app: JSON.stringify({
			appID,
			...req.params,
		}),
	});
});

// Improved /login route
app.post('/login', async (req, res, next) => {
	try {
		const encodedJWT = req.body.jwt;
		const decodedJWT = jwt.decode(encodedJWT, secret);
		const restInfo = decodedJWT.request.rest;

		// Debugging logs
		console.log('Decoded JWT:', decodedJWT);

		// Use axios for token fetching
		const response = await axios.post(restInfo.authEndpoint, {
			clientId,
			clientSecret,
			refreshToken: restInfo.refreshToken,
			accessType: 'offline',
		});

		// Debugging logs
		console.log('Token response:', response.data);

		// Save tokens in session
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

// Export the app for serverless environments
const serverless = require('serverless-http');
module.exports = serverless(app);

// Local development
if (process.env.NODE_ENV === 'development') {
	https.createServer({
		key: fs.readFileSync('server.key'),
		cert: fs.readFileSync('server.cert'),
	}, app).listen(process.env.PORT || 3000, () => {
		console.log('App listening on port ' + (process.env.PORT || 3000));
	});
} else {
	// Fallback server
	app.listen(process.env.PORT || 3000, () => {
		console.log('App listening on port ' + (process.env.PORT || 3000));
	});
}
