import { test, expect } from '@playwright/test';
test('creation forms start as real data and existing stock operations have no test checkbox',async({page})=>{
  for(const view of ['task-form','maintenance-create','need','document-form','intake','global-edit&new=1','items']) {
    await page.goto(`http://127.0.0.1:4174/?view=${view}`);
    await expect(page.locator('input[name="is_test"]')).not.toBeChecked();
  }
  await page.goto('http://127.0.0.1:4174/?view=quick-add');
  await expect(page.locator('input[name="is_test"]')).toHaveCount(0);
  const item=page.getByRole('combobox',{name:'Type an item name'});
  await item.fill('New fixture product');
  await page.getByRole('option',{name:/Create as a new item/}).click();
  await expect(page.locator('input[name="is_test"]')).not.toBeChecked();
  await item.fill('BELI');await item.press('ArrowDown');await item.press('Enter');
  await expect(page.locator('input[name="is_test"]')).toHaveCount(0);
});
for (const lang of ['en', 'es']) {
  test(`explicit test checkbox, badge and deletion confirmation (${lang})`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:4174/?view=test-data&lang=${lang}`);
    const checkbox = page.getByRole('checkbox', {
      name: lang === 'en' ? 'Test data' : 'Datos de prueba',
      exact: true,
    });
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(page.getByText('TEST', { exact: true })).toHaveCount(1);
    const label = lang === 'en' ? 'Delete test data' : 'Eliminar datos de prueba';
    await page.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('button', { name: lang === 'en' ? 'Cancel' : 'Cancelar', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('test-delete'))).toBeNull();
    await page.getByRole('button', { name: label, exact: true }).click();
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-delete')!))).toEqual({
      table: 'tasks',
      id: '40000000-0000-4000-8000-000000000001',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
