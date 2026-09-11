import { test, expect } from '@playwright/test';
test('login exposes recovery and disabled SMS clearly explains the manual boundary', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible();
  await expect(
    page.getByText('SMS recovery is not available yet. Contact Linda for account recovery.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send SMS code' })).toHaveCount(0);
});
test('Spanish SMS recovery steps are mobile friendly and password failure stays gated', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=recovery&lang=es');
  await page.locator('input[name=phone]').fill('1234567');
  await page.getByRole('button', { name: 'Enviar código por SMS' }).click();
  await page.locator('input[name=code]').fill('000000');
  await page.getByRole('button', { name: 'Verificar código' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar');
  await page.locator('input[name=code]').fill('123456');
  await page.getByRole('button', { name: 'Verificar código' }).click();
  await expect(page.locator('input[name=password]')).toBeVisible();
  await expect(page.locator('input[name=code]')).toHaveCount(0);
  await page.locator('input[name=password]').fill('isolated-password-123');
  await page.locator('input[name=confirm]').fill('isolated-password-123');
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('input[name=password]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
