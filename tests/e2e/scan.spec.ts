import { test, expect } from '@playwright/test';
test('lost approval response preserves the draft and gives honest retry guidance', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/scan.html');
  await page.getByLabel('What should happen?').first().selectOption('NEED');
  await page.getByLabel('Quantity', { exact: true }).first().fill('2.5');
  await page.evaluate(() => sessionStorage.setItem('scan-drop-response', 'yes'));
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve selected actions' }).click();
  await expect(page.getByRole('alert')).toContainText('Check scan history before retrying');
  await expect(page.getByRole('alert')).not.toContainText('No inventory changed');
  await expect(page.getByLabel('Quantity', { exact: true }).first()).toHaveValue('2.5');
  const submitted = await page.evaluate(() => sessionStorage.getItem('scan-approved'));
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve selected actions' }).click();
  await expect(page.getByRole('status')).toContainText('Scan approved');
  expect(await page.evaluate(() => sessionStorage.getItem('scan-approved'))).toBe(submitted);
});
test('review corrects ambiguous rows, keeps IDs and requires approval before any action', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/scan.html');
  expect(await page.evaluate(() => sessionStorage.getItem('scan-approved'))).toBeNull();
  await expect(page.getByText('Check this', { exact: true }).first()).toBeVisible();
  const row = page.locator('section').first();
  await row.getByLabel('Inventory match').selectOption('30000000-0000-4000-8000-000000000001');
  await row.getByLabel('Quantity', { exact: true }).fill('3');
  await row.getByLabel('What should happen?').selectOption('NEED');
  await page.locator('section').nth(1).getByRole('button', { name: 'Remove row' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('scan-approved'))).toBeNull();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Approve selected actions' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('scan-approved'))).toBeNull();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve selected actions' }).click();
  await expect(page.getByRole('status')).toContainText('Scan approved');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('scan-approved')!));
  expect(saved.review.rows).toHaveLength(1);
  expect(saved.review.rows[0]).toMatchObject({
    action: 'NEED',
    quantity: 3,
    product: '30000000-0000-4000-8000-000000000001',
  });
});
test('negative quantity blocks approval and remains editable', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/scan.html');
  await page.getByLabel('Quantity', { exact: true }).first().fill('-2');
  await page.getByLabel('What should happen?').first().selectOption('NEED');
  await page.getByRole('button', { name: 'Approve selected actions' }).click();
  await expect(page.getByRole('alert')).toContainText('Check the quantities');
  expect(await page.evaluate(() => sessionStorage.getItem('scan-approved'))).toBeNull();
});
test('receipt metadata is editable in Spanish without a stock-add option', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/scan.html?receipt=1&lang=es');
  await page.getByLabel('Proveedor').fill('Corrected Store');
  await page.getByLabel('Total del recibo').fill('14.50');
  await expect(page.getByRole('option', { name: 'Agregar inventario', exact: true })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('camera and gallery are available with a safe retry on scan failure', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/scan.html?capture=1');
  await expect(page.getByRole('button', { name: 'Read image' })).toBeDisabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take photo' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Read image' }).click();
  await expect(page.getByRole('alert')).toContainText('No inventory changed');
  await expect(page.getByRole('button', { name: 'Read image' })).toBeEnabled();
});

test('new item review accepts decimal comma and explicit category and location', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/scan.html');
  const row = page.locator('section').nth(1);
  await row.getByLabel('What should happen?').selectOption('INVENTORY');
  await row
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption('20000000-0000-4000-8000-000000000001');
  await row
    .getByRole('combobox', { name: 'Location', exact: true })
    .selectOption('10000000-0000-4000-8000-000000000003');
  await row.getByLabel('Quantity', { exact: true }).fill('1,5');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve selected actions' }).click();
  await expect(page.getByRole('status')).toContainText('Scan approved');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('scan-approved')!));
  expect(saved.review.rows[1].quantity).toBe(1.5);
});
