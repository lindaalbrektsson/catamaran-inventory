import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { phoneIdentity, loginCredentials, newPasswordSchema } from '../src/lib/auth-domain';
let db: PGlite;
const owner = '40000000-0000-4000-8000-000000000001',
  manager = '40000000-0000-4000-8000-000000000002';
async function user(id: string) {
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',phone text,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;
 grant usage on schema auth,storage,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant all on storage.objects to authenticated,anon;`);
  for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(await readFile('supabase/migrations/' + f, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  for (const [id, role] of [
    [owner, 'OWNER'],
    [manager, 'MANAGER'],
  ]) {
    await db.query(
      "insert into auth.users(id,phone,encrypted_password) values($1,'5011234567','test-only-old-hash')",
      [id],
    );
    await db.query(
      'update public.profiles set active=true,role=$1,must_change_password=false where id=$2',
      [role, id],
    );
  }
});
beforeEach(async () => {
  await db.exec('begin');
  await user(owner);
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());
it.each([
  ['501', '1234567', '+5011234567'],
  ['57', '3001234567', '+573001234567'],
  ['46', '701234567', '+46701234567'],
])('normalizes supported country %s', (country, number, result) =>
  expect(phoneIdentity(country, number)).toBe(result),
);
it.each([
  ['1', '1234567890'],
  ['501', '123'],
  ['46', '0701234567'],
  ['57', '+573001234567'],
])('rejects invalid phone input %s %s', (c, n) => expect(phoneIdentity(c, n)).toBeNull());
it('supports email and phone password credentials without signup', () => {
  const form = new FormData();
  form.set('email', 'staff@example.test');
  form.set('password', 'test-only-password');
  expect(loginCredentials(form)).toMatchObject({ email: 'staff@example.test' });
  form.set('method', 'phone');
  form.delete('email');
  form.set('country', '501');
  form.set('phone', '1234567');
  expect(loginCredentials(form)).toEqual({ phone: '+5011234567', password: 'test-only-password' });
  expect(newPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(false);
});
it('new users default to password pending and cannot bypass operational RPCs', async () => {
  await db.exec('reset role');
  const id = crypto.randomUUID();
  await db.query('insert into auth.users(id) values($1)', [id]);
  await db.query("update public.profiles set role='MANAGER',active=true where id=$1", [id]);
  await user(id);
  expect((await db.query('select private.current_role() as role')).rows).toEqual([{ role: null }]);
  expect((await db.query('select * from public.products')).rows).toHaveLength(0);
  await expect(
    db.query("select public.change_stock($1,$2,$3,1,'ADD','other','')", [
      crypto.randomUUID(),
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
    ]),
  ).rejects.toThrow('FORBIDDEN');
});
it('password pending denies receipt storage and cannot clear its own flag', async () => {
  await db.exec('reset role');
  await db.query('update public.profiles set must_change_password=true where id=$1', [manager]);
  await user(manager);
  expect((await db.query('select * from public.receipt_intake')).rows).toHaveLength(0);
  await expect(
    db.query('update public.profiles set must_change_password=false where id=$1', [manager]),
  ).rejects.toThrow();
});
it('only a successful Auth password update clears the flag', async () => {
  await db.exec('reset role');
  await db.query('update public.profiles set must_change_password=true where id=$1', [manager]);
  await db.query(
    `update auth.users set raw_user_meta_data='{"must_change_password":false}' where id=$1`,
    [manager],
  );
  expect(
    (
      await db.query('select must_change_password as flag from public.profiles where id=$1', [
        manager,
      ])
    ).rows,
  ).toEqual([{ flag: true }]);
  await db.query("update auth.users set encrypted_password='test-only-new-hash' where id=$1", [
    manager,
  ]);
  await user(manager);
  expect((await db.query('select private.current_role() as role')).rows).toEqual([
    { role: 'MANAGER' },
  ]);
  expect(JSON.stringify((await db.query('select * from public.audit_events')).rows)).not.toContain(
    'test-only-new-hash',
  );
});
it('owner can edit existing staff profiles with audit and cannot clear the password gate', async () => {
  await db.query("select public.manage_staff($1,'Updated staff','MANAGER','es',true)", [manager]);
  const row = (await db.query('select * from public.profiles where id=$1', [manager])).rows[0];
  expect(row).toMatchObject({
    id: manager,
    display_name: 'Updated staff',
    role: 'MANAGER',
    language: 'es',
    active: true,
  });
  expect(
    (
      await db.query('select * from public.audit_events where actor_id=$1 and entity_id=$2', [
        owner,
        manager,
      ])
    ).rows.length,
  ).toBeGreaterThan(0);
});
it('manager cannot manage staff through RPC', async () => {
  await user(manager);
  await expect(
    db.query("select public.manage_staff($1,'Owner','OWNER','en',true)", [manager]),
  ).rejects.toThrow('FORBIDDEN');
});
it('owner cannot deactivate the last usable owner', async () => {
  await expect(
    db.query("select public.manage_staff($1,'Owner','MANAGER','en',true)", [owner]),
  ).rejects.toThrow('LAST_OWNER');
});
it('phone changes preserve identity and role and write masked audit values only', async () => {
  await db.exec('reset role');
  await db.query("update auth.users set phone='573001239876' where id=$1", [manager]);
  expect(
    (await db.query('select id,role,language from public.profiles where id=$1', [manager])).rows,
  ).toEqual([{ id: manager, role: 'MANAGER', language: 'en' }]);
  const audit = (
    await db.query(
      "select before_data,after_data from public.audit_events where action='PHONE_CHANGE' and entity_id=$1",
      [manager],
    )
  ).rows;
  expect(audit).toEqual([
    { before_data: { phone: '••••4567' }, after_data: { phone: '••••9876' } },
  ]);
  expect(JSON.stringify(audit)).not.toContain('573001239876');
});
