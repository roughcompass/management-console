import { defineProvenanceConfig } from '@de/ui-provenance/compiler'

export default defineProvenanceConfig({
  applicationId: 'payments-web',
  repository: 'github/roughcompass/management-console',
  include: ['src/**/*.{jsx,tsx}'],
  exclude: ['**/*.test.*', '**/*.stories.*', '**/generated/**'],
  registry: '.ui-provenance/registry.json',
  saltPackages: ['@salt-ds/core', '@salt-ds/lab', '@salt-ds/icons'],
  ambiguousMatchThreshold: 0.9,
  tombstoneRetentionDays: 90,
  productionDisabled: true,
  federation: {
    name: 'payments_dash',
    role: 'remote',
    exposes: ['./PaymentsDash', './PaymentsDashNext'],
  },
})
