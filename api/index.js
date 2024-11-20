
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const axios = require('axios');
const EventEmitter = require('events').EventEmitter;

const app = express();
app.use(bodyParser.json());

// Middleware for assetId validation
app.use((req, res, next) => {
    const assetId = req.params.assetId || req.body.assetId;
    if (assetId && isNaN(Number(assetId))) {
        return res.status(400).send({ error: 'Invalid assetId format. It must be a number.' });
    }
    next();
});

// Get route for asset handling
app.get(['/block/:assetId(\d+)', '/'], (req, res) => {
    const assetId = req.params.assetId;

    if (!assetId) {
        console.warn("Asset ID is missing in the request.");
        return res.status(400).send({ error: 'Asset ID is required.' });
    }

    // Mock API call to Salesforce for asset data (replace with real API)
    axios.get(`https://mcrqbn2cd382pvnr8mnczbsrx5n8.rest.marketingcloudapis.com/asset/v1/content/assets/${assetId}`)
        .then(response => {
            res.json(response.data);
        })
        .catch(err => {
            console.error("Error fetching asset data:", err.message);
            res.status(500).send({ error: 'Failed to retrieve asset data.' });
        });
});

// Save or update data
app.post('/block/:assetId(\d+)', (req, res) => {
    const assetId = req.params.assetId;
    const { data } = req.body;

    if (!data) {
        return res.status(400).send({ error: 'No data provided for the asset.' });
    }

    // Mock save to Salesforce (replace with actual API call)
    axios.post(`https://mcrqbn2cd382pvnr8mnczbsrx5n8.rest.marketingcloudapis.com/asset/v1/content/assets/${assetId}`, { data })
        .then(() => {
            res.status(200).send({ success: true, message: 'Asset updated successfully.' });
        })
        .catch(err => {
            console.error("Error updating asset:", err.message);
            res.status(500).send({ error: 'Failed to update asset.' });
        });
});

module.exports = app; // Export the Express app



