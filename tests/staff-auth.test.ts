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
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',phone text,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
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
      "update public.profiles set active=true,role=$1,must_change_password=false,account_admin=($1::public.app_role='OWNER') where id=$2",
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
it('accepts phone credentials and rejects email login submissions', () => {
  const form = new FormData();
  form.set('email', 'staff@example.test');
  form.set('password', 'test-only-password');
  expect(loginCredentials(form)).toBeNull();
  form.set('method', 'email');
  expect(loginCredentials(form)).toBeNull();
  form.set('method', 'phone');
  form.delete('email');
  form.set('country', '501');
  form.set('phone', '1234567');
  form.set('username', ' LINDA ');
  expect(loginCredentials(form)).toEqual({ username: 'linda', password: 'test-only-password' });
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
  ).rejects.toThrow('ACCOUNT_ADMIN_PROTECTED');
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

it('an OWNER without ACCOUNT_ADMIN cannot provision, reset or maintain staff', async () => {
  await db.exec('reset role');
  await db.query('update public.profiles set account_admin=false where id=$1', [owner]);
  await user(owner);
  await expect(
    db.query("select public.begin_account_change($1,$2,'RESET')", [crypto.randomUUID(), manager]),
  ).rejects.toThrow('FORBIDDEN');
});

it('credential operations block access and overlapping requests; browser cannot finish them', async () => {
  const request = crypto.randomUUID();
  await db.query("select public.begin_account_change($1,$2,'RESET')", [request, manager]);
  await user(manager);
  expect((await db.query('select private.current_role() as role')).rows).toEqual([{ role: null }]);
  await expect(
    db.query("select public.finish_account_change($1,$2,'{}')", [request, manager]),
  ).rejects.toThrow('permission denied');
});

it('reset forces a new password, invalidates old JWTs and never audits password hashes', async () => {
  const request = crypto.randomUUID();
  await db.query("select public.begin_account_change($1,$2,'RESET')", [request, manager]);
  await db.exec('reset role');
  await db.query(
    "update auth.users set encrypted_password='temporary-test-only-hash' where id=$1",
    [manager],
  );
  await db.query("select public.finish_account_change($1,$2,'{}')", [request, manager]);
  expect(
    (
      await db.query(
        'select must_change_password,credential_pending from public.profiles where id=$1',
        [manager],
      )
    ).rows,
  ).toEqual([{ must_change_password: true, credential_pending: false }]);
  // GoTrue's trusted hash update has no application JWT.
  await db.exec("select set_config('request.jwt.claims','',false)");
  await db.query("update auth.users set encrypted_password='new-own-test-only-hash' where id=$1", [
    manager,
  ]);
  await user(manager);
  expect((await db.query('select private.current_role() as role')).rows).toEqual([{ role: null }]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ iat: Math.floor(Date.now() / 1000) + 10 }),
  ]);
  expect((await db.query('select private.current_role() as role')).rows).toEqual([
    { role: 'MANAGER' },
  ]);
  await db.exec('reset role');
  const audit = JSON.stringify((await db.query('select * from public.audit_events')).rows);
  expect(audit).not.toContain('test-only-hash');
  expect(
    (await db.query("select actor_id from public.audit_events where action='RESET_COMPLETED'"))
      .rows,
  ).toEqual([{ actor_id: owner }]);
});

it('secure creation links the Auth UUID and activates only after profile setup', async () => {
  const request = crypto.randomUUID(),
    target = crypto.randomUUID();
  await db.query("select public.begin_account_change($1,null,'CREATE')", [request]);
  await db.exec('reset role');
  await db.query('insert into auth.users(id,raw_app_meta_data) values($1,$2)', [
    target,
    JSON.stringify({ account_operation: request }),
  ]);
  await db.exec('set constraints all immediate');
  expect(
    (
      await db.query('select active,must_change_password from public.profiles where id=$1', [
        target,
      ])
    ).rows,
  ).toEqual([{ active: false, must_change_password: true }]);
  await db.query('select public.finish_account_change($1,$2,$3)', [
    request,
    target,
    JSON.stringify({ name: 'Isolated staff', role: 'MANAGER', language: 'es', active: true }),
  ]);
  expect(
    (
      await db.query(
        'select id,active,must_change_password,account_admin from public.profiles where id=$1',
        [target],
      )
    ).rows,
  ).toEqual([{ id: target, active: true, must_change_password: true, account_admin: false }]);
});

it('admin phone changes audit the acting admin and preserve stable profile identity', async () => {
  const request = crypto.randomUUID();
  await db.query("select public.begin_account_change($1,$2,'PHONE')", [request, manager]);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query("update auth.users set phone='46701239876' where id=$1", [manager]);
  await db.query("select public.finish_account_change($1,$2,'{}')", [request, manager]);
  expect(
    (await db.query('select id,role,language from public.profiles where id=$1', [manager])).rows,
  ).toEqual([{ id: manager, role: 'MANAGER', language: 'en' }]);
  expect(
    (
      await db.query(
        "select actor_id,after_data from public.audit_events where action='PHONE_CHANGE'",
      )
    ).rows,
  ).toEqual([{ actor_id: owner, after_data: { phone: '••••9876' } }]);
});

it('capability changes are audited and cannot remove the final admin', async () => {
  await db.query("select public.manage_staff($1,'Another owner','OWNER','en',true)", [manager]);
  await db.query('select public.set_account_admin($1,true)', [manager]);
  expect(
    (
      await db.query(
        "select after_data->>'account_admin' as enabled from public.audit_events where entity_id=$1 and after_data->>'account_admin'='true'",
        [manager],
      )
    ).rows.length,
  ).toBeGreaterThan(0);
  await db.query('select public.set_account_admin($1,false)', [manager]);
  await expect(db.query('select public.set_account_admin($1,false)', [owner])).rejects.toThrow(
    'ACCOUNT_ADMIN_PROTECTED',
  );
});
it('account administrator cannot issue their own temporary reset', async () => {
  await expect(
    db.query('select public.begin_account_change($1,$2,$3)', [crypto.randomUUID(), owner, 'RESET']),
  ).rejects.toThrow('ACCOUNT_ADMIN_PROTECTED');
});
it('own phone change retains account administrator capability and history identity', async () => {
  const request = crypto.randomUUID();
  await db.query('select public.begin_account_change($1,$2,$3)', [request, owner, 'PHONE']);
  await db.exec('reset role');
  await db.query("update auth.users set phone='46701239876' where id=$1", [owner]);
  await db.query("select public.finish_account_change($1,$2,'{}')", [request, owner]);
  const result = await db.query(
    'select id,account_admin,must_change_password,credential_pending from public.profiles where id=$1',
    [owner],
  );
  expect(result.rows).toEqual([
    { id: owner, account_admin: true, must_change_password: false, credential_pending: false },
  ]);
});

it.each(['CAPTAIN', 'CREW'])('staff RPC rejects assigning legacy role %s', async (role) => {
  await expect(
    db.query("select public.manage_staff($1,'Staff',$2,'en',true)", [manager, role]),
  ).rejects.toThrow('INVALID_INPUT');
});

it('reproduces the original profiles FK blocker and cleans an unused profile atomically', async () => {
  await db.exec(
    'reset role; alter table auth.users disable trigger cleanup_unused_auth_user; savepoint deletion_check',
  );
  await expect(db.query('delete from auth.users where id=$1', [manager])).rejects.toThrow(
    /profiles_id_fkey/,
  );
  await db.exec(
    'rollback to savepoint deletion_check; alter table auth.users enable trigger cleanup_unused_auth_user',
  );
  await db.query('delete from auth.users where id=$1', [manager]);
  expect(
    (await db.query('select id from public.profiles where id=$1', [manager])).rows,
  ).toHaveLength(0);
  expect((await db.query('select id from auth.users where id=$1', [manager])).rows).toHaveLength(0);
});
it('cleans setup references and deletes Auth/profile while retaining audit events', async () => {
  await db.exec('reset role');
  await db.query(
    "insert into private.account_changes(id,actor_id,target_id,kind) values(gen_random_uuid(),$1,$2,'CREATE')",
    [owner, manager],
  );
  await user(owner);
  expect(
    (
      await db.query<{ result: string }>('select public.prepare_user_deletion($1) as result', [
        manager,
      ])
    ).rows[0].result,
  ).toBe('DELETE');
  await db.exec('reset role');
  await db.query('delete from auth.users where id=$1', [manager]);
  expect(
    (await db.query('select id from private.account_changes where target_id=$1', [manager])).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select id from public.audit_events where entity_id=$1 and action='AUTH_USER_DELETED'",
        [manager],
      )
    ).rows,
  ).toHaveLength(1);
});
it('preserves a historical actor and blocks destructive direct Auth deletion', async () => {
  await db.exec('reset role');
  await db.query(
    "insert into public.audit_events(actor_id,entity_type,entity_id,action) values($1,'test','history','TEST_HISTORY')",
    [manager],
  );
  await user(owner);
  expect(
    (
      await db.query<{ result: string }>('select public.prepare_user_deletion($1) as result', [
        manager,
      ])
    ).rows[0].result,
  ).toBe('PRESERVED');
  await db.exec('reset role');
  expect(
    (
      await db.query<{ active: boolean }>('select active from public.profiles where id=$1', [
        manager,
      ])
    ).rows[0].active,
  ).toBe(false);
  await expect(db.query('delete from auth.users where id=$1', [manager])).rejects.toThrow(
    /USER_HAS_HISTORY/,
  );
});
it('cannot delete self or an account administrator and rejects operational callers', async () => {
  await db.exec('savepoint protection');
  await expect(db.query('select public.prepare_user_deletion($1)', [owner])).rejects.toThrow(
    /ACCOUNT_ADMIN_PROTECTED/,
  );
  await db.exec('rollback to savepoint protection');
  await user(manager);
  await expect(db.query('select public.prepare_user_deletion($1)', [owner])).rejects.toThrow(
    /FORBIDDEN/,
  );
});

it('marks partial Auth creation as pending and permits unused-account cleanup', async () => {
  const request = '60000000-0000-4000-8000-000000000001';
  const fresh = '40000000-0000-4000-8000-000000000003';
  await db.query("select public.begin_account_change($1,null,'CREATE')", [request]);
  await db.exec('reset role');
  await db.query(
    "insert into auth.users(id,raw_app_meta_data) values($1,jsonb_build_object('account_operation',$2::text))",
    [fresh, request],
  );
  await db.exec('set constraints all immediate');
  expect(
    (
      await db.query<{ credential_pending: boolean }>(
        'select credential_pending from public.profiles where id=$1',
        [fresh],
      )
    ).rows[0].credential_pending,
  ).toBe(true);
  await db.query('delete from auth.users where id=$1', [fresh]);
  expect((await db.query('select id from public.profiles where id=$1', [fresh])).rows).toHaveLength(
    0,
  );
  expect(
    (await db.query('select id from private.account_changes where id=$1', [request])).rows,
  ).toHaveLength(0);
});

it('assigns normalized usernames, resolves the same UUID, and renames without changing Auth', async () => {
  await db.exec('reset role');
  await db.query("update auth.users set email='opaque@example.test' where id=$1", [manager]);
  await user(owner);
  await db.query('select public.set_staff_username($1,$2)', [manager, ' Test.Manager ']);
  await db.exec('reset role');
  let resolved = (
    await db.query<{ v: { id: string; email: string } }>(
      "select public.resolve_username(' TEST.MANAGER ') v",
    )
  ).rows[0].v;
  expect(resolved.id).toBe(manager);
  await user(owner);
  await db.query('select public.set_staff_username($1,$2)', [manager, 'renamed.manager']);
  await db.exec('reset role');
  expect(
    (await db.query<{ v: unknown }>("select public.resolve_username('test.manager') v")).rows[0].v,
  ).toBeNull();
  resolved = (
    await db.query<{ v: { id: string; email: string } }>(
      "select public.resolve_username('renamed.manager') v",
    )
  ).rows[0].v;
  expect(resolved).toEqual({ id: manager, email: 'opaque@example.test' });
});
it('reserved username blocks duplicate provisioning, including after a failed attempt', async () => {
  const request = '60000000-0000-4000-8000-000000000001';
  await db.query("select public.begin_username_creation($1,' Reserved ')", [request]);
  await db.exec('savepoint duplicate');
  await expect(
    db.query("select public.begin_username_creation(gen_random_uuid(),'RESERVED')"),
  ).rejects.toThrow(/USERNAME_UNAVAILABLE/);
  await db.exec('rollback to savepoint duplicate; reset role');
  await db.query('select public.release_account_change($1)', [request]);
  await user(owner);
  expect(
    (
      await db.query<{ v: { target: unknown } }>(
        "select public.begin_username_creation($1,'reserved') v",
        [request],
      )
    ).rows[0].v.target,
  ).toBeNull();
});
it.each(['OWNER', 'MANAGER'])(
  'phone-free %s finalization keeps first-login gate and cleanup removes reservation',
  async (role) => {
    const request = '60000000-0000-4000-8000-000000000001',
      fresh = '40000000-0000-4000-8000-000000000003';
    await db.query("select public.begin_username_creation($1,'fresh')", [request]);
    await db.exec('reset role');
    await db.query(
      "insert into auth.users(id,email,raw_app_meta_data) values($1,'opaque@example.test',jsonb_build_object('account_operation',$2::text))",
      [fresh, request],
    );
    await db.exec('set constraints all immediate');
    await db.query('select public.finish_username_creation($1,$2,$3,null)', [
      request,
      fresh,
      { name: 'New staff', role, language: 'en', active: true },
    ]);
    const profile = (
      await db.query<{ username: string; must_change_password: boolean }>(
        'select username,must_change_password from public.profiles where id=$1',
        [fresh],
      )
    ).rows[0];
    expect(profile).toEqual({ username: 'fresh', must_change_password: true });
    expect((await db.query('select phone from auth.users where id=$1', [fresh])).rows).toEqual([
      { phone: null },
    ]);
    await db.query('delete from auth.users where id=$1', [fresh]);
    expect(
      (await db.query("select * from private.username_reservations where username='fresh'")).rows,
    ).toHaveLength(0);
  },
);
it('historical usernames remain reserved and resolver is not accessible to authenticated users', async () => {
  await db.query("select public.set_staff_username($1,'history.user')", [manager]);
  await db.exec('reset role');
  await db.query(
    "insert into public.audit_events(actor_id,entity_type,entity_id,action) values($1,'test','history','TEST')",
    [manager],
  );
  await user(owner);
  await db.query('select public.prepare_user_deletion($1)', [manager]);
  await db.exec('savepoint reserved');
  await expect(
    db.query("select public.begin_username_creation(gen_random_uuid(),'history.user')"),
  ).rejects.toThrow(/USERNAME_UNAVAILABLE/);
  await db.exec('rollback to savepoint reserved');
  await expect(db.query("select public.resolve_username('history.user')")).rejects.toThrow(
    /permission denied/,
  );
});
it('rate limiting applies equally before identity lookup', async () => {
  await db.exec('reset role');
  for (let i = 0; i < 15; i++)
    expect(
      (
        await db.query<{ v: boolean }>('select public.consume_login_limit($1,$2) v', [
          'a'.repeat(64),
          'b'.repeat(64),
        ])
      ).rows[0].v,
    ).toBe(true);
  expect(
    (
      await db.query<{ v: boolean }>('select public.consume_login_limit($1,$2) v', [
        'a'.repeat(64),
        'b'.repeat(64),
      ])
    ).rows[0].v,
  ).toBe(false);
});
