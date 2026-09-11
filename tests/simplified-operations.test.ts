import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002',
  other = '40000000-0000-4000-8000-000000000003',
  crew = '40000000-0000-4000-8000-000000000004';
const product = '30000000-0000-4000-8000-000000000001',
  boat = '10000000-0000-4000-8000-000000000001',
  storage = '10000000-0000-4000-8000-000000000003';
let original: string;
async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const reverse = (id = original, request = crypto.randomUUID()) =>
  db.query('select public.reverse_stock($1,$2)', [request, id]);
const capture = (id = crypto.randomUUID(), type = 'FUEL', payment = 'CASH') =>
  db.query('select public.capture_receipt($1,$2,$3,$4,128)', [id, type, payment, 'a'.repeat(64)]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;
 grant usage on schema auth,storage,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant all on storage.objects to authenticated,anon;
 create policy broad_policy on storage.objects for all to authenticated,anon using(true) with check(true);`);
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  for (const [id, role] of [
    [owner, 'OWNER'],
    [manager, 'MANAGER'],
    [other, 'MANAGER'],
    [crew, 'CREW'],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('update public.profiles set active=true,role=$1 where id=$2', [role, id]);
  }
});
beforeEach(async () => {
  await db.exec('begin');
  await user(owner);
  for (const loc of [boat, storage])
    await db.query('select public.configure_inventory($1,$2,2,10)', [product, loc]);
  await user(manager);
  original = (
    await db.query<{ id: string }>(
      "select public.change_stock($1,$2,$3,10,'ADD','other','') as id",
      [crypto.randomUUID(), product, boat],
    )
  ).rows[0].id;
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());
it('blocks manager catalog administration at the RPC boundary', async () => {
  await expect(
    db.query('select public.save_inventory_items($1,$2)', [crypto.randomUUID(), '[]']),
  ).rejects.toThrow('FORBIDDEN');
});
it('keeps manager financial entry owner-only', async () => {
  await expect(
    db.query("select public.record_spending($1,'EXPENSE',$2,1,'BZD',$3,$4,'CASH',now(),'')", [
      crypto.randomUUID(),
      '60000000-0000-4000-8000-000000000001',
      boat,
      manager,
    ]),
  ).rejects.toThrow('FORBIDDEN');
});
it('reversal creates linked history and never changes original actor/time/quantity', async () => {
  const before = (
    await db.query('select * from public.inventory_transactions where id=$1', [original])
  ).rows[0];
  const request = crypto.randomUUID();
  await reverse(original, request);
  await reverse(original, request);
  expect(
    (await db.query('select * from public.inventory_transactions where id=$1', [original])).rows[0],
  ).toEqual(before);
  expect(
    (
      await db.query(
        'select quantity,performed_by_user_id from public.inventory_transactions where reverses_transaction_id=$1',
        [original],
      )
    ).rows,
  ).toEqual([{ quantity: '-10.000', performed_by_user_id: manager }]);
  expect(
    (await db.query('select quantity from public.inventory_balances where location_id=$1', [boat]))
      .rows,
  ).toEqual([{ quantity: '0.000' }]);
  await expect(reverse()).rejects.toThrow('ALREADY_REVERSED');
});
it('only owners can reverse another user and managers see the linked correction', async () => {
  await user(other);
  await db.exec('savepoint bad');
  await expect(reverse()).rejects.toThrow('FORBIDDEN');
  await db.exec('rollback to savepoint bad');
  await user(owner);
  await reverse();
  await user(manager);
  expect((await db.query('select * from public.inventory_transactions')).rows).toHaveLength(2);
  await user(other);
  expect((await db.query('select * from public.inventory_transactions')).rows).toHaveLength(0);
});
it('reverses both transfer legs atomically', async () => {
  const transfer = crypto.randomUUID();
  await db.query("select public.transfer_stock($1,$2,$3,$4,4,'')", [
    transfer,
    product,
    boat,
    storage,
  ]);
  const leg = (
    await db.query<{ id: string }>(
      'select id from public.inventory_transactions where transfer_id=$1 and location_id=$2',
      [transfer, storage],
    )
  ).rows[0].id;
  await reverse(leg);
  expect(
    (await db.query('select quantity from public.inventory_balances order by location_id')).rows,
  ).toEqual([{ quantity: '10.000' }, { quantity: '0.000' }]);
  expect(
    (
      await db.query(
        'select * from public.inventory_transactions where reverses_transaction_id is not null',
      )
    ).rows,
  ).toHaveLength(2);
});
it('insufficient stock rolls back a reversal without any history changes', async () => {
  await db.query("select public.change_stock($1,$2,$3,1,'REMOVE','other','')", [
    crypto.randomUUID(),
    product,
    boat,
  ]);
  await db.exec('savepoint bad');
  await expect(reverse()).rejects.toThrow('INSUFFICIENT_STOCK');
  await db.exec('rollback to savepoint bad');
  expect(
    (
      await db.query(
        'select * from public.inventory_transactions where reverses_transaction_id is not null',
      )
    ).rows,
  ).toHaveLength(0);
});
it('rolls back the first transfer reversal leg when the second leg has insufficient stock', async () => {
  const transfer = crypto.randomUUID();
  await db.query("select public.transfer_stock($1,$2,$3,$4,4,'')", [
    transfer,
    product,
    boat,
    storage,
  ]);
  await db.query("select public.change_stock($1,$2,$3,2,'REMOVE','other','')", [
    crypto.randomUUID(),
    product,
    storage,
  ]);
  const id = (
    await db.query<{ id: string }>(
      "select id from public.inventory_transactions where transfer_id=$1 and transaction_type='TRANSFER_OUT'",
      [transfer],
    )
  ).rows[0].id;
  const before = (
    await db.query(
      'select location_id,quantity from public.inventory_balances order by location_id',
    )
  ).rows;
  await db.exec('savepoint bad');
  await expect(reverse(id)).rejects.toThrow('INSUFFICIENT_STOCK');
  await db.exec('rollback to savepoint bad');
  expect(
    (
      await db.query(
        'select location_id,quantity from public.inventory_balances order by location_id',
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await db.query(
        'select * from public.inventory_transactions where reverses_transaction_id is not null',
      )
    ).rows,
  ).toHaveLength(0);
});
it('capture needs no financial fields and records immutable server metadata', async () => {
  const id = crypto.randomUUID();
  await capture(id, 'STORE', 'CREDIT');
  await capture(id, 'STORE', 'CREDIT');
  const r = (
    await db.query<{ uploaded_by: string; created_at: string; review_details: unknown }>(
      'select * from public.receipt_intake',
    )
  ).rows[0];
  expect(r.uploaded_by).toBe(manager);
  expect(r.review_details).toEqual({});
  expect(r.created_at).toBeTruthy();
  await user(owner);
  expect((await db.query('select * from public.expenses')).rows).toHaveLength(0);
  expect((await db.query('select * from public.purchases')).rows).toHaveLength(0);
});
it('private upload, completion and owner review preserve original data and restrict other managers', async () => {
  const id = crypto.randomUUID();
  await capture(id);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('receipts',$1,$2)", [
    `intake/${id}/receipt.jpg`,
    { mimetype: 'image/jpeg', size: 128 },
  ]);
  await db.query('select public.complete_intake($1)', [id]);
  await db.exec('savepoint bad');
  await expect(db.query("select public.review_intake($1,'REVIEWED','{}')", [id])).rejects.toThrow(
    'FORBIDDEN',
  );
  await db.exec('rollback to savepoint bad');
  await user(other);
  expect((await db.query('select * from public.receipt_intake')).rows).toHaveLength(0);
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  await user(owner);
  const before = (
    await db.query('select uploaded_by,created_at,payment_method from public.receipt_intake')
  ).rows;
  await db.query("select public.review_intake($1,'REVIEWED',$2)", [
    id,
    { supplier: 'Test review only' },
  ]);
  expect(
    (await db.query('select uploaded_by,created_at,payment_method from public.receipt_intake'))
      .rows,
  ).toEqual(before);
  await db.exec('reset role');
  await expect(
    db.query("update public.receipt_intake set created_at=now()+interval '1 day' where id=$1", [
      id,
    ]),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});
it('crew cannot capture and anonymous objects stay private', async () => {
  await user(crew);
  await expect(capture()).rejects.toThrow('FORBIDDEN');
});

it('preserves original receipt metadata and bytes path, retries exactly and denies other uploaders', async () => {
  const id = crypto.randomUUID();
  const args = [id, 'STORE', 'CREDIT', 'b'.repeat(64), 5000000, 'image/png'];
  const first = await db.query<{ reserve_original_receipt: string }>(
    'select public.reserve_original_receipt($1,$2,$3,$4,$5,$6)',
    args,
  );
  expect(first.rows[0].reserve_original_receipt).toBe(`intake/${id}/original.png`);
  await db.query('select public.reserve_original_receipt($1,$2,$3,$4,$5,$6)', args);
  const row = (
    await db.query<{ original_preserved: boolean; byte_size: number }>(
      'select original_preserved,byte_size from public.receipt_intake where id=$1',
      [id],
    )
  ).rows[0];
  expect(row).toEqual({ original_preserved: true, byte_size: 5000000 });
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('receipts',$1,$2)", [
    first.rows[0].reserve_original_receipt,
    JSON.stringify({ mimetype: 'image/png', size: 5000000 }),
  ]);
  await db.query('select public.complete_intake($1)', [id]);
  await user(other);
  expect(
    (await db.query('select * from public.receipt_intake where id=$1', [id])).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query('select * from storage.objects where name=$1', [
        first.rows[0].reserve_original_receipt,
      ])
    ).rows,
  ).toHaveLength(0);
  await user(owner);
  expect(
    (
      await db.query('select * from storage.objects where name=$1', [
        first.rows[0].reserve_original_receipt,
      ])
    ).rows,
  ).toHaveLength(1);
});
it('rejects unsupported original formats and oversized uploads', async () => {
  await expect(
    db.query("select public.reserve_original_receipt($1,'FUEL','CASH',$2,20971521,'image/png')", [
      crypto.randomUUID(),
      'a'.repeat(64),
    ]),
  ).rejects.toThrow('RECEIPT_INVALID');
});
it('denies original receipt capture to crew', async () => {
  await user(crew);
  await expect(
    db.query("select public.reserve_original_receipt($1,'FUEL','CASH',$2,20,'image/png')", [
      crypto.randomUUID(),
      'a'.repeat(64),
    ]),
  ).rejects.toThrow('FORBIDDEN');
});
it('allows owner metadata and thresholds without changing quantities', async () => {
  await user(owner);
  const values = {
    name: 'Updated test product',
    category: '20000000-0000-4000-8000-000000000001',
    unit: 'bottle',
    location: boat,
    minimum: '3',
    target: '12',
    cost: '2.25',
    currency: 'BZD',
    quantity: '',
    notes: 'Metadata only',
    active: true,
  };
  await db.query('select public.configure_item($1,$2)', [product, JSON.stringify(values)]);
  expect(
    (
      await db.query<{ quantity: string }>(
        'select quantity from public.inventory_balances where product_id=$1 and location_id=$2',
        [product, boat],
      )
    ).rows[0].quantity,
  ).toBe('10.000');
  expect((await db.query('select * from public.inventory_transactions')).rows).toHaveLength(1);
});
it('prevents unit changes after history even for an owner', async () => {
  await user(owner);
  await expect(
    db.query("update public.products set unit='liter' where id=$1", [product]),
  ).rejects.toThrow('ITEM_UNIT_CONFLICT');
});
it('denies manager item configuration', async () => {
  await expect(db.query('select public.configure_item($1,$2)', [product, '{}'])).rejects.toThrow(
    'FORBIDDEN',
  );
});

it('keeps original receipt uploader, time, hash and MIME immutable', async () => {
  const id = crypto.randomUUID();
  await db.query("select public.reserve_original_receipt($1,'FUEL','CASH',$2,20,'image/png')", [
    id,
    'a'.repeat(64),
  ]);
  await db.exec('reset role');
  await expect(
    db.query("update public.receipt_intake set content_type='image/webp' where id=$1", [id]),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});
it('permits unit choice for unused products and audits the change', async () => {
  await user(owner);
  const id = crypto.randomUUID();
  await db.query(
    "insert into public.products(id,name,category_id,unit) values($1,'Unused test item','20000000-0000-4000-8000-000000000001','piece')",
    [id],
  );
  await db.query("update public.products set unit='box' where id=$1", [id]);
  expect(
    (await db.query<{ unit: string }>('select unit from public.products where id=$1', [id])).rows[0]
      .unit,
  ).toBe('box');
  expect(
    (
      await db.query("select * from public.audit_events where entity_id=$1 and action='UPDATE'", [
        id,
      ])
    ).rows,
  ).toHaveLength(1);
});
it('denies manager category creation through RLS', async () => {
  await expect(
    db.query("insert into public.categories(name_en,name_es) values('Invalid','Invalid')"),
  ).rejects.toThrow();
});
