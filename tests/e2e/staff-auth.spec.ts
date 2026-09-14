import { test, expect } from '@playwright/test';
test('private login is phone-only without registration links', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email address', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Phone number', { exact: true })).toBeVisible();
  const country = page.getByRole('combobox', { name: 'Country code', exact: true });
  await expect(country.locator('option')).toHaveText(['Belize +501', 'Colombia +57', 'Sweden +46']);
  await country.selectOption('57');
  await page.getByLabel('Phone number', { exact: true }).fill('3001234567');
  await expect(page.getByRole('link', { name: /sign up|create account|register/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sign up|create account|register/i })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/phone-login-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveCount(0);
});

test('isolated account provisioning shows the temporary password once and clears it', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=account');
  await page.getByLabel('Display name', { exact: true }).fill('Isolated staff');
  await page.getByLabel('Phone number', { exact: true }).fill('1234567');
  await page
    .getByRole('checkbox', {
      name: 'I have verified that this number belongs to this staff member.',
    })
    .check();
  await page.getByRole('button', { name: 'Add user', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Isolated-UI-Example-Only');
  await page.getByRole('button', { name: 'Done — hide password' }).click();
  await expect(page.locator('output')).toHaveCount(0);
  await page.goto('http://127.0.0.1:4174/?view=account&unconfigured=1');
  await expect(page.getByRole('button', { name: 'Add user', exact: true })).toBeDisabled();
});

test('isolated first-password form has confirmation and fails closed', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=password');
  await page.getByLabel('Create your new password', { exact: true }).fill('Isolated-Password-Only');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Isolated-Password-Only');
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/view=password/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('phone controls translate and private staff/password routes require authentication', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await expect(page.getByLabel('Número de teléfono', { exact: true })).toBeVisible();
  for (const route of ['/staff', '/change-password']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
});
