import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { can, type Role } from '../src/lib/domain';
let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002',
  captain = '40000000-0000-4000-8000-000000000003',
  crew = '40000000-0000-4000-8000-000000000004',
  inactive = '40000000-0000-4000-8000-000000000005';
const product = '30000000-0000-4000-8000-000000000001',
  location = '10000000-0000-4000-8000-000000000001',
  otherLocation = '10000000-0000-4000-8000-000000000002';
async function asUser(user: string, sqlRole = 'authenticated') {
  await db.exec(`reset role;set role ${sqlRole}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
}
async function change(
  quantity: number | string,
  type = 'ADD',
  reason = 'returned',
  requestId = crypto.randomUUID(),
  loc = location,
  notes = '',
) {
  return db.query<{ id: string }>('select public.change_stock($1,$2,$3,$4,$5,$6,$7) as id', [
    requestId,
    product,
    loc,
    quantity,
    type,
    reason,
    notes,
  ]);
}
async function balance() {
  const result = await db.query<{ quantity: string }>(
    'select quantity from public.inventory_balances where product_id=$1 and location_id=$2',
    [product, location],
  );
  return Number(result.rows[0]?.quantity);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(await readFile('supabase/migrations/202609090001_inventory.sql', 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  for (const [id, role] of [
    [owner, 'OWNER'],
    [manager, 'MANAGER'],
    [captain, 'CAPTAIN'],
    [crew, 'CREW'],
    [inactive, 'CREW'],
  ]) {
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      id,
      { display_name: role, role: 'OWNER' },
    ]);
    await db.query('update public.profiles set role=$1,active=$2 where id=$3', [
      role,
      id !== inactive,
      id,
    ]);
  }
  await db.query(
    'insert into public.location_assignments(user_id,location_id) values($1,$3),($2,$3)',
    [captain, crew, location],
  );
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await asUser(owner);
});
describe('actual PostgreSQL migration and inventory function', () => {
  it('starts with zero catalog balances and no fictitious movements', async () => {
    expect(await balance()).toBe(0);
    const r = await db.query('select * from public.inventory_transactions');
    expect(r.rows).toHaveLength(0);
  });
  it('adds stock with before/after, actor and audit atomically', async () => {
    const request = crypto.randomUUID();
    await change(24, 'ADD', 'returned', request);
    expect(await balance()).toBe(24);
    const r = await db.query<{
      previous_quantity: string;
      resulting_quantity: string;
      performed_by_user_id: string;
    }>('select * from public.inventory_transactions where request_id=$1', [request]);
    expect(Number(r.rows[0].previous_quantity)).toBe(0);
    expect(Number(r.rows[0].resulting_quantity)).toBe(24);
    expect(r.rows[0].performed_by_user_id).toBe(owner);
    const audit = await db.query(
      "select * from public.audit_events where after_data->>'request_id'=$1",
      [request],
    );
    expect(audit.rows).toHaveLength(1);
  });
  it('removes stock with a negative ledger delta', async () => {
    await change(3, 'TOUR_USE', 'tour');
    expect(await balance()).toBe(21);
  });
  it('rejects negative stock without adding a movement or audit event', async () => {
    const request = crypto.randomUUID();
    await expect(change(22, 'REMOVE', 'other', request)).rejects.toThrow('INSUFFICIENT_STOCK');
    expect(await balance()).toBe(21);
    expect(
      (
        await db.query('select id from public.inventory_transactions where request_id=$1', [
          request,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select id from public.audit_events where after_data->>'request_id'=$1", [
          request,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it('deduplicates retries and rejects reuse with a changed payload', async () => {
    const request = crypto.randomUUID(),
      before = await balance();
    const a = await change(2, 'ADD', 'returned', request);
    const b = await change(2, 'ADD', 'returned', request);
    expect(a.rows).toEqual(b.rows);
    expect(await balance()).toBe(before + 2);
    await expect(change(3, 'ADD', 'returned', request)).rejects.toThrow('REQUEST_CONFLICT');
    await expect(change(2, 'ADD', 'returned', request, otherLocation)).rejects.toThrow(
      'REQUEST_CONFLICT',
    );
  });
  it.each([0, -1, 'NaN', 'Infinity', '0.0001'])(
    'rejects unsafe quantities %s at database boundary',
    async (value) => {
      await expect(change(value)).rejects.toThrow('INVALID_INPUT');
    },
  );
  it('rejects unsupported types and mismatched reasons', async () => {
    await expect(change(1, 'PURCHASE', 'returned')).rejects.toThrow('INVALID_INPUT');
    await expect(change(1, 'ADD', 'tour')).rejects.toThrow('INVALID_INPUT');
  });
  it('records fractional quantities exactly in PostgreSQL', async () => {
    const before = await balance();
    await change('0.125');
    expect(await balance()).toBe(before + 0.125);
  });
  it('keeps minimum changes separate from quantity', async () => {
    const before = await balance();
    await db.query('select public.configure_inventory($1,$2,3,5)', [product, location]);
    expect(await balance()).toBe(before);
  });
  it('serializes competing removals and prevents overselling', async () => {
    const before = await balance();
    const results = await Promise.allSettled([
      change(before, 'TOUR_USE', 'tour'),
      change(before, 'TOUR_USE', 'tour'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balance()).toBe(0);
    // PGlite queues statements; multi-connection contention requires hosted verification.
  });
});
describe('authorization and immutable history', () => {
  it('does not trust role metadata when creating users', async () => {
    await db.exec('reset role');
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      crypto.randomUUID(),
      { role: 'OWNER', display_name: 'Test' },
    ]);
    const result = await db.query<{ role: string; active: boolean }>(
      "select role,active from public.profiles where display_name='Test'",
    );
    expect(result.rows[0]).toEqual({ role: 'CREW', active: false });
  });
  it('enforces role matrix consistently with application permissions', async () => {
    for (const [id, role] of [
      [owner, 'OWNER'],
      [manager, 'MANAGER'],
      [captain, 'CAPTAIN'],
      [crew, 'CREW'],
    ] as [string, Role][]) {
      await asUser(id);
      const result = await db.query<{ allowed: boolean }>(
        "select private.can_move($1,'ADD') as allowed",
        [location],
      );
      expect(result.rows[0].allowed).toBe(can(role, 'inventory.add'));
    }
  });
  it('allows managers to add stock but not change thresholds', async () => {
    await asUser(manager);
    await change(10);
    await expect(
      db.query('select public.configure_inventory($1,$2,3,5)', [product, location]),
    ).rejects.toThrow('FORBIDDEN');
  });
  it('limits captain reads and consumption to assigned boats', async () => {
    await asUser(captain);
    const r = await db.query<{ id: string }>('select id from public.locations');
    expect(r.rows).toEqual([{ id: location }]);
    await change(1, 'TOUR_USE', 'tour');
    await expect(change(1)).rejects.toThrow('FORBIDDEN');
    await expect(change(1, 'TOUR_USE', 'tour', crypto.randomUUID(), otherLocation)).rejects.toThrow(
      'FORBIDDEN',
    );
  });
  it('limits crew to tour use even on assigned boat', async () => {
    await asUser(crew);
    await change(1, 'TOUR_USE', 'tour');
    await expect(change(1, 'DAMAGE', 'damaged')).rejects.toThrow('FORBIDDEN');
  });
  it('blocks inactive profiles and anonymous writes', async () => {
    await asUser(inactive);
    expect((await db.query('select * from public.inventory_balances')).rows).toHaveLength(0);
    await expect(change(1)).rejects.toThrow('FORBIDDEN');
    await asUser('', 'anon');
    await expect(change(1)).rejects.toThrow('permission denied');
  });
  it('blocks direct balance edits, history deletion and self-promotion even for owners', async () => {
    await expect(db.exec('update public.inventory_balances set quantity=999')).rejects.toThrow(
      'permission denied',
    );
    await expect(db.exec('delete from public.inventory_transactions')).rejects.toThrow(
      'permission denied',
    );
    await expect(db.exec('delete from public.audit_events')).rejects.toThrow('permission denied');
    await expect(db.exec("update public.profiles set role='OWNER'")).rejects.toThrow(
      'permission denied',
    );
  });
  it('protects ledger history against administrator accidental mutation too', async () => {
    await db.exec('reset role');
    await expect(
      db.exec("update public.inventory_transactions set notes='changed'"),
    ).rejects.toThrow('IMMUTABLE_HISTORY');
  });
  it('persists language without granting profile update privileges', async () => {
    await db.query("select public.set_language('es')");
    const r = await db.query<{ language: string }>(
      'select language from public.profiles where id=$1',
      [owner],
    );
    expect(r.rows[0].language).toBe('es');
    await expect(db.query("select public.set_language('fr')")).rejects.toThrow('FORBIDDEN');
  });
});
