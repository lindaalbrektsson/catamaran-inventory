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
async function completeFile(id: string) {
  const actor = (await db.query<{ id: string }>('select auth.uid() id')).rows[0].id;
  await db.exec('reset role;set role service_role');
  await db.exec('savepoint finalization');
  try {
    const result = await db.query('select public.complete_document_file($1,$2)', [id, actor]);
    await user(actor);
    return result;
  } catch (error) {
    await db.exec('rollback to savepoint finalization');
    await user(actor);
    throw error;
  }
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
it('restrictive policies defeat an unrelated broad Storage read policy', async () => {
  await create({ access_level: 'OWNERS' });
  await db.exec(
    'reset role;create policy fixture_broad_read on storage.objects for select to authenticated using(true)',
  );
  await user(manager);
  await operation('object.get_authenticated');
  expect(
    (await db.query("select * from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([]);
  await user(owner);
  await operation('object.sign');
  expect(
    (await db.query("select * from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([]);
});
const values = (extra = {}) => ({
  title: 'Fixture checklist',
  description: 'Tour preparation',
  category: 'Operations',
  expiry_date: '2026-10-01',
  favorite: true,
  archived: false,
  access_level: 'STAFF',
  selected_users: [],
  ...extra,
});
async function operation(op: string) {
  await db.query("select set_config('storage.operation',$1,true)", [op]);
}
async function save(
  id: string,
  version: number,
  v = values(),
  file: object | null = null,
  request = crypto.randomUUID(),
) {
  return db.query('select public.save_document($1,$2,$3,$4,$5) result', [
    request,
    id,
    version,
    JSON.stringify(v),
    file ? JSON.stringify(file) : null,
  ]);
}
async function create(extra = {}) {
  await db.exec(
    `reset role;create or replace function storage.allow_only_operation(p text) returns boolean language sql stable as $$select replace(coalesce(current_setting('storage.operation',true),''),'storage.','')=replace(p,'storage.','')$$;`,
  );
  await user(owner);
  const id = crypto.randomUUID(),
    file = crypto.randomUUID();
  await save(id, 0, values(extra), {
    id: file,
    content_type: 'application/pdf',
    byte_size: 100,
    sha256: 'a'.repeat(64),
  });
  await operation('object.upload');
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('documents',$1,$2)", [
    id + '/' + file,
    JSON.stringify({ size: 100, mimetype: 'application/pdf' }),
  ]);
  await completeFile(file);
  return { id, file, path: id + '/' + file };
}
it('owner uploads and favorites a document with immutable server upload time', async () => {
  const { id } = await create();
  const { rows } = await db.query<{
    uploaded_by: string;
    uploaded_at: Date;
    favorite: boolean;
    version: number;
  }>('select * from public.documents where id=$1', [id]);
  expect(rows[0]).toMatchObject({ uploaded_by: owner, favorite: true, version: 2 });
  expect(rows[0].uploaded_at).toBeTruthy();
});
it('authorized manager sees favorite and underlying file', async () => {
  const d = await create();
  await user(manager);
  await operation('object.get_authenticated');
  expect(
    (await db.query('select id from public.documents where favorite and not archived')).rows,
  ).toEqual([{ id: d.id }]);
  expect(
    (await db.query("select name from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([{ name: d.path }]);
});
it('owners-only denies metadata and file to manager', async () => {
  await create({ access_level: 'OWNERS' });
  await user(manager);
  await operation('object.get_authenticated');
  expect((await db.query('select * from public.documents')).rows).toEqual([]);
  expect(
    (await db.query("select * from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([]);
});
it('access revocation removes file access immediately and prevents signed URL minting', async () => {
  const d = await create();
  await operation('object.sign');
  expect(
    (await db.query("select * from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([]);
  await save(d.id, 2, values({ access_level: 'OWNERS' }));
  await user(manager);
  await operation('object.get_authenticated');
  expect((await db.query('select * from public.documents')).rows).toEqual([]);
  expect(
    (await db.query("select * from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([]);
});
it('selected staff access follows UUID and requires an active account', async () => {
  const d = await create({ access_level: 'SELECTED', selected_users: [manager] });
  await db.exec("reset role;update public.profiles set role='CREW' where id='" + manager + "'");
  await user(manager);
  expect((await db.query('select id from public.documents')).rows).toEqual([{ id: d.id }]);
  await db.exec("reset role;update public.profiles set active=false where id='" + manager + "'");
  await user(manager);
  expect((await db.query('select * from public.documents')).rows).toEqual([]);
});
it('managers-only excludes crew', async () => {
  await create({ access_level: 'MANAGERS' });
  await db.exec("reset role;update public.profiles set role='CREW' where id='" + manager + "'");
  await user(manager);
  expect((await db.query('select * from public.documents')).rows).toEqual([]);
});
it('archive removes from active favorites, retains history and restores', async () => {
  const d = await create();
  await save(d.id, 2, values({ archived: true }));
  expect((await db.query('select id from public.documents where not archived')).rows).toEqual([]);
  expect((await db.query('select id from public.documents where archived')).rows).toEqual([
    { id: d.id },
  ]);
  await save(d.id, 3, values());
  expect((await db.query('select id from public.documents where not archived')).rows).toEqual([
    { id: d.id },
  ]);
  expect((await db.query('select * from public.document_history($1)', [d.id])).rows.length).toBe(6);
});
it('manager cannot edit existing access', async () => {
  const d = await create();
  await user(manager);
  await expect(save(d.id, 2, values({ access_level: 'OWNERS' }))).rejects.toThrow('FORBIDDEN');
});
it('replacement keeps original upload identity, versions and audits', async () => {
  const d = await create();
  const before = (
    await db.query('select uploaded_by,uploaded_at from public.documents where id=$1', [d.id])
  ).rows[0];
  const next = crypto.randomUUID();
  await save(
    d.id,
    2,
    values({
      title: 'Renamed checklist',
      description: 'Updated instructions',
      favorite: false,
      expiry_date: '2026-10-02',
    }),
    { id: next, content_type: 'image/png', byte_size: 200, sha256: 'b'.repeat(64) },
  );
  await operation('object.upload');
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('documents',$1,$2)", [
    d.id + '/' + next,
    JSON.stringify({ size: 200, mimetype: 'image/png' }),
  ]);
  await completeFile(next);
  expect(
    (await db.query('select uploaded_by,uploaded_at from public.documents where id=$1', [d.id]))
      .rows[0],
  ).toEqual(before);
  expect((await db.query('select id from public.document_files')).rows).toHaveLength(2);
  await user(manager);
  await operation('object.get_authenticated');
  expect(
    (await db.query("select name from storage.objects where bucket_id='documents'")).rows,
  ).toEqual([{ name: d.id + '/' + next }]);
});
it('rejects stale edits', async () => {
  const d = await create();
  await expect(save(d.id, 1)).rejects.toThrow('DOCUMENT_STALE');
});
it('does not allow direct metadata writes', async () => {
  const d = await create();
  await expect(
    db.query("update public.documents set access_level='STAFF' where id=$1", [d.id]),
  ).rejects.toThrow('permission denied');
});
it('file deletion and overwrite are denied', async () => {
  await create();
  await operation('object.delete');
  expect(
    (await db.query("delete from storage.objects where bucket_id='documents' returning id")).rows,
  ).toEqual([]);
  await operation('object.upload_update');
  expect(
    (
      await db.query(
        "update storage.objects set metadata='{}' where bucket_id='documents' returning id",
      )
    ).rows,
  ).toEqual([]);
});
it('normal application users cannot erase audit history', async () => {
  await create();
  await expect(db.exec('delete from public.audit_events')).rejects.toThrow();
});
it('preserves immutable document upload time', async () => {
  await create();
  await db.exec('reset role');
  await expect(db.exec("update public.documents set uploaded_at='1990-01-01'")).rejects.toThrow(
    'IMMUTABLE_HISTORY',
  );
});
it('file reservation is atomic and cannot publish missing bytes', async () => {
  const d = crypto.randomUUID();
  await save(d, 0, values(), {
    id: d,
    content_type: 'application/pdf',
    byte_size: 100,
    sha256: 'a'.repeat(64),
  });
  await expect(completeFile(d)).rejects.toThrow('DOCUMENT_INCOMPLETE');
});

it('manager uploads a private document, retries safely, completes and cannot elevate access', async () => {
  await create({ access_level: 'OWNERS' });
  await user(manager);
  const id = crypto.randomUUID(),
    file = crypto.randomUUID(),
    request = crypto.randomUUID();
  const v = values({ favorite: false, access_level: 'MANAGERS' }),
    f = { id: file, content_type: 'image/jpeg', byte_size: 100, sha256: 'a'.repeat(64) };
  await save(id, 0, v, f, request);
  await save(id, 0, v, f, request);
  await operation('object.upload');
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('documents',$1,$2)", [
    id + '/' + file,
    JSON.stringify({ size: 100, mimetype: 'image/jpeg' }),
  ]);
  await operation('object.get_authenticated');
  expect((await db.query('select id from public.documents')).rows).toEqual([{ id }]);
  await completeFile(file);
  const r = await db.query<{ uploaded_by: string; uploaded_at: string }>(
    'select uploaded_by,uploaded_at from public.documents where id=$1',
    [id],
  );
  expect(r.rows[0].uploaded_by).toBe(manager);
  expect(r.rows[0].uploaded_at).toBeTruthy();
  await expect(save(id, 2, values({ access_level: 'STAFF' }))).rejects.toThrow('FORBIDDEN');
});
it('manager cannot publish new documents with Owner permissions', async () => {
  await user(manager);
  await expect(
    save(crypto.randomUUID(), 0, values({ access_level: 'STAFF' }), {
      id: crypto.randomUUID(),
      content_type: 'image/jpeg',
      byte_size: 10,
      sha256: 'a'.repeat(64),
    }),
  ).rejects.toThrow('FORBIDDEN');
});
const endpoint = 'https://fcm.googleapis.com/fcm/send/fixture-endpoint';
async function subscribe() {
  await db.query('select public.save_push_subscription($1,$2,$3)', [
    endpoint,
    'a'.repeat(87),
    'a'.repeat(22),
  ]);
}
it('push subscriptions are private, self-only and cannot be stolen', async () => {
  await subscribe();
  expect(
    (await db.query('select public.has_push_subscription($1) enabled', [endpoint])).rows,
  ).toEqual([{ enabled: true }]);
  await user(manager);
  await db.query('select public.remove_push_subscription($1)', [endpoint]);
  expect(
    (await db.query('select public.has_push_subscription($1) enabled', [endpoint])).rows,
  ).toEqual([{ enabled: false }]);
  await expect(subscribe()).rejects.toThrow('SUBSCRIPTION_CONFLICT');
});
it('anonymous/operational clients cannot dispatch reminders or read private subscriptions', async () => {
  await expect(db.query('select public.claim_due_push()')).rejects.toThrow();
});
it('due task delivery claims are unique per device occurrence and exclude completed tasks', async () => {
  await subscribe();
  await db.exec('reset role;update private.push_subscriptions set mobile_pwa=true');
  const task = crypto.randomUUID();
  await db.query(
    "insert into public.tasks(id,title,type_code,assignee_id,created_by,updated_by,remind_at) values($1,'Private title','TASK',$2,$2,$2,now())",
    [task, owner],
  );
  const a = await db.query<{ r: { id: string; task: string; claim_token: string } }>(
    'select public.claim_due_push() r',
  );
  expect(a.rows[0].r.task).toBe(task);
  expect(JSON.stringify(a.rows)).toContain('Private title');
  expect((await db.query('select public.claim_due_push() r')).rows).toEqual([{ r: null }]);
  await db.query("select public.finish_push($1,'EXPIRED',$2,$3)", [
    a.rows[0].r.id,
    endpoint,
    a.rows[0].r.claim_token,
  ]);
  expect((await db.query('select * from private.push_subscriptions')).rows).toEqual([]);
});
it('unassigned reminders go to creator, completed and inactive users get no push', async () => {
  await subscribe();
  await db.exec('reset role;update private.push_subscriptions set mobile_pwa=true');
  const task = crypto.randomUUID();
  await db.query(
    "insert into public.tasks(id,title,type_code,created_by,updated_by,remind_at,status) values($1,'Fixture','TASK',$2,$2,now(),'DONE')",
    [task, owner],
  );
  expect((await db.query('select public.claim_due_push() r')).rows).toEqual([{ r: null }]);
  await db.query("update public.tasks set status='IN_PROGRESS' where id=$1", [task]);
  await db.query('update public.profiles set active=false where id=$1', [owner]);
  expect((await db.query('select public.claim_due_push() r')).rows).toEqual([{ r: null }]);
});

it('category visual metadata is nullable, constrained, audited and Owner-only', async () => {
  const before = await db.query<{
    id: string;
    name_en: string;
    name_es: string;
    active: boolean;
    icon_key: string | null;
    accent_key: string | null;
  }>('select * from public.categories order by id');
  expect(before.rows.length).toBeGreaterThan(0);
  const c = before.rows[0];
  expect(c.icon_key).toBeNull();
  expect(c.accent_key).toBeNull();
  await db.query("update public.categories set icon_key='waves',accent_key='teal' where id=$1", [
    c.id,
  ]);
  const after = (
    await db.query(
      'select name_en,name_es,active,icon_key,accent_key from public.categories where id=$1',
      [c.id],
    )
  ).rows[0];
  expect(after).toEqual({
    name_en: c.name_en,
    name_es: c.name_es,
    active: c.active,
    icon_key: 'waves',
    accent_key: 'teal',
  });
  const audit = await db.query<{ after_data: { icon_key?: string } }>(
    "select after_data from public.audit_events where entity_type='categories' and entity_id=$1 order by created_at desc",
    [c.id],
  );
  expect(
    audit.rows.some((r) => (r.after_data as { icon_key?: string })?.icon_key === 'waves'),
  ).toBe(true);
  const created = await db.query<{ icon_key: string; accent_key: string }>(
    "insert into public.categories(name_en,name_es,icon_key,accent_key) values('Equipment','Equipo','box','sand') returning icon_key,accent_key",
  );
  expect(created.rows[0]).toEqual({ icon_key: 'box', accent_key: 'sand' });
  await user(manager);
  const changed = await db.query(
    "update public.categories set accent_key='coral' where id=$1 returning id",
    [c.id],
  );
  expect(changed.rows).toHaveLength(0);
});
it('category whitelist rejects arbitrary icon names and CSS values', async () => {
  await db.exec('savepoint invalid_visual');
  await expect(
    db.query(
      "insert into public.categories(name_en,name_es,icon_key) values('Fixture','Ejemplo','javascript:alert(1)')",
    ),
  ).rejects.toThrow();
  await db.exec('rollback to savepoint invalid_visual');
  await expect(
    db.query(
      "insert into public.categories(name_en,name_es,accent_key) values('Fixture','Ejemplo','#ffffff')",
    ),
  ).rejects.toThrow();
  await db.exec('rollback to savepoint invalid_visual');
});

it.each(['complete_document_file', 'complete_intake', 'complete_receipt'])(
  'rejects direct authenticated %s even with a forged actor',
  async (name) => {
    for (const actor of [owner, manager]) {
      await user(actor);
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('authenticated',$1,'EXECUTE') allowed",
            ['public.' + name + '(uuid,uuid)'],
          )
        ).rows[0].allowed,
      ).toBe(false);
      await db.exec('savepoint denied');
      await expect(
        db.query(`select public.${name}($1,$2)`, [crypto.randomUUID(), actor]),
      ).rejects.toThrow('permission denied');
      await db.exec('rollback to savepoint denied');
    }
  },
);

type Delivery = { id: string; claim_token: string };
async function dueDelivery() {
  await subscribe();
  await db.exec('reset role;update private.push_subscriptions set mobile_pwa=true');
  await db.query(
    "insert into public.tasks(id,title,type_code,created_by,updated_by,remind_at) values($1,'Retry fixture','TASK',$2,$2,now())",
    [crypto.randomUUID(), owner],
  );
  return claimDelivery();
}
async function claimDelivery() {
  return (await db.query<{ r: Delivery | null }>('select public.claim_due_push() r')).rows[0].r!;
}
async function finishDelivery(d: Delivery, outcome: string) {
  await db.query('select public.finish_push($1,$2,$3,$4)', [
    d.id,
    outcome,
    endpoint,
    d.claim_token,
  ]);
}
it('transient failure backs off, retries and never resends after success', async () => {
  const first = await dueDelivery();
  await finishDelivery(first, 'FAILED');
  expect(await claimDelivery()).toBeNull();
  await db.exec("update private.push_deliveries set next_attempt_at=now()-interval '1 second'");
  const retry = await claimDelivery();
  expect(retry.id).toBe(first.id);
  expect(retry.claim_token).not.toBe(first.claim_token);
  await finishDelivery(first, 'EXPIRED');
  expect((await db.query('select * from private.push_subscriptions')).rows).toHaveLength(1);
  await finishDelivery(retry, 'SENT');
  expect(await claimDelivery()).toBeNull();
});
it('abandoned claims recover after lease and attempts are bounded', async () => {
  let d = await dueDelivery();
  for (let i = 1; i < 5; i++) {
    expect(await claimDelivery()).toBeNull();
    await db.exec("update private.push_deliveries set lease_until=now()-interval '1 second'");
    const next = await claimDelivery();
    expect(next.id).toBe(d.id);
    expect(next.claim_token).not.toBe(d.claim_token);
    d = next;
  }
  await db.exec("update private.push_deliveries set lease_until=now()-interval '1 second'");
  expect(await claimDelivery()).toBeNull();
  expect(
    (await db.query('select delivery_state,attempts from private.push_deliveries')).rows,
  ).toEqual([{ delivery_state: 'EXHAUSTED', attempts: 5 }]);
});
it('overlapping claims do not acquire the same live lease', async () => {
  const first = await dueDelivery();
  expect(first).toBeTruthy();
  expect(await Promise.all([claimDelivery(), claimDelivery(), claimDelivery()])).toEqual([
    null,
    null,
    null,
  ]);
});

it('all old single-argument finalizers are inaccessible in the private schema', async () => {
  await db.exec('reset role');
  for (const name of ['complete_document_file', 'complete_intake', 'complete_receipt'])
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated',$1,'EXECUTE') allowed",
          ['private.' + name + '(uuid)'],
        )
      ).rows[0].allowed,
    ).toBe(false);
});

it('one user with multiple devices gets an independent lease for each device', async () => {
  const first = await dueDelivery();
  await db.query(
    "insert into private.push_subscriptions(endpoint,user_id,p256dh,auth_key,mobile_pwa,created_at) values($1,$2,$3,$4,true,now()-interval '1 hour')",
    [endpoint + 'second', owner, 'a'.repeat(87), 'a'.repeat(22)],
  );
  const second = await claimDelivery();
  expect(second.id).not.toBe(first.id);
  expect(await claimDelivery()).toBeNull();
  await finishDelivery(first, 'SENT');
  expect(await claimDelivery()).toBeNull();
});

it.each([owner, manager])(
  '30 MiB reservation works for authorized actor %s and finalization remains service-only',
  async (actor) => {
    await user(actor);
    const id = crypto.randomUUID(),
      file = crypto.randomUUID();
    await save(id, 0, values({ favorite: false, access_level: 'MANAGERS' }), {
      id: file,
      content_type: 'application/pdf',
      byte_size: 31457280,
      sha256: 'a'.repeat(64),
    });
    await db.exec('savepoint blocked');
    await expect(
      db.query('select public.complete_document_file($1,$2)', [file, actor]),
    ).rejects.toThrow(/permission denied/);
    await db.exec('rollback to savepoint blocked');
    await db.exec('savepoint oversized');
    await expect(
      save(crypto.randomUUID(), 0, values({ favorite: false, access_level: 'MANAGERS' }), {
        id: crypto.randomUUID(),
        content_type: 'application/pdf',
        byte_size: 31457281,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/INVALID_INPUT/);
    await db.exec('rollback to savepoint oversized');
    await db.exec('reset role');
    const bucket = (
      await db.query<{ file_size_limit: number; allowed_mime_types: string[] }>(
        "select * from storage.buckets where id='documents'",
      )
    ).rows[0];
    expect(Number(bucket.file_size_limit)).toBe(31457280);
    expect(bucket.allowed_mime_types.sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  },
);
