const path = require('path');

module.exports = {
    entry: './src/main.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true // Cleans the output directory before each build
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.(png|jpe?g|gif|svg)$/i,
                type: 'asset/resource' // Replaces url-loader for image assets
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.json'], // Resolve these extensions during imports
    }
};
