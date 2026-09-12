import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@adl/anchor-core': r('./packages/anchor-core/src/index.ts'),
      '@adl/provenance': r('./packages/provenance/src/index.ts'),
      '@adl/feedback-ui': r('./packages/feedback-ui/src/index.ts'),
      '@adl/feedback-store': r('./packages/feedback-store/src/index.ts'),
      '@de/ui-provenance/core': r('./ui-provenance/src/core/index.ts'),
      '@de/ui-provenance/compiler': r('./ui-provenance/src/compiler/index.ts'),
      '@de/ui-provenance/runtime': r('./ui-provenance/src/runtime/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'ui-provenance/**/*.test.ts',
    ],
    globals: false,
  },
})
