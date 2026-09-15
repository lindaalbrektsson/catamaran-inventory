import { test, expect } from '@playwright/test';
const fixture = 'http://127.0.0.1:4174/';
for (const [lang, archive, cancel, success] of [
  ['en', 'Archive item', 'Cancel', 'Item archived'],
  ['es', 'Archivar artículo', 'Cancelar', 'Artículo archivado'],
]) {
  test(`Owner archive requires confirmation and works in ${lang}`, async ({ page }) => {
    await page.goto(`${fixture}?view=detail&owner=1&lang=${lang}`);
    await page.evaluate(() => sessionStorage.removeItem('archived-item-fixture'));
    await page.getByRole('button', { name: archive, exact: true }).click();
    await expect(page.getByRole('group', { name: archive })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('archived-item-fixture'))).toBeNull();
    await page.getByRole('button', { name: cancel, exact: true }).click();
    await expect(page.getByRole('group', { name: archive })).toHaveCount(0);
    await page.getByRole('button', { name: archive, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `artifacts/archive-${lang}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: archive, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(success);
    expect(await page.evaluate(() => sessionStorage.getItem('archived-item-fixture'))).toBeTruthy();
  });
}
test('Manager and Crew do not see the Owner archive action', async ({ page }) => {
  for (const suffix of ['', '&crew=1']) {
    await page.goto(`${fixture}?view=detail${suffix}`);
    await expect(page.getByRole('button', { name: 'Archive item', exact: true })).toHaveCount(0);
  }
});
