import { z } from 'zod';
import { cashbookDateRange, foodTotalMinor, isCashbookDate, moneyToMinor } from './cashbook-domain';
import type { Json } from './database.types';
import type { CashbookFilters } from './cashbook-types';

const idSchema = z.uuid();
const accountSchema = z.enum(['CASH', 'ACCOUNT']);
const date = (value: string) => {
  if (!isCashbookDate(value) || value < '2000-01-01' || value > '2100-12-31')
    throw new Error('CASHBOOK_DATE');
  return value;
};
const positiveInteger = (value: string, maximum: number, zero = false) => {
  if (!/^\d+$/.test(value)) throw new Error('CASHBOOK_INVALID');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (zero ? 0 : 1) || number > maximum)
    throw new Error('CASHBOOK_INVALID');
  return number;
};
// Only recognized form fields reach the financial RPC. Actors and timestamps never do.
export function cashbookInput(form: FormData) {
  const get = (name: string) => {
    const value = form.get(name);
    if (value !== null && typeof value !== 'string') throw new Error('CASHBOOK_INVALID');
    return (value ?? '') as string;
  };
  const text = (name: string, max: number, required = false) => {
    const value = get(name).trim();
    if (value.length > max || (required && !value)) throw new Error('CASHBOOK_INVALID');
    return value;
  };
  const action = z
    .enum(['POST', 'VOID', 'CORRECT', 'SAVE_TEMPLATE', 'ADD_FOOD', 'UPDATE_DUE', 'PAY'])
    .parse(get('action'));
  const request = idSchema.parse(get('requestId'));
  const values: Record<string, Json> = {};
  if (['PAY', 'VOID', 'CORRECT'].includes(action) && get('confirmed') !== 'on')
    throw new Error('CASHBOOK_CONFIRMATION');
  if (action === 'SAVE_TEMPLATE') {
    if (get('id')) values.id = idSchema.parse(get('id'));
    values.kind = z.enum(['FOOD', 'MONTHLY']).parse(get('kind'));
    values.name_en = text('name_en', 120, true);
    values.name_es = text('name_es', 120, true);
    values.default_amount_cents = get('default_amount')
      ? moneyToMinor(get('default_amount'))
      : null;
    values.due_day =
      values.kind === 'MONTHLY' && get('due_day') ? positiveInteger(get('due_day'), 31) : null;
    values.active = get('active') === 'on';
  } else {
    values.effective_date = date(get('effective_date'));
    values.comment = text('comment', 1000);
    if (action === 'POST' || action === 'CORRECT') {
      if (action === 'POST')
        values.kind = z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'OPENING']).parse(get('kind'));
      values.amount_cents = moneyToMinor(get('amount'), {
        allowZero: action === 'CORRECT' || values.kind === 'OPENING',
      });
      if (get('source_account')) values.source_account = accountSchema.parse(get('source_account'));
      if (get('destination_account'))
        values.destination_account = accountSchema.parse(get('destination_account'));
    }
    if (action === 'VOID' || action === 'CORRECT') {
      values.id = idSchema.parse(get('id'));
      values.reason = text('reason', 1000, true);
    }
    if (action === 'ADD_FOOD') {
      values.template_id = idSchema.parse(get('template_id'));
      values.quantity = positiveInteger(get('quantity'), 100000);
      values.unit_amount_cents = moneyToMinor(get('unit_amount'));
      foodTotalMinor(values.quantity, values.unit_amount_cents);
    }
    if (action === 'UPDATE_DUE') {
      values.id = idSchema.parse(get('id'));
      values.version = positiveInteger(get('version'), 2147483647, true);
      if (get('quantity')) values.quantity = positiveInteger(get('quantity'), 100000);
      if (get('unit_amount')) values.unit_amount_cents = moneyToMinor(get('unit_amount'));
      if (get('amount')) values.amount_cents = moneyToMinor(get('amount'));
    }
    if (action === 'PAY') {
      const ids = z.array(idSchema).min(1).max(1000).parse(form.getAll('ids'));
      if (new Set(ids).size !== ids.length) throw new Error('CASHBOOK_INVALID');
      values.ids = ids;
      values.source_account = accountSchema.parse(get('source_account'));
      values.expected_total_cents = moneyToMinor(get('expected_total'), { allowZero: true });
      if (get('amount')) values.amount_cents = moneyToMinor(get('amount'));
      const versions = z
        .record(idSchema, z.number().int().nonnegative().max(2147483647))
        .parse(JSON.parse(get('versions')));
      if (Object.keys(versions).length !== ids.length || ids.some((id) => !(id in versions)))
        throw new Error('CASHBOOK_INVALID');
      values.versions = versions;
    }
  }
  return { p_request: request, p_action: action, p_values: values };
}

export function cashbookFilters(
  params: Record<string, string | string[] | undefined>,
  today: string,
): CashbookFilters {
  const get = (key: string) => (typeof params[key] === 'string' ? params[key] : '');
  const from = get('from') || today.slice(0, 7) + '-01',
    to = get('to') || today;
  cashbookDateRange(date(from), date(to));
  const selectedMonth = get('month') || today.slice(0, 7);
  // Native month controls submit YYYY-MM; database occurrences use month-start dates.
  const month = /^\d{4}-\d{2}$/.test(selectedMonth) ? `${selectedMonth}-01` : selectedMonth;
  if (!date(month).endsWith('-01')) throw new Error('CASHBOOK_DATE');
  return {
    from,
    to,
    month,
    view: z.enum(['ledger', 'payments', 'templates']).catch('ledger').parse(get('view')),
    foodView: z.enum(['all', 'today', 'period', 'previous']).catch('all').parse(get('foodView')),
    page: get('page') ? positiveInteger(get('page'), 1000000) : 1,
  };
}
