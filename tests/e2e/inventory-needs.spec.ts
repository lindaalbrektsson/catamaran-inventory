import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174/?view=need';
test('name searches inventory, selection links the UUID and removes the location field', async ({
  page,
}) => {
  await page.goto(base);
  await page.getByRole('combobox', { name: 'Name', exact: true }).fill('BELIK');
  await page.getByRole('option', { name: /Belikin Beer/ }).click();
  await expect(page.getByText('Linked inventory item: Belikin Beer')).toBeVisible();
  await expect(page.locator('input[name="product_id"]')).toHaveValue(
    '30000000-0000-4000-8000-000000000001',
  );
  await expect(page.locator('[name="location_id"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save purchase need', exact: true }).click();
  expect(
    JSON.parse((await page.evaluate(() => sessionStorage.getItem('need-fixture')))!),
  ).toMatchObject({ product_id: '30000000-0000-4000-8000-000000000001' });
});
for (const status of ['PENDING', 'ORDERED'])
  test(
    'prefilled linked item shows existing ' + status + ' need instead of allowing duplicates',
    async ({ page }) => {
      await page.goto(base + '&linked=1&activeNeed=' + status);
      await expect(page.getByRole('combobox', { name: 'Name', exact: true })).toHaveValue(
        'Belikin Beer',
      );
      await expect(page.getByRole('status')).toContainText('Already in shopping list');
      await expect(page.getByRole('status')).toHaveAttribute(
        'href',
        '/needs/90000000-0000-4000-8000-000000000004',
      );
      await expect(
        page.getByRole('button', { name: 'Save purchase need', exact: true }),
      ).toBeDisabled();
    },
  );
test('unmatched Spanish need remains text-only', async ({ page }) => {
  await page.goto(base + '&lang=es');
  await page.locator('input[name="name"]').fill('Repuesto especial');
  await page
    .getByRole('button', { name: 'Crear "Repuesto especial" como compra necesaria', exact: true })
    .click();
  await expect(page.locator('input[name="product_id"]')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('location shortcut preselects item/location and lets the user review the suggested quantity', async ({
  page,
}) => {
  await page.goto(base + '&linked=1&shopping=1');
  await expect(page.locator('input[name="location_id"]')).toHaveValue(
    '10000000-0000-4000-8000-000000000003',
  );
  await expect(page.locator('input[name="quantity_needed"]')).toHaveValue('10');
  await page.locator('input[name="quantity_needed"]').fill('7');
  await page.getByRole('button', { name: 'Save purchase need', exact: true }).click();
  expect(
    JSON.parse((await page.evaluate(() => sessionStorage.getItem('need-fixture')))!),
  ).toMatchObject({ quantity_needed: '7', location_id: '10000000-0000-4000-8000-000000000003' });
});
test('TEST product locks the creation classification while normal products remain ordinary', async ({
  page,
}) => {
  await page.goto(base + '&linked=1&shopping=1&testProduct=1');
  await expect(page.getByText('TEST', { exact: true })).toBeVisible();
  await expect(page.locator('input[name="is_test"]')).toHaveValue('on');
  await expect(page.locator('input[type="checkbox"][name="is_test"]')).toHaveCount(0);
  await page.goto(base + '&linked=1&shopping=1');
  await expect(page.locator('input[name="is_test"]')).toHaveCount(0);
});
test('Need at a different location does not block the location shortcut', async ({ page }) => {
  await page.goto(base + '&linked=1&shopping=1&activeNeed=ORDERED&scopedNeed=1');
  await expect(page.getByRole('button', { name: 'Save purchase need', exact: true })).toBeEnabled();
});
