import { createProvenance } from '@adl/provenance'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { mockApi } from './mock-api'

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '')

// One provenance bundle: the babel half marks host elements, the bundler half
// publishes the manifest, the context lock and the build report.
const provenance = createProvenance({
  repo: 'roughcompass/management-console',
  commit: process.env.GIT_COMMIT ?? 'dev-preview',
  root,
  contextLock: {
    frame: '3.1.0',
    frameContracts: '3.1',
    designTokens: '4.2.1',
    capabilityRegistry: '2026-09-11T00:00:00Z',
    lobConventions: 'markets-1.4',
    mfes: { 'payments-dash': '2.4.1', 'limits-panel': '1.2.0' },
  },
  artifacts: [
    { kind: 'env-var', name: 'PREVIEW_TTL_MINUTES', value: '90' },
    { kind: 'remote', name: 'payments-dash', value: 'https://cdn.preview/payments-dash/2.4.1/remoteEntry.js' },
    { kind: 'dependency', name: '@cib/design-tokens', value: '4.2.1' },
  ],
})

export default defineConfig({
  plugins: [
    react({ babel: { plugins: [provenance.babelPlugin] } }),
    provenance.vitePlugin as never,
    mockApi(),
  ],
  server: { port: 5273 },
})
