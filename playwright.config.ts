import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /mobile-compatibility\.spec\.ts/,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'npm run start -- --port 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'npx vite --config tests/ui/vite.config.mts',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
