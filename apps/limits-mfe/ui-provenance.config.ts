import { defineProvenanceConfig } from '@de/ui-provenance/compiler'

export default defineProvenanceConfig({
  applicationId: 'limits-web',
  repository: 'github/roughcompass/management-console',
  include: ['src/**/*.{jsx,tsx}'],
  registry: '.ui-provenance/registry.json',
  federation: { name: 'limits_panel', role: 'remote', exposes: ['./LimitsPanel'] },
})
