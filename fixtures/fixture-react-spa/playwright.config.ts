import { defineConfig, devices } from '@playwright/test'

// End-to-end smoke tests for the fixture SPA. Run with `pnpm test:e2e`
// (browsers must be installed first: `pnpm exec playwright install chromium`).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
