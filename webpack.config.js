const path = require('path');

module.exports = {
    entry: './src/main.js', // Entry point for your application
    output: {
        filename: 'main.js', // Output bundled file
        path: path.resolve(__dirname, 'dist'), // Output directory
        clean: true, // Cleans the output directory before each build
    },
    devtool: 'source-map', // Enables source maps for debugging
    module: {
        rules: [
            {
                test: /\.(png|jpe?g|gif|svg)$/i, // Matches image files
                type: 'asset/resource', // Handles assets by copying them to the output directory
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i, // Matches font files
                type: 'asset/resource', // Handles fonts similarly to images
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.json'], // Resolves these extensions automatically
    },
};
