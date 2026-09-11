import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174';
test('history is readable with optional quantities and no internal codes', async ({ page }) => {
  await page.goto(`${base}?view=history`);
  await expect(page.getByRole('heading', { name: /Water/ })).toBeVisible();
  await expect(page.getByText('+2', { exact: true })).toBeVisible();
  await expect(page.getByText(/Linda/)).toBeVisible();
  await expect(page.locator('time')).toBeVisible();
  await expect(page.getByText('Bodega', { exact: true })).toBeVisible();
  await expect(page.getByText('QUICK_ADD', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Page 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Before: 0/)).not.toBeVisible();
  await page.getByText('Movement details', { exact: true }).click();
  await expect(page.getByText(/Before: 0/)).toBeVisible();
  await expect(page.getByText('Reason: Other', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
});
test('transfer shortcuts and note spacing stay simple at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}?view=transfer`);
  await expect(page.getByRole('group', { name: 'Quick quantity' }).getByRole('button')).toHaveText([
    '1',
    '2',
    '3',
    '4',
  ]);
  await expect(
    page.getByText('Enter a positive quantity with up to 3 decimal places.'),
  ).toHaveCount(0);
  const gap = () =>
    page.evaluate(() => {
      const note = document.querySelector('details')!,
        actions = note.parentElement!.lastElementChild!;
      return actions.getBoundingClientRect().top - note.getBoundingClientRect().bottom;
    });
  expect(await gap()).toBeGreaterThanOrEqual(20);
  await page.getByText('Add a note', { exact: true }).click();
  expect(await gap()).toBeGreaterThanOrEqual(20);
  await expect(page.getByLabel('Notes (optional)')).toBeVisible();
  await page.screenshot({
    path: `artifacts/transfer-spacing-${test.info().project.name}.png`,
    fullPage: true,
  });
});
