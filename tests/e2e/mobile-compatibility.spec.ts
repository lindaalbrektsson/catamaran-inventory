import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const widths = [320, 360, 375, 390, 412, 430, 768, 1024, 1440];
test('production service worker renders an offline page on actual network loss', async ({
  page,
}) => {
  let unavailable = false;
  const allowed = new Set([
    'sw.js',
    'offline.html',
    'offline.js',
    'icon.svg',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
    'apple-icon.png',
    'favicon.png',
  ]);
  const server = createServer(async (req, res) => {
    if (unavailable) {
      req.socket.destroy();
      return;
    }
    const file = req.url?.slice(1) ?? '';
    if (!file) {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><title>Isolated worker QA</title><script>navigator.serviceWorker.register("/sw.js")</script>',
      );
      return;
    }
    if (!allowed.has(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'application/javascript'
        : file.endsWith('.html')
          ? 'text/html'
          : file.endsWith('.svg')
            ? 'image/svg+xml'
            : 'image/png',
    );
    res.end(await readFile(path.join(process.cwd(), 'public', file)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    unavailable = true;
    const response = await page.goto(`http://127.0.0.1:${address.port}/inventory`);
    expect(response?.status()).toBe(503);
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
    await page.getByRole('button', { name: 'Español', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
    unavailable = false;
    await page.getByRole('link', { name: /Open|Abrir/ }).click();
    await expect(page).toHaveTitle('Isolated worker QA');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
const views = [
  'locations',
  'detail',
  'quick-add',
  'quick-move',
  'transfer',
  'need',
  'intake',
  'receipt',
  'task-form',
  'task-list',
  'task-progress',
  'document-home',
  'document-list',
  'document-form',
  'recovery',
  'password',
  'history',
].filter((view) => !process.env.COMPAT_RELEASE || !['recovery', 'password'].includes(view));
test('long new item names wrap in the Add suggestions at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('http://127.0.0.1:4174/?view=quick-add&lang=es');
  await page.getByRole('combobox').fill('SnorkelingEquipmentReplacement'.repeat(4));
  await expect(page.getByRole('listbox')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const list = page.getByRole('listbox');
  expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
for (const width of widths)
  test(`Spanish operational screens fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const view of views) {
      await page.goto(`http://127.0.0.1:4174/?view=${view}&lang=es`);
      await expect(page.locator('main')).toBeVisible();
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll('main *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width && (r.right > innerWidth + 1 || r.left < -1);
          })
          .slice(0, 6)
          .map((el) => ({ tag: el.tagName, text: el.textContent?.slice(0, 70) })),
      }));
      expect(
        overflow.scroll,
        `${view} ${width}: ${JSON.stringify(overflow.offenders)}`,
      ).toBeLessThanOrEqual(width + 1);
      const clipped = await page
        .locator('main button:visible')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.scrollWidth > button.clientWidth + 2)
            .map((button) => button.textContent),
        );
      expect(clipped, `${view}: clipped buttons`).toEqual([]);
      const tiny = await page
        .locator('main button:visible')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getBoundingClientRect().height < 44)
            .map((button) => button.textContent),
        );
      expect(tiny, `${view}: buttons need at least 44px height`).toEqual([]);
      if (width < 768) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const overlap = await page.evaluate(() => {
          const nav = [...document.querySelectorAll('nav')].find(
            (el) =>
              getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().height > 0,
          );
          const main = document.querySelector('main');
          return nav && main
            ? main.getBoundingClientRect().bottom - nav.getBoundingClientRect().top
            : 0;
        });
        expect(overlap, `${view}: content obscured by bottom navigation`).toBeLessThanOrEqual(1);
      }
    }
    expect(errors).toEqual([]);
  });
test('public login fits smallest phone and landscape height without input zoom', async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/login');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const inputs = await page
      .locator('input:visible')
      .evaluateAll((elements) => elements.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(inputs.every((size) => size >= 16)).toBe(true);
    await page.locator('input[name=password]').focus();
    const submit = page
      .locator('form')
      .filter({ has: page.locator('input[name=password]') })
      .locator('button[type=submit]');
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
  }
});
test('reduced viewport permits scrolling to quantity and save; upload opens file chooser', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await page.goto('http://127.0.0.1:4174/?view=intake&lang=en');
  const camera = page.locator('input[capture=environment]');
  await expect(camera).toHaveCount(1);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Take photo', { exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles('public/icon-192.png');
  await expect(page.locator('img[alt]')).toBeVisible();
  const submit = page.locator('button[type=submit]');
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
});
