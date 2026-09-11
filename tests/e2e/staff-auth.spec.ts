import { test, expect } from '@playwright/test';
test('private login switches between phone and email without registration links', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
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
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
});
test('phone controls translate and private staff/password routes require authentication', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('button', { name: 'Teléfono', exact: true }).click();
  await expect(page.getByLabel('Número de teléfono', { exact: true })).toBeVisible();
  for (const route of ['/staff', '/change-password']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
});
