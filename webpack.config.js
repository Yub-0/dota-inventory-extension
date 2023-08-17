const webpack = require('webpack');
const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin').CleanWebpackPlugin;
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = (env, argv) => {
  const fileExtensions = ['jpg', 'jpeg', 'png', 'gif', 'eot', 'otf', 'svg', 'ttf', 'woff', 'woff2'];
  const mode = argv.mode || 'development';

  // requited for the chrome manifest.json so the development version gets the same id as the prod
  const chromeExtKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAycJXpmt94FIYH7+OVQswE8ZLWTqmNt3VePgk3IkOVP9QtEvXAcSNvtldqWCH3kFikAJzyeXdUM/puDOwZ4yM0KMgDbhfragLcB9j14VP2i3f3F98utOrRrl0eUAHFJ2fP2yCFbPqOiRZA9JK2jotpHhHib+lO2hLEtAbpnvMhD+TdIuPr33QEJcLkAfqCLZKrFGzqsOV+5NCkLQYfptA9v1KersX8FfFSDRmuzWipfo8EEwJDTcImau4v0YB+lZulHodxv5INt4Xp0Iq/lOgdm/6xUVdhZ3ISyjSvjLWVwstd1UMlLNxyBA9ibpc5UpkXDuPmkd77S2qVyMgsGtEPQIDAQAB';

  // adds extra fields to the chrome and edge versions of the manifest
  const modifyManifest = (buffer) => {
    // copy-webpack-plugin passes a buffer
    const manifest = JSON.parse(buffer.toString());

    manifest.options_page = 'index.html';
    manifest.background.persistent = false;

    if (mode === 'development') {
      manifest.key = chromeExtKey;
    }

    // pretty print to JSON with two spaces
    return JSON.stringify(manifest, null, 2);
  };

  const pluginsToAlwaysUse = [
    new webpack.EnvironmentPlugin({
      NODE_ENV: mode,
      DEBUG: false,
    }),
    // copies assets that don't need bundling
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          to: 'manifest_ff.json',
        },
        {
          from: 'src/manifest.json',
          to: 'manifest.json',
          transform(content) {
            return modifyManifest(content);
          },
        },
        {
          from: 'src/assets/styles/external/generalCSTStyle.css',
          to: 'css/generalCSTStyle.css',
        },
        {
          from: 'src/assets/_locales',
          to: '_locales/',
        },
        {
          from: 'src/assets/images',
          to: 'images/',
        },
        {
          from: 'src/assets/sounds',
          to: 'sounds/',
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'index.html'),
      filename: 'index.html',
      chunks: ['index'],
    }),
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].css',
      chunkFilename: '[id].css',
    }),
    new ESLintPlugin({
      cache: false,
      emitWarning: true,
      fix: false,
    }),
  ];

  return {
    mode,
    entry: {
      // the single js bundle used by the single page
      // that is used for the popup, options and bookmarks
      index: path.join(__dirname, 'src', '', 'index.js'),

      // background scripts
      'js/backgroundScripts/background': path.join(__dirname, 'src', 'backgroundScripts', 'background.js'),
      'js/backgroundScripts/messaging': path.join(__dirname, 'src', 'backgroundScripts', 'messaging.js'),

      // contents scripts that run on Steam pages
      'js/contentScripts/steam/apiKey': path.join(__dirname, 'src', 'contentScripts/steam', 'apiKey.js'),
      'js/contentScripts/steam/inventory': path.join(__dirname, 'src', 'contentScripts/steam', 'inventory.js'),
    },
    output: {
      publicPath: '/',
      path: path.join(__dirname, 'build'),
      filename: '[name].bundle.js',
    },
    module: {
      rules: [
        {
          test: /\.(sa|sc|c)ss$/,
          use: [
            {
              loader: MiniCssExtractPlugin.loader,
            },
            'css-loader',
            'sass-loader',
          ],
        },
        {
          test: new RegExp(`.(${fileExtensions.join('|')})$`),
          type: 'asset/resource',
          exclude: /node_modules/,
        },
        {
          test: /\.html$/,
          loader: 'html-loader',
          options: {
            sources: false,
          },
          exclude: /node_modules/,
        },
        {
          test: /\.(js|jsx)$/,
          loader: 'babel-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      modules: [path.resolve(__dirname, './src'), 'node_modules'],
      extensions: fileExtensions.map((extension) => (`.${extension}`)).concat(['.jsx', '.js', '.css']),
    },
    optimization: {
      minimizer: [new TerserPlugin({ // used to avoid the creation of commments/license txt files
        extractComments: false,
      })],
    },
    // devtool: 'inline-nosources-cheap-source-map',
    devtool: mode ==='production' ? 'source-map' : 'cheap-module-source-map',
    plugins:
      (mode === 'production') ? [...pluginsToAlwaysUse, new CleanWebpackPlugin()] : pluginsToAlwaysUse, // CleanWebpackPlugin only needs to run when it's a production build
    devServer: {
      devMiddleware: {
        writeToDisk: true,
      },
      static: {
        directory: path.join(__dirname, "../build")
      },
    },
  };
};
