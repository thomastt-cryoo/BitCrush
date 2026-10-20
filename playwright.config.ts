import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 1440, height: 960 },
    launchOptions: process.env.BITCRUSH_CHROME ? { executablePath: process.env.BITCRUSH_CHROME } : {},
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
});
