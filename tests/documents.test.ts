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
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',phone text,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
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
  await db.query('select public.complete_document_file($1)', [file]);
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
it('manager cannot upload or edit access', async () => {
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
  await db.query('select public.complete_document_file($1)', [next]);
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
  await expect(db.query('select public.complete_document_file($1)', [d])).rejects.toThrow(
    'DOCUMENT_INCOMPLETE',
  );
});
