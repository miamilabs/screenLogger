const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    entry: './src/screenLogger.js',

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'screenLogger.min.js',
    },

    mode: 'production',

    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
    },
};
