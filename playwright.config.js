import { defineConfig } from '@playwright/test'

const port = 4173
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/global-setup.js',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: String(port),
      DB_PATH: './data/browser-test.sqlite',
      APP_URL: baseURL,
      DOMAIN: `127.0.0.1:${port}`,
      DOMAIN_NAME: `127.0.0.1:${port}`,
      TRUST_PROXY: 'false',
      MONITORING_ENABLED: 'false',
      AUTH_RATE_LIMIT_MAX: '200',
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
  },
})
