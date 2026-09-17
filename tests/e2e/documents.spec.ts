import { test, expect } from '@playwright/test';
const url = 'http://127.0.0.1:4174/?view=';
test('document pages and private file URLs require authentication', async ({ page, request }) => {
  for (const p of [
    '/documents',
    '/documents/new',
    '/documents/70000000-0000-4000-8000-000000000001',
  ]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/(login|setup)$/);
  }
  const r = await request.get('/document-file/70000000-0000-4000-8000-000000000001');
  expect(r.status()).toBe(401);
  expect(r.headers()['cache-control']).toContain('no-store');
});
test('documents open a permitted file directly and exclude archived documents', async ({
  page,
}) => {
  await page.goto(url + 'document-home&staff&lang=es');
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Fixture tour checklist/ })).toHaveAttribute(
    'href',
    '/document-file/70000000-0000-4000-8000-000000000001',
  );
  await expect(page.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/documents');
  await expect(page.getByText('Archived fixture')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Subir documento' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('document list filters active, archived, category and search', async ({ page }) => {
  await page.goto(url + 'document-list&staff');
  await expect(page.getByText('Fixture tour checklist')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Archived', exact: true }).check();
  await expect(page.getByText('Archived fixture')).toBeVisible();
  await expect(page.getByText('Fixture tour checklist')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Operations');
  await page.getByRole('searchbox', { name: 'Search documents' }).fill('no match');
  await expect(page.getByText('No matching documents.')).toBeVisible();
});
test('owner upload preserves title, access and file on retry', async ({ page }) => {
  await page.goto(url + 'document-form');
  await page.getByLabel('Title', { exact: true }).fill('Fixture document');
  await page
    .getByRole('combobox', { name: 'Who can access this document?' })
    .selectOption('SELECTED');
  await page.getByRole('checkbox', { name: 'Fixture staff' }).check();
  await expect(page.getByRole('checkbox', { name: /Favorite/ })).toHaveCount(0);
  await page.getByLabel('Expiry date (optional)').fill('2026-10-01');
  await page.locator('input[name=file]').setInputFiles({
    name: 'fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nfixture-only\n%%EOF'),
  });
  await page.getByRole('button', { name: 'Save document' }).click();
  await expect(page.getByRole('alert')).toContainText('file upload is incomplete');
  const data = await page.evaluate(() => JSON.parse(sessionStorage.getItem('document-fixture')!));
  expect(data.title).toBe('Fixture document');
  expect(data.access_level).toBe('SELECTED');
  expect(data.favorite).toBe('');
  expect(data.selected_users).toHaveLength(1);
  expect(data.file.name).toBe('fixture.pdf');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Fixture document');
});
test('owner sees expiry information in full list', async ({ page }) => {
  await page.goto(url + 'document-list');
  await expect(page.getByText('Expires today: 30 Sept')).toBeVisible();
});

test('frequent documents are automatic, user-scoped and survive reload without extra requests', async ({
  page,
}) => {
  await page.goto(url + 'document-list');
  await expect(page.getByRole('heading', { name: 'Frequently used' })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem(
      'catamaran:document-usage:v1:other-user',
      JSON.stringify({ '70000000-0000-4000-8000-000000000001': { count: 99, last: 1 } }),
    );
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Frequently used' })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem(
      'catamaran:document-usage:v1:40000000-0000-4000-8000-000000000001',
      JSON.stringify({
        '70000000-0000-4000-8000-000000000001': { count: 2, last: 1 },
        '70000000-0000-4000-8000-000000000002': { count: 9, last: 1 },
      }),
    );
  });
  await page.reload();
  const shortcuts = page.getByRole('region', { name: 'Frequently used' });
  await expect(shortcuts.getByRole('link', { name: 'Fixture tour checklist' })).toBeVisible();
  await expect(shortcuts.getByText('Archived fixture')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Favorite/ })).toHaveCount(0);
});

test('opening an authorized document records usage automatically', async ({page}) => {
  await page.goto(url + 'document-opened');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('catamaran:document-usage:v1:40000000-0000-4000-8000-000000000001') ?? '{}')['70000000-0000-4000-8000-000000000001']?.count)).toBe(1);
  await page.goto(url + 'document-list&lang=es');
  await expect(page.getByRole('region', {name:'Uso frecuente'}).getByRole('link', {name:'Fixture tour checklist'})).toBeVisible();
  await expect(page.getByLabel('Favorite', {exact:true})).toHaveCount(0);
});
