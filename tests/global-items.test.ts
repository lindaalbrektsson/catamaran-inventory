import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { validateItems, type ItemInput } from '../src/lib/item-domain';
import type { Product, Category, Location } from '../src/lib/database.types';
let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002',
  other = '40000000-0000-4000-8000-000000000003',
  crew = '40000000-0000-4000-8000-000000000004';
const boat = '10000000-0000-4000-8000-000000000001',
  storage = '10000000-0000-4000-8000-000000000003';

async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
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
    [other, 'CAPTAIN'],
    [crew, 'CREW'],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query(
      'update public.profiles set active=true,must_change_password=false,role=$1 where id=$2',
      [role, id],
    );
  }
});

beforeEach(async () => {
  await db.exec('begin');
  await user(manager);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());

const category = '20000000-0000-4000-8000-000000000001';
const values = { name: 'Catalogue fixture', category, unit: 'piece' };
async function manage(
  action: string,
  id: string | null,
  payload: object = values,
  request = crypto.randomUUID(),
) {
  const expected = id
    ? (
        await db.query<{ updated_at: string }>(
          'select updated_at::text from public.products where id=$1',
          [id],
        )
      ).rows[0]?.updated_at
    : null;
  return (
    await db.query<{ id: string }>('select public.manage_catalog_item($1,$2,$3,$4,$5) as id', [
      request,
      action,
      id,
      JSON.stringify(payload),
      expected,
    ])
  ).rows[0].id;
}
for (const [role, id] of [
  ['OWNER', owner],
  ['MANAGER', manager],
  ['CAPTAIN', other],
  ['CREW', crew],
]) {
  it(`${role} creates, edits and removes catalogue items without deleting history`, async () => {
    await user(id);
    const item = await manage('CREATE', null);
    await manage('EDIT', item, { ...values, name: 'Renamed fixture' });
    await manage('DELETE', item);
    expect(
      (await db.query('select name,active from public.products where id=$1', [item])).rows,
    ).toEqual([{ name: 'Renamed fixture', active: false }]);
    await db.exec('reset role');
    const audit = (
      await db.query<{
        actor_id: string;
        before_data: object;
        after_data: object;
        created_at: string;
      }>(
        "select * from public.audit_events where entity_type='products' and entity_id=$1 order by id",
        [item],
      )
    ).rows;
    expect(audit).toHaveLength(3);
    expect(audit.every((a) => a.actor_id === id && a.created_at)).toBe(true);
    expect(
      audit.some(
        (a) =>
          JSON.stringify(a.before_data).includes('Catalogue fixture') &&
          JSON.stringify(a.after_data).includes('Renamed fixture'),
      ),
    ).toBe(true);
  });
}
it('requires an explicit duplicate choice and safely retries a create', async () => {
  const request = crypto.randomUUID();
  const first = await manage('CREATE', null, { ...values, name: 'Fixture-Cola' }, request);
  expect(await manage('CREATE', null, { ...values, name: 'Fixture-Cola' }, request)).toBe(first);
  await db.exec('savepoint duplicate');
  await expect(manage('CREATE', null, { ...values, name: 'fixture cola' })).rejects.toThrow(
    'ITEM_SIMILAR',
  );
  await db.exec('rollback to duplicate');
  expect(
    await manage('CREATE', null, { ...values, name: 'fixture cola', confirmDuplicate: true }),
  ).not.toBe(first);
});
it('merge records both stock legs in each location and preserves original movement rows', async () => {
  const source = await manage('CREATE', null, { ...values, name: 'Source' });
  const target = await manage('CREATE', null, { ...values, name: 'Target' });
  await user(owner);
  for (const [id, location, quantity] of [
    [source, boat, 3],
    [source, storage, 8],
    [target, boat, 2],
    [target, storage, 1],
  ]) {
    await db.query('select public.configure_inventory($1,$2,null,null)', [id, location]);
    await db.query("select public.change_stock($1,$2,$3,$4,'ADD','other','fixture')", [
      crypto.randomUUID(),
      id,
      location,
      quantity,
    ]);
  }
  const before = (
    await db.query('select * from public.inventory_transactions where product_id=$1 order by id', [
      source,
    ])
  ).rows;
  const updated = (
    await db.query<{ updated_at: string }>(
      'select updated_at::text from public.products where id=$1',
      [target],
    )
  ).rows[0].updated_at;
  await user(crew);
  await manage('MERGE', source, { target, targetUpdatedAt: updated });
  await db.exec('reset role');
  expect(
    (
      await db.query(
        'select location_id,quantity from public.inventory_balances where product_id=$1 order by location_id',
        [target],
      )
    ).rows,
  ).toEqual([
    { location_id: boat, quantity: '5.000' },
    { location_id: storage, quantity: '9.000' },
  ]);
  expect(
    (
      await db.query<{ quantity: string }>(
        'select quantity from public.inventory_balances where product_id=$1',
        [source],
      )
    ).rows.every((r) => r.quantity === '0.000'),
  ).toBe(true);
  expect(
    (
      await db.query(
        "select * from public.inventory_transactions where product_id=$1 and reason<>'ITEM_MERGE' order by id",
        [source],
      )
    ).rows,
  ).toEqual(before);
  const moves = (
    await db.query<{ performed_by_user_id: string }>(
      "select * from public.inventory_transactions where reason='ITEM_MERGE'",
    )
  ).rows;
  expect(moves).toHaveLength(4);
  expect(moves.every((m) => m.performed_by_user_id === crew)).toBe(true);
  const mergeLeg = (
    await db.query<{ id: string }>(
      "select id from public.inventory_transactions where product_id=$1 and reason='ITEM_MERGE' limit 1",
      [target],
    )
  ).rows[0].id;
  await user(owner);
  await db.exec('savepoint reversal');
  await expect(
    db.query('select public.reverse_stock($1,$2)', [crypto.randomUUID(), mergeLeg]),
  ).rejects.toThrow('REVERSAL_INVALID');
  await db.exec('rollback to reversal;reset role');
  await db.exec('savepoint frozen');
  await expect(
    db.query('update public.inventory_balances set quantity=1 where product_id=$1', [source]),
  ).rejects.toThrow('ITEM_MERGED');
  await db.exec('rollback to frozen');
  await expect(
    db.query('update public.products set active=true where id=$1', [source]),
  ).rejects.toThrow('ITEM_MERGED');
});
it('rejects merging different units atomically', async () => {
  const source = await manage('CREATE', null, { ...values, name: 'Source' });
  const target = await manage('CREATE', null, { ...values, name: 'Target', unit: 'box' });
  const updated = (
    await db.query<{ updated_at: string }>(
      'select updated_at::text from public.products where id=$1',
      [target],
    )
  ).rows[0].updated_at;
  await db.exec('savepoint merge');
  await expect(manage('MERGE', source, { target, targetUpdatedAt: updated })).rejects.toThrow(
    'ITEM_UNIT_CONFLICT',
  );
  await db.exec('rollback to merge');
  expect(
    (
      await db.query<{ active: boolean }>('select active from public.products where id=$1', [
        source,
      ])
    ).rows[0].active,
  ).toBe(true);
});
it('rejects stale edits', async () => {
  const id = await manage('CREATE', null);
  await expect(
    db.query("select public.manage_catalog_item($1,'EDIT',$2,$3,'2000-01-01')", [
      crypto.randomUUID(),
      id,
      JSON.stringify(values),
    ]),
  ).rejects.toThrow('ITEM_STALE');
});
it('does not grant Crew direct stock writes or anonymous catalogue access', async () => {
  await user(crew);
  await db.exec('savepoint permissions');
  await expect(db.query('update public.inventory_balances set quantity=50')).rejects.toThrow();
  await db.exec('rollback to permissions');
  await db.exec('reset role;set role anon');
  await expect(manage('CREATE', null)).rejects.toThrow();
});
it('blocks inactive and pending-password staff', async () => {
  await db.exec('reset role');
  await db.query('update public.profiles set must_change_password=true where id=$1', [crew]);
  await user(crew);
  await expect(manage('CREATE', null)).rejects.toThrow('FORBIDDEN');
});

it('keeps completed Need references and audits the active Need canonical link', async () => {
  const source = await manage('CREATE', null, { ...values, name: 'Need source' });
  const target = await manage('CREATE', null, { ...values, name: 'Need target' });
  const needId = crypto.randomUUID();
  await db.query('select public.save_purchase_need($1,$2,$3,0,false)', [
    crypto.randomUUID(),
    needId,
    JSON.stringify({
      name: 'Need fixture',
      product_id: source,
      country: 'BELIZE',
      product_url: '',
      comment: '',
      status: 'PENDING',
    }),
  ]);
  const updated = (
    await db.query<{ updated_at: string }>(
      'select updated_at::text from public.products where id=$1',
      [target],
    )
  ).rows[0].updated_at;
  await manage('MERGE', source, { target, targetUpdatedAt: updated });
  expect(
    (
      await db.query<{ product_id: string }>(
        'select product_id from public.purchase_needs where id=$1',
        [needId],
      )
    ).rows[0].product_id,
  ).toBe(target);
  await db.exec('reset role');
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int as n from public.audit_events where entity_type='purchase_needs' and entity_id=$1 and before_data->>'product_id'=$2 and after_data->>'product_id'=$3",
        [needId, source, target],
      )
    ).rows[0].n,
  ).toBe(1);
});

it('blocks two active Needs and leaves both products and Needs untouched', async () => {
  const source = await manage('CREATE', null, { ...values, name: 'Need source' });
  const target = await manage('CREATE', null, { ...values, name: 'Need target' });
  for (const product_id of [source, target])
    await db.query('select public.save_purchase_need($1,$2,$3,0,false)', [
      crypto.randomUUID(),
      crypto.randomUUID(),
      JSON.stringify({
        name: 'Need fixture',
        product_id,
        country: 'BELIZE',
        product_url: '',
        comment: '',
        status: 'PENDING',
      }),
    ]);
  const updated = (
    await db.query<{ updated_at: string }>(
      'select updated_at::text from public.products where id=$1',
      [target],
    )
  ).rows[0].updated_at;
  await db.exec('savepoint need_conflict');
  await expect(manage('MERGE', source, { target, targetUpdatedAt: updated })).rejects.toThrow(
    'ITEM_NEED_CONFLICT',
  );
  await db.exec('rollback to need_conflict');
  expect(
    (
      await db.query<{ active: boolean }>('select active from public.products where id=any($1)', [
        [source, target],
      ])
    ).rows.every((p) => p.active),
  ).toBe(true);
});

it('does not permit deleting or rewriting merge/audit history', async () => {
  await user(crew);
  await db.exec('savepoint history');
  await expect(db.exec('delete from public.audit_events')).rejects.toThrow();
  await db.exec('rollback to history');
  await expect(db.exec('delete from private.product_merges')).rejects.toThrow();
});

it('Excel detects similar names before approval and enforces confirmation in the RPC', async () => {
  await user(owner);
  await manage('CREATE', null, { ...values, name: 'Import-Cola' });
  const row: ItemInput = {
    name: 'import cola',
    category,
    unit: 'piece',
    location: boat,
    minimum: '',
    target: '',
    cost: '',
    currency: 'BZD',
    quantity: '',
    notes: '',
    active: true,
    mode: 'create',
  };
  const catalog = {
    products: (await db.query<Product>('select * from public.products')).rows,
    categories: (await db.query<Category>('select * from public.categories')).rows,
    locations: (await db.query<Location>('select * from public.locations')).rows,
  };
  expect(validateItems([row], catalog)[0].errors).toContain('ITEM_SIMILAR');
  await db.exec('savepoint import_choice');
  await expect(
    db.query('select public.save_inventory_items($1,$2)', [
      crypto.randomUUID(),
      JSON.stringify([row]),
    ]),
  ).rejects.toThrow('ITEM_SIMILAR');
  await db.exec('rollback to import_choice');
  await db.query('select public.save_inventory_items($1,$2)', [
    crypto.randomUUID(),
    JSON.stringify([{ ...row, confirmDuplicate: true }]),
  ]);
});
