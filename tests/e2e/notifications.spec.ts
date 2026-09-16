import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
});
test('standalone install guide is public and notification settings require login', async ({
  page,
  request,
}) => {
  await page.goto('/install');
  await expect(
    page.getByRole('heading', { name: 'How to install on Android', exact: true }),
  ).toBeVisible();
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.post('/api/reminders/dispatch')).status()).toBe(401);
});
test('explicit opt in, permission status, test and off work with simulated browser PushManager', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        get permission() {
          return permission;
        },
        requestPermission: async () => {
          permission = 'granted';
          return permission;
        },
      },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
    let sub: unknown = null;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => ({
          active: true,
          pushManager: {
            getSubscription: async () => sub,
            subscribe: async () => {
              sub = {
                endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
                toJSON: () => ({}),
                unsubscribe: async () => {
                  sub = null;
                  return true;
                },
              };
              return sub;
            },
          },
        }),
      },
    });
  });
  await page.goto('http://127.0.0.1:4174/?view=notifications');
  await expect(page.getByRole('switch')).toBeEnabled();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch').click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByRole('status')).toContainText('Test sent');
  await page.getByRole('switch').click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});
test('iOS unsupported context shows installation requirement without requesting permission', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'PushManager');
  });
  await page.goto('http://127.0.0.1:4174/?view=notifications&lang=es');
  await expect(page.getByRole('switch')).toBeDisabled();
  await expect(page.getByText(/iOS 16.4/)).toBeVisible();
});
test('manager mobile document upload has camera and file controls, no access administration', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=document-form&staff');
  await expect(page.getByRole('button', { name: 'Take photo', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Choose image or PDF', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Who can access this document?' })).toHaveCount(
    0,
  );
  await page.getByLabel('Title', { exact: true }).fill('Camera fixture');
  await page.locator('input[capture=environment]').setInputFiles({
    name: 'camera.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('isolated-image-fixture'),
  });
  await page.getByRole('button', { name: 'Save document' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(sessionStorage.getItem('document-fixture')!));
  expect(data.file.name).toBe('camera.jpg');
  expect(data.access_level).toBe('MANAGERS');
});

test('denied permission is explicit and never prompts on page load', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'denied',
        requestPermission: () => {
          throw new Error('Unexpected prompt');
        },
      },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => ({ pushManager: { getSubscription: async () => null } }),
      },
    });
  });
  await page.goto('http://127.0.0.1:4174/?view=notifications');
  await expect(page.getByText('Permission: Blocked', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Enable notifications' })).toBeDisabled();
  await expect(page.getByText(/Allow notifications in your browser/)).toBeVisible();
});

test('desktop has no notification controls and never requests permission', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission: () => {
          throw new Error('DESKTOP_PERMISSION_REQUEST');
        },
      },
    });
  });
  await page.goto('http://127.0.0.1:4174/?view=notifications');
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByText('Send test notification', { exact: true })).toHaveCount(0);
});
