import { createUiProvenanceVite } from '@de/ui-provenance/vite'
import { federation } from '@module-federation/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const PAYMENTS_ORIGIN = process.env.VITE_PAYMENTS_ORIGIN ?? 'http://localhost:5274'
const LIMITS_ORIGIN = process.env.VITE_LIMITS_ORIGIN ?? 'http://localhost:5275'

// @module-federation/vite 1.21 publishes the remote entry, not an mf-manifest,
// in both dev and build. MF_ENTRY overrides it for a deployment that serves a
// manifest instead; the MF2 runtime accepts either.
const ENTRY = process.env.MF_ENTRY ?? 'remoteEntry.js'

// Registration is preview-only: a production bundle carries no provenance code,
// so the runtime plugin is not in it at all.
const PROVENANCE_ENABLED = process.env.DE_UI_PROVENANCE_ENABLED === 'true'

const provenance = createUiProvenanceVite()

export default defineConfig({
  server: { port: 5273, cors: true },
  build: { target: 'chrome89', modulePreload: false, cssCodeSplit: false },
  plugins: [
    // The shell is instrumented too: its chrome is reviewable, and its manifest
    // is one of the manifests the runtime registers.
    provenance.vitePlugin as never,
    react({ babel: { plugins: [provenance.babelPlugin] } }),
    federation({
      name: 'shell',
      remotes: {
        payments_dash: {
          type: 'module',
          name: 'payments_dash',
          entry: `${PAYMENTS_ORIGIN}/${ENTRY}`,
          entryGlobalName: 'payments_dash',
          shareScope: 'default',
        },
        limits_panel: {
          type: 'module',
          name: 'limits_panel',
          entry: `${LIMITS_ORIGIN}/${ENTRY}`,
          entryGlobalName: 'limits_panel',
          shareScope: 'default',
        },
      },
      // Remotes register themselves through documented runtime lifecycle
      // hooks, never by reading a federation debugging global.
      runtimePlugins: PROVENANCE_ENABLED
        ? [
            [
              '@de/ui-provenance/module-federation',
              { host: { manifestUrl: '/ui-provenance-manifest.json', rootSelector: '#preview' } },
            ],
          ]
        : [],
      shared: {
        react: { singleton: true, requiredVersion: false },
        'react-dom': { singleton: true, requiredVersion: false },
        '@salt-ds/core': { singleton: true, requiredVersion: false },
      },
    }),
  ],
})
