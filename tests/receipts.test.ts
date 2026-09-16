import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeReceipt } from '../src/lib/receipt-image';
import { spendingSchema } from '../src/lib/spending-domain';
import { can } from '../src/lib/domain';

let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002',
  crew = '40000000-0000-4000-8000-000000000003',
  inactive = '40000000-0000-4000-8000-000000000004';
const location = '10000000-0000-4000-8000-000000000001',
  category = '60000000-0000-4000-8000-000000000001',
  expense = '70000000-0000-4000-8000-000000000001';
const sha = 'a'.repeat(64);
it('post-migration verification queries cover the receipt schema and private bucket', async () => {
  // Metadata verification runs as the database administrator, like the CLI check.
  await db.exec('reset role');
  for (const file of ['verify.sql', 'receipts.sql']) {
    const queries = (await readFile(`supabase/checks/${file}`, 'utf8')).split(';').map((q) => q.trim()).filter(Boolean);
    for (const query of queries) expect((await db.query(query)).rows.length).toBeGreaterThan(0);
  }
});
async function asUser(id: string, role = 'authenticated') {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
function record(kind = 'EXPENSE', amount: string | null = '25.50', id = expense, payer = owner) {
  return db.query(
    "select public.record_spending($1,$2,$3,$4,'BZD',$5,$6,'CASH','2026-09-10T12:00:00Z','') as id",
    [id, kind, category, amount, location, payer],
  );
}
function reserve(id: string, parent = expense, kind = 'EXPENSE', hash = sha) {
  return db.query('select public.reserve_receipt($1,$2,$3,$4,128)', [
    id,
    kind === 'EXPENSE' ? parent : null,
    kind === 'PURCHASE' ? parent : null,
    hash,
  ]);
}
function object(id: string, size = 128) {
  return db.query("insert into storage.objects(bucket_id,name,metadata) values('receipts',$1,$2)", [
    `${id}/receipt.jpg`,
    { mimetype: 'image/jpeg', size },
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    grant all on storage.objects to authenticated,anon;
    create policy unrelated_permissive_policy on storage.objects for all to authenticated,anon using(true) with check(true);`);
  for (const name of [
    '20260909000100_inventory.sql',
    '20260910000100_inventory_transfers.sql',
    '20260910000200_receipts_and_fuel.sql',
  ])
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  for (const [id, role, active] of [
    [owner, 'OWNER', true],
    [manager, 'MANAGER', true],
    [crew, 'CREW', true],
    [inactive, 'OWNER', false],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('update public.profiles set role=$1,active=$2 where id=$3', [role, active, id]);
  }
});
beforeEach(async () => {
  await db.exec('begin');
  await asUser(owner);
  await record();
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});

it('records Fuel/Combustible with exact money and never changes stock', async () => {
  const row = (
    await db.query('select amount,currency,location_id,paid_by,payment_method from public.expenses')
  ).rows[0];
  expect(row).toEqual({
    amount: '25.50',
    currency: 'BZD',
    location_id: location,
    paid_by: owner,
    payment_method: 'CASH',
  });
  expect(
    (
      await db.query('select name_en,name_es from public.expense_categories where id=$1', [
        category,
      ])
    ).rows[0],
  ).toEqual({ name_en: 'Fuel', name_es: 'Combustible' });
  expect((await db.query('select * from public.inventory_transactions')).rows).toHaveLength(0);
  expect(
    (await db.query("select * from public.audit_events where entity_type='expenses'")).rows,
  ).toHaveLength(1);
});
it('deduplicates expense retries and captures a separate purchase draft', async () => {
  await record();
  const purchase = crypto.randomUUID();
  await record('PURCHASE', '30.25', purchase);
  expect((await db.query('select * from public.expenses')).rows).toHaveLength(1);
  expect((await db.query('select status from public.purchases')).rows).toEqual([
    { status: 'DRAFT' },
  ]);
  const receipt = crypto.randomUUID();
  await reserve(receipt, purchase, 'PURCHASE');
  await object(receipt);
  await db.query('select public.complete_receipt($1)', [receipt]);
  expect(
    (await db.query('select expense_id,purchase_id,status from public.receipts')).rows,
  ).toEqual([{ expense_id: null, purchase_id: purchase, status: 'READY' }]);
});
it.each(['0', '-1', 'NaN', 'Infinity', '1.001', '1000000000000', null])(
  'rejects unsafe financial amount %s',
  async (amount) => {
    await expect(record('EXPENSE', amount, crypto.randomUUID())).rejects.toThrow(
      'SPENDING_INVALID',
    );
  },
);
it('rejects cross-kind reuse of an expense request ID', async () => {
  await expect(record('PURCHASE')).rejects.toThrow('REQUEST_CONFLICT');
});
it('rejects a changed expense amount on retry', async () => {
  await expect(record('EXPENSE', '26')).rejects.toThrow('REQUEST_CONFLICT');
});
it('denies direct expense edits and direct receipt inserts', async () => {
  await db.exec('savepoint denied');
  await expect(
    db.query('update public.expenses set amount=1 where id=$1', [expense]),
  ).rejects.toThrow('permission denied');
  await db.exec('rollback to savepoint denied');
  await expect(
    db.query('insert into public.receipts(id) values($1)', [crypto.randomUUID()]),
  ).rejects.toThrow('permission denied');
});
it.each([crew, inactive, ''])(
  'denies spending and receipt visibility for unauthorized profiles',
  async (id) => {
    const receipt = crypto.randomUUID();
    await reserve(receipt);
    await object(receipt);
    await db.query('select public.complete_receipt($1)', [receipt]);
    await asUser(id);
    expect((await db.query('select * from public.expenses')).rows).toHaveLength(0);
    expect(
      (await db.query("select * from storage.objects where bucket_id='receipts'")).rows,
    ).toHaveLength(0);
    await expect(record('EXPENSE', '1', crypto.randomUUID())).rejects.toThrow('FORBIDDEN');
  },
);
it('allows managers to upload and view receipts without administrative credentials', async () => {
  await asUser(manager);
  const receipt = crypto.randomUUID();
  await reserve(receipt);
  await object(receipt);
  await db.query('select public.complete_receipt($1)', [receipt]);
  await db.query('select public.complete_receipt($1)', [receipt]);
  expect(
    (await db.query("select * from storage.objects where bucket_id='receipts'")).rows,
  ).toHaveLength(1);
  expect(can('MANAGER', 'receipts.upload')).toBe(true);
  expect(can('CREW', 'receipts.upload')).toBe(false);
});
it('requires a reserved object path and protects it against broad unrelated policies', async () => {
  await expect(object(crypto.randomUUID())).rejects.toThrow('row-level security');
});
it('prevents another authorized user from uploading into a pending reservation', async () => {
  const receipt = crypto.randomUUID();
  await reserve(receipt);
  await asUser(manager);
  await expect(object(receipt)).rejects.toThrow('row-level security');
});
it('cannot finalize missing bytes or claim a different image using the same ID', async () => {
  const receipt = crypto.randomUUID();
  await reserve(receipt);
  await db.exec('savepoint missing');
  await expect(db.query('select public.complete_receipt($1)', [receipt])).rejects.toThrow(
    'RECEIPT_UPLOAD_INCOMPLETE',
  );
  await db.exec('rollback to savepoint missing');
  await expect(reserve(receipt, expense, 'EXPENSE', 'b'.repeat(64))).rejects.toThrow(
    'REQUEST_CONFLICT',
  );
});
it('denies overwrites/deletions and anonymous reads even with permissive Storage policies', async () => {
  const receipt = crypto.randomUUID();
  await reserve(receipt);
  await object(receipt);
  await db.query('select public.complete_receipt($1)', [receipt]);
  expect(
    (
      await db.query(
        "update storage.objects set metadata='{}' where bucket_id='receipts' returning id",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("delete from storage.objects where bucket_id='receipts' returning id")).rows,
  ).toHaveLength(0);
  await asUser('', 'anon');
  expect(
    (await db.query("select * from storage.objects where bucket_id='receipts'")).rows,
  ).toHaveLength(0);
  await db.query("insert into storage.objects(bucket_id,name) values('unrelated','public-file')");
  expect(
    (await db.query("select * from storage.objects where bucket_id='unrelated'")).rows,
  ).toHaveLength(1);
});
it('rejects receipt reassignment after completion, including administrator edits', async () => {
  const receipt = crypto.randomUUID();
  await reserve(receipt);
  await object(receipt);
  await db.query('select public.complete_receipt($1)', [receipt]);
  await db.exec('reset role');
  await expect(
    db.query("update public.receipts set status='PENDING' where id=$1", [receipt]),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});
it('rejects invalid dates and unsafe money strings at the application boundary', () => {
  const input = {
    requestId: expense,
    kind: 'EXPENSE',
    categoryId: category,
    amount: '25.50',
    currency: 'BZD',
    locationId: location,
    paidBy: owner,
    paymentMethod: 'CASH',
    occurredAt: '2026-09-10T12:00:00Z',
    notes: '',
  };
  expect(spendingSchema.safeParse(input).success).toBe(true);
  expect(spendingSchema.safeParse({ ...input, amount: '1e3' }).success).toBe(false);
  expect(spendingSchema.safeParse({ ...input, occurredAt: 'invalid' }).success).toBe(false);
});
it('re-encodes image bytes and rejects SVG/HTML disguised as a photo', async () => {
  const png = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  const result = await normalizeReceipt(png);
  const metadata = await sharp(result).metadata();
  expect(metadata.format).toBe('jpeg');
  expect(metadata.exif).toBeUndefined();
  await expect(
    normalizeReceipt(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    ),
  ).rejects.toThrow();
  await expect(normalizeReceipt(Buffer.from('<html>not a receipt</html>'))).rejects.toThrow();
});
