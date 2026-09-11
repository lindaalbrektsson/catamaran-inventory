import { test, expect } from '@playwright/test';
test('server timestamps display in the browser timezone', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/?view=time');
  await expect(page.locator('time')).toContainText('10:00');
  await expect(page.locator('time')).toHaveAttribute('datetime', '2026-09-09T14:00:00Z');
  await context.close();
});
test('new deployment notification does not reload an unfinished form', async ({ page }) => {
  await page.route('**/app-version', (route) =>
    route.fulfill({ json: { version: 'new-test-version' } }),
  );
  await page.goto('/login');
  await expect(page.getByText(/New update available/)).toBeVisible();
  await page.getByLabel('Email address').fill('unfinished@example.test');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByLabel('Email address')).toHaveValue('unfinished@example.test');
});
test('Excel actions are owner-only and desktop-only', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:4174/?view=admin');
  const excel = page.getByRole('link', { name: 'Download Excel template', exact: true });
  if (info.project.name === 'mobile') await expect(excel).toBeHidden();
  else await expect(excel).toBeVisible();
  await page.goto('http://127.0.0.1:4174/?view=admin&manager=1');
  await expect(
    page.getByRole('link', { name: 'Download Excel template', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add item', exact: true })).toHaveCount(0);
});
test('camera-first capture has only image and payment radio choices', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=intake&lang=es');
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Efectivo' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Tarjeta' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Crédito' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.locator('input[type=file]').last().setInputFiles('public/icon-192.png');
  await page.getByRole('radio', { name: 'Tarjeta' }).check();
  await page.getByRole('button', { name: 'Subir recibo', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Tarjeta' })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/simple-receipt.png', fullPage: true });
});

test('location actions open the item chooser in the chosen mode', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=locations');
  const card = page.locator('article').filter({ hasText: 'Cas Cat' });
  for (const [label, mode] of [
    ['Add', 'add'],
    ['Remove', 'remove'],
    ['Transfer', 'transfer'],
  ]) {
    await expect(card.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'href',
      new RegExp(`action=${mode}$`),
    );
  }
  for (const mode of ['add', 'remove', 'transfer']) {
    await page.goto(`http://127.0.0.1:4174/?action=${mode}`);
    const link = page.getByRole('link').filter({ hasText: 'Water' });
    await expect(link).toHaveAttribute(
      'href',
      new RegExp(mode === 'transfer' ? '/transfer$' : `/change\\?mode=${mode}$`),
    );
  }
});
test('owner overview filters quantities by location and product', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop workspace');
  await page.goto('http://127.0.0.1:4174/?view=overview');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page
    .getByRole('combobox', { name: 'Location', exact: true })
    .selectOption({ label: 'Bodega' });
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('8');
  await page
    .getByRole('searchbox', { name: 'Search products', exact: true })
    .fill('no matching item');
  await expect(page.locator('tbody tr')).toHaveCount(0);
});

