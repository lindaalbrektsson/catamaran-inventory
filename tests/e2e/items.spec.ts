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
  await expect(page.getByRole('switch', { name: 'Keep minimum in stock' })).not.toBeChecked();
  await expect(page.getByLabel('Minimum quantity', { exact: true })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Keep minimum in stock' }).check();
  await page.getByLabel('Minimum quantity', { exact: true }).fill('6');
  if (test.info().project.name === 'desktop')
    await page.getByLabel('Target stock', { exact: true }).fill('12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/manual-item-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Items saved');
});

test('minimum toggle clears the threshold and is translated in Spanish', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=items&lang=es');
  const toggle = page.getByRole('switch', { name: 'Mantener mínimo en inventario' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Cantidad mínima', { exact: true }).fill('6');
  await toggle.uncheck();
  await expect(page.getByLabel('Cantidad mínima', { exact: true })).toHaveCount(0);
  await toggle.check();
  await expect(page.getByLabel('Cantidad mínima', { exact: true })).toHaveValue('');
});

test('editing a configured item retains its enabled minimum', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=items&edit=1&minimum=1');
  await expect(page.getByRole('switch', { name: 'Keep minimum in stock' })).toBeChecked();
  await expect(page.getByLabel('Minimum quantity', { exact: true })).toHaveValue('6');
});
