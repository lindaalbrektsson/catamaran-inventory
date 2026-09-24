import { expect, test, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:4174/?view=cashbook';
async function requests(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('cashbook-requests') ?? '[]'));
}

for (const locale of ['en', 'es']) {
  test(`Cashbook simple income, positive amounts, live balances and no TEST controls (${locale})`, async ({
    page,
  }) => {
    await page.goto(`${fixture}&lang=${locale}`);
    const spanish = locale === 'es';
    await expect(
      page.getByText(spanish ? 'Fondos totales' : 'Total funds', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[name="is_test"]')).toHaveCount(0);
    await page
      .getByRole('button', { name: spanish ? 'Agregar ingreso' : 'Add income', exact: true })
      .click();
    const form = page.getByRole('form', { name: spanish ? 'Agregar ingreso' : 'Add income' });
    await expect(form.locator('input[name="amount"]')).toHaveAttribute('min', '0.01');
    await form.locator('input[name="amount"]').fill('50');
    await form.locator('select[name="destination_account"]').selectOption('ACCOUNT');
    await form.locator('textarea[name="comment"]').fill('Customer payment');
    await expect(form.locator('input[name="effective_date"]')).toHaveValue('2026-09-23');
    await form.getByRole('button', { name: spanish ? 'Guardar' : 'Save', exact: true }).dblclick();
    await expect(form).toHaveCount(0);
    const saved = await requests(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      action: 'POST',
      kind: 'INCOME',
      amount: '50',
      destination_account: 'ACCOUNT',
      effective_date: '2026-09-23',
      comment: 'Customer payment',
    });
    expect(saved[0].is_test).toBeUndefined();
    await expect(page.getByText(/2[,.]050[,.]00/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('Owner desktop export respects date range and Jackie never receives export or templates', async ({
  page,
  isMobile,
}) => {
  await page.goto(fixture);
  const exportLink = page.getByRole('link', { name: 'Export to Excel' });
  if (isMobile) await expect(exportLink).toBeHidden();
  else await expect(exportLink).toBeVisible();
  await page.goto(`${fixture}&role=jackie`);
  await expect(page.getByRole('link', { name: 'Export to Excel' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Manage payment concepts' })).toHaveCount(0);
  await page.getByText('Filter by date', { exact: true }).click();
  await page.locator('input[name="from"]').fill('2026-09-01');
  await page.locator('input[name="to"]').fill('2026-09-23');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page).toHaveURL(/from=2026-09-01.*to=2026-09-23/);
});

test('Opening balance is explicit Owner input and transfer links opposite accounts', async ({
  page,
}) => {
  await page.goto(`${fixture}&unopened=1`);
  await page.getByRole('button', { name: 'Opening balance', exact: true }).click();
  const opening = page.getByRole('form', { name: 'Opening balance' });
  await expect(opening.locator('input[name="amount"]')).toHaveValue('');
  await expect(opening.locator('input[name="amount"]')).toHaveAttribute('min', '0');
  await page.goto(`${fixture}&role=jackie&unopened=1`);
  await expect(page.getByRole('button', { name: 'Opening balance', exact: true })).toHaveCount(0);
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();
  const transfer = page.getByRole('form', { name: 'Transfer' });
  await transfer.locator('input[name="amount"]').fill('300');
  await transfer.locator('textarea[name="comment"]').fill('Cash withdrawal');
  await expect(transfer.locator('select[name="source_account"]')).toHaveValue('ACCOUNT');
  await expect(transfer.locator('select[name="destination_account"]')).toHaveValue('CASH');
  await transfer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(transfer).toHaveCount(0);
  await expect(page.getByText(/2,000.00/)).toBeVisible();
  expect((await requests(page))[0]).toMatchObject({
    action: 'POST',
    kind: 'TRANSFER',
    source_account: 'ACCOUNT',
    destination_account: 'CASH',
    amount: '300',
  });
});

test('Food defaults, one-entry override and Wednesday daily review', async ({ page }) => {
  await page.goto(`${fixture}&tab=payments`);
  await expect(page.getByText('Monday, Sep 21, 2026')).toBeVisible();
  await expect(page.getByText('BZD 65.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText('Monday, Sep 21, 2026')).toHaveCount(0);
  await expect(page.getByText('Wednesday, Sep 23, 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add food debt', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add food debt' });
  await expect(form.locator('input[name="unit_amount"]')).toHaveValue('20.00');
  await form.locator('input[name="quantity"]').fill('3');
  await form.locator('input[name="unit_amount"]').fill('15');
  await expect(form.getByText('BZD 45.00', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect((await requests(page))[0]).toMatchObject({
    action: 'ADD_FOOD',
    quantity: '3',
    unit_amount: '15',
    effective_date: '2026-09-23',
  });
  await page.getByRole('button', { name: 'Add food debt', exact: true }).click();
  await expect(form.locator('input[name="unit_amount"]')).toHaveValue('20.00');
});

test('Food payment includes all reviewed lines and requires explicit confirmation', async ({
  page,
}) => {
  await page.goto(`${fixture}&tab=payments`);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Pay food total', exact: true }).click();
  const form = page.getByRole('form', { name: 'Review payment' });
  await expect(form.getByText('Monday, Sep 21, 2026')).toBeVisible();
  await expect(form.getByText('BZD 125.00', { exact: true })).toBeVisible();
  await expect(form.locator('input[name="ids"]')).toHaveCount(3);
  await form.getByRole('button', { name: 'Confirm payment', exact: true }).click();
  expect(await requests(page)).toEqual([]);
  await form.locator('select[name="source_account"]').selectOption('ACCOUNT');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Confirm payment', exact: true }).click();
  await expect(form).toHaveCount(0);
  const saved = (await requests(page))[0];
  expect(saved).toMatchObject({
    action: 'PAY',
    source_account: 'ACCOUNT',
    amount: '125.00',
    expected_total: '125.00',
    confirmed: 'on',
  });
  expect(saved.ids).toHaveLength(3);
  expect(Object.keys(JSON.parse(saved.versions))).toHaveLength(3);
});

test('Monthly one-occurrence amount override and source confirmation', async ({ page }) => {
  await page.goto(`${fixture}&tab=payments&lang=es`);
  const monthly = page.getByRole('region', { name: 'Pagos mensuales' });
  await expect(monthly.getByRole('heading', { name: 'Renta de bodega' })).toBeVisible();
  await expect(monthly.getByRole('heading', { name: 'Seguro Social' })).toBeVisible();
  await monthly.getByRole('button', { name: 'Pagar', exact: true }).first().click();
  const form = page.getByRole('form', { name: 'Revisar pago' });
  await form.locator('input[name="amount"]').fill('900');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect((await requests(page))[0]).toMatchObject({
    action: 'PAY',
    amount: '900',
    expected_total: '800.00',
    source_account: 'CASH',
  });
});

test('Correction and void preserve a reason and explicit confirmation', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Correct', exact: true }).click();
  let form = page.getByRole('form', { name: 'Correct', exact: true });
  await form.locator('input[name="amount"]').fill('950');
  await form.locator('textarea[name="reason"]').fill('Corrected amount from customer');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect((await requests(page))[0]).toMatchObject({
    action: 'CORRECT',
    amount: '950',
    reason: 'Corrected amount from customer',
    confirmed: 'on',
  });
  await page.getByRole('button', { name: 'Void transaction', exact: true }).click();
  form = page.getByRole('form', { name: 'Void transaction', exact: true });
  await form.locator('textarea[name="reason"]').fill('Duplicate entry');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect((await requests(page))[1]).toMatchObject({
    action: 'VOID',
    reason: 'Duplicate entry',
    confirmed: 'on',
  });
});

test('An uncertain response freezes the exact request and retries the same UUID', async ({
  page,
}) => {
  await page.goto(`${fixture}&uncertain=1`);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add expense' });
  await form.locator('input[name="amount"]').fill('500');
  await form.locator('textarea[name="comment"]').fill('Salary Charlie');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('connection was interrupted');
  await expect(form.locator('input[name="amount"]')).toBeDisabled();
  await expect(form.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await form.getByRole('button', { name: 'Retry same request' }).click();
  await expect(form).toHaveCount(0);
  const saved = await requests(page);
  expect(saved).toHaveLength(2);
  expect(saved[0]).toEqual(saved[1]);
});

test('Owner can edit template price, due day and active status', async ({ page }) => {
  await page.goto(`${fixture}&tab=templates`);
  await page.locator('summary').filter({ hasText: 'Manage payment concepts' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).nth(2).click();
  const form = page.getByRole('form', { name: 'Recurring payments' });
  await form.locator('input[name="default_amount"]').fill('850');
  await form.locator('input[name="due_day"]').fill('31');
  await form.locator('input[name="active"]').uncheck();
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect((await requests(page))[0]).toMatchObject({
    action: 'SAVE_TEMPLATE',
    kind: 'MONTHLY',
    default_amount: '850',
    due_day: '31',
    name_en: 'Bodega rent',
    name_es: 'Renta de bodega',
  });
  expect((await requests(page))[0].active).toBeUndefined();
});

for (const [action, label] of [
  ['INCOME', 'Add income'],
  ['EXPENSE', 'Add expense'],
  ['TRANSFER', 'Transfer'],
  ['FOOD', 'Add food debt'],
]) {
  test(`Cashbook shortcut opens ${action} without posting`, async ({ page }) => {
    await page.goto(`${fixture}&action=${action}${action === 'FOOD' ? '&tab=payments' : ''}`);
    await expect(page.getByRole('form', { name: label, exact: true })).toBeVisible();
    expect(await requests(page)).toHaveLength(0);
  });
}
