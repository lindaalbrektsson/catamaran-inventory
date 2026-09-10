import { test, expect } from '@playwright/test';
test('native install accepted/dismissed/error feedback and installed state', async ({
  page,
}, testInfo) => {
  await page.addInitScript(
    (mobile) =>
      Object.defineProperty(navigator, 'userAgent', {
        get: () =>
          mobile
            ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
            : 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      }),
    testInfo.project.name === 'mobile',
  );
  await page.goto('/login');
  for (const outcome of ['dismissed', 'error', 'accepted']) {
    await page.evaluate((outcome) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          if (outcome === 'error') throw new Error('test');
        },
        userChoice: Promise.resolve({ outcome }),
      });
      window.dispatchEvent(event);
    }, outcome);
    await page.getByRole('button', { name: 'Install app', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      outcome === 'dismissed' ? 'dismissed' : outcome === 'error' ? 'could not open' : 'accepted',
    );
  }
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
});
test('iPhone and iPad show instructions without a dead install button', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
    }),
  );
  await page.goto('/login');
  await expect(
    page.getByText('To install the app on your iPhone, tap Share and choose Add to Home Screen.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
});
test('standalone mode hides installation controls', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { get: () => true }),
  );
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Catamaran Belize on your phone' })).toHaveCount(0);
});
test('iPad desktop mode uses visible Spanish instructions', async ({ page, context }) => {
  await context.addCookies([
    { name: 'coral-language', value: 'es', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });
  await page.goto('/login');
  await expect(
    page.getByText(
      'Para instalar la app en tu iPhone, toca Compartir y selecciona Añadir a pantalla de inicio.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instalar aplicación', exact: true })).toHaveCount(
    0,
  );
});
test('unavailable native installation gives feedback and disables the button', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Chrome on Android' });
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toBeDisabled();
  await expect(page.getByText(/Automatic installation is not available/)).toBeVisible();
});
