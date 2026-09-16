import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174/?view=';
test('maintenance routes and photos require authentication', async ({ page, request }) => {
  for (const path of ['/tasks/maintenance', '/tasks/maintenance/plan', '/tasks/maintenance/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/login$/);
  }
  expect(
    (await request.get('/maintenance-photo/50000000-0000-4000-8000-000000000001')).status(),
  ).toBe(401);
});
test('create weekly/monthly recurring check with Belize time', async ({ page }) => {
  await page.goto(base + 'maintenance-create');
  await page.getByLabel('Title', { exact: true }).fill('Check oil');
  await page.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('WEEKLY');
  await page.getByRole('combobox', { name: 'Day of week', exact: true }).selectOption('1');
  await page.getByLabel('Reminder time (optional, Belize)', { exact: true }).fill('08:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const data = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('maintenance-fixture')!),
  );
  expect(data.weekday).toBe('1');
  expect(data.time).toBe('08:00');
  await page.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('MONTHLY');
  await page.getByLabel('Day of month', { exact: true }).fill('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('planner groups due checks/pending jobs and only submits selected work', async ({ page }) => {
  await page.goto(base + 'maintenance-plan');
  await expect(page.getByRole('heading', { name: 'Due recurring checks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Repair hatch' }).check();
  await page.getByRole('button', { name: "Add to today's plan" }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    (await page.evaluate(() => JSON.parse(sessionStorage.getItem('maintenance-fixture')!))).tasks,
  ).toEqual(['50000000-0000-4000-8000-000000000002']);
});
test('manual assignee, remaining summary and Ready status stay on one screen', async ({ page }) => {
  await page.goto(base + 'maintenance-work');
  await expect(page.getByLabel("Person's name", { exact: true })).toHaveValue('Charlie');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('READY');
  await page.getByRole('textbox', { name: 'What remains?', exact: true }).fill('Final inspection');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const data = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('maintenance-fixture')!),
  );
  expect(data.manual).toBe('Charlie');
  expect(data.status).toBe('READY');
  expect(data.remaining).toBe('Final inspection');
});
test('Tomorrow snooze chooses and remembers time in an emulated installed mobile PWA', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android Chrome' });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
  await page.goto(base + 'maintenance-snooze');
  await page.getByRole('combobox', { name: 'Snooze', exact: true }).selectOption('1440');
  await page.getByLabel('Reminder time (Belize)', { exact: true }).fill('07:35');
  await page.getByRole('button', { name: 'Snooze', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    (await page.evaluate(() => JSON.parse(sessionStorage.getItem('snooze-fixture')!))).time,
  ).toBe('07:35');
  await page.reload();
  await page.getByRole('combobox', { name: 'Snooze', exact: true }).selectOption('1440');
  await expect(page.getByLabel('Reminder time (Belize)', { exact: true })).toHaveValue('07:35');
});
test('desktop reminder view does not expose notification-based Snooze', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Windows Chrome' }),
  );
  await page.goto(base + 'maintenance-snooze');
  await expect(page.getByRole('button', { name: 'Snooze', exact: true })).toHaveCount(0);
});
test('Spanish maintenance and photo capture controls', async ({ page }) => {
  await page.goto(base + 'maintenance-update&lang=es');
  await expect(page.getByRole('button', { name: 'Tomar foto', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir imagen', exact: true })).toBeVisible();
  await page.getByLabel('Actualización', { exact: true }).fill('Revisión terminada');
  await page.locator('input[capture=environment]').setInputFiles({
    name: 'work.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('isolated-photo-fixture'),
  });
  await page.getByRole('button', { name: 'Agregar actualización', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('Add shortcut opens planner without creating a task', async ({ page }) => {
  await page.goto(base + 'maintenance-add');
  await page.getByRole('link', { name: 'Today / Work plan', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/maintenance\/plan$/);
  expect(await page.evaluate(() => sessionStorage.getItem('maintenance-fixture'))).toBeNull();
});
