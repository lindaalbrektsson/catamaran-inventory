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
test('favorites open a permitted file directly and exclude archived documents', async ({
  page,
}) => {
  await page.goto(url + 'document-home&staff&lang=es');
  await expect(page.getByRole('heading', { name: 'Favoritos / Documentos' })).toBeVisible();
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
test('owner upload preserves title, access, favorite and file on retry', async ({ page }) => {
  await page.goto(url + 'document-form');
  await page.getByLabel('Title', { exact: true }).fill('Fixture document');
  await page
    .getByRole('combobox', { name: 'Who can access this document?' })
    .selectOption('SELECTED');
  await page.getByRole('checkbox', { name: 'Fixture staff' }).check();
  await page.getByRole('checkbox', { name: 'Favorite', exact: true }).check();
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
  expect(data.favorite).toBe('on');
  expect(data.selected_users).toHaveLength(1);
  expect(data.file.name).toBe('fixture.pdf');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Fixture document');
});
test('owner sees expiry information in full list', async ({ page }) => {
  await page.goto(url + 'document-list');
  await expect(page.getByText('Expires today: 2026-09-30')).toBeVisible();
});
