import { test, expect } from '@playwright/test';
const fixture = 'http://127.0.0.1:4174/';

test('Catamaran Belize location summaries fit mobile and show an honest empty state', async ({
  page,
}) => {
  await page.goto(`${fixture}?view=locations&lang=es`);
  for (const name of ['Cas Cat', 'Bodega'])
    await expect(page.getByRole('heading', { name, exact: true }).last()).toBeVisible();
  const storage = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Bodega' }) });
  await expect(storage.getByRole('link', { name: 'Agregar', exact: true })).toHaveAttribute(
    'href',
    /action=add$/,
  );
  await expect(storage).not.toContainText('Productos activos');
  await expect(storage).not.toContainText('Inventario bajo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/coral-locations-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('detail exposes permitted stock actions and thresholds', async ({ page }) => {
  await page.goto(`${fixture}?view=detail&lang=es`);
  await expect(page.getByRole('link', { name: 'Agregar inventario', exact: true })).toHaveAttribute(
    'href',
    /mode=add$/,
  );
  await expect(page.getByRole('link', { name: 'Retirar inventario', exact: true })).toHaveAttribute(
    'href',
    /mode=remove$/,
  );
  await expect(page.getByRole('link', { name: 'Transferencia', exact: true })).toHaveAttribute(
    'href',
    /\/transfer$/,
  );
  await expect(page.getByText('Inventario objetivo', { exact: true })).toBeVisible();
  await expect(page.getByText('Costo unitario estimado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/coral-detail-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.goto(`${fixture}?view=detail&crew=1`);
  await expect(page.getByRole('link', { name: 'Record tour use' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Transfer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add stock', exact: true })).toHaveCount(0);
});
test('quick mobile stock entry accepts decimal comma and preserves entered data after error', async ({
  page,
}) => {
  await page.goto(`${fixture}?form=1&lang=es`);
  await page
    .getByRole('group', { name: 'Cantidad rápida' })
    .getByRole('button', { name: '6', exact: true })
    .click();
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('6');
  await page.getByLabel('Cantidad', { exact: true }).fill('0,125');
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('0.125');
  await page.getByLabel('Motivo', { exact: true }).selectOption('damaged');
  await page.getByText('Agregar una nota', { exact: true }).click();
  await page.getByLabel('Notas', { exact: false }).fill('Test fixture only');
  await page.getByRole('button', { name: 'Guardar cambio' }).click();
  await expect(page.getByRole('alert')).toContainText('No hay suficientes existencias');
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('0.125');
  await expect(page.getByLabel('Notas', { exact: false })).toHaveValue('Test fixture only');
  await expect(page.getByLabel('Motivo', { exact: true })).toHaveValue('damaged');
  for (const element of await page
    .locator('button:visible,input:visible,select:visible,summary:visible')
    .all()) {
    expect((await element.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
test('transfer infers the only destination and preserves request identity after failure', async ({
  page,
}) => {
  await page.goto(`${fixture}?view=transfer&lang=es`);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText('Bodega', { exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Cantidad rápida' })
    .getByRole('button', { name: '12', exact: true })
    .click();
  await page.getByRole('button', { name: 'Transferencia', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No hay suficientes existencias');
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('12');
  await expect(page.locator('input[name="destinationId"]')).toHaveValue(
    '10000000-0000-4000-8000-000000000003',
  );
  await expect(page.locator('input[name="requestId"]')).toHaveValue(
    '50000000-0000-4000-8000-000000000001',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/coral-transfer-${test.info().project.name}.png`,
    fullPage: true,
  });
});
