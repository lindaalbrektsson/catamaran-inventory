import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174';
for (const mode of ['remove', 'transfer'])
  test(`${mode} stays on one screen after item choice`, async ({ page }) => {
    await page.goto(`${base}?view=quick-move&mode=${mode}`);
    await page.getByRole('combobox', { name: 'Name', exact: true }).fill('bel');
    await page.getByRole('option', { name: /Belikin/ }).click();
    await expect(page.getByRole('combobox', { name: 'Reason', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Destination', exact: true })).toHaveCount(0);
    await page.getByLabel('Quantity', { exact: true }).fill('1');
    await page
      .getByRole('button', { name: mode === 'transfer' ? 'Transfer' : 'Save change', exact: true })
      .click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
test('mobile has Home Add Need More while desktop retains owner navigation', async ({
  page,
}, info) => {
  await page.goto(`${base}?view=locations`);
  const nav = page.locator('nav:visible');
  if (info.project.name === 'mobile')
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Add', 'Need', 'More']);
  else {
    await expect(nav.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Receipts', exact: true })).toBeVisible();
  }
});
