import { UiProvenanceWebpackPlugin, loaderPath } from '@de/ui-provenance/webpack'
import { ModuleFederationPlugin } from '@module-federation/enhanced/webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import { createRequire } from 'node:module'
import webpack from 'webpack'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))
const PORT = 5275
const ORIGIN = process.env.LIMITS_ORIGIN ?? `http://localhost:${PORT}`

const limits = [
  { id: 'l-1', name: 'Intraday credit', used: 0.62, cap: 50_000_000 },
  { id: 'l-2', name: 'Settlement exposure', used: 0.88, cap: 25_000_000 },
]

/**
 * This remote is built with Webpack and Module Federation 2 through
 * @module-federation/enhanced, because that is what some teams use. The host is
 * a Vite application: identity has to survive the bundler boundary, and the
 * source ids in this build come from the same analysis the Vite remote uses.
 */
export default {
  entry: join(root, 'src/main.tsx'),
  output: {
    publicPath: `${ORIGIN}/`,
    path: join(root, 'dist'),
    clean: true,
    // A module-type remote entry, so the Vite host consumes it the same way it
    // consumes its Vite remote.
    module: true,
    library: { type: 'module' },
  },
  experiments: { outputModule: true },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        // Loaders run right to left: provenance sees the author's JSX first.
        use: [
          {
            loader: require.resolve('babel-loader'),
            options: {
              presets: [
                [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
                [require.resolve('@babel/preset-typescript'), { isTSX: true, allExtensions: true }],
              ],
            },
          },
          loaderPath,
        ],
      },
      { test: /\.css$/, use: [require.resolve('style-loader'), require.resolve('css-loader')] },
    ],
  },
  plugins: [
    // Webpack does not give the browser a `process`; the origin is a build input.
    new webpack.DefinePlugin({
      'process.env.LIMITS_API': JSON.stringify(ORIGIN),
    }),
    new UiProvenanceWebpackPlugin({ root }),
    new ModuleFederationPlugin({
      name: 'limits_panel',
      filename: 'remoteEntry.js',
      exposes: { './LimitsPanel': join(root, 'src/LimitsPanel.tsx') },
      library: { type: 'module' },
      shared: {
        react: { singleton: true, requiredVersion: false },
        'react-dom': { singleton: true, requiredVersion: false },
        '@salt-ds/core': { singleton: true, requiredVersion: false },
      },
    }),
    new HtmlWebpackPlugin({ template: join(root, 'index.html') }),
  ],
  devServer: {
    port: PORT,
    hot: false,
    liveReload: false,
    headers: { 'Access-Control-Allow-Origin': '*' },
    devMiddleware: { writeToDisk: false },
    // The MFE talks to its own service, which is cross-origin from the host.
    setupMiddlewares(middlewares, server) {
      server.app.get('/api/limits', (_request, response) => {
        response.set('Access-Control-Allow-Origin', '*')
        response.json({ limits })
      })
      return middlewares
    },
  },
}
