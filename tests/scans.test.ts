import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002';
async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query<Record<string, unknown>>("select set_config('request.jwt.claim.sub',$1,false)", [
    id,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',phone text,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;
 grant usage on schema auth,storage,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant all on storage.objects to authenticated,anon;`);
  const migrations = (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of migrations) await db.exec(await readFile('supabase/migrations/' + f, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  for (const [id, role] of [
    [owner, 'OWNER'],
    [manager, 'MANAGER'],
  ]) {
    await db.query<Record<string, unknown>>(
      "insert into auth.users(id,phone,encrypted_password) values($1,'5011234567','test-only-old-hash')",
      [id],
    );
    await db.query<Record<string, unknown>>(
      migrations.some((x) => x.startsWith('20260911000800'))
        ? "update public.profiles set active=true,role=$1,must_change_password=false,account_admin=($1::public.app_role='OWNER') where id=$2"
        : 'update public.profiles set active=true,role=$1 where id=$2',
      [role, id],
    );
  }
});
beforeEach(async () => {
  await db.exec("begin;set time zone 'UTC'");
  await user(owner);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());

const extraction = {
  supplier: null,
  date: null,
  total: null,
  currency: null,
  items: [{ name: 'Scan Water', quantity: 24, check: false }],
};
async function scan(type = 'NOTE') {
  const id = crypto.randomUUID();
  await db.query('select public.reserve_scan($1,$2,$3,100,$4)', [
    id,
    type,
    'a'.repeat(64),
    'image/jpeg',
  ]);
  await db.exec('reset role');
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('smart-scans',$1,$2)",
    [id + '/original', JSON.stringify({ size: 100, mimetype: 'image/jpeg' })],
  );
  await user(type === 'RECEIPT' ? owner : manager);
  await db.query('select public.claim_scan($1)', [id]);
  await db.query('select public.finish_scan($1,$2,$3)', [
    id,
    JSON.stringify(extraction),
    'isolated-test',
  ]);
  return id;
}
async function review(action = 'INVENTORY') {
  const c = (
    await db.query<{ id: string }>('select id from public.categories where active limit 1')
  ).rows[0].id;
  const l = (await db.query<{ id: string }>('select id from public.locations where active limit 1'))
    .rows[0].id;
  return {
    supplier: '',
    date: '',
    total: '',
    currency: '',
    rows: [
      {
        index: 0,
        name: 'Scan Water',
        quantity: 24,
        action,
        product: '',
        category: c,
        unit: 'bottle',
        location: l,
        country: 'BELIZE',
        confirmSimilar: false,
      },
    ],
  };
}
async function approve(id: string, v: unknown) {
  await db.exec('savepoint approval');
  try {
    const result = await db.query('select public.approve_scan($1,$2)', [id, JSON.stringify(v)]);
    await db.exec('release savepoint approval');
    return result;
  } catch (error) {
    await db.exec('rollback to savepoint approval');
    throw error;
  }
}

async function count(table: string) {
  return Number(
    (await db.query<{ n: number }>(`select count(*) n from public.${table}`)).rows[0].n,
  );
}
it('scan extraction makes no inventory or Need writes before approval', async () => {
  await user(manager);
  const before = [
    await count('products'),
    await count('inventory_transactions'),
    await count('purchase_needs'),
  ];
  await scan();
  expect([
    await count('products'),
    await count('inventory_transactions'),
    await count('purchase_needs'),
  ]).toEqual(before);
});
it('manager approves corrected note stock via immutable transactions exactly once', async () => {
  await user(manager);
  const id = await scan(),
    v = await review();
  v.rows[0].quantity = 3;
  v.rows[0].name = 'Corrected Water';
  await approve(id, v);
  await approve(id, v);
  expect(await count('inventory_transactions')).toBe(1);
  const s = (
    await db.query<{ original_result: unknown; approved_by: string; actions: unknown }>(
      'select * from public.smart_scans where id=$1',
      [id],
    )
  ).rows[0];
  expect(s.original_result).toEqual(extraction);
  expect(s.approved_by).toBe(manager);
  expect(JSON.stringify(s.actions)).toContain('transaction_request');
  expect(
    (
      await db.query<{ quantity: number }>(
        'select quantity from public.inventory_balances where quantity>0',
      )
    ).rows[0].quantity,
  ).toBe('3.000');
  await expect(approve(id, { ...v, supplier: 'changed' })).rejects.toThrow('REQUEST_CONFLICT');
});
it('invalid later rows roll back the entire approval', async () => {
  await user(manager);
  const id = await scan(),
    v = await review();
  v.rows.push({ ...v.rows[0], index: 1, name: 'Invalid second row' });
  await expect(approve(id, v)).rejects.toThrow('INVALID_INPUT');
  expect(await count('products')).toBe(8);
  expect(await count('inventory_transactions')).toBe(0);
});
it('Need approval uses linked entity, prevents active duplicates, and never changes stock', async () => {
  await user(manager);
  const id = await scan(),
    v = await review('NEED');
  await approve(id, v);
  expect(await count('purchase_needs')).toBe(1);
  expect(await count('products')).toBe(8);
  expect(await count('inventory_transactions')).toBe(0);
});
it('Owner receipt approval preserves suggestions and creates only zero-stock configuration', async () => {
  await user(owner);
  const id = await scan('RECEIPT'),
    v = await review();
  v.supplier = 'Reviewed Store';
  v.total = '12.50';
  v.currency = 'BZD';
  v.date = '2026-09-11';
  await approve(id, v);
  expect(await count('products')).toBe(9);
  expect(await count('inventory_transactions')).toBe(0);
  expect(
    (await db.query<{ review: unknown }>('select review from public.smart_scans where id=$1', [id]))
      .rows[0].review,
  ).toEqual(v);
});
it('manager cannot create or read an Owner receipt scan', async () => {
  await user(owner);
  const id = await scan('RECEIPT');
  await user(manager);
  expect((await db.query('select * from public.smart_scans where id=$1', [id])).rows).toHaveLength(
    0,
  );
  await expect(approve(id, await review())).rejects.toThrow('FORBIDDEN');
});
it('restricted roles cannot scan', async () => {
  await db.exec("reset role;update public.profiles set role='CREW' where id='" + manager + "'");
  await user(manager);
  await expect(
    db.query('select public.reserve_scan($1,$2,$3,100,$4)', [
      crypto.randomUUID(),
      'NOTE',
      'a'.repeat(64),
      'image/jpeg',
    ]),
  ).rejects.toThrow('FORBIDDEN');
});
it('original result cannot be replaced or history deleted', async () => {
  await user(manager);
  const id = await scan();
  await db.exec('savepoint original_result');
  await expect(
    db.query('select public.finish_scan($1,$2,$3)', [
      id,
      JSON.stringify({ ...extraction, items: [] }),
      'replacement',
    ]),
  ).rejects.toThrow('SCAN_STATE');
  await db.exec('rollback to savepoint original_result');
  await expect(db.query('delete from public.smart_scans where id=$1', [id])).rejects.toThrow();
});
it('negative quantities are rejected before operational writes', async () => {
  await user(manager);
  const id = await scan(),
    v = await review();
  v.rows[0].quantity = -2;
  await expect(approve(id, v)).rejects.toThrow('INVALID_INPUT');
  expect(await count('inventory_transactions')).toBe(0);
});
it('ignoring all rows records approval without operations', async () => {
  await user(manager);
  const id = await scan();
  await approve(id, await review('IGNORE'));
  expect(await count('products')).toBe(8);
  expect(await count('inventory_transactions')).toBe(0);
});

it('existing matched product creates stock without duplicating the catalog', async () => {
  await user(manager);
  const id = await scan(),
    v = await review();
  v.rows[0].product = (
    await db.query<{ id: string }>("select id from public.products where name='Water'")
  ).rows[0].id;
  await approve(id, v);
  expect(await count('products')).toBe(8);
  expect(await count('inventory_transactions')).toBe(1);
});
it('linked Needs reject duplicate active entries atomically', async () => {
  await user(manager);
  const id = await scan(),
    v = await review('NEED');
  v.rows[0].product = (
    await db.query<{ id: string }>("select id from public.products where name='Water'")
  ).rows[0].id;
  await approve(id, v);
  const other = await scan();
  await expect(approve(other, v)).rejects.toThrow('DUPLICATE_NEED');
  expect(await count('purchase_needs')).toBe(1);
});
it('private image access remains protected even with an unrelated broad storage policy', async () => {
  await user(owner);
  const id = await scan('RECEIPT');
  await db.exec(
    "reset role;create function storage.allow_only_operation(text) returns boolean language sql as $$select $1=current_setting('test.operation',true)$$;create policy broad_read on storage.objects for select to authenticated using(true)",
  );
  await user(manager);
  await db.exec("select set_config('test.operation','object.get_authenticated',false)");
  expect(
    (await db.query('select * from storage.objects where name=$1', [id + '/original'])).rows,
  ).toHaveLength(0);
  await user(owner);
  expect(
    (await db.query('select * from storage.objects where name=$1', [id + '/original'])).rows,
  ).toHaveLength(1);
  await db.exec("select set_config('test.operation','object.sign',false)");
  expect(
    (await db.query('select * from storage.objects where name=$1', [id + '/original'])).rows,
  ).toHaveLength(0);
});
it('scan audit contains original and approved snapshots with server actor and timestamps', async () => {
  await user(manager);
  const id = await scan();
  await approve(id, await review('IGNORE'));
  await user(owner);
  const events = (
    await db.query<{
      actor_id: string;
      before_data: unknown;
      after_data: unknown;
      created_at: string;
    }>('select * from public.audit_events where entity_type=$1 and entity_id=$2 order by id', [
      'smart_scans',
      id,
    ])
  ).rows;
  expect(events.length).toBe(4);
  expect(events.every((e) => e.actor_id === manager && e.created_at)).toBe(true);
  expect(events.some((e) => JSON.stringify(e.after_data).includes('APPROVED'))).toBe(true);
});
