import { test, expect } from '@playwright/test';
for (const lang of ['en', 'es'])
  test(`staff activity is compact, translated and leaves account controls available (${lang})`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:4174/?view=staff-activity&lang=${lang}`);
    await expect(
      page.getByText(
        lang === 'en' ? 'First login not completed' : 'Primer inicio de sesión pendiente',
        { exact: true },
      ),
    ).toHaveCount(2);
    await expect(
      page.getByText(lang === 'en' ? 'Setup complete' : 'Configuración completa', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(lang === 'en' ? 'Never signed in' : 'Nunca ha iniciado sesión', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        lang === 'en' ? 'Last login unavailable' : 'Último inicio de sesión no disponible',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('time')).toHaveAttribute('datetime', '2026-09-22T20:37:00Z');
    await expect(page.locator('time')).toContainText('2026');
    await expect(
      page.getByLabel(lang === 'en' ? 'Username' : 'Usuario', { exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
