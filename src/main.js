
import './components/templating-block-app';
import SDK from 'blocksdk';
import { getHtml, parseTemplate } from './lib/templating-block-utils';
import { getBlock } from './lib/api';

const sdk = new SDK();

function initializeApp(data) {
    const app = document.createElement('templating-block-app');
    app.locked = data.locked || false;

    if (data.template) {
        app.assetId = data.template.id;
    } else {
        console.error("Template data is missing. Verify assetId or initialization.");
    }

    // Respond to app changes
    app.addEventListener('change', e => {
        sdk.getData(blockData => {
            const newBlockData = { ...blockData };

            // Update block data based on event type
            switch (e.detail.type) {
                case 'template':
                    newBlockData.template = e.detail.template;
                    newBlockData.fields = parseTemplate(newBlockData.template);
                    app.fields = newBlockData.fields;
                    break;
                case 'fields':
                    newBlockData.fields = e.detail.fields;
                    break;
                default:
                    console.warn("Unhandled event type:", e.detail.type);
                    break;
            }

            // Save updated data back to SDK
            sdk.setData(newBlockData);
        });
    });

    document.getElementById('workspace').appendChild(app);
}

// Initialize the app with data from SDK
sdk.getData(data => {
    if (!data) {
        console.error("Failed to retrieve initial data. Ensure block is configured correctly.");
        return;
    }
    initializeApp(data);
});

sdk.getAssetId(assetId => {
    if (!assetId) {
        console.warn("Asset ID is undefined. Ensure assetId is provided in the block configuration.");
    } else {
        console.log("Loaded Asset ID:", assetId);
    }
});
