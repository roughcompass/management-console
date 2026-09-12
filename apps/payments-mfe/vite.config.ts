import { createUiProvenanceVite } from '@de/ui-provenance/vite'
import { federation } from '@module-federation/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mockApi } from './mock-api'

const PORT = 5274
const ORIGIN = process.env.PAYMENTS_ORIGIN ?? `http://localhost:${PORT}`

const provenance = createUiProvenanceVite()

export default defineConfig({
  base: `${ORIGIN}/`,
  server: { port: PORT, cors: true, origin: ORIGIN },
  build: { target: 'chrome89', modulePreload: false, cssCodeSplit: false },
  plugins: [
    provenance.vitePlugin as never,
    // Injection rides the existing JSX pass rather than regenerating modules.
    react({ babel: { plugins: [provenance.babelPlugin] } }),
    federation({
      name: 'payments_dash',
      filename: 'remoteEntry.js',
      exposes: {
        './PaymentsDash': './src/v1/PaymentsDash.tsx',
        // The next version of the same MFE. In a real preview this is a
        // separately deployed remote; the shell pins which one it loads.
        './PaymentsDashNext': './src/v2/PaymentsDash.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: false },
        'react-dom': { singleton: true, requiredVersion: false },
        '@salt-ds/core': { singleton: true, requiredVersion: false },
      },
    }),
    mockApi(),
  ],
})
