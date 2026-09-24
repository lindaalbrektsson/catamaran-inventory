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
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',phone text,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
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
async function item(test = true, quantity = 10) {
  const category = (await query<{ id: string }>('select id from public.categories limit 1')).rows[0]
    .id;
  const args = {
    p_request: crypto.randomUUID(),
    p_location: '10000000-0000-4000-8000-000000000003',
    p_product: null,
    p_name: crypto.randomUUID(),
    p_category: category,
    p_quantity: quantity,
    p_confirm_duplicate: false,
    p_unit: 'piece',
    p_minimum: 5,
  };
  const id = test
    ? (
        await query<{ id: string }>(
          "select public.create_test_record('quick_add_item',$1) #>> '{}' id",
          [args],
        )
      ).rows[0].id
    : (
        await query<{ id: string }>(
          'select public.quick_add_item($1,$2,$3,$4,$5,$6,$7,$8,$9) id',
          Object.values(args),
        )
      ).rows[0].id;
  return { id, args };
}
async function query<T>(sql: string, args?: unknown[]) {
  await db.exec('savepoint expected_error');
  try {
    const result = await db.query<T>(sql, args);
    await db.exec('release savepoint expected_error');
    return result;
  } catch (e) {
    await db.exec('rollback to savepoint expected_error; release savepoint expected_error');
    throw e;
  }
}
const values = () => ({
  title: 'Test task',
  description: '',
  type_code: 'TASK',
  status: 'NEED_REVIEW',
  subtasks: [{ id: crypto.randomUUID(), title: 'Child' }],
});
async function create(table = 'tasks', actor = manager, extra: Record<string, unknown> = {}) {
  await user(actor);
  const id = crypto.randomUUID();
  const args =
    table === 'tasks'
      ? {
          p_request: crypto.randomUUID(),
          p_id: id,
          p_version: 0,
          p_action: 'SAVE',
          p_values: { ...values(), ...extra },
        }
      : { p_id: id, p_type: 'STORE', p_payment: 'CASH', p_hash: 'a'.repeat(64), p_size: 100 };
  await query('select public.create_test_record($1,$2)', [
    table === 'tasks' ? 'manage_task' : 'capture_receipt',
    args,
  ]);
  return id;
}
const remove = (table: string, id: string) =>
  query('select public.delete_test_record($1,$2)', [table, id]);
it('existing/ordinary records default false, creation is explicit and immutable', async () => {
  const id = crypto.randomUUID();
  await query('select public.manage_task($1,$2,0,$3,$4)', [
    crypto.randomUUID(),
    id,
    'SAVE',
    values(),
  ]);
  expect(
    (await query<{ is_test: boolean }>('select is_test from public.tasks where id=$1', [id]))
      .rows[0].is_test,
  ).toBe(false);
  await expect(remove('tasks', id)).rejects.toThrow('FORBIDDEN');
  await db.exec('reset role');
  await expect(query('update public.tasks set is_test=true where id=$1', [id])).rejects.toThrow(
    'TEST_CLASSIFICATION_IMMUTABLE',
  );
});
it('manager deletes own test task and owned children, audit remains', async () => {
  const id = await create();
  await remove('tasks', id);
  expect((await query('select id from public.tasks where id=$1', [id])).rows).toHaveLength(0);
  await db.exec('reset role');
  expect(
    (await query('select id from public.task_subtasks where task_id=$1', [id])).rows,
  ).toHaveLength(0);
  expect(
    (
      await query(
        "select id from public.audit_events where entity_id=$1 and action='TEST_DATA_DELETED'",
        [id],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(query('delete from public.audit_events where entity_id=$1', [id])).rejects.toThrow(
    'IMMUTABLE_HISTORY',
  );
});
it('manager cannot delete another creator test task; ordinary owner can', async () => {
  const id = await create('tasks', owner);
  await user(manager);
  await expect(remove('tasks', id)).rejects.toThrow('FORBIDDEN');
  await db.exec(`reset role;update public.profiles set account_admin=false where id='${owner}'`);
  await user(owner);
  await remove('tasks', id);
});
it('real dependent task blocks and rolls back cleanup', async () => {
  const id = await create();
  await query('select public.manage_task($1,$2,0,$3,$4)', [
    crypto.randomUUID(),
    crypto.randomUUID(),
    'SAVE',
    { ...values(), related_task_id: id },
  ]);
  await expect(remove('tasks', id)).rejects.toThrow('TEST_DEPENDENCY_BLOCKED');
  expect((await query('select id from public.tasks where id=$1', [id])).rows).toHaveLength(1);
});
it('test child reference owned by another creator blocks manager cleanup', async () => {
  const id = await create();
  await create('tasks', owner, { related_task_id: id });
  await user(manager);
  await expect(remove('tasks', id)).rejects.toThrow('TEST_DEPENDENCY_BLOCKED');
});
it('receipt deletion queues exact path, retry is idempotent and late upload is blocked', async () => {
  const id = await create('receipt_intake');
  await remove('receipt_intake', id);
  await remove('receipt_intake', id);
  await expect(query('select public.claim_test_storage_cleanup()')).rejects.toThrow();
  await db.exec('reset role');
  const claim = (
    await query<{ r: { bucket: string; path: string; token: string } }>(
      'select public.claim_test_storage_cleanup() r',
    )
  ).rows[0].r;
  expect(claim.path).toBe(`intake/${id}/receipt.jpg`);
  await expect(
    query("insert into storage.objects(bucket_id,name) values('receipts',$1)", [claim.path]),
  ).rejects.toThrow('TEST_DATA_DELETED');
  await query('select public.finish_test_storage_cleanup($1,$2,$3,false)', [
    claim.bucket,
    claim.path,
    claim.token,
  ]);
  expect(
    (await query<{ r: unknown }>('select public.claim_test_storage_cleanup() r')).rows[0].r,
  ).toBeNull();
  await db.exec("update private.test_storage_cleanup set next_attempt=now()-interval '1 minute'");
  const next = (await query<{ r: typeof claim }>('select public.claim_test_storage_cleanup() r'))
    .rows[0].r;
  await query('select public.finish_test_storage_cleanup($1,$2,$3,true)', [
    next.bucket,
    next.path,
    next.token,
  ]);
  expect(
    (await query<{ r: unknown }>('select public.claim_test_storage_cleanup() r')).rows[0].r,
  ).toBeNull();
});
it('creation wrapper cannot perform edits or invoke arbitrary RPCs', async () => {
  await expect(
    query('select public.create_test_record($1,$2)', ['manage_staff', {}]),
  ).rejects.toThrow('INVALID_INPUT');
  await expect(
    query('select public.create_test_record($1,$2)', [
      'manage_task',
      { p_version: 1, p_action: 'SAVE' },
    ]),
  ).rejects.toThrow('INVALID_INPUT');
});
it('test item stock remains location-separated; deletion removes only its stock/history', async () => {
  await user(manager);
  const test = await item(),
    real = await item(false);
  await query("select public.change_stock($1,$2,$3,3,'ADD','other','')", [
    crypto.randomUUID(),
    test.id,
    test.args.p_location,
  ]);
  await query("select public.change_stock($1,$2,$3,2,'REMOVE','other','')", [
    crypto.randomUUID(),
    test.id,
    test.args.p_location,
  ]);
  await query('select public.transfer_stock($1,$2,$3,$4,4,$5)', [
    crypto.randomUUID(),
    test.id,
    test.args.p_location,
    '10000000-0000-4000-8000-000000000001',
    'QA',
  ]);
  const balances = (
    await query<{ quantity: string }>(
      'select quantity from public.inventory_balances where product_id=$1 order by location_id',
      [test.id],
    )
  ).rows;
  expect(balances.map((x) => Number(x.quantity))).toEqual([4, 7]);
  await remove('products', test.id);
  expect(
    (await query('select * from public.inventory_transactions where product_id=$1', [test.id]))
      .rows,
  ).toHaveLength(0);
  expect(
    Number(
      (
        await query<{ quantity: string }>(
          'select quantity from public.inventory_balances where product_id=$1 and quantity>0',
          [real.id],
        )
      ).rows[0].quantity,
    ),
  ).toBe(10);
  await expect(remove('products', real.id)).rejects.toThrow('FORBIDDEN');
  await expect(
    query("select public.create_test_record('quick_add_item',$1)", [test.args]),
  ).rejects.toThrow('TEST_DATA_DELETED');
  await expect(
    query('select public.quick_add_item($1,$2,$3,$4,$5,$6,$7,$8,$9)', Object.values(test.args)),
  ).rejects.toThrow('TEST_DATA_DELETED');
});
it('test-to-real merge rolls back both balances and product changes', async () => {
  const a = await item(),
    b = await item(false);
  const before = (
    await query<{ id: string; updated_at: string }>(
      'select id,updated_at::text from public.products where id in ($1,$2)',
      [a.id, b.id],
    )
  ).rows;
  await expect(
    query("select public.manage_catalog_item($1,'MERGE',$2,$3,$4)", [
      crypto.randomUUID(),
      a.id,
      { target: b.id, targetUpdatedAt: before.find((x) => x.id === b.id)!.updated_at },
      before.find((x) => x.id === a.id)!.updated_at,
    ]),
  ).rejects.toThrow('TEST_MERGE_CONFLICT');
  expect(
    (
      await query<{ quantity: string }>(
        'select quantity from public.inventory_balances where product_id in ($1,$2)',
        [a.id, b.id],
      )
    ).rows.map((x) => Number(x.quantity)),
  ).toEqual([0, 10, 0, 10]);
});
it('documents include unfinished and replaced file reservations without weakening finalizers', async () => {
  const id = crypto.randomUUID(),
    file = crypto.randomUUID();
  const args = {
    p_request: crypto.randomUUID(),
    p_id: id,
    p_version: 0,
    p_values: {
      title: 'Document',
      description: '',
      category: '',
      expiry_date: '',
      favorite: false,
      archived: false,
      access_level: 'MANAGERS',
      selected_users: [],
    },
    p_file: { id: file, content_type: 'application/pdf', byte_size: 100, sha256: 'a'.repeat(64) },
  };
  await query("select public.create_test_record('save_document',$1)", [args]);
  await expect(
    query('select public.complete_document_file($1,$2)', [file, owner]),
  ).rejects.toThrow();
  await query('select public.save_document($1,$2,1,$3,$4)', [
    crypto.randomUUID(),
    id,
    args.p_values,
    { ...args.p_file, id: crypto.randomUUID() },
  ]);
  await remove('documents', id);
  await db.exec('reset role');
  expect(
    (await query("select object_path from private.test_storage_cleanup where bucket='documents'"))
      .rows,
  ).toHaveLength(2);
  expect(
    (await query('select * from public.document_files where document_id=$1', [id])).rows,
  ).toHaveLength(0);
});
it('Need photo versions inherit classification; an existing real Need blocks Item cleanup', async () => {
  const p = await item(),
    id = crypto.randomUUID();
  const args = {
    p_request: crypto.randomUUID(),
    p_id: id,
    p_values: {
      name: 'Need',
      product_id: p.id,
      location_id: '',
      country: 'BELIZE',
      status: 'PENDING',
      product_url: '',
      comment: '',
      quantity_needed: null,
    },
    p_version: 0,
    p_confirm_duplicate: false,
  };
  // Privileged fixture reproduces a pre-existing mixed dependency. New linked
  // Needs now inherit classification, but old real rows must never be reclassified.
  await db.exec('reset role');
  await query(
    "insert into public.purchase_needs(id,name,product_id,country,status,created_by,updated_by) values($1,'Legacy Need',$2,'BELIZE','PENDING',$3,$3)",
    [id, p.id, owner],
  );
  await user(owner);
  await expect(remove('products', p.id)).rejects.toThrow('TEST_DEPENDENCY_BLOCKED');
  const testId = crypto.randomUUID();
  args.p_id = testId;
  args.p_request = crypto.randomUUID();
  args.p_values.product_id = '';
  await query("select public.create_test_record('save_purchase_need',$1)", [args]);
  await query('select public.reserve_need_image($1,$2,$3,100,1)', [
    crypto.randomUUID(),
    testId,
    'b'.repeat(64),
  ]);
  await remove('purchase_needs', testId);
  await db.exec('reset role');
  expect(
    (await query("select * from private.test_storage_cleanup where bucket='need-photos'")).rows,
  ).toHaveLength(1);
});
it('maintenance inherits from its Task and removes occurrences/updates only for that test parent', async () => {
  const id = crypto.randomUUID();
  await query("select public.create_test_record('create_maintenance',$1)", [
    {
      p_id: id,
      p_title: 'Maintenance',
      p_recurrence: 'NONE',
      p_days: null,
      p_due: null,
      p_time: null,
      p_weekday: null,
      p_monthday: null,
    },
  ]);
  await query('select public.plan_maintenance($1)', [[id]]);
  await remove('tasks', id);
  expect(
    (await query('select * from public.maintenance_rules where task_id=$1', [id])).rows,
  ).toHaveLength(0);
  expect(
    (await query('select * from public.maintenance_occurrences where task_id=$1', [id])).rows,
  ).toHaveLength(0);
});
it('private deletion authority cannot be forged by an authenticated caller', async () => {
  await expect(
    query(
      "insert into private.test_delete_members(transaction_id,relation,row_data) values(txid_current(),'public.audit_events','{}')",
    ),
  ).rejects.toThrow();
  await expect(
    query("select private.test_delete_allowed('public.audit_events','{}')"),
  ).rejects.toThrow();
});

it('a former Owner cannot delete spending after losing spending access', async () => {
  const id = crypto.randomUUID();
  const category = (await query<{ id: string }>('select id from public.expense_categories limit 1'))
    .rows[0].id;
  await query("select public.create_test_record('record_spending',$1)", [
    {
      p_id: id,
      p_kind: 'EXPENSE',
      p_category_id: category,
      p_amount: 1,
      p_currency: 'BZD',
      p_location_id: '10000000-0000-4000-8000-000000000003',
      p_paid_by: owner,
      p_payment_method: 'CASH',
      p_occurred_at: '2026-09-22T12:00:00Z',
      p_notes: '',
    },
  ]);
  await db.exec('reset role');
  await query("update public.profiles set role='MANAGER',account_admin=false where id=$1", [owner]);
  await user(owner);
  await expect(remove('expenses', id)).rejects.toThrow('FORBIDDEN');
  await db.exec('reset role');
  expect((await query('select id from public.expenses where id=$1', [id])).rows).toHaveLength(1);
});
