import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174/';
test('existing item is selected inline, location preselected, decimal quantity retry is stable', async ({
  page,
}) => {
  await page.goto(base + '?view=quick-add');
  const input = page.getByRole('combobox', { name: 'Type an item name' });
  await input.fill('BELI');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.getByText('Selected item:', { exact: false })).toContainText('Belikin Beer');
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).toHaveCount(0);
  await page.getByLabel('Quantity', { exact: true }).fill('2,5');
  await page.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const first = await page.evaluate(() => sessionStorage.getItem('quick-add-fixture'));
  await page.getByRole('button', { name: 'Save change', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('quick-add-fixture'))).toBe(first);
  expect(JSON.parse(first!).location).toBe('10000000-0000-4000-8000-000000000001');
});
test('new item needs only name category quantity and warns about punctuation duplicates', async ({
  page,
}) => {
  await page.goto(base + '?view=quick-add');
  const input = page.getByRole('combobox', { name: 'Type an item name' });
  await expect(input).toHaveAttribute('spellcheck', 'true');
  await input.fill('Coca-Cola');
  await expect(page.getByRole('option', { name: 'Coca Cola', exact: true })).toBeVisible();
  await page.getByRole('option', { name: /Create as a new item/ }).click();
  await expect(page.getByText('Similar items already exist.', { exact: false })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Bar' });
  await page.getByLabel('Quantity', { exact: true }).fill('3');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const value = JSON.parse(
    (await page.evaluate(() => sessionStorage.getItem('quick-add-fixture')))!,
  );
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue(
    '20000000-0000-4000-8000-000000000001',
  );
  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Save change', exact: true }).click();
  expect(
    JSON.parse((await page.evaluate(() => sessionStorage.getItem('quick-add-fixture')))!),
  ).toEqual(value);
  expect(value).toMatchObject({
    name: 'Coca-Cola',
    product: '',
    quantity: '3',
    confirmDuplicate: 'on',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/quick-add-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('bottom Add chooses location on the same form and Spanish uses spellcheck', async ({
  page,
}) => {
  await page.goto(base + '?view=quick-add&bottom=1&lang=es');
  await expect(
    page.getByRole('combobox', { name: 'Escribe el nombre del artículo' }),
  ).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('combobox', { name: 'Ubicación', exact: true })).toBeVisible();
});
test('purchase need keeps fields after failure and offers all statuses', async ({ page }) => {
  await page.goto(base + '?view=need');
  await page.getByLabel('Name', { exact: true }).fill('Fixture need');
  await page.getByRole('combobox', { name: 'Purchase country', exact: true }).selectOption('USA');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('ORDERED');
  await page.getByRole('button', { name: 'Save purchase need', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Fixture need');
  expect(
    JSON.parse((await page.evaluate(() => sessionStorage.getItem('need-fixture')))!),
  ).toMatchObject({ country: 'USA', status: 'ORDERED' });
});
