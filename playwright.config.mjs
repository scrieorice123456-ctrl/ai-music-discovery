import { defineConfig, devices } from '@playwright/test'
import { bundledBrowser } from './scripts/bundled-browser.mjs'
const launchOptions = process.env.PLAYWRIGHT_BUNDLED_CHROMIUM === '1' ? await bundledBrowser() : {}
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: {
      DATABASE_PATH: 'data/e2e.sqlite3',
      EXTERNAL_APIS_ENABLED: 'false',
      COOKIE_SECURE: 'false',
    },
  },
})
