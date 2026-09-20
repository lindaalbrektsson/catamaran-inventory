import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch:
    /(mobile-compatibility|session-persistence|receipts|quick-add|inventory-needs|tasks|pwa|pwa-update|staff-auth|recovery|documents|mobile-ux-review|visual-polish)\.spec\.ts/,
  timeout: 120_000,
  workers: 4,
  projects: [
    {
      name: 'chromium-emulation',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'webkit-emulation',
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
});
