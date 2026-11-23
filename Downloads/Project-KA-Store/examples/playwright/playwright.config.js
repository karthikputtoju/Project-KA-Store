// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Start the store first:  (in the project root)  npm start
 * Then run:               npx playwright test
 * Use your installed Chrome instead of downloading browsers: CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx playwright test
 */
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,                       // tests share one database; keep them sequential
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: require.resolve('./global-setup.js'),
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.NO_VIDEO ? 'off' : 'retain-on-failure',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
  ],
});
