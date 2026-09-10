import { test, expect } from '@playwright/test';

test('receipt camera, image preview and safe retry work on mobile and desktop', async ({ page }) => {
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
