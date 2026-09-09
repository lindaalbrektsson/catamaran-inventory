import { test, expect } from '@playwright/test';
test('unconfigured app shows setup, redirects protected routes and persists Spanish', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole('heading', { name: 'Your workspace is almost ready.' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Language' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu espacio de trabajo está casi listo.' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `artifacts/setup-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('manifest is installable and icons exist', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
test('isolated inventory component searches, filters and fits mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174');
  await expect(page.getByRole('heading', { name: 'Belikin Beer' })).toBeVisible();
  expect(
    await page
      .locator('[data-slot="card"]')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).borderRadius)),
  ).toBeGreaterThan(0);
  await page.getByRole('searchbox').fill('Water');
  await expect(page.getByRole('heading', { name: 'Water', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Belikin Beer' })).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Boat supplies' });
  await expect(page.getByRole('heading', { name: 'Paper Towels' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Water', exact: true })).toHaveCount(0);
  await page.getByRole('combobox').selectOption('');
  await page.getByRole('button', { name: 'Low stock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Belikin Beer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Water', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Low stock', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const element of await page.locator('button:visible,input:visible,select:visible').all()) {
    const box = await element.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `artifacts/inventory-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('isolated Spanish stock form displays server error and preserves retry ID', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?form=1&lang=es');
  await page.getByLabel('Cantidad').fill('50');
  await page.getByRole('button', { name: 'Guardar cambio' }).click();
  await expect(page.getByRole('alert')).toContainText('No hay suficientes existencias');
  await expect(page.getByLabel('Cantidad')).toHaveValue('50');
  await expect(page.locator('input[name="requestId"]')).toHaveValue(
    '50000000-0000-4000-8000-000000000001',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/stock-form-${test.info().project.name}.png`,
    fullPage: true,
  });
});
