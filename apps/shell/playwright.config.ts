import { defineConfig } from '@playwright/test'

const executablePath = process.env.PW_CHROMIUM_PATH

/**
 * Browser-level proof of the loop across a real federation boundary: the shell
 * on one origin, two remotes on their own. jsdom cannot exercise this - it has
 * no layout, no second origin, and every box it reports is zero.
 *
 * Run `pnpm build` first: the apps consume the built packages.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  // Every test shares the same three dev servers, and the second version of
  // payments-dash is transformed on its first request. Parallel workers all
  // queue behind that one cold build and time out waiting for it.
  workers: 1,
  use: {
    baseURL: 'http://localhost:5273',
    viewport: { width: 1440, height: 900 },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    {
      command: 'pnpm --filter @adl/payments-mfe dev',
      url: 'http://localhost:5274/remoteEntry.js',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @adl/limits-mfe dev',
      url: 'http://localhost:5275/remoteEntry.js',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5273',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
