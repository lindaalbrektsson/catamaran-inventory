import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174/';
for (const [status, label] of [
  ['PENDING', 'Pending'],
  ['ORDERED', 'Ordered'],
  ['DONE', 'Done'],
  ['', 'All'],
])
  test(`Need ${label} applies immediately and preserves country`, async ({ page }) => {
    await page.goto(base + '?view=need-filters&country=USA');
    await expect(page.getByRole('button', { name: 'Pending', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: label, exact: true }).click();
    const route = await page.evaluate(() => sessionStorage.getItem('navigation-fixture'));
    const url = new URL(route!, 'http://fixture');
    expect(url.searchParams.get('status')).toBe(status);
    expect(url.searchParams.get('country')).toBe('USA');
    await expect(page.getByRole('button', { name: 'Apply filters' })).toHaveCount(0);
    await page.goto(base + '?view=need-filters&status=' + status);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await page.locator('button[aria-pressed=true]').count()).toBe(1);
  });
test('catalogue has category filtering, alphabetical order and shared icon search', async ({
  page,
}) => {
  await page.goto(base + '?view=global-items');
  const links = page.locator('li a');
  await expect(links).toHaveCount(3);
  expect(await links.allTextContents()).toEqual([
    expect.stringContaining('Belikin'),
    expect.stringContaining('Paper'),
    expect.stringContaining('Water'),
  ]);
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Boat supplies' });
  await expect(links).toHaveCount(1);
  await expect(links.first()).toContainText('Paper Towels');
  await expect(page.locator('svg.lucide-search')).toHaveCount(1);
});
test('stock default prioritizes low stock, sort and selected filter are explicit', async ({
  page,
}) => {
  await page.goto(base);
  const links = page.locator('main a[href^="/inventory/"]').filter({ has: page.locator('h3') });
  await expect(links.first()).toContainText('Belikin Beer');
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('quantity');
  expect(await links.allTextContents()).toEqual([
    expect.stringContaining('Belikin'),
    expect.stringContaining('Paper'),
    expect.stringContaining('Water'),
  ]);
  await page.getByRole('button', { name: 'Low stock', exact: true }).click();
  await expect(links).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Low stock', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('manual assignee is exclusive and does not require a second person', async ({ page }) => {
  await page.goto(base + '?view=maintenance-work');
  const select = page.getByRole('combobox', { name: 'Assignee', exact: true });
  await expect(page.getByLabel("Person's name", { exact: true })).toBeVisible();
  await expect(page.getByText('External', { exact: true })).toBeVisible();
  await select.selectOption({ label: 'Fixture operator' });
  await expect(page.getByText('App user', { exact: true })).toBeVisible();
  await expect(page.getByLabel("Person's name", { exact: true })).toHaveCount(0);
  await select.selectOption({ label: 'Enter another name' });
  await expect(page.getByLabel("Person's name", { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
});
test('Add actions follow operational order', async ({ page }) => {
  await page.goto(base + '?view=maintenance-add');
  const links = page.locator('main a');
  const labels = await links.allTextContents();
  expect(labels.slice(-6)).toEqual([
    'Add stock',
    'Add task',
    "Plan today's work",
    'Add purchase need',
    'Add receipt',
    'Add document',
  ]);
});
for (const width of [320, 360, 375, 390, 412, 430, 768, 1440])
  test(`polished lists and forms fit ${width}px in English and Spanish`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const lang of ['en', 'es'])
      for (const view of [
        'locations',
        'global-items',
        'need-filters',
        'task-list',
        'maintenance-work',
        'maintenance-list',
        'maintenance-plan',
        'maintenance-update',
        'maintenance-add',
        'stock',
      ]) {
        await page.goto(base + '?view=' + view + '&lang=' + lang);
        await page.locator('main').waitFor();
        await expect(page.locator('main')).not.toBeEmpty();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${view} ${lang}`,
        ).toBe(true);
      }
  });

test('mobile navigation opens Need directly with no count request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push(r.url());
  });
  await page.goto(base + '?view=locations');
  const nav = page.locator('nav:visible');
  await expect(nav.getByRole('link')).toHaveText(['Home', 'Add', 'Need', 'More']);
  await expect(nav.getByRole('link', { name: 'Need', exact: true })).toHaveAttribute(
    'href',
    '/needs',
  );
  await nav.getByRole('link', { name: 'Need', exact: true }).click();
  await expect(page).toHaveURL(/\/needs$/);
  expect(requests).toEqual([]);
});

test('Need status changes leave the active filter immediately, failed writes remain visible', async ({
  page,
}) => {
  await page.goto(base + '?view=need-workflow');
  await page.getByRole('button', { name: 'Mark Ordered', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shopping fixture' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ordered', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shopping fixture' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shopping fixture' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shopping fixture' })).toBeVisible();
  await page.goto(base + '?view=need-workflow&fail=1');
  await page.getByRole('button', { name: 'Mark Ordered', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shopping fixture' })).toBeVisible();
});

test('empty update history is explicit and remains on demand', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/task-updates?*', (route) => {
    reads++;
    return route.fulfill({ json: { rows: [], more: false } });
  });
  await page.goto(base + '?view=voice-update');
  expect(reads).toBe(0);
  await page.getByText('Updates', { exact: true }).click();
  await expect(page.getByText('No updates yet', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await page.getByText('Updates', { exact: true }).click();
  await page.getByText('Updates', { exact: true }).click();
  expect(reads).toBe(1);
});
test('uninstalled mobile browser gets setup guidance without a push permission prompt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android Chrome' });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
  });
  await page.goto(base + '?view=notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Installation guide', exact: true })).toHaveAttribute(
    'href',
    '/install',
  );
  await expect(page.getByRole('switch')).toHaveCount(0);
});

test('running-low rows follow low stock, unset minimum stays neutral', async ({ page }) => {
  await page.goto(base + '?statuses=1');
  const links = page.locator('main a[href^="/inventory/"]').filter({ has: page.locator('h3') });
  expect(await links.allTextContents()).toEqual([
    expect.stringContaining('Belikin'),
    expect.stringContaining('Water'),
    expect.stringContaining('Paper'),
  ]);
  await expect(links.nth(1)).toContainText('Running low');
  await expect(links.nth(2)).toContainText('No minimum set');
  await expect(links.nth(2)).not.toContainText('In stock');
  await page.getByRole('button', { name: 'Low stock', exact: true }).click();
  await expect(links).toHaveCount(1);
});
test('Home task destinations are navigation shortcuts without a fake selected state', async ({
  page,
}) => {
  await page.goto(base + '?view=task-home');
  for (const href of ['/tasks?assignee=me', '/tasks?assignee=']) {
    const link = page.locator(`a[href="${href}"]`);
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute('aria-pressed');
    await expect(link).not.toHaveAttribute('aria-current');
    await expect(link.locator('svg.lucide-chevron-right')).toHaveCount(1);
  }
});
