import { test, expect } from '@playwright/test';
const url = 'http://127.0.0.1:4174/?view=';
test('task pages require authentication', async ({ page }) => {
  for (const path of ['/tasks', '/tasks/new', '/tasks/50000000-0000-4000-8000-000000000001']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/(login|setup)$/);
  }
});
test('task form submits assignment, subtasks and Belize reminder; preserves inputs on conflict', async ({
  page,
}) => {
  await page.goto(url + 'task-form');
  await page.getByLabel('Title', { exact: true }).fill('Inspect engine');
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-01');
  await page.getByText('Description and reminder', { exact: true }).click();
  await page.getByLabel('Reminder (Belize time)', { exact: true }).fill('2026-10-01T08:30');
  await page.getByText('Subtasks (0)', { exact: true }).click();
  await page.getByRole('button', { name: 'Add subtask' }).click();
  await page.getByLabel('Subtask 1', { exact: true }).fill('Check oil');
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('alert')).toContainText('task has changed');
  const data = await page.evaluate(() => JSON.parse(sessionStorage.getItem('task-fixture')!));
  expect(data.title).toBe('Inspect engine');
  expect(data.assignee_id).toBe('40000000-0000-4000-8000-000000000001');
  expect(data.remind_at).toBe('2026-10-01T14:30:00.000Z');
  expect(JSON.parse(data.subtasks)[0].title).toBe('Check oil');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Inspect engine');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('filters overdue tasks and assignees', async ({ page }) => {
  await page.goto(url + 'task-list');
  await expect(page.getByRole('button', { name: 'My tasks', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Check engine' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'All tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Due / reminder', exact: true })
    .selectOption('taskOverdue');
  await expect(page.getByRole('heading', { name: 'Check engine' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Call mechanic' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check engine' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter 1', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Assignee', exact: true })
    .selectOption('40000000-0000-4000-8000-000000000001');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByText('No matching tasks.')).toBeVisible();
  await page.getByRole('button', { name: 'Filter 1', exact: true }).click();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check engine' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
});
test('changes status and completes subtasks', async ({ page }) => {
  await page.goto(url + 'task-progress');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('IN_PROGRESS');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem('task-progress-fixture') ?? '{}').status,
      ),
    )
    .toBe('IN_PROGRESS');
  await page.getByRole('checkbox', { name: 'Check oil' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem('task-progress-fixture') ?? '{}').completed,
      ),
    )
    .toBe('true');
});
test('Spanish home tasks have clear indicators and quick add', async ({ page }) => {
  await page.goto(url + 'task-home&lang=es');
  await expect(page.getByRole('heading', { name: 'Tareas', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Agregar tarea' })).toHaveAttribute(
    'href',
    '/tasks/new',
  );
  await expect(page.getByText('Vence hoy', { exact: true })).toBeVisible();
  await expect(page.getByText('Vencida', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Manager reminder forces self assignment; Owner can choose active staff', async ({ page }) => {
  await page.goto(url + 'task-form&manager');
  await page.getByLabel('Title', { exact: true }).fill('Own reminder');
  await page.getByText('Description and reminder', { exact: true }).click();
  await page.getByLabel('Reminder (Belize time)', { exact: true }).fill('2026-10-01T08:30');
  await expect(page.locator('select[name=assignee_id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem('task-fixture')!).assignee_id),
  ).toBe('40000000-0000-4000-8000-000000000001');
  await page.goto(url + 'task-form');
  await page.getByText('Description and reminder', { exact: true }).click();
  await page.getByLabel('Reminder (Belize time)', { exact: true }).fill('2026-10-01T08:30');
  await expect(page.getByRole('combobox', { name: 'Assigned to' })).toHaveValue(
    '40000000-0000-4000-8000-000000000001',
  );
  await page
    .getByRole('combobox', { name: 'Assigned to' })
    .selectOption('40000000-0000-4000-8000-000000000002');
  await page.getByLabel('Title', { exact: true }).fill('Assigned reminder');
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem('task-fixture')!).assignee_id),
  ).toBe('40000000-0000-4000-8000-000000000002');
});
