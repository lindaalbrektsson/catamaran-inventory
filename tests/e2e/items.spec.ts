import { test, expect } from '@playwright/test';
test('manual item form is mobile friendly and submits validated fields', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=items');
  await expect(page.getByLabel('Estimated unit cost', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Currency', exact: true })).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Test fixture item');
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Bar' });
  await page
    .getByRole('combobox', { name: 'Location', exact: true })
    .selectOption({ label: 'Cas Cat' });
  await page.getByLabel('Minimum stock', { exact: true }).fill('2');
  await page.getByLabel('Target stock', { exact: true }).fill('4');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/manual-item-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Items saved');
});
