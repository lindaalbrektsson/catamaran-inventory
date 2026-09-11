import { readFile } from 'node:fs/promises';
import { receiptImagePolicy } from '../../src/lib/receipt-response';
import { test, expect } from '@playwright/test';
const fixture = 'http://127.0.0.1:4174';
test('owner can rename an existing item without Excel duplicate validation blocking save', async ({
  page,
}) => {
  await page.goto(fixture + '/?view=items&edit=1');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Renamed fixture');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('saved');
});
test('desktop-only direct URLs explain the mobile restriction and offer a return link', async ({
  page,
}, info) => {
  await page.goto(fixture + '/?view=desktop-only');
  if (info.project.name === 'mobile') {
    await expect(page.getByText('Open this owner tool on a desktop or tablet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to inventory' })).toHaveAttribute(
      'href',
      '/inventory',
    );
    await expect(page.getByRole('link', { name: 'Download Excel template' })).toBeHidden();
  } else await expect(page.getByRole('link', { name: 'Audit history', exact: true })).toBeVisible();
});
test('Undo submits a stable request and refreshes the history', async ({ page }) => {
  await page.goto(fixture + '/?view=undo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('refreshed-fixture')))
    .toBe('yes');
  const first = await page.evaluate(() => sessionStorage.getItem('undo-fixture'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('undo-fixture'))).toBe(first);
});
test('receipt review retains entered details after errors and supports both terminal statuses', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Owner review is desktop-only');
  await page.goto(fixture + '/?view=review&lang=es');
  await page.locator('input[name=amount]').fill('12,50');
  await page.locator('input[name=supplier]').fill('Fixture supplier');
  for (const status of ['REVIEWED', 'ARCHIVED']) {
    await page.locator('select[name=status]').selectOption(status);
    await page.getByRole('button', { name: 'Guardar revisión' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('input[name=amount]')).toHaveValue('12,50');
    const submitted = JSON.parse(
      (await page.evaluate(() => sessionStorage.getItem('review-fixture')))!,
    );
    expect(submitted.status).toBe(status);
    expect(submitted).not.toHaveProperty('uploaded_by');
    expect(submitted).not.toHaveProperty('created_at');
  }
});
test('all owner-only routes reject anonymous visitors', async ({ request }) => {
  for (const path of [
    '/inventory/audit',
    '/inventory/overview',
    '/inventory/categories',
    '/inventory/items?import=1',
  ]) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toContain('/login');
  }
});

test('opening an original image remains visible under the actual response security policy', async ({
  page,
}) => {
  await page.route('**/qa-original-image', async (route) =>
    route.fulfill({
      body: await readFile('public/icon-192.png'),
      contentType: 'image/png',
      headers: {
        'Content-Security-Policy': receiptImagePolicy,
        'X-Content-Type-Options': 'nosniff',
      },
    }),
  );
  await page.goto(fixture + '/qa-original-image');
  await expect
    .poll(() => page.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(192);
});
