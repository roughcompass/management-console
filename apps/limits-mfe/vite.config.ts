import { createUiProvenanceVite } from '@de/ui-provenance/vite'
import { federation } from '@module-federation/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mockApi } from './mock-api'

const PORT = 5275
const ORIGIN = process.env.LIMITS_ORIGIN ?? `http://localhost:${PORT}`

const provenance = createUiProvenanceVite()

export default defineConfig({
  base: `${ORIGIN}/`,
  server: { port: PORT, cors: true, origin: ORIGIN },
  build: { target: 'chrome89', modulePreload: false, cssCodeSplit: false },
  plugins: [
    provenance.vitePlugin as never,
    react({ babel: { plugins: [provenance.babelPlugin] } }),
    federation({
      name: 'limits_panel',
      filename: 'remoteEntry.js',
      exposes: { './LimitsPanel': './src/LimitsPanel.tsx' },
      shared: {
        react: { singleton: true, requiredVersion: false },
        'react-dom': { singleton: true, requiredVersion: false },
        '@salt-ds/core': { singleton: true, requiredVersion: false },
      },
    }),
    mockApi(),
  ],
})
