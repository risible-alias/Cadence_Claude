import { defineConfig, devices } from '@playwright/test'

const DEV_PORT = 5183
const PREVIEW_PORT = 4183
const OFFLINE = /offline\.spec\.ts/

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${DEV_PORT}` },
  webServer: [
    {
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // The service worker only exists in a production build.
      command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', testIgnore: OFFLINE, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: OFFLINE, use: { ...devices['Pixel 7'] } },
    // Playwright's WebKit build: Safari's engine, though not Safari itself.
    { name: 'safari-desktop', testIgnore: OFFLINE, use: { ...devices['Desktop Safari'] } },
    { name: 'safari-iphone', testIgnore: OFFLINE, use: { ...devices['iPhone 15'] } },
    {
      name: 'offline',
      testMatch: OFFLINE,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
  ],
})
