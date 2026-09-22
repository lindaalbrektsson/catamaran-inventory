import { test, expect, type Page } from '@playwright/test';
const base = 'http://127.0.0.1:4174/?view=onboarding';
test('Spanish onboarding uses translated controls', async ({page}) => {
  await device(page, {installed:true});
  await page.goto(base+'&lang=es');
  await expect(page.getByRole('heading',{name:'Mantente al día'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Activar notificaciones'})).toBeVisible();
  await page.getByRole('button',{name:'Ahora no'}).click();
  await expect(page.getByRole('heading',{name:'Mantente al día'})).toHaveCount(0);
});
async function device(
  page: Page,
  {
    installed = false,
    platform = 'ios',
    permission = 'default',
    result = 'granted',
    supported = true,
    active = false,
  }: {
    installed?: boolean;
    platform?: string;
    permission?: NotificationPermission;
    result?: NotificationPermission;
    supported?: boolean;
    active?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ installed, platform, permission, result, supported, active }) => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value:
          platform === 'ios'
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18 Safari/604'
            : platform === 'android'
              ? 'Mozilla/5.0 Android'
              : 'Mozilla/5.0 Windows',
      });
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
      let state = permission;
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: {
          get permission() {
            return state;
          },
          requestPermission: async () => {
            sessionStorage.setItem(
              'prompted',
              String(Number(sessionStorage.getItem('prompted')) + 1),
            );
            state = result;
            return result;
          },
        },
      });
      if (!supported) {
        Object.defineProperty(window, 'PushManager', { configurable: true, value: undefined });
        delete (window as unknown as { PushManager?: unknown }).PushManager;
      } else
        Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
      const make = () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
        toJSON: () => ({}),
        unsubscribe: async () => {
          sub = null;
          return true;
        },
      });
      let sub: ReturnType<typeof make> | null = active ? make() : null;
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: async () => ({
            active: true,
            pushManager: {
              getSubscription: async () => sub,
              subscribe: async () => {
                sub = make();
                return sub;
              },
            },
          }),
        },
      });
    },
    { installed, platform, permission, result, supported, active },
  );
}
test('mobile browser shows install, snoozes three days, keeps Settings link and isolates users', async ({
  page,
}) => {
  await device(page);
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Installation guide' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toHaveCount(0);
  await page.goto(base + '&user=fixture-two');
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem('catamaran:onboarding:v1:fixture-one:install', String(Date.now() - 1)),
  );
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('prompted'))).toBeNull();
});
test('Android invokes native install only on tap and hides on appinstalled', async ({ page }) => {
  await device(page, { platform: 'android' });
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    Object.assign(e, {
      prompt: async () => {
        sessionStorage.setItem('installed', 'true');
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('installed'))).toBe('true');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toHaveCount(0);
});
for (const platform of ['ios', 'android'])
  test(platform + ' install fallback opens guide', async ({ page }) => {
    await device(page, { platform });
    await page.goto(base);
    await page.getByRole('button', { name: 'Install app', exact: true }).click();
    expect(await page.evaluate(() => sessionStorage.getItem('navigation-fixture'))).toBe('/install');
  });
test('standalone default permission has explicit opt-in; active grant clears Home', async ({
  page,
}) => {
  await device(page, { installed: true });
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('prompted'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('push-on'))).toBeNull();
  await page.getByRole('button', { name: 'Enable notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('prompted'))).toBe('1');
  expect(await page.evaluate(() => sessionStorage.getItem('push-on'))).toBe('true');
});
test('granted active subscription is quiet; notification Not now can expire', async ({ page }) => {
  await device(page, { installed: true, permission: 'granted', active: true });
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem('catamaran:push-owner:v1', 'fixture-one'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toHaveCount(0);
});
test('notification dismissal survives reload but expires and is user-scoped', async ({ page }) => {
  await device(page, { installed: true });
  await page.goto(base);
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toHaveCount(0);
  await page.goto(base + '&user=fixture-two');
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem('catamaran:onboarding:v1:fixture-one:push', String(Date.now() - 1)),
  );
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toBeVisible();
});
test('denial hides card and Settings offers device guidance without reprompt', async ({ page }) => {
  await device(page, { installed: true, result: 'denied' });
  await page.goto(base);
  await page.getByRole('button', { name: 'Enable notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(await page.evaluate(() => sessionStorage.getItem('prompted'))).toBe('1');
  await device(page, { installed: true, permission: 'denied' });
  await page.goto('http://127.0.0.1:4174/?view=notifications');
  await expect(
    page.getByText(/Allow notifications in your browser or device settings/),
  ).toBeVisible();
  await expect(page.getByRole('switch')).toBeDisabled();
});
test('unsupported and desktop never offer mobile notification onboarding', async ({ page }) => {
  await device(page, { installed: true, supported: false });
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Enable notifications', exact: true })).toHaveCount(
    0,
  );
  await device(page, { platform: 'desktop' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Install app', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Stay updated' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Installation guide' })).toHaveCount(0);
});
