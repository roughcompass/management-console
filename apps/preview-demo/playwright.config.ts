import { defineConfig } from '@playwright/test'

const executablePath = process.env.PW_CHROMIUM_PATH

/**
 * Browser-level proof of the loop. jsdom cannot exercise the visual level of
 * the chain, because every box it reports is zero.
 *
 * Run `pnpm build` first: the demo consumes the built packages.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5273',
    viewport: { width: 1440, height: 900 },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5273',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
