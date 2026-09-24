import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const owner = 'cc000000-0000-4000-8000-000000000001';
const jackie = 'b54670b2-df51-4247-83fb-55a456db6011';
const manager = 'cc000000-0000-4000-8000-000000000003';
const crew = 'cc000000-0000-4000-8000-000000000004';
const foodTemplate = 'cb000000-0000-4000-8000-000000000002';
const rentTemplate = 'cb000000-0000-4000-8000-000000000005';
const socialTemplate = 'cb000000-0000-4000-8000-000000000006';
const date = '2026-09-24';

async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function q<T = Record<string, unknown>>(sql: string, args?: unknown[]) {
  await db.exec('savepoint expected_error');
  try {
    const r = await db.query<T>(sql, args);
    await db.exec('release savepoint expected_error');
    return r;
  } catch (e) {
    await db.exec('rollback to savepoint expected_error;release savepoint expected_error');
    throw e;
  }
}
async function mutate(
  action: string,
  values: Record<string, unknown>,
  request = crypto.randomUUID(),
) {
  return (
    await q<{ result: { id: string; ids: string[] } }>(
      'select public.cashbook_mutate($1,$2,$3) result',
      [request, action, values],
    )
  ).rows[0].result;
}
async function balance() {
  return (
    await q<{
      b: {
        cash_cents: number;
        account_cents: number;
        total_cents: number;
        cash_opened: boolean;
        account_opened: boolean;
      };
    }>('select public.cashbook_balances() b')
  ).rows[0].b;
}
async function opening(cash = 100000, account = 200000) {
  await mutate('POST', {
    kind: 'OPENING',
    amount_cents: cash,
    destination_account: 'CASH',
    effective_date: date,
  });
  await mutate('POST', {
    kind: 'OPENING',
    amount_cents: account,
    destination_account: 'ACCOUNT',
    effective_date: date,
  });
}
async function food(quantity = 2, unit = 2000) {
  return (
    await mutate('ADD_FOOD', {
      template_id: foodTemplate,
      effective_date: date,
      quantity,
      unit_amount_cents: unit,
      comment: 'Food detail',
    })
  ).id;
}
async function payment(ids: string[], overrides: Record<string, unknown> = {}) {
  const due = (
    await q<{ id: string; amount_cents: number; version: number }>(
      'select id,amount_cents,version from public.cashbook_due where id=any($1::uuid[])',
      [ids],
    )
  ).rows;
  return {
    ids,
    source_account: 'CASH',
    effective_date: date,
    expected_total_cents: due.reduce((sum, d) => sum + Number(d.amount_cents), 0),
    versions: Object.fromEntries(due.map((d) => [d.id, d.version])),
    ...overrides,
  };
}
async function template(id = rentTemplate, amount = 80000, due = 31) {
  return mutate('SAVE_TEMPLATE', {
    id,
    kind: 'MONTHLY',
    name_en: id === rentTemplate ? 'Bodega rent' : 'Social Security',
    name_es: id === rentTemplate ? 'Renta de bodega' : 'Seguro Social',
    default_amount_cents: amount,
    due_day: due,
    active: true,
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',phone text,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;
    grant usage on schema auth,storage,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant all on storage.objects to authenticated,anon;`);
  const migrations = (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations.filter((f) => !f.startsWith('20260924000100')))
    await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  for (const [id, role] of [
    [owner, 'OWNER'],
    [jackie, 'MANAGER'],
    [manager, 'MANAGER'],
    [crew, 'CREW'],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query(
      "update public.profiles set active=true,role=$1,must_change_password=false,display_name='Jackie' where id=$2",
      [role, id],
    );
  }
  await db.exec(await readFile('supabase/migrations/20260924000100_cashbook.sql', 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec("begin;set time zone 'UTC'");
  await user(owner);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db?.close();
});

it('binds membership by authenticated UUID; Owners access without membership and names confer no access', async () => {
  expect((await q('select public.cashbook_access() allowed')).rows[0].allowed).toBe(true);
  await user(jackie);
  expect((await q('select public.cashbook_access() allowed')).rows[0].allowed).toBe(true);
  for (const id of [manager, crew]) {
    await user(id);
    expect((await q('select public.cashbook_access() allowed')).rows[0].allowed).toBe(false);
    expect((await q('select * from public.cashbook_templates')).rows).toHaveLength(0);
    expect((await q('select * from public.cashbook_due')).rows).toHaveLength(0);
    await expect(
      mutate('ADD_FOOD', { template_id: foodTemplate, quantity: 1, unit_amount_cents: 100 }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(balance()).rejects.toThrow('FORBIDDEN');
  }
  await db.exec('reset role;set role anon');
  await expect(q('select public.cashbook_access()')).rejects.toThrow('permission denied');
});

it('revoking activation or membership immediately denies read/write access', async () => {
  await db.exec(`reset role;update public.profiles set active=false where id='${jackie}'`);
  await user(jackie);
  expect((await q('select public.cashbook_access() allowed')).rows[0].allowed).toBe(false);
  await db.exec(
    `reset role;update public.profiles set active=true where id='${jackie}';delete from public.cashbook_members where user_id='${jackie}'`,
  );
  await user(jackie);
  await expect(balance()).rejects.toThrow('FORBIDDEN');
});

it('has no invented opening, amount, or monthly due-day; zero Owner opening is explicit and audited', async () => {
  expect(await balance()).toEqual({
    cash_cents: 0,
    account_cents: 0,
    total_cents: 0,
    cash_opened: false,
    account_opened: false,
  });
  expect((await q('select * from public.cashbook_due')).rows).toHaveLength(0);
  expect(
    (await q('select default_amount_cents,due_day from public.cashbook_templates')).rows.every(
      (r) => r.default_amount_cents === null && r.due_day === null,
    ),
  ).toBe(true);
  await user(jackie);
  await expect(
    mutate('POST', { kind: 'OPENING', amount_cents: 0, destination_account: 'CASH' }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    mutate('POST', { kind: 'INCOME', amount_cents: 100, destination_account: 'CASH' }),
  ).rejects.toThrow('OPENING_REQUIRED');
  await user(owner);
  const { id } = await mutate('POST', {
    kind: 'OPENING',
    amount_cents: 0,
    destination_account: 'CASH',
  });
  expect((await balance()).cash_opened).toBe(true);
  const row = (await q('select * from public.audit_events where entity_id=$1', [id])).rows[0];
  expect(row.actor_id).toBe(owner);
  expect(row.created_at).toBeTruthy();
  await expect(
    mutate('POST', { kind: 'OPENING', amount_cents: 1, destination_account: 'CASH' }),
  ).rejects.toThrow('OPENING_ALREADY_SET');
});

it('records cash/account incomes and expenses exactly; transfers preserve total and link both legs', async () => {
  await opening();
  await user(jackie);
  for (const account of ['CASH', 'ACCOUNT']) {
    await mutate('POST', { kind: 'INCOME', amount_cents: 10001, destination_account: account });
    await mutate('POST', { kind: 'EXPENSE', amount_cents: 550, source_account: account });
  }
  const before = await balance();
  const { id } = await mutate('POST', {
    kind: 'TRANSFER',
    amount_cents: 30000,
    source_account: 'ACCOUNT',
    destination_account: 'CASH',
  });
  expect(await balance()).toMatchObject({
    cash_cents: 139451,
    account_cents: 179451,
    total_cents: before.total_cents,
  });
  const legs = (
    await q<{ amount_cents: number }>(
      'select amount_cents from public.cashbook_entries where transaction_id=$1',
      [id],
    )
  ).rows;
  expect(legs).toHaveLength(2);
  expect(legs.reduce((sum, row) => sum + Number(row.amount_cents), 0)).toBe(0);
});

it('allows negative current balances to record actual payments, but not negative entered amounts or partial transfers', async () => {
  await opening(0, 0);
  await mutate('POST', { kind: 'EXPENSE', amount_cents: 101, source_account: 'CASH' });
  expect((await balance()).cash_cents).toBe(-101);
  await expect(
    mutate('POST', { kind: 'EXPENSE', amount_cents: -1, source_account: 'CASH' }),
  ).rejects.toThrow('INVALID_INPUT');
  await expect(
    mutate('POST', {
      kind: 'TRANSFER',
      amount_cents: 10,
      source_account: 'CASH',
      destination_account: 'CASH',
    }),
  ).rejects.toThrow();
  expect((await balance()).cash_cents).toBe(-101);
});

it('rolls back both transfer legs, transaction, and idempotency receipt on injected second-leg failure', async () => {
  await opening();
  await db.exec(`reset role;create function private.fail_cashbook_leg() returns trigger language plpgsql as $$begin if new.account='CASH' then raise exception 'INJECTED';end if;return new;end$$;
    create trigger fail_leg before insert on public.cashbook_entries for each row execute function private.fail_cashbook_leg();`);
  await user(jackie);
  const request = crypto.randomUUID();
  await expect(
    mutate(
      'POST',
      {
        kind: 'TRANSFER',
        amount_cents: 100,
        source_account: 'ACCOUNT',
        destination_account: 'CASH',
      },
      request,
    ),
  ).rejects.toThrow('INJECTED');
  expect(await balance()).toMatchObject({ cash_cents: 100000, account_cents: 200000 });
  expect(
    (await q('select id from public.cashbook_transactions where request_id=$1', [request])).rows,
  ).toHaveLength(0);
  await db.exec('reset role');
  expect(
    (await q('select request_id from private.cashbook_requests where request_id=$1', [request]))
      .rows,
  ).toHaveLength(0);
});

it('retries exactly once and rejects changed payload/actor with same stable request', async () => {
  await opening();
  const request = crypto.randomUUID(),
    values = { kind: 'INCOME', amount_cents: 123, destination_account: 'CASH' };
  const first = await mutate('POST', values, request);
  expect(await mutate('POST', values, request)).toEqual(first);
  await expect(mutate('POST', { ...values, amount_cents: 124 }, request)).rejects.toThrow(
    'REQUEST_CONFLICT',
  );
  await user(jackie);
  await expect(mutate('POST', values, request)).rejects.toThrow('REQUEST_CONFLICT');
  expect((await balance()).cash_cents).toBe(100123);
});

it('preserves original history during corrections and voids, including transfer reversal', async () => {
  await opening();
  const initial = await mutate('POST', {
    kind: 'INCOME',
    amount_cents: 10000,
    destination_account: 'CASH',
    comment: 'Original',
  });
  await user(jackie);
  const corrected = await mutate('CORRECT', {
    id: initial.id,
    reason: 'Count corrected',
    amount_cents: 6000,
  });
  expect((await balance()).cash_cents).toBe(106000);
  const original = (
    await q('select * from public.cashbook_transaction_history where id=$1', [initial.id])
  ).rows[0];
  expect(original).toMatchObject({ status: 'CORRECTED', created_by: owner, comment: 'Original' });
  await mutate('VOID', { id: corrected.id, reason: 'Entered twice' });
  expect((await balance()).cash_cents).toBe(100000);
  await expect(mutate('VOID', { id: corrected.id, reason: 'Again' })).rejects.toThrow(
    'ALREADY_REVERSED',
  );
  const transfer = await mutate('POST', {
    kind: 'TRANSFER',
    source_account: 'ACCOUNT',
    destination_account: 'CASH',
    amount_cents: 200,
  });
  await mutate('VOID', { id: transfer.id, reason: 'Transfer did not happen' });
  expect(await balance()).toMatchObject({ cash_cents: 100000, account_cents: 200000 });
});

it('permits only Owner correction of opening balance and forbids voiding/replacing its account', async () => {
  await opening();
  const id = (
    await q<{ id: string }>(
      "select id from public.cashbook_transactions where kind='OPENING' and destination_account='CASH'",
    )
  ).rows[0].id;
  await user(jackie);
  await expect(mutate('CORRECT', { id, amount_cents: 1, reason: 'Correction' })).rejects.toThrow(
    'OPENING_REQUIRES_OWNER_CORRECTION',
  );
  await user(owner);
  await expect(mutate('VOID', { id, reason: 'Correction' })).rejects.toThrow(
    'OPENING_REQUIRES_OWNER_CORRECTION',
  );
  await expect(
    mutate('CORRECT', {
      id,
      amount_cents: 100,
      destination_account: 'ACCOUNT',
      reason: 'Correction',
    }),
  ).rejects.toThrow('INVALID_INPUT');
  await mutate('CORRECT', { id, amount_cents: 50000, reason: 'Actual count' });
  expect((await balance()).cash_cents).toBe(50000);
});

it('food quantity × individual price is exact, pending debt has no ledger effect, and override leaves template unchanged', async () => {
  const id = await food(3, 2001);
  expect((await balance()).total_cents).toBe(0);
  expect(
    (await q('select amount_cents,quantity from public.cashbook_due where id=$1', [id])).rows[0],
  ).toMatchObject({ amount_cents: 6003, quantity: 3 });
  await mutate('UPDATE_DUE', { id, version: 1, quantity: 2, unit_amount_cents: 3000 });
  expect(
    (await q('select amount_cents,version from public.cashbook_due where id=$1', [id])).rows[0],
  ).toMatchObject({ amount_cents: 6000, version: 2 });
  expect(
    (
      await q('select default_amount_cents from public.cashbook_templates where id=$1', [
        foodTemplate,
      ])
    ).rows[0].default_amount_cents,
  ).toBeNull();
  await expect(mutate('UPDATE_DUE', { id, version: 1, quantity: 1 })).rejects.toThrow(
    'STALE_VERSION',
  );
  await expect(food(1.5, 1000)).rejects.toThrow();
});

it('settles reviewed food lines with one payment, retries safely, and refuses a second settlement', async () => {
  await opening();
  await user(jackie);
  const ids = [await food(), await food(1, 2500)],
    values = await payment(ids),
    request = crypto.randomUUID();
  const paid = await mutate('PAY', values, request);
  expect(await mutate('PAY', values, request)).toEqual(paid);
  expect(
    (await q("select id from public.cashbook_transactions where kind='PAYMENT'")).rows,
  ).toHaveLength(1);
  expect((await q("select id from public.cashbook_due where status='PAID'")).rows).toHaveLength(2);
  expect((await balance()).cash_cents).toBe(93500);
  expect(
    (
      await q('select debt_ids,payment_kind from public.cashbook_transaction_history where id=$1', [
        paid.id,
      ])
    ).rows[0],
  ).toMatchObject({ payment_kind: 'FOOD', debt_ids: [...ids].sort() });
  await expect(mutate('PAY', values)).rejects.toThrow('ALREADY_PAID');
  await expect(mutate('UPDATE_DUE', { id: ids[0], version: 1, quantity: 10 })).rejects.toThrow(
    'ALREADY_PAID',
  );
});

it('rejects a stale payment review before any balance/debt change and requires explicit line versions', async () => {
  await opening();
  const id = await food(),
    values = await payment([id]);
  await mutate('UPDATE_DUE', { id, version: 1, quantity: 3 });
  await expect(mutate('PAY', values)).rejects.toThrow('STALE_VERSION');
  await expect(mutate('PAY', { ids: [id], source_account: 'CASH' })).rejects.toThrow(
    'REVIEW_REQUIRED',
  );
  await expect(
    mutate('PAY', { ...(await payment([id])), expected_total_cents: 1 }),
  ).rejects.toThrow('AMOUNT_CHANGED');
  expect((await balance()).cash_cents).toBe(100000);
  expect((await q('select status from public.cashbook_due where id=$1', [id])).rows[0].status).toBe(
    'PENDING',
  );
});

it('payment correction preserves paid linkage; void restores all food debts and allows a new reviewed settlement', async () => {
  await opening();
  const ids = [await food(), await food()];
  const paid = await mutate('PAY', await payment(ids));
  await expect(
    mutate('CORRECT', { id: paid.id, reason: 'Wrong total', amount_cents: 10 }),
  ).rejects.toThrow('FOOD_TOTAL_IMMUTABLE');
  const corrected = await mutate('CORRECT', {
    id: paid.id,
    reason: 'Paid from account',
    source_account: 'ACCOUNT',
  });
  expect((await q("select id from public.cashbook_due where status='PAID'")).rows).toHaveLength(2);
  expect(await balance()).toMatchObject({ cash_cents: 100000, account_cents: 192000 });
  await mutate('VOID', { id: corrected.id, reason: 'Never paid' });
  expect((await q("select id from public.cashbook_due where status='PENDING'")).rows).toHaveLength(
    2,
  );
  await mutate('PAY', await payment(ids));
  expect((await balance()).cash_cents).toBe(92000);
});

it('projects monthly rent/social occurrences without GET writes; clamps due day and materializes only selected payment', async () => {
  await opening();
  await template();
  await template(socialTemplate, 12000, 15);
  const due = (
    await q<{ id: string; version: number; template_id: string; amount_cents: number }>(
      'select * from public.cashbook_due',
    )
  ).rows;
  expect(due).toHaveLength(2);
  expect(due.every((d) => d.version === 0)).toBe(true);
  // Virtual month IDs must pass the same UUID validation as the web forms.
  expect(due.every((d) => z.uuid().safeParse(d.id).success)).toBe(true);
  expect((await q('select id from public.cashbook_debts')).rows).toHaveLength(0);
  const rent = due.find((d) => d.template_id === rentTemplate)!;
  await mutate('PAY', await payment([rent.id], { amount_cents: 81000, source_account: 'ACCOUNT' }));
  expect(
    (await q('select * from public.cashbook_due where id=$1', [rent.id])).rows[0],
  ).toMatchObject({ status: 'PAID', amount_cents: 80000, paid_amount_cents: 81000 });
  expect((await balance()).account_cents).toBe(119000);
  expect((await q('select id from public.cashbook_debts')).rows).toHaveLength(1);
});

it('snapshots outstanding monthly occurrences before template changes and invalidates virtual review', async () => {
  await opening();
  await template();
  const due = (
      await q<{ id: string; version: number }>('select id,version from public.cashbook_due')
    ).rows[0],
    values = await payment([due.id]);
  await template(rentTemplate, 90000, 20);
  const snapshot = (await q('select * from public.cashbook_due where id=$1', [due.id])).rows[0];
  expect(snapshot).toMatchObject({ amount_cents: 80000, version: 1 });
  await expect(mutate('PAY', values)).rejects.toThrow('STALE_VERSION');
  await mutate('UPDATE_DUE', { id: due.id, version: 1, amount_cents: 85000 });
  expect(
    (
      await q('select default_amount_cents from public.cashbook_templates where id=$1', [
        rentTemplate,
      ])
    ).rows[0].default_amount_cents,
  ).toBe(90000);
});

it('generates missed configured months with stable IDs and allows one-month override of a virtual occurrence', async () => {
  await template();
  await db.exec(
    `reset role;update public.cashbook_templates set start_month=(date_trunc('month',now() at time zone 'America/Belize')-interval '2 months')::date where id='${rentTemplate}'`,
  );
  await user(owner);
  const rows = (
    await q<{ id: string; version: number }>(
      'select id,version from public.cashbook_due order by period_month',
    )
  ).rows;
  expect(rows).toHaveLength(3);
  expect(
    (await q('select id,version from public.cashbook_due order by period_month')).rows,
  ).toEqual(rows);
  await mutate('UPDATE_DUE', { id: rows[0].id, version: 0, amount_cents: 85000 });
  expect(
    (await q('select amount_cents,version from public.cashbook_due where id=$1', [rows[0].id]))
      .rows[0],
  ).toMatchObject({ amount_cents: 85000, version: 2 });
  expect((await q('select id from public.cashbook_debts')).rows).toHaveLength(1);
});

it('restricts template edits and export to Owner, and rejects direct table/private helper/history changes', async () => {
  await opening();
  await user(jackie);
  await expect(template()).rejects.toThrow('FORBIDDEN');
  await expect(q('select public.cashbook_report($1)', [date])).rejects.toThrow('FORBIDDEN');
  await expect(q('delete from public.cashbook_transactions')).rejects.toThrow('permission denied');
  await expect(
    q(
      "insert into public.cashbook_entries(transaction_id,account,amount_cents) values(gen_random_uuid(),'CASH',1)",
    ),
  ).rejects.toThrow('permission denied');
  await expect(q('select private.cashbook_materialize(array[]::uuid[])')).rejects.toThrow(
    'permission denied',
  );
  await db.exec('reset role');
  await expect(q('delete from public.cashbook_transactions')).rejects.toThrow(
    'CASHBOOK_HISTORY_IMMUTABLE',
  );
  await expect(q('truncate public.cashbook_entries')).rejects.toThrow('CASHBOOK_HISTORY_IMMUTABLE');
  await expect(
    q("update public.audit_events set action='tampered' where entity_type='cashbook_transactions'"),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});

it('does not extend Test Data, rejects stray is_test, and leaves existing guards unchanged', async () => {
  await expect(
    mutate('POST', {
      kind: 'OPENING',
      amount_cents: 0,
      destination_account: 'CASH',
      is_test: true,
    }),
  ).rejects.toThrow('INVALID_INPUT');
  await expect(
    q("select public.create_test_record('cashbook_mutate',$1)", [
      { p_request: crypto.randomUUID(), p_action: 'POST', p_values: {} },
    ]),
  ).rejects.toThrow('INVALID_INPUT');
  await expect(
    q("select public.delete_test_record('cashbook_transactions',$1)", [crypto.randomUUID()]),
  ).rejects.toThrow('INVALID_INPUT');
  expect(
    (
      await q(
        "select column_name from information_schema.columns where table_name like 'cashbook_%' and column_name='is_test'",
      )
    ).rows,
  ).toHaveLength(0);
});

it('defaults effective dates in Belize and the Owner report includes complete linked ledger through its cutoff', async () => {
  await opening();
  const post = await mutate('POST', {
    kind: 'INCOME',
    amount_cents: 1,
    destination_account: 'CASH',
  });
  expect(
    (
      await q(
        "select effective_date=(now() at time zone 'America/Belize')::date correct from public.cashbook_transactions where id=$1",
        [post.id],
      )
    ).rows[0].correct,
  ).toBe(true);
  const report = (
    await q<{ r: { transactions: unknown[]; entries: unknown[] } }>(
      "select public.cashbook_report('2100-01-01') r",
    )
  ).rows[0].r;
  expect(report.transactions).toHaveLength(3);
  expect(report.entries).toHaveLength(3);
  expect(
    (
      await q(
        "select ('2026-09-25 04:59:00+00'::timestamptz at time zone 'America/Belize')::date::text operational_day",
      )
    ).rows[0].operational_day,
  ).toBe('2026-09-24');
});

it('serializes duplicate submitted payments with one stable request in the embedded database queue', async () => {
  await opening();
  const id = await food(),
    values = await payment([id]),
    request = crypto.randomUUID();
  const call = () =>
    db.query<{ r: { id: string } }>('select public.cashbook_mutate($1,$2,$3) r', [
      request,
      'PAY',
      values,
    ]);
  const [a, b] = await Promise.all([call(), call()]);
  expect(a.rows[0].r.id).toBe(b.rows[0].r.id);
  expect((await balance()).cash_cents).toBe(96000);
  const body = (
    await q<{ body: string }>(
      "select pg_get_functiondef('public.cashbook_mutate(uuid,text,jsonb)'::regprocedure) body",
    )
  ).rows[0].body;
  expect(body).toContain("pg_advisory_xact_lock(hashtextextended('cashbook',0))");
  expect(body).toContain('for update');
});

it('retains payment line snapshots after void, debt edits, and repayment', async () => {
  await opening();
  const id = await food(2, 2000);
  const paid = await mutate('PAY', await payment([id]));
  const originalDetails = (
    await q<{
      details: {
        quantity: number;
        unit_amount_cents: number;
        amount_cents: number;
        paid_amount_cents: number;
      }[];
    }>('select public.cashbook_payment_details($1) details', [paid.id])
  ).rows[0].details;
  expect(originalDetails).toHaveLength(1);
  expect(originalDetails[0]).toMatchObject({
    quantity: 2,
    unit_amount_cents: 2000,
    amount_cents: 4000,
    paid_amount_cents: 4000,
  });
  const corrected = await mutate('CORRECT', {
    id: paid.id,
    reason: 'Actual source',
    source_account: 'ACCOUNT',
  });
  expect(
    (
      await q<{ details: { quantity: number; amount_cents: number }[] }>(
        'select public.cashbook_payment_details($1) details',
        [corrected.id],
      )
    ).rows[0].details[0],
  ).toMatchObject({ quantity: 2, amount_cents: 4000 });
  const voided = await mutate('VOID', { id: corrected.id, reason: 'Payment cancelled' });
  await mutate('UPDATE_DUE', {
    id,
    version: 1,
    quantity: 3,
    unit_amount_cents: 1500,
    effective_date: '2026-09-25',
  });
  await mutate('PAY', await payment([id]));
  const later = (
    await q<{ details: unknown[] }>('select public.cashbook_payment_details($1) details', [paid.id])
  ).rows[0].details;
  expect(later).toEqual(originalDetails);
  const reversedDetails = (
    await q<{ details: { amount_cents: number }[] }>(
      'select public.cashbook_payment_details($1) details',
      [voided.id],
    )
  ).rows[0].details;
  expect(reversedDetails[0].amount_cents).toBe(4000);
  await user(manager);
  await expect(q('select public.cashbook_payment_details($1)', [paid.id])).rejects.toThrow(
    'FORBIDDEN',
  );
});

it('preserves relationships to corrections beyond an export cutoff without adding future ledger legs', async () => {
  await opening();
  const original = await mutate('POST', {
    kind: 'INCOME',
    amount_cents: 100,
    destination_account: 'CASH',
    effective_date: date,
  });
  const correction = await mutate('CORRECT', {
    id: original.id,
    reason: 'Future correction',
    amount_cents: 200,
    effective_date: '2026-09-25',
  });
  const r = (
    await q<{
      r: {
        transactions: { id: string; related_transaction_ids: string[]; status: string }[];
        entries: { transaction_id: string }[];
      };
    }>('select public.cashbook_report($1) r', [date])
  ).rows[0].r;
  expect(r.transactions).toHaveLength(3);
  expect(r.transactions.find((t) => t.id === original.id)).toMatchObject({
    status: 'CORRECTED',
    related_transaction_ids: expect.arrayContaining([correction.id]),
  });
  expect(r.entries.some((e) => e.transaction_id === correction.id)).toBe(false);
});

it('does not backfill unconfigured/inactive months and preserves already accrued debts at deactivation', async () => {
  await db.exec(
    `reset role;update public.cashbook_templates set created_at=now()-interval '2 years' where id='${rentTemplate}'`,
  );
  await user(owner);
  await template();
  expect((await q('select id from public.cashbook_due')).rows).toHaveLength(1);
  await db.exec(
    `reset role;update public.cashbook_templates set start_month=(date_trunc('month',now() at time zone 'America/Belize')-interval '2 months')::date where id='${rentTemplate}'`,
  );
  await user(owner);
  await mutate('SAVE_TEMPLATE', {
    id: rentTemplate,
    kind: 'MONTHLY',
    name_en: 'Bodega rent',
    name_es: 'Renta de bodega',
    default_amount_cents: 80000,
    due_day: 15,
    active: false,
  });
  expect((await q('select id from public.cashbook_debts')).rows).toHaveLength(3);
  // A past inactive run start must not cause new gap months to be invented on reactivation.
  await db.exec(
    `reset role;update public.cashbook_templates set start_month=(date_trunc('month',now() at time zone 'America/Belize')-interval '12 months')::date where id='${rentTemplate}'`,
  );
  await user(owner);
  await template();
  expect((await q('select id from public.cashbook_due')).rows).toHaveLength(3);
  expect(
    (
      await q(
        "select start_month=date_trunc('month',now() at time zone 'America/Belize')::date reset from public.cashbook_templates where id=$1",
        [rentTemplate],
      )
    ).rows[0].reset,
  ).toBe(true);
});

it('keeps audit records confidential to other Managers and derives actor/server time from authentication', async () => {
  await opening();
  await user(jackie);
  const posted = await mutate('POST', {
    kind: 'EXPENSE',
    source_account: 'CASH',
    amount_cents: 100,
    created_by: manager,
    created_at: '2000-01-01',
  });
  const row = (
    await q(
      'select created_by,created_at=now() correct_time from public.cashbook_transactions where id=$1',
      [posted.id],
    )
  ).rows[0];
  expect(row).toMatchObject({ created_by: jackie, correct_time: true });
  await user(manager);
  expect(
    (await q("select * from public.audit_events where entity_type like 'cashbook_%'")).rows,
  ).toHaveLength(0);
  expect((await q('select * from public.cashbook_transaction_history')).rows).toHaveLength(0);
  expect((await q('select * from public.cashbook_entries')).rows).toHaveLength(0);
  expect((await q('select * from public.cashbook_allocations')).rows).toHaveLength(0);
});

it('rolls back payment and all ledger effects when allocation creation fails', async () => {
  await opening();
  const id = await food();
  await db.exec(`reset role;create function private.fail_cashbook_allocation() returns trigger language plpgsql as $$begin raise exception 'INJECTED_PAYMENT';end$$;
    create trigger fail_allocation before insert on public.cashbook_allocations for each row execute function private.fail_cashbook_allocation();`);
  await user(jackie);
  await expect(mutate('PAY', await payment([id]))).rejects.toThrow('INJECTED_PAYMENT');
  expect((await balance()).cash_cents).toBe(100000);
  expect(
    (await q("select id from public.cashbook_transactions where kind='PAYMENT'")).rows,
  ).toHaveLength(0);
  expect((await q('select status from public.cashbook_due where id=$1', [id])).rows[0].status).toBe(
    'PENDING',
  );
});

it('accepts exactly one of two queued overlapping settlement requests', async () => {
  await opening();
  const id = await food(),
    values = await payment([id]);
  await db.exec(`reset role;create function private.try_cashbook_pay(p_request uuid,p_values jsonb) returns jsonb language plpgsql as $$
    begin return public.cashbook_mutate(p_request,'PAY',p_values);exception when others then return jsonb_build_object('error',sqlerrm);end$$;`);
  await user(jackie);
  const call = () =>
    db.query<{ r: { id?: string; error?: string } }>('select private.try_cashbook_pay($1,$2) r', [
      crypto.randomUUID(),
      values,
    ]);
  const results = await Promise.all([call(), call()]);
  expect(results.filter((r) => r.rows[0].r.id)).toHaveLength(1);
  expect(results.filter((r) => r.rows[0].r.error === 'ALREADY_PAID')).toHaveLength(1);
  expect((await balance()).cash_cents).toBe(96000);
});
