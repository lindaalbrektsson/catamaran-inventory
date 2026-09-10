import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { can, transferSchema } from '../src/lib/domain';

let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001';
const manager = '40000000-0000-4000-8000-000000000002';
const crew = '40000000-0000-4000-8000-000000000003';
const inactive = '40000000-0000-4000-8000-000000000004';
const product = '30000000-0000-4000-8000-000000000001';
const source = '10000000-0000-4000-8000-000000000001';
const destination = '10000000-0000-4000-8000-000000000003';
async function asUser(id: string, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
function transfer(
  quantity: number | string | null = 2,
  id = crypto.randomUUID(),
  from = source,
  to = destination,
  notes = '',
) {
  return db.query('select public.transfer_stock($1,$2,$3,$4,$5,$6) as id', [
    id,
    product,
    from,
    to,
    quantity,
    notes,
  ]);
}
async function state() {
  return (
    await db.query(
      'select location_id,quantity from public.inventory_balances order by location_id',
    )
  ).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  for (const name of ['20260909000100_inventory.sql', '20260910000100_inventory_transfers.sql']) {
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
  }
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  // Safe seed is idempotent and contains no operational quantities or identities.
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  expect((await db.query('select * from public.inventory_balances')).rows).toHaveLength(0);
  expect((await db.query('select * from auth.users')).rows).toHaveLength(0);
  expect((await db.query('select * from public.categories')).rows).toHaveLength(8);
  expect((await db.query('select name from public.locations order by name')).rows).toEqual([
    { name: 'Bodega / Storage' },
    { name: 'Cas Cat' },
  ]);
  for (const [id, role, active] of [
    [owner, 'OWNER', true],
    [manager, 'MANAGER', true],
    [crew, 'CREW', true],
    [inactive, 'OWNER', false],
  ]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('update public.profiles set role=$1,active=$2 where id=$3', [role, active, id]);
  }
  await db.query('insert into public.location_assignments values($1,$2)', [crew, source]);
});
beforeEach(async () => {
  await db.exec('begin');
  await asUser(owner);
  await db.query('select public.configure_inventory($1,$2,null,null)', [product, source]);
  await db.query('select public.configure_inventory($1,$2,null,null)', [product, destination]);
  await db.query("select public.change_stock($1,$2,$3,10,'ADD','other','')", [
    crypto.randomUUID(),
    product,
    source,
  ]);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});

it('moves both balances and records two linked immutable legs and audit events', async () => {
  const id = crypto.randomUUID();
  await asUser(manager);
  await transfer('2.125', id);
  const rows = (
    await db.query(
      'select quantity,transfer_id,related_location_id,performed_by_user_id from public.inventory_transactions where transfer_id=$1 order by quantity',
      [id],
    )
  ).rows;
  expect(rows).toEqual([
    {
      quantity: '-2.125',
      transfer_id: id,
      related_location_id: destination,
      performed_by_user_id: manager,
    },
    {
      quantity: '2.125',
      transfer_id: id,
      related_location_id: source,
      performed_by_user_id: manager,
    },
  ]);
  expect(await state()).toEqual([
    { location_id: source, quantity: '7.875' },
    { location_id: destination, quantity: '2.125' },
  ]);
  expect(
    (await db.query("select * from public.audit_events where after_data->>'transfer_id'=$1", [id]))
      .rows,
  ).toHaveLength(2);
  expect(can('MANAGER', 'inventory.transfer')).toBe(true);
  expect(can('CREW', 'inventory.transfer')).toBe(false);
});
it('deduplicates identical retries without double subtraction', async () => {
  const id = crypto.randomUUID();
  const first = await transfer(2, id);
  expect((await transfer(2, id)).rows).toEqual(first.rows);
  expect(await state()).toEqual([
    { location_id: source, quantity: '8.000' },
    { location_id: destination, quantity: '2.000' },
  ]);
});
it.each(['quantity', 'destination', 'notes', 'actor', 'stock-rpc'])(
  'rejects request reuse with changed %s',
  async (field) => {
    const id = crypto.randomUUID();
    await transfer(2, id);
    if (field === 'actor') await asUser(manager);
    if (field === 'stock-rpc') {
      await expect(
        db.query("select public.change_stock($1,$2,$3,2,'ADD','other','')", [id, product, source]),
      ).rejects.toThrow('REQUEST_CONFLICT');
    } else {
      await expect(
        transfer(
          field === 'quantity' ? 3 : 2,
          id,
          field === 'destination' ? destination : source,
          field === 'destination' ? source : destination,
          field === 'notes' ? 'changed' : '',
        ),
      ).rejects.toThrow('REQUEST_CONFLICT');
    }
  },
);
it.each([0, -1, null, 'NaN', 'Infinity', '0.0001', '100000000000'])(
  'rejects invalid transfer quantity %s',
  async (value) => {
    await expect(transfer(value)).rejects.toThrow('INVALID_INPUT');
  },
);
it.each([crew, inactive, ''])('rejects unauthorized or inactive users', async (id) => {
  await asUser(id);
  await expect(transfer()).rejects.toThrow('FORBIDDEN');
});
it('denies anonymous RPC execution', async () => {
  await asUser('', 'anon');
  await expect(transfer()).rejects.toThrow('permission denied');
});
it('rolls back both balances and both histories if the second audit write fails', async () => {
  const before = await state();
  const id = crypto.randomUUID();
  await db.exec('reset role');
  await db.exec(`create function public.fail_transfer_audit() returns trigger language plpgsql as $$begin if new.action='TRANSFER_IN' then raise exception 'TEST_AUDIT_FAILURE'; end if; return new; end;$$;
    create trigger fail_transfer before insert on public.audit_events for each row execute function public.fail_transfer_audit();`);
  await asUser(owner);
  await db.exec('savepoint transfer_attempt');
  await expect(transfer(2, id)).rejects.toThrow('TEST_AUDIT_FAILURE');
  await db.exec('rollback to savepoint transfer_attempt');
  expect(await state()).toEqual(before);
  expect(
    (await db.query('select * from public.inventory_transactions where transfer_id=$1', [id])).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from public.audit_events where after_data->>'transfer_id'=$1", [id]))
      .rows,
  ).toHaveLength(0);
});
it('keeps destination history outside an unassigned crew member’s RLS scope', async () => {
  await transfer();
  await asUser(crew);
  const rows = (
    await db.query(
      'select location_id from public.inventory_transactions where transfer_id is not null',
    )
  ).rows;
  expect(rows).toEqual([{ location_id: source }]);
});
it('does not create a destination balance implicitly', async () => {
  await db.exec('reset role');
  await db.query('delete from public.inventory_balances where location_id=$1', [destination]);
  await asUser(owner);
  await expect(transfer(1)).rejects.toThrow(
    'DESTINATION_NOT_CONFIGURED',
  );
});
it('rejects same-location transfers and insufficient stock', async () => {
  await db.exec('savepoint invalid');
  await expect(transfer(1, crypto.randomUUID(), source, source)).rejects.toThrow('INVALID_INPUT');
  await db.exec('rollback to savepoint invalid');
  await expect(transfer(11)).rejects.toThrow('INSUFFICIENT_STOCK');
});
it('retains history immutability even for database administrators', async () => {
  const id = crypto.randomUUID();
  await transfer(2, id);
  await db.exec('reset role');
  await expect(
    db.query('update public.inventory_transactions set notes=$1 where transfer_id=$2', [
      'changed',
      id,
    ]),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});
it('validates transfer input without floating point coercion', () => {
  const value = {
    requestId: crypto.randomUUID(),
    productId: product,
    sourceId: source,
    destinationId: destination,
    quantity: '0.125',
    notes: '',
  };
  expect(transferSchema.safeParse(value).success).toBe(true);
  expect(transferSchema.safeParse({ ...value, destinationId: source }).success).toBe(false);
  expect(transferSchema.safeParse({ ...value, quantity: '1e2' }).success).toBe(false);
});


it('retires the legacy catalog location while preserving balances and future locations', async () => {
  await db.exec('reset role');
  await db.exec("insert into public.locations(id,name,type) values ('10000000-0000-4000-8000-000000000002','Retired fixture','BOAT'),('10000000-0000-4000-8000-000000000004','Future fixture','STORAGE')");
  const migration = await readFile('supabase/migrations/20260910000300_v1_locations.sql', 'utf8');
  const before = await state();
  await db.exec(migration);
  await db.exec(migration);
  expect(await state()).toEqual(before);
  expect((await db.query("select active from public.locations where id='10000000-0000-4000-8000-000000000002'")).rows).toEqual([{ active: false }]);
  expect((await db.query("select name from public.locations where active order by name")).rows).toEqual([{name:'Bodega / Storage'},{name:'Cas Cat'},{name:'Future fixture'}]);
});
