import { defineProvenanceConfig } from '@de/ui-provenance/compiler'

export default defineProvenanceConfig({
  applicationId: 'frame-shell',
  repository: 'github/roughcompass/management-console',
  include: ['src/**/*.{jsx,tsx}'],
  exclude: ['**/*.test.*', '**/e2e/**'],
  registry: '.ui-provenance/registry.json',
  federation: { name: 'shell', role: 'host' },
})
