import { test, expect } from '@playwright/test';

test('global catalogue searches items without location or active controls', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=global-items');
  await page.getByRole('searchbox', { name: 'Search items' }).fill('wAt');
  await expect(page.getByRole('link', { name: /Water/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Belikin Beer/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add item', exact: true })).toBeVisible();
  await expect(page.getByLabel('Active', { exact: true })).toHaveCount(0);
});

test('new catalogue item requires an explicit duplicate choice', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=global-edit&new=1');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('belikin-beer');
  await expect(page.getByRole('link', { name: /Use \/ Merge with existing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save change' })).toBeDisabled();
  await page.getByLabel('Create as new item').check();
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Bar' });
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('global-item-fixture')))
    .toContain('"confirmDuplicate":true');
});

for (const [lang, remove, cancel, question] of [
  ['en', 'Delete item', 'Cancel', 'Are you sure you want to delete this item from the list?'],
  [
    'es',
    'Eliminar artículo',
    'Cancelar',
    '¿Seguro que quieres eliminar este artículo de la lista?',
  ],
])
  test(`delete confirms before writing in ${lang}`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:4174/?view=global-edit&lang=${lang}`);
    await page.getByRole('button', { name: remove, exact: true }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('global-item-fixture'))).toBeNull();
    await page.getByRole('button', { name: cancel, exact: true }).click();
    await expect(page.getByText(question, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: remove, exact: true }).click();
    await page
      .getByRole('region', { name: remove })
      .getByRole('button', { name: remove, exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('global-item-fixture')))
      .toContain('"action":"DELETE"');
  });

test('merge requires a chosen target and explicit confirmation, with no mobile overflow', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=global-edit');
  await page.getByRole('button', { name: 'Merge with…', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Merge items' })).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Merge with…' })
    .selectOption({ label: 'Water · bottles' });
  expect(await page.evaluate(() => sessionStorage.getItem('global-item-fixture'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Merge items' }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('global-item-fixture')))
    .toContain('"action":"MERGE"');
});
