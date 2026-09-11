import { test, expect } from '@playwright/test';

for (const mode of ['browser', 'android-standalone', 'ios-standalone']) {
  test(`update preserves SDK session and warns before losing a draft: ${mode}`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      if (mode === 'ios-standalone')
        Object.defineProperty(navigator, 'standalone', { value: true });
      if (mode === 'android-standalone') {
        const match = window.matchMedia.bind(window);
        window.matchMedia = (q) =>
          q === '(display-mode: standalone)'
            ? ({
                ...match(q),
                matches: true,
                addEventListener() {},
                removeEventListener() {},
              } as MediaQueryList)
            : match(q);
      }
    }, mode);
    await page.route('**/app-version', (route) =>
      route.fulfill({ json: { version: 'new-test-version' } }),
    );
    await page.goto('http://127.0.0.1:4174/update.html');
    await expect(page.getByText('New update available')).toBeVisible();
    const session = (action: string) =>
      page.evaluate(async (action) => {
        const api = (window as unknown as { sessionTest: Record<string, () => Promise<unknown>> })
          .sessionTest;
        return api[action]();
      }, action);
    await session('login');
    await page.getByLabel('Draft').fill('Unfinished stock entry');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByLabel('Draft')).toHaveValue('Unfinished stock entry');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('unsaved changes');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Update now' }).click();
    await expect(page.getByLabel('Draft')).toHaveValue('Unfinished stock entry');
    expect(await session('signedIn')).toBe(true);
    page.once('dialog', (dialog) => dialog.accept());
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Update now' }).click(),
    ]);
    await expect(page.getByLabel('Draft')).toHaveValue('');
    expect(await session('signedIn')).toBe(true);
  });
}

test('Spanish update works without service worker support', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined }),
  );
  await page.route('**/app-version', (route) =>
    route.fulfill({ json: { version: 'new-test-version' } }),
  );
  await page.goto('http://127.0.0.1:4174/update.html?lang=es');
  await expect(page.getByText('Nueva actualización disponible')).toBeVisible();
  await page.getByLabel('Draft').fill('Sin terminar');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('sin guardar');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Actualizar ahora' }).click();
  await expect(page.getByLabel('Draft')).toHaveValue('Sin terminar');
});

test('unresponsive waiting worker falls back to a user-requested reload', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => ({ waiting: { postMessage() {} } }),
        addEventListener() {},
      },
    }),
  );
  await page.route('**/app-version', (route) =>
    route.fulfill({ json: { version: 'new-test-version' } }),
  );
  await page.goto('http://127.0.0.1:4174/update.html');
  await expect(page.getByText('New update available')).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Update now' }).click(),
  ]);
});
