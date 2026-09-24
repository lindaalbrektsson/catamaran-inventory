import { describe, expect, it } from 'vitest';
import { cashbookFilters, cashbookInput } from '../src/lib/cashbook-input';

const request = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000002';
const otherId = '30000000-0000-4000-8000-000000000003';
function form(action: string, values: Record<string, string | string[]> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({
    action,
    requestId: request,
    effective_date: '2026-09-24',
    comment: '',
    ...values,
  }))
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, item);
  return result;
}
const payment = (overrides: Record<string, string | string[]> = {}) =>
  form('PAY', {
    confirmed: 'on',
    ids: [id, otherId],
    source_account: 'CASH',
    expected_total: '40.58',
    versions: JSON.stringify({ [id]: 0, [otherId]: 3 }),
    ...overrides,
  });

describe('Cashbook form allowlist and exact amounts', () => {
  it('constructs an exact income request and ignores client actor, timestamps, status and TEST fields', () => {
    const result = cashbookInput(
      form('POST', {
        kind: 'INCOME',
        amount: '19.99',
        destination_account: 'CASH',
        comment: ' Customer payment ',
        created_by: otherId,
        actor_id: otherId,
        created_at: '2000-01-01',
        status: 'VOIDED',
        is_test: 'true',
        isTest: 'true',
        p_request: otherId,
        p_action: 'DELETE',
        amount_cents: '1',
        role: 'OWNER',
        request_id: otherId,
        updated_at: '2000-01-01',
      }),
    );
    expect(result).toEqual({
      p_request: request,
      p_action: 'POST',
      p_values: {
        kind: 'INCOME',
        amount_cents: 1999,
        destination_account: 'CASH',
        effective_date: '2026-09-24',
        comment: 'Customer payment',
      },
    });
  });
  it.each(['INCOME', 'EXPENSE', 'TRANSFER'])(
    'requires a positive %s amount and valid selected accounts',
    (kind) => {
      expect(() => cashbookInput(form('POST', { kind, amount: '0' }))).toThrow('CASHBOOK_AMOUNT');
      expect(() => cashbookInput(form('POST', { kind, amount: '-10' }))).toThrow('CASHBOOK_AMOUNT');
      expect(() => cashbookInput(form('POST', { kind, amount: '10.001' }))).toThrow(
        'CASHBOOK_AMOUNT',
      );
      expect(() =>
        cashbookInput(form('POST', { kind, amount: '10', source_account: 'OTHER' })),
      ).toThrow();
      expect(() =>
        cashbookInput(form('POST', { kind, amount: '10', destination_account: 'OTHER' })),
      ).toThrow();
    },
  );
  it('allows an explicit zero opening and leaves actor/kind-specific authorization to the database', () => {
    expect(
      cashbookInput(form('POST', { kind: 'OPENING', amount: '0', destination_account: 'ACCOUNT' }))
        .p_values,
    ).toMatchObject({ kind: 'OPENING', amount_cents: 0, destination_account: 'ACCOUNT' });
  });
  it('rejects unknown actions, malformed UUIDs, files in text fields and overly long text', () => {
    expect(() => cashbookInput(form('DELETE'))).toThrow();
    expect(() => cashbookInput(form('POST', { requestId: 'not-an-id' }))).toThrow();
    expect(() => cashbookInput(form('POST', { kind: 'REVERSAL', amount: '1' }))).toThrow();
    expect(() =>
      cashbookInput(form('POST', { kind: 'INCOME', amount: '1', comment: 'a'.repeat(1001) })),
    ).toThrow('CASHBOOK_INVALID');
    const file = form('POST', { kind: 'INCOME', amount: '1' });
    file.set('comment', new Blob(['payload']), 'comment.txt');
    expect(() => cashbookInput(file)).toThrow('CASHBOOK_INVALID');
  });
  it.each(['2026-02-29', '2026-13-01', '1999-12-31', '2101-01-01', '2026-09-24T00:00:00Z'])(
    'rejects invalid effective date %s',
    (date) => {
      expect(() =>
        cashbookInput(form('POST', { kind: 'INCOME', amount: '1', effective_date: date })),
      ).toThrow('CASHBOOK_DATE');
    },
  );
});

describe('Cashbook confirmation and correction inputs', () => {
  it.each(['PAY', 'VOID', 'CORRECT'])('requires explicit confirmation for %s', (action) => {
    for (const confirmed of ['', 'true', 'yes', 'off'])
      expect(() => cashbookInput(form(action, { confirmed }))).toThrow('CASHBOOK_CONFIRMATION');
  });
  it('requires original reference and reason, and does not accept a client correction type', () => {
    const result = cashbookInput(
      form('CORRECT', {
        confirmed: 'on',
        id,
        reason: ' Corrected amount ',
        amount: '0.29',
        kind: 'OPENING',
        source_account: 'ACCOUNT',
      }),
    );
    expect(result.p_values).toEqual({
      id,
      reason: 'Corrected amount',
      amount_cents: 29,
      source_account: 'ACCOUNT',
      effective_date: '2026-09-24',
      comment: '',
    });
    expect(() => cashbookInput(form('VOID', { confirmed: 'on', id, reason: ' ' }))).toThrow(
      'CASHBOOK_INVALID',
    );
    expect(() =>
      cashbookInput(form('VOID', { confirmed: 'on', id: 'bad', reason: 'Duplicate' })),
    ).toThrow();
    expect(
      cashbookInput(
        form('VOID', { confirmed: 'on', id, reason: 'Duplicate', amount: '900', status: 'VOIDED' }),
      ).p_values,
    ).toEqual({ id, reason: 'Duplicate', effective_date: '2026-09-24', comment: '' });
  });
});

describe('Cashbook food, recurring templates and due overrides', () => {
  it('accepts an Owner template payload with a nullable default, and scopes a due day to monthly templates', () => {
    expect(
      cashbookInput(
        form('SAVE_TEMPLATE', {
          kind: 'MONTHLY',
          name_en: ' Bodega rent ',
          name_es: ' Renta de bodega ',
          due_day: '31',
          active: 'on',
        }),
      ).p_values,
    ).toEqual({
      kind: 'MONTHLY',
      name_en: 'Bodega rent',
      name_es: 'Renta de bodega',
      default_amount_cents: null,
      due_day: 31,
      active: true,
    });
    expect(
      cashbookInput(
        form('SAVE_TEMPLATE', {
          id,
          kind: 'FOOD',
          name_en: 'Fruit',
          name_es: 'Fruta',
          default_amount: '25.29',
          due_day: '31',
        }),
      ).p_values,
    ).toEqual({
      id,
      kind: 'FOOD',
      name_en: 'Fruit',
      name_es: 'Fruta',
      default_amount_cents: 2529,
      due_day: null,
      active: false,
    });
  });
  it('rejects empty template names, invalid due days, zero defaults and invalid template IDs', () => {
    const valid = { kind: 'MONTHLY', name_en: 'Rent', name_es: 'Renta', due_day: '10' };
    const patches: Record<string, string>[] = [
      { name_en: ' ' },
      { due_day: '32' },
      { due_day: '0' },
      { default_amount: '0' },
      { id: 'bad' },
    ];
    for (const patch of patches)
      expect(() => cashbookInput(form('SAVE_TEMPLATE', { ...valid, ...patch }))).toThrow();
  });
  it('parses food quantity and per-entry price without sending a template price change', () => {
    expect(
      cashbookInput(
        form('ADD_FOOD', {
          template_id: id,
          quantity: '3',
          unit_amount: '0.29',
          default_amount: '100',
          name_en: 'Override',
        }),
      ).p_values,
    ).toEqual({
      template_id: id,
      quantity: 3,
      unit_amount_cents: 29,
      effective_date: '2026-09-24',
      comment: '',
    });
    for (const quantity of ['0', '-1', '1.5', '1e2', '100001'])
      expect(() =>
        cashbookInput(form('ADD_FOOD', { template_id: id, quantity, unit_amount: '1' })),
      ).toThrow();
    expect(() =>
      cashbookInput(
        form('ADD_FOOD', { template_id: id, quantity: '100000', unit_amount: '9999999999.99' }),
      ),
    ).toThrow('CASHBOOK_AMOUNT');
  });
  it('requires optimistic version and uses only selected override fields for one due occurrence', () => {
    expect(
      cashbookInput(
        form('UPDATE_DUE', {
          id,
          version: '0',
          amount: '800.29',
          template_id: otherId,
          default_amount: '5',
          status: 'PAID',
        }),
      ).p_values,
    ).toEqual({ id, version: 0, amount_cents: 80029, effective_date: '2026-09-24', comment: '' });
    for (const version of ['', '-1', '1.5', '2147483648', '9007199254740992'])
      expect(() => cashbookInput(form('UPDATE_DUE', { id, version, amount: '1' }))).toThrow(
        'CASHBOOK_INVALID',
      );
    expect(
      cashbookInput(
        form('UPDATE_DUE', { id, version: '2147483647', quantity: '2', unit_amount: '20.29' }),
      ).p_values,
    ).toMatchObject({ version: 2147483647, quantity: 2, unit_amount_cents: 2029 });
  });
});

describe('Cashbook payment review identity', () => {
  it('preserves the precise reviewed IDs, versions, expected total and actual override', () => {
    expect(cashbookInput(payment({ amount: '41.29' }))).toEqual({
      p_request: request,
      p_action: 'PAY',
      p_values: {
        effective_date: '2026-09-24',
        comment: '',
        ids: [id, otherId],
        source_account: 'CASH',
        expected_total_cents: 4058,
        amount_cents: 4129,
        versions: { [id]: 0, [otherId]: 3 },
      },
    });
  });
  it('rejects empty/duplicate/invalid selected IDs and malformed/missing/extra versions', () => {
    for (const ids of [[], [id, id], ['not-an-id']])
      expect(() => cashbookInput(payment({ ids }))).toThrow();
    for (const versions of [
      'invalid json',
      '[]',
      '{}',
      JSON.stringify({ [id]: 0 }),
      JSON.stringify({ [id]: 0, [otherId]: 3, [request]: 1 }),
      JSON.stringify({ [id]: -1, [otherId]: 3 }),
      JSON.stringify({ [id]: 1.5, [otherId]: 3 }),
      JSON.stringify({ [id]: '0', [otherId]: 3 }),
      JSON.stringify({ [id]: 0, [otherId]: 2147483648 }),
    ])
      expect(() => cashbookInput(payment({ versions }))).toThrow();
  });
  it('rejects more than 1000 included debts', () => {
    expect(() => cashbookInput(payment({ ids: Array(1001).fill(id) }))).toThrow();
  });
});

describe('Cashbook date and view filters', () => {
  it('defaults to the Belize date supplied by the server, with independent monthly occurrence period', () => {
    expect(cashbookFilters({}, '2026-09-24')).toEqual({
      from: '2026-09-01',
      to: '2026-09-24',
      month: '2026-09-01',
      view: 'ledger',
      foodView: 'all',
      page: 1,
    });
    expect(
      cashbookFilters(
        {
          from: '2026-08-01',
          to: '2026-08-31',
          month: '2026-10-01',
          view: 'payments',
          foodView: 'previous',
          page: '2',
        },
        '2026-09-24',
      ),
    ).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      month: '2026-10-01',
      view: 'payments',
      foodView: 'previous',
      page: 2,
    });
  });
  it('uses safe defaults for unsupported views and duplicate query parameters', () => {
    expect(
      cashbookFilters(
        { view: 'sql', foodView: 'other', page: ['2', '3'], from: ['bad'] },
        '2026-09-24',
      ),
    ).toMatchObject({ view: 'ledger', foodView: 'all', page: 1, from: '2026-09-01' });
  });
  it('normalizes a native month input while preserving the selected month', () => {
    expect(cashbookFilters({ month: '2026-10' }, '2026-09-24').month).toBe('2026-10-01');
    expect(cashbookFilters({ month: '2028-02' }, '2026-09-24').month).toBe('2028-02-01');
  });
  it('rejects reversed/invalid ranges, non-month-start occurrences and invalid pages', () => {
    for (const params of [
      { from: '2026-09-25', to: '2026-09-24' },
      { from: '2026-02-29' },
      { month: '2026-09-15' },
      { month: '2026-13' },
      { page: '0' },
      { page: '-1' },
      { page: '1.1' },
      { page: '1000001' },
    ])
      expect(() => cashbookFilters(params, '2026-09-24')).toThrow();
  });
});
