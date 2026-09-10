import { test, expect } from '@playwright/test';

test('production PWA metadata, icons and safe public cache', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const response = await request.get('/manifest.webmanifest');
  const manifest = await response.json();
  expect(manifest.name).toBe('Catamaran Belize');
  expect(manifest.short_name).toBe('Catamaran Belize');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('portrait');
  expect(manifest.start_url).toBe('/');
  expect(manifest.categories).toEqual(['business', 'productivity']);
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.ok()).toBe(true);
    const data = await image.body();
    const [width, height] = icon.sizes.split('x').map(Number);
    expect(data.readUInt32BE(16)).toBe(width);
    expect(data.readUInt32BE(20)).toBe(height);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).not.toContain('user-scalable=no');
  expect(viewport).not.toContain('maximum-scale=1');
  const worker = await request.get('/sw.js');
  expect(worker.headers()['cache-control']).toContain('no-store');
  expect(worker.headers()['set-cookie']).toBeUndefined();
  expect((await request.get('/offline.html')).headers()['set-cookie']).toBeUndefined();
  await page.goto('/inventory');
  const keys = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('coral-public-'));
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map((key) => new URL(key.url).pathname),
        ),
      )
    ).flat();
  });
  expect(keys.sort()).toEqual(
    [
      '/offline.html',
      '/offline.js',
      '/icon.svg',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
      '/apple-icon.png',
      '/favicon.png',
    ].sort(),
  );
});

test('offline navigation is translated, never queues mutations and recovers', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await expect(page.getByRole('alert').filter({ hasText: 'Sin conexión' })).toBeVisible();
  const mutation = await page.evaluate(async () => {
    try {
      await fetch('/inventory', { method: 'POST', body: 'offline-verification' });
      return 'unexpected';
    } catch {
      return 'network-failure';
    }
  });
  expect(mutation).toBe('network-failure');
  const response = await page.goto('/inventory');
  expect(response?.status()).toBe(503);
  await expect(page.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
  await expect(page.getByText('Los cambios no se guardan', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const element of await page.locator('button:visible,a:visible').all()) {
    expect((await element.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: `artifacts/pwa-offline-${test.info().project.name}.png`,
    fullPage: true,
  });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/\/(setup|login)$/);
});
