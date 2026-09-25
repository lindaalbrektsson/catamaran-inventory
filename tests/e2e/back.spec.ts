import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:4174';
const html = readFileSync('tests/ui/back.html', 'utf8');
test.beforeEach(async ({ page }) => {
  await page.route(origin + '/**', (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ contentType: 'text/html', body: html })
      : route.continue(),
  );
});
test('Home → Inventory → item → Back retains filters, refresh and router state', async ({
  page,
}) => {
  await page.goto(origin + '/');
  await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => history.state.next)).toBe('preserved');
  await page.getByRole('button', { name: 'Item', exact: true }).click();
  await page.reload();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(origin + '/inventory?category=food');
  await page.getByRole('button', { name: 'Replace filter', exact: true }).click();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(origin + '/');
  await page.goForward();
  await expect(page).toHaveURL(origin + '/inventory?category=tools');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(origin + '/');
});
const routes = [
  '/failure',
  '/inventory',
  '/inventory/bodega',
  '/inventory/cas-cat/item',
  '/inventory/bodega/item/change',
  '/inventory/bodega/item/transfer',
  '/inventory/bodega/item/settings-history',
  '/inventory/overview',
  '/inventory/audit',
  '/inventory/categories',
  '/inventory/items',
  '/items',
  '/items/new',
  '/items/item',
  '/tasks',
  '/tasks/new',
  '/tasks/task',
  '/tasks/maintenance',
  '/tasks/maintenance/new',
  '/tasks/maintenance/plan',
  '/tasks/maintenance/task',
  '/needs/new',
  '/needs/need',
  '/documents',
  '/documents/new',
  '/documents/document',
  '/expenses',
  '/expenses/capture',
  '/expenses/new',
  '/expenses/records',
  '/expenses/inbox/receipt',
  '/expenses/receipt',
  '/staff',
  '/notifications',
  '/cashbook',
  '/add?inventory=1',
];
for (const path of routes) {
  test(`direct ${path} and refresh have one Back control returning Home`, async ({ page }) => {
    await page.goto(origin + path);
    const back = page.getByRole('link', { name: 'Back', exact: true });
    await expect(back).toHaveCount(1);
    await expect(back).toBeVisible();
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.reload();
    await back.click();
    await expect(page).toHaveURL(origin + '/');
  });
}
test('primary destinations keep obvious navigation without redundant Back', async ({ page }) => {
  for (const path of ['/', '/add', '/needs', '/more']) {
    await page.goto(origin + path);
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  }
});
test('authentication is not a useful Back destination; Spanish Back stays in app', async ({
  page,
}) => {
  await page.goto(origin + '/login?lang=es');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('link', { name: 'Volver', exact: true }).click();
  await expect(page).toHaveURL(origin + '/');
});
test('real Next public install route provides Home fallback after refresh', async ({ page }) => {
  await page.goto('/install');
  await page.reload();
  const back = page.getByRole('link', { name: 'Back', exact: true });
  await expect(back).toHaveAttribute('href', '/');
  await back.click();
  await expect(page).not.toHaveURL(/\/install$/);
});

test('real Next history integration preserves Back through refresh and router state updates', async ({
  page,
}) => {
  await page.goto('/install?step=1');
  await expect.poll(() => page.evaluate(() => Boolean(history.state?.__catamaranBack))).toBe(true);
  await page.evaluate(() => history.pushState({ testMarker: 'kept' }, '', '/install?step=2'));
  await expect(page).toHaveURL(/\/install\?step=2$/);
  await page.reload();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/install\?step=1$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/install\?step=2$/);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/install\?step=1$/);
});
