import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:4174/?view=';
for (const lang of ['en', 'es']) {
  test(`Home limits tasks and links to full list (${lang})`, async ({ page }) => {
    await page.goto(base + 'task-home&many=1&lang=' + lang);
    await expect(page.getByRole('heading', { name: /^Task \d+$/ })).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Task 0', exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: lang === 'en' ? 'View all tasks' : 'Ver todas las tareas' }),
    ).toHaveAttribute('href', '/tasks?assignee=');
  });
  test(`Transfer shows balances and after preview (${lang})`, async ({ page }) => {
    await page.goto(base + 'transfer&lang=' + lang);
    await page.locator('input[name=quantity]').fill('4');
    const preview = page.getByRole('status');
    await expect(preview).toContainText(lang === 'en' ? 'After transfer' : 'Después del traslado');
    await expect(preview).toContainText('6');
    await expect(preview).toContainText('7');
    await page.locator('input[name=quantity]').fill('11');
    await expect(preview).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
  test(`Need optional decimal quantity and inventory order (${lang})`, async ({ page }) => {
    await page.goto(base + 'need&linked=1&lang=' + lang);
    const quantity = page.getByLabel(lang === 'en' ? 'Quantity to buy' : 'Cantidad a comprar', {
      exact: false,
    });
    await quantity.fill('2.125');
    const text = await page.locator('form').innerText();
    expect(text.indexOf('Bodega')).toBeLessThan(text.indexOf('Cas Cat'));
    await page
      .getByRole('button', {
        name: lang === 'en' ? 'Save purchase need' : 'Guardar pendiente de compra',
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(sessionStorage.getItem('need-fixture') ?? '{}').quantity_needed,
        ),
      )
      .toBe('2.125');
  });
  test(`Maintenance shortcuts reuse planner/reminder routes (${lang})`, async ({ page }) => {
    await page.goto(base + 'maintenance-context&lang=' + lang);
    await expect(
      page.getByRole('link', {
        name: lang === 'en' ? "Add to today's plan" : 'Agregar al plan de hoy',
      }),
    ).toHaveAttribute('href', /\/tasks\/maintenance\/plan\?task=/);
    await expect(
      page.getByRole('link', { name: lang === 'en' ? 'Add reminder' : 'Agregar recordatorio' }),
    ).toHaveAttribute('href', /\/tasks\/new\?reminderFor=/);
    await page.goto(base + 'maintenance-context&planned=1&lang=' + lang);
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.locator('a[href*="maintenance/plan"]')).toHaveCount(0);
  });
}
test('planner preselects only contextual task', async ({ page }) => {
  await page.goto(base + 'maintenance-plan&task=50000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('checkbox', { name: 'Check oil' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Repair hatch' })).not.toBeChecked();
});
test('contextual reminder requires date and enforces Manager self-assignment', async ({ page }) => {
  await page.goto(base + 'task-form&context=1&manager=1');
  await expect(page.locator('input[type=datetime-local]')).toBeVisible();
  await expect(page.locator('input[type=datetime-local]')).toHaveAttribute('required', '');
  await expect(page.locator('select[name=assignee_id]')).toHaveCount(0);
  await expect(page.locator('input[name=assignee_id]')).toHaveValue(
    '40000000-0000-4000-8000-000000000001',
  );
  await page.goto(base + 'task-form&context=1');
  await expect(page.locator('select[name=assignee_id]')).toBeVisible();
});
