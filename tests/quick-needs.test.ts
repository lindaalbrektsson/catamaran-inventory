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

async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
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
const quick = (
  request = crypto.randomUUID(),
  name = 'New fixture',
  quantity = 3,
  existing: string | null = null,
  confirm = false,
) =>
  db.query<{ id: string }>('select public.quick_add_stock($1,$2,$3,$4,$5,$6,$7) as id', [
    request,
    boat,
    existing,
    name,
    '20000000-0000-4000-8000-000000000001',
    quantity,
    confirm,
  ]);
const needValue = {
  name: 'Fixture purchase need',
  product_id: product,
  location_id: boat,
  country: 'BELIZE',
  product_url: 'https://example.test/item',
  comment: 'Fixture only',
  status: 'PENDING',
};
const need = (
  id = crypto.randomUUID(),
  values: typeof needValue & { quantity_needed?: unknown } = needValue,
  version = 0,
  request = crypto.randomUUID(),
  confirm = false,
) =>
  db.query('select public.save_purchase_need($1,$2,$3,$4,$5)', [
    request,
    id,
    JSON.stringify(values),
    version,
    confirm,
  ]);
it('quick add creates item and both zero configurations, with stock only through transactions', async () => {
  const id = (await quick()).rows[0].id;
  expect(
    (
      await db.query(
        'select location_id,quantity from public.inventory_balances where product_id=$1 order by location_id',
        [id],
      )
    ).rows,
  ).toEqual([
    { location_id: boat, quantity: '3.000' },
    { location_id: storage, quantity: '0.000' },
  ]);
  expect(
    (
      await db.query(
        'select performed_by_user_id,quantity from public.inventory_transactions where product_id=$1',
        [id],
      )
    ).rows,
  ).toEqual([{ performed_by_user_id: manager, quantity: '3.000' }]);
  await user(owner);
  expect(
    (
      await db.query(
        "select * from public.audit_events where entity_type='products' and entity_id=$1 and actor_id=$2",
        [id, manager],
      )
    ).rows,
  ).toHaveLength(1);
});
it('quick add existing item configures a missing location without a separate UI', async () => {
  await quick(crypto.randomUUID(), '', 2, product);
  expect(
    (
      await db.query(
        'select quantity from public.inventory_balances where product_id=$1 and location_id=$2',
        [product, boat],
      )
    ).rows,
  ).toEqual([{ quantity: '2.000' }]);
});
it('quick retries apply once and reject reused IDs with changed quantities', async () => {
  const request = crypto.randomUUID();
  const a = await quick(request);
  const b = await quick(request);
  expect(a.rows).toEqual(b.rows);
  expect(
    (
      await db.query('select * from public.inventory_transactions where product_id=$1', [
        a.rows[0].id,
      ])
    ).rows,
  ).toHaveLength(1);
  await expect(quick(request, 'New fixture', 4)).rejects.toThrow('REQUEST_CONFLICT');
});
it('quick add rejects exact and punctuation duplicate names unless similarity is confirmed', async () => {
  await quick(crypto.randomUUID(), 'Fixture Coca Cola');
  await db.exec('savepoint attempt');
  await expect(quick(crypto.randomUUID(), 'fixture coca cola')).rejects.toThrow('ITEM_DUPLICATE');
  await db.exec('rollback to savepoint attempt');
  await expect(quick(crypto.randomUUID(), 'Fixture Coca-Cola')).rejects.toThrow('SIMILAR_ITEM');
  await db.exec('rollback to savepoint attempt');
  await quick(crypto.randomUUID(), 'Fixture Coca-Cola', 1, null, true);
});
it('invalid quantities roll back all new catalog and movement data', async () => {
  await db.exec('savepoint attempt');
  await expect(quick(crypto.randomUUID(), 'Invalid fixture', -1)).rejects.toThrow('INVALID_INPUT');
  await db.exec('rollback to savepoint attempt');
  expect(
    (await db.query("select * from public.products where name='Invalid fixture'")).rows,
  ).toHaveLength(0);
});
it.each([crew, ''])('restricted callers cannot quick add or create needs %s', async (id) => {
  await user(id);
  await db.exec('savepoint attempt');
  await expect(quick()).rejects.toThrow('FORBIDDEN');
  await db.exec('rollback to savepoint attempt');
  await expect(need()).rejects.toThrow('FORBIDDEN');
});
it('needs preserve creator/time while updating status and record every change', async () => {
  const id = crypto.randomUUID();
  await need(id);
  const initial = (
    await db.query<{ created_at: string }>('select * from public.purchase_needs where id=$1', [id])
  ).rows[0];
  await user(owner);
  await need(id, { ...needValue, status: 'ORDERED' }, 1);
  const after = (
    await db.query<{ created_at: string }>('select * from public.purchase_needs where id=$1', [id])
  ).rows[0];
  expect(after).toMatchObject({
    created_by: manager,
    created_at: initial.created_at,
    updated_by: owner,
    status: 'ORDERED',
    version: 2,
  });

  expect(
    (await db.query('select * from public.audit_events where entity_id=$1', [id])).rows,
  ).toHaveLength(2);
});
it('needs retry once, warn on duplicates, and reject stale edits', async () => {
  const id = crypto.randomUUID(),
    request = crypto.randomUUID();
  await need(id, needValue, 0, request);
  await need(id, needValue, 0, request);
  await db.exec('savepoint attempt');
  await expect(need()).rejects.toThrow('DUPLICATE_NEED');
  await db.exec('rollback to savepoint attempt');
  await need(id, { ...needValue, status: 'DONE' }, 1);
  await db.exec('savepoint stale');
  await expect(need(id, { ...needValue, status: 'ORDERED' }, 1)).rejects.toThrow('STALE_NEED');
});
it('needs cannot be directly edited or deleted by operational users', async () => {
  await need();
  await expect(db.query('delete from public.purchase_needs')).rejects.toThrow();
});
it('private photo policies resist unrelated permissive Storage policies', async () => {
  const id = crypto.randomUUID();
  await need(id);
  await db.exec(
    `reset role;create or replace function storage.allow_only_operation(p text) returns boolean language sql stable as $$select current_setting('storage.operation',true)=p$$;select set_config('storage.operation','object.get_authenticated',true);`,
  );
  const hash = 'a'.repeat(64);
  const path = (
    await db.query<{ path: string }>('select public.reserve_need_photo($1,$2,128) as path', [
      id,
      hash,
    ])
  ).rows[0].path;
  await db.query(
    `insert into storage.objects(bucket_id,name,metadata) values('need-photos',$1,'{"size":128,"mimetype":"image/jpeg"}')`,
    [path],
  );
  await db.query('select private.complete_need_photo($1)', [id]);
  await user(crew);
  expect(
    (await db.query("select * from storage.objects where bucket_id='need-photos'")).rows,
  ).toHaveLength(0);
  await user(owner);
  expect(
    (await db.query("select * from storage.objects where bucket_id='need-photos'")).rows,
  ).toHaveLength(1);
  await db.query("delete from storage.objects where bucket_id='need-photos'");
  expect(
    (await db.query("select * from storage.objects where bucket_id='need-photos'")).rows,
  ).toHaveLength(1);
});
it('creator and timestamp are immutable even on accidental privileged updates', async () => {
  const id = crypto.randomUUID();
  await need(id);
  await db.exec('reset role');
  await expect(
    db.query(
      "update public.purchase_needs set created_at=created_at+interval '1 day' where id=$1",
      [id],
    ),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});

it('transfer creates a missing zero destination atomically, audits it and retries once', async () => {
  const id = (await quick()).rows[0].id;
  await db.exec('reset role');
  await db.query('delete from public.inventory_balances where product_id=$1 and location_id=$2', [
    id,
    storage,
  ]);
  await user(manager);
  const request = crypto.randomUUID();
  await db.query("select public.transfer_stock($1,$2,$3,$4,1,'')", [request, id, boat, storage]);
  await db.query("select public.transfer_stock($1,$2,$3,$4,1,'')", [request, id, boat, storage]);
  expect(
    (
      await db.query(
        'select quantity from public.inventory_balances where product_id=$1 order by location_id',
        [id],
      )
    ).rows,
  ).toEqual([{ quantity: '2.000' }, { quantity: '1.000' }]);
  await user(owner);
  expect(
    (
      await db.query(
        "select actor_id from public.audit_events where action='TRANSFER_CONFIGURATION' and entity_id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ actor_id: manager }]);
});

it('failed transfer rolls a newly configured destination back', async () => {
  const id = (await quick()).rows[0].id;
  await db.exec('reset role');
  await db.query('delete from public.inventory_balances where product_id=$1 and location_id=$2', [
    id,
    storage,
  ]);
  await user(manager);
  await db.exec('savepoint failed_move');
  await expect(
    db.query("select public.transfer_stock($1,$2,$3,$4,99,'')", [
      crypto.randomUUID(),
      id,
      boat,
      storage,
    ]),
  ).rejects.toThrow('INSUFFICIENT_STOCK');
  await db.exec('rollback to savepoint failed_move');
  expect(
    (
      await db.query(
        'select * from public.inventory_balances where product_id=$1 and location_id=$2',
        [id, storage],
      )
    ).rows,
  ).toHaveLength(0);
  await user(owner);
  expect(
    (
      await db.query(
        "select * from public.audit_events where entity_id=$1 and action='TRANSFER_CONFIGURATION'",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
});

it('unscoped and same-location Needs cannot duplicate active product Needs, and DONE permits another', async () => {
  const id = crypto.randomUUID();
  await need(id);
  await db.exec('savepoint duplicate');
  await expect(
    db.query('select public.save_purchase_need($1,$2,$3,0,true)', [
      crypto.randomUUID(),
      crypto.randomUUID(),
      JSON.stringify({ ...needValue, location_id: '', country: 'USA' }),
    ]),
  ).rejects.toThrow('DUPLICATE_NEED');
  await db.exec('rollback to savepoint duplicate');
  await need(id, { ...needValue, status: 'ORDERED' }, 1);
  await db.exec('savepoint ordered');
  await expect(need()).rejects.toThrow('DUPLICATE_NEED');
  await db.exec('rollback to savepoint ordered');
  await need(id, { ...needValue, status: 'DONE' }, 2);
  await need();
  expect(
    (
      await db.query('select count(*)::int as n from public.purchase_needs where product_id=$1', [
        product,
      ])
    ).rows,
  ).toEqual([{ n: 2 }]);
});

it('scoped needs retain location and product UUID through rename, and permit text-only needs', async () => {
  const id = crypto.randomUUID();
  await need(id);
  await db.exec('reset role');
  await db.query("update public.products set name='Corrected fixture name' where id=$1", [product]);
  expect(
    (await db.query('select product_id,location_id from public.purchase_needs where id=$1', [id]))
      .rows,
  ).toEqual([{ product_id: product, location_id: boat }]);
  await user(owner);
  await need(crypto.randomUUID(), {
    ...needValue,
    name: 'New spare part',
    product_id: '',
    location_id: '',
  });
});

const mobileAdd = (request = crypto.randomUUID(), unit = 'bottle', minimum: number | null = 6) =>
  db.query<{ id: string }>('select public.quick_add_item($1,$2,null,$3,$4,4,false,$5,$6) id', [
    request,
    boat,
    'Mobile fixture',
    '20000000-0000-4000-8000-000000000001',
    unit,
    minimum,
  ]);
const settings = {
  name: 'Renamed fixture',
  category: '20000000-0000-4000-8000-000000000002',
  location: boat,
  unit: 'bottle',
  minimum: '12',
  target: '24',
  cost: '',
  currency: 'BZD',
  notes: '',
  quantity: '',
  active: true,
};
it.each([owner, manager])('mobile creation and audited settings work for %s', async (actor) => {
  await user(actor);
  const request = crypto.randomUUID(),
    id = (await mobileAdd(request)).rows[0].id;
  expect((await mobileAdd(request)).rows[0].id).toBe(id);
  expect((await db.query('select unit from products where id=$1', [id])).rows[0]).toMatchObject({
    unit: 'bottle',
  });
  expect(
    (
      await db.query(
        'select quantity,minimum_stock from inventory_balances where product_id=$1 and location_id=$2',
        [id, boat],
      )
    ).rows[0],
  ).toMatchObject({ quantity: '4.000', minimum_stock: '6.000' });
  await db.query('select configure_item($1,$2)', [id, JSON.stringify(settings)]);
  const history = (
    await db.query<{
      history: {
        actor_id: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        created_at: string;
      }[];
    }>('select item_change_history($1,1) history', [id])
  ).rows[0].history;
  expect(history.every((e) => e.actor_id === actor && !!e.created_at)).toBe(true);
  expect(
    history.some((e) => e.before.name === 'Mobile fixture' && e.after.name === 'Renamed fixture'),
  ).toBe(true);
  expect(
    history.some(
      (e) => Number(e.before.minimum_stock) === 6 && Number(e.after.minimum_stock) === 12,
    ),
  ).toBe(true);
  await db.query('select configure_item($1,$2)', [
    id,
    JSON.stringify({ ...settings, active: false, minimum: '' }),
  ]);
  expect((await db.query('select active from products where id=$1', [id])).rows[0]).toMatchObject({
    active: false,
  });
  expect(
    (
      await db.query(
        'select quantity,minimum_stock from inventory_balances where product_id=$1 and location_id=$2',
        [id, boat],
      )
    ).rows[0],
  ).toMatchObject({ quantity: '4.000', minimum_stock: null });
  await db.query('select configure_item($1,$2)', [id, JSON.stringify(settings)]);
  expect(
    (await db.query('select count(*)::int n from inventory_transactions where product_id=$1', [id]))
      .rows[0],
  ).toMatchObject({ n: 1 });
});
it('mobile creation invalid minimum rolls back all records', async () => {
  await db.exec('savepoint invalid_minimum');
  await expect(mobileAdd(crypto.randomUUID(), 'bottle', -1)).rejects.toThrow('INVALID_INPUT');
  await db.exec('rollback to savepoint invalid_minimum');
  expect(
    (await db.query("select count(*)::int n from products where name='Mobile fixture'")).rows[0],
  ).toMatchObject({ n: 0 });
});
it('operational editing cannot reinterpret historical units or delete audit history', async () => {
  const id = (await mobileAdd()).rows[0].id;
  await db.exec('savepoint unit_edit');
  await expect(
    db.query('select configure_item($1,$2)', [id, JSON.stringify({ ...settings, unit: 'piece' })]),
  ).rejects.toThrow('ITEM_UNIT_CONFLICT');
  await db.exec('rollback to savepoint unit_edit');
  await db.exec('savepoint delete_audit');
  await expect(db.exec('delete from audit_events')).rejects.toThrow();
  await db.exec('rollback to savepoint delete_audit');
  await expect(db.exec('update audit_events set created_at=now()')).rejects.toThrow();
});
it.each(['CREW', 'CAPTAIN'])('%s cannot create/edit/read item changes', async (role) => {
  await db.exec('reset role');
  await db.query('update profiles set role=$1 where id=$2', [role, crew]);
  await user(crew);
  for (const sql of [
    "select quick_add_item(gen_random_uuid(),$1,null,'Denied',$2,1,false,'piece',null)",
    "select configure_item($1,'{}')",
    'select item_change_history($1,1)',
  ]) {
    await db.exec('savepoint denied');
    await expect(
      db.query(
        sql,
        sql.includes('$2') ? [boat, '20000000-0000-4000-8000-000000000001'] : [product],
      ),
    ).rejects.toThrow('FORBIDDEN');
    await db.exec('rollback to savepoint denied');
  }
});

it('Owner archives idempotently, preserving balances, references and immutable history, then restores', async () => {
  const id = (await mobileAdd()).rows[0].id;
  await need(crypto.randomUUID(), { ...needValue, product_id: id });
  await user(owner);
  const before = (await db.query('select * from inventory_balances where product_id=$1', [id]))
    .rows;
  const movements = (
    await db.query('select * from inventory_transactions where product_id=$1', [id])
  ).rows;
  const needs = (await db.query('select * from purchase_needs where product_id=$1', [id])).rows;
  await db.query('select archive_inventory_item($1)', [id]);
  expect((await db.query('select active from products where id=$1', [id])).rows[0]).toMatchObject({
    active: false,
  });
  expect(
    (await db.query('select * from inventory_balances where product_id=$1', [id])).rows,
  ).toEqual(before);
  expect(
    (await db.query('select * from inventory_transactions where product_id=$1', [id])).rows,
  ).toEqual(movements);
  expect((await db.query('select * from purchase_needs where product_id=$1', [id])).rows).toEqual(
    needs,
  );
  const audit = (
    await db.query(
      "select * from audit_events where entity_type='products' and entity_id=$1 and actor_id=$2",
      [id, owner],
    )
  ).rows;
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    before_data: { active: true },
    after_data: { active: false },
    actor_id: owner,
  });
  expect(audit[0]).toHaveProperty('created_at', expect.any(Date));
  await db.query('select archive_inventory_item($1)', [id]);
  expect(
    (
      await db.query(
        "select * from audit_events where entity_type='products' and entity_id=$1 and actor_id=$2",
        [id, owner],
      )
    ).rows,
  ).toEqual(audit);
  await db.query('select configure_item($1,$2)', [id, JSON.stringify(settings)]);
  expect((await db.query('select active from products where id=$1', [id])).rows[0]).toMatchObject({
    active: true,
  });
  expect(
    (await db.query('select * from inventory_transactions where product_id=$1', [id])).rows,
  ).toEqual(movements);
  await db.exec('savepoint protected_history');
  await expect(db.exec('delete from audit_events')).rejects.toThrow();
  await db.exec('rollback to savepoint protected_history');
  await expect(db.exec('update audit_events set created_at=now()')).rejects.toThrow();
});
it.each(['MANAGER', 'CAPTAIN', 'CREW'])(
  '%s cannot invoke Owner archive RPC directly',
  async (role) => {
    await db.exec('reset role');
    await db.query('update profiles set role=$1 where id=$2', [role, crew]);
    await user(crew);
    await expect(db.query('select archive_inventory_item($1)', [product])).rejects.toThrow(
      'FORBIDDEN',
    );
  },
);
it('anonymous users cannot call archive RPC', async () => {
  await db.exec('reset role;set role anon');
  await expect(db.query('select archive_inventory_item($1)', [product])).rejects.toThrow();
});

it.each([owner, manager])(
  'optional Need quantity uses stock precision without changing inventory for %s',
  async (actor) => {
    await user(actor);
    const id = crypto.randomUUID(),
      request = crypto.randomUUID();
    const values = { ...needValue, quantity_needed: 2.125 };
    const before = (
      await db.query('select * from public.inventory_balances order by product_id,location_id')
    ).rows;
    await need(id, values, 0, request);
    await need(id, values, 0, request);
    expect(
      (await db.query('select quantity_needed from public.purchase_needs where id=$1', [id])).rows,
    ).toEqual([{ quantity_needed: '2.125' }]);
    await need(id, { ...needValue, status: 'ORDERED' }, 1);
    expect(
      (await db.query('select quantity_needed from public.purchase_needs where id=$1', [id])).rows,
    ).toEqual([{ quantity_needed: '2.125' }]);
    await need(id, { ...needValue, quantity_needed: null }, 2);
    expect(
      (await db.query('select quantity_needed from public.purchase_needs where id=$1', [id])).rows,
    ).toEqual([{ quantity_needed: null }]);
    expect(
      (await db.query('select * from public.inventory_balances order by product_id,location_id'))
        .rows,
    ).toEqual(before);
    await db.exec('reset role');
    expect(
      (
        await db.query(
          "select 1 from public.audit_events where entity_id=$1 and before_data->>'quantity_needed'='2.125' and after_data->'quantity_needed'='null'::jsonb",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
  },
);
it.each([-1, 0.0001, 100000000000, 'NaN', 'Infinity', '2 items'])(
  'rejects invalid Need quantity %s',
  async (quantity_needed) => {
    await expect(need(crypto.randomUUID(), { ...needValue, quantity_needed })).rejects.toThrow(
      'INVALID_INPUT',
    );
  },
);
it('legacy Need creates without quantity and duplicate protection still applies', async () => {
  const id = crypto.randomUUID();
  await need(id);
  expect(
    (await db.query('select quantity_needed from public.purchase_needs where id=$1', [id])).rows,
  ).toEqual([{ quantity_needed: null }]);
  await expect(need(crypto.randomUUID(), { ...needValue, quantity_needed: 3 })).rejects.toThrow(
    'DUPLICATE_NEED',
  );
});

async function photoOperation(op: string) {
  await db.query("select set_config('storage.operation',$1,true)", [op]);
}
async function setupPhotoOperations() {
  await db.exec(
    `reset role;create or replace function storage.allow_only_operation(p text) returns boolean language sql stable as $$select current_setting('storage.operation',true)=p$$;`,
  );
}
it.each([owner, manager])(
  'versioned photo for %s requires trusted finalization and preserves replaced history',
  async (actor) => {
    await setupPhotoOperations();
    await user(actor);
    const id = crypto.randomUUID();
    await need(id);
    const file = crypto.randomUUID(),
      hash = 'b'.repeat(64);
    const reserve = () =>
      db.query<{ path: string }>('select public.reserve_need_image($1,$2,$3,128,1) path', [
        file,
        id,
        hash,
      ]);
    const path = (await reserve()).rows[0].path;
    expect((await reserve()).rows[0].path).toBe(path);
    await photoOperation('object.upload');
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('need-photos',$1,$2)",
      [path, JSON.stringify({ size: 128, mimetype: 'image/jpeg' })],
    );
    await db.exec('savepoint denied');
    await expect(
      db.query('select public.complete_need_image($1,$2)', [file, actor]),
    ).rejects.toThrow(/permission denied/);
    await db.exec('rollback to savepoint denied');
    await db.exec('reset role;set role service_role');
    await db.query('select public.complete_need_image($1,$2)', [file, actor]);
    await db.query('select public.complete_need_image($1,$2)', [file, actor]);
    await user(actor);
    expect(
      (
        await db.query<{ current_photo_id: string; version: number }>(
          'select current_photo_id,version from public.purchase_needs where id=$1',
          [id],
        )
      ).rows[0],
    ).toEqual({ current_photo_id: file, version: 2 });
    const replacement = crypto.randomUUID();
    const p2 = (
      await db.query<{ path: string }>('select public.reserve_need_image($1,$2,$3,120,2) path', [
        replacement,
        id,
        'c'.repeat(64),
      ])
    ).rows[0].path;
    await photoOperation('object.upload');
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('need-photos',$1,$2)",
      [p2, JSON.stringify({ size: 120, mimetype: 'image/jpeg' })],
    );
    await db.exec('reset role;set role service_role');
    await db.query('select public.complete_need_image($1,$2)', [replacement, actor]);
    // Retrying an older success cannot roll the current pointer back.
    await db.query('select public.complete_need_image($1,$2)', [file, actor]);
    await user(actor);
    expect(
      (await db.query('select * from public.need_photos where need_id=$1 and ready', [id])).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query<{ current_photo_id: string }>(
          'select current_photo_id from public.purchase_needs where id=$1',
          [id],
        )
      ).rows[0].current_photo_id,
    ).toBe(replacement);
    await photoOperation('object.sign');
    expect(
      (await db.query("select * from storage.objects where bucket_id='need-photos'")).rows,
    ).toHaveLength(0);
    await photoOperation('object.get_authenticated');
    expect(
      (await db.query("select * from storage.objects where bucket_id='need-photos'")).rows,
    ).toHaveLength(2);
    await user(crew);
    expect((await db.query('select * from public.need_photos')).rows).toHaveLength(0);
    await db.exec('reset role');
    expect((await db.query('select * from public.inventory_transactions')).rows).toHaveLength(0);
  },
);
it('photo cannot publish over a concurrent Need edit', async () => {
  const id = crypto.randomUUID(),
    file = crypto.randomUUID();
  await need(id);
  await db.query('select public.reserve_need_image($1,$2,$3,128,1)', [file, id, 'a'.repeat(64)]);
  await need(id, { ...needValue, name: 'Changed' }, 1);
  await db.exec('savepoint denied');
  await db.exec('reset role;set role service_role');
  await expect(
    db.query('select public.complete_need_image($1,$2)', [file, manager]),
  ).rejects.toThrow(/STALE_NEED/);
  await db.exec('rollback to savepoint denied');
});
it('photo cannot bind to a different Need and pending bytes stay private to uploader', async () => {
  await setupPhotoOperations();
  await user(manager);
  const id = crypto.randomUUID(),
    otherNeed = crypto.randomUUID(),
    file = crypto.randomUUID();
  await need(id);
  await need(otherNeed, { ...needValue, name: 'Another', product_id: '', location_id: '' });
  await db.query('select public.reserve_need_image($1,$2,$3,128,1)', [file, id, 'a'.repeat(64)]);
  await user(other);
  expect(
    (await db.query('select * from public.need_photos where id=$1', [file])).rows,
  ).toHaveLength(0);
  await db.exec('reset role;savepoint denied');
  await expect(
    db.query('update public.purchase_needs set current_photo_id=$1 where id=$2', [file, otherNeed]),
  ).rejects.toThrow(/need_current_photo_fk/);
  await db.exec('rollback to savepoint denied');
});

it('Bodega and Cas Cat have independent active Needs, while same-location and locationless duplicates remain blocked', async () => {
  const boatNeed = crypto.randomUUID(),
    landNeed = crypto.randomUUID();
  await need(boatNeed);
  await need(landNeed, { ...needValue, location_id: storage, country: 'USA' });
  await db.exec('savepoint duplicate_scope');
  await expect(
    need(
      crypto.randomUUID(),
      { ...needValue, location_id: storage, country: 'BELIZE' },
      0,
      crypto.randomUUID(),
      true,
    ),
  ).rejects.toThrow('DUPLICATE_NEED');
  await db.exec('rollback to savepoint duplicate_scope');
  await expect(need(crypto.randomUUID(), { ...needValue, location_id: '' })).rejects.toThrow(
    'DUPLICATE_NEED',
  );
  await db.exec('rollback to savepoint duplicate_scope');
  expect(
    (await db.query('select location_id from public.purchase_needs order by location_id')).rows,
  ).toEqual([{ location_id: boat }, { location_id: storage }]);
});
it('legacy or manually created unscoped Need prevents either location from creating a duplicate', async () => {
  await need(crypto.randomUUID(), { ...needValue, location_id: '' });
  await db.exec('savepoint legacy_scope');
  await expect(need()).rejects.toThrow('DUPLICATE_NEED');
  await db.exec('rollback to savepoint legacy_scope');
  await expect(need(crypto.randomUUID(), { ...needValue, location_id: storage })).rejects.toThrow(
    'DUPLICATE_NEED',
  );
});
it.each([owner, manager])(
  'linked TEST product inherits TEST classification even through direct Need RPC for %s',
  async (actor) => {
    await user(actor);
    const args = {
      p_request: crypto.randomUUID(),
      p_location: boat,
      p_product: null,
      p_name: 'TEST linked fixture',
      p_category: '20000000-0000-4000-8000-000000000001',
      p_quantity: 4,
      p_confirm_duplicate: false,
      p_unit: 'piece',
      p_minimum: 5,
    };
    const p = (
      await db.query<{ id: string }>(
        "select public.create_test_record('quick_add_item',$1)#>>'{}' id",
        [args],
      )
    ).rows[0].id;
    const id = crypto.randomUUID(),
      request = crypto.randomUUID();
    await need(id, { ...needValue, product_id: p }, 0, request);
    await need(id, { ...needValue, product_id: p }, 0, request);
    expect(
      (
        await db.query(
          'select is_test,created_by,location_id from public.purchase_needs where id=$1',
          [id],
        )
      ).rows,
    ).toEqual([{ is_test: true, created_by: actor, location_id: boat }]);
    await db.exec('reset role');
    expect(
      (await db.query('select count(*)::int n from private.test_creation_context')).rows,
    ).toEqual([{ n: 0 }]);
    await user(actor);
    await db.query("select public.delete_test_record('purchase_needs',$1)", [id]);
    await db.exec('savepoint deleted_replay');
    await expect(need(id, { ...needValue, product_id: p }, 0, request)).rejects.toThrow(
      'TEST_DATA_DELETED',
    );
  },
);
it('normal linked product produces ordinary Need and rejects explicit TEST override', async () => {
  const id = crypto.randomUUID();
  await need(id);
  expect(
    (await db.query('select is_test from public.purchase_needs where id=$1', [id])).rows,
  ).toEqual([{ is_test: false }]);
  await db.exec('savepoint mismatch');
  await expect(
    db.query("select public.create_test_record('save_purchase_need',$1)", [
      {
        p_request: crypto.randomUUID(),
        p_id: crypto.randomUUID(),
        p_version: 0,
        p_values: { ...needValue, location_id: storage },
        p_confirm_duplicate: false,
      },
    ]),
  ).rejects.toThrow('TEST_CLASSIFICATION_CONFLICT');
});
it('editing a Need cannot create a new mixed real/test product link', async () => {
  const id = crypto.randomUUID();
  await need(id, { ...needValue, product_id: '', location_id: '' });
  const args = {
    p_request: crypto.randomUUID(),
    p_location: boat,
    p_product: null,
    p_name: 'TEST separate item',
    p_category: '20000000-0000-4000-8000-000000000001',
    p_quantity: 4,
    p_confirm_duplicate: false,
    p_unit: 'piece',
    p_minimum: 5,
  };
  const p = (
    await db.query<{ id: string }>(
      "select public.create_test_record('quick_add_item',$1)#>>'{}' id",
      [args],
    )
  ).rows[0].id;
  await db.exec('savepoint mismatch');
  await expect(need(id, { ...needValue, product_id: p, location_id: '' }, 1)).rejects.toThrow(
    'TEST_CLASSIFICATION_CONFLICT',
  );
});
