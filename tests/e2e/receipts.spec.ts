import { test, expect } from '@playwright/test';

test('receipt camera, image preview and safe retry work on mobile and desktop', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=receipt');
  await expect(page.locator('input[capture="environment"]')).toHaveCount(1);
  await page.locator('input[type="file"]').last().setInputFiles('public/icon-192.png');
  await expect(page.locator('img[alt]')).toBeVisible();
  const id = await page.locator('input[name="requestId"]').inputValue();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('input[name="requestId"]')).toHaveValue(id);
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('private receipt URL denies anonymous access and caching', async ({ request }) => {
  const response = await request.get('/receipts/80000000-0000-4000-8000-000000000001');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
});

for (const type of ['NORMAL', 'FUEL', 'STORE'])
  test(`${type} camera images use shared compression`, async ({ page }) => {
    await page.goto(
      'http://127.0.0.1:4174/?view=' + (type === 'NORMAL' ? 'receipt' : 'intake') + '&type=' + type,
    );
    const buffer = await (
      await import('sharp')
    )
      .default({ create: { width: 4000, height: 6000, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"]')
      .last()
      .setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer });
    const img = page.locator('img[alt]');
    await expect(img).toBeVisible();
    const result = await img.evaluate(async (node) => {
      const i = node as HTMLImageElement;
      const blob = await (await fetch(i.src)).blob();
      return { type: blob.type, size: blob.size, width: i.naturalWidth, height: i.naturalHeight };
    });
    expect(result.type).toBe('image/jpeg');
    expect(result.width).toBeLessThanOrEqual(2400);
    expect(result.height).toBeLessThanOrEqual(4000);
    expect(result.size).toBeLessThan(3 * 1024 * 1024);
    console.log(
      JSON.stringify({
        receipt: type,
        input: buffer.length,
        output: result.size,
        width: result.width,
        height: result.height,
      }),
    );
  });

test('slow online receipt stays pending with the same request and form values', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=receipt&slow=1');
  await page.locator('input[type="file"]').last().setInputFiles('public/icon-192.png');
  await expect(page.locator('img[alt]')).toBeVisible();
  await page.clock.install();
  const id = await page.locator('input[name="requestId"]').inputValue();
  await page.locator('button[type="submit"]').click();
  await page.clock.fastForward(15000);
  await expect(page.getByRole('status')).toContainText('taking longer');
  await expect(page.locator('button[type="submit"]')).toBeDisabled();
  await expect(page.locator('input[name="requestId"]')).toHaveValue(id);
  await expect(page.locator('img[alt]')).toBeVisible();
  await page.clock.fastForward(6000);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('input[name="requestId"]')).toHaveValue(id);
});
