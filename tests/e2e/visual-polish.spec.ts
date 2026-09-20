import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174/';
test('category editor previews and submits EN/ES metadata without decorative requests', async ({
  page,
}) => {
  await page.goto(base + '?view=category-polish');
  await expect(page.getByLabel('Preview')).toBeVisible();
  const decorativeRequests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr', 'image', 'font'].includes(request.resourceType()))
      decorativeRequests.push(request.url());
  });
  await page.locator('[name="name_en"]').fill('Equipment');
  await page.locator('[name="name_es"]').fill('Equipo');
  await page.locator('[name="icon_key"]').selectOption('wrench');
  await page.getByLabel('Coral', { exact: true }).check();
  await expect(page.getByLabel('Preview').locator('[data-accent="coral"]')).toBeVisible();
  await expect(page.getByLabel('Preview')).toContainText('Equipment');
  await expect(page.getByLabel('Preview').locator('svg.lucide-wrench')).toBeVisible();
  // Names are user data: changing them must not change stored visual choices.
  await page.locator('[name="name_en"]').fill('Completely new category');
  await expect(page.getByLabel('Preview').locator('svg.lucide-wrench')).toBeVisible();
  await expect(page.getByLabel('Preview').locator('[data-accent="coral"]')).toBeVisible();
  expect(decorativeRequests).toEqual([]);
  await page.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(sessionStorage.getItem('category-polish') || '{}').icon_key),
    )
    .toBe('wrench');
  await page.goto(base + '?view=category-polish&lang=es');
  await page.locator('[name="name_es"]').fill('Equipo');
  await expect(page.getByLabel('Vista previa')).toContainText('Equipo');
  await expect(page.getByRole('combobox', { name: /^Icono/ })).toBeVisible();
});
for (const width of [320, 360, 390, 430])
  test(`polished views fit ${width}px with reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    for (const view of ['category-polish', 'locations', 'skeleton-polish', 'inventory']) {
      await page.goto(base + '?view=' + view);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    }
    await page.goto(base + '?view=skeleton-polish');
    await expect(page.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(
      await page
        .locator('.skeleton')
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe('none');
  });
