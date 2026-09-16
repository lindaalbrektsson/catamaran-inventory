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
  await db.exec(
    "create function storage.allow_only_operation(p text) returns boolean language sql stable as $$select current_setting('storage.operation',true)=p$$",
  );
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

async function create(
  recurrence = 'NONE',
  due = '2020-01-01',
  time: string | null = null,
  weekday: number | null = null,
  monthday: number | null = null,
) {
  const id = crypto.randomUUID();
  await db.query('select public.create_maintenance($1,$2,$3,$4,$5,$6,$7,$8)', [
    id,
    'Fixture ' + recurrence,
    recurrence,
    recurrence === 'CUSTOM' ? 10 : null,
    recurrence === 'NONE' ? null : due,
    time,
    weekday,
    monthday,
  ]);
  return id;
}
async function plan(id: string) {
  await db.query('select public.plan_maintenance($1)', [[id]]);
  return (
    await db.query<{ id: string; version: number; status: string }>(
      "select * from public.maintenance_occurrences where task_id=$1 and status<>'DONE'",
      [id],
    )
  ).rows[0];
}
async function progress(
  id: string,
  version: number,
  status: string,
  assignee: string | null = null,
  manual = '',
  remaining = '',
) {
  await db.query('select public.update_maintenance($1,$2,$3,$4,$5,$6)', [
    id,
    version,
    status,
    assignee,
    manual,
    remaining,
  ]);
}
async function reject(fn: () => Promise<unknown>, message: string) {
  await db.exec('savepoint reject_attempt');
  await expect(fn()).rejects.toThrow(message);
  await db.exec('rollback to savepoint reject_attempt');
}
const voice = { content_type: 'audio/webm', byte_size: 100, sha256: 'b'.repeat(64), duration: 1 };
const photo = { content_type: 'image/png', byte_size: 80, sha256: 'a'.repeat(64) };
async function entry(
  task: string,
  occurrence: string | null,
  body = '',
  v: unknown = voice,
  f: unknown = null,
) {
  const id = crypto.randomUUID();
  await db.query('select public.prepare_task_update($1,$2,$3,$4,$5,$6)', [
    id,
    task,
    occurrence,
    body,
    f === null ? null : JSON.stringify(f),
    v === null ? null : JSON.stringify(v),
  ]);
  return id;
}
async function ordinary(privateReminder = false) {
  const id = crypto.randomUUID();
  await db.query("select public.manage_task($1,$2,0,'SAVE',$3)", [
    crypto.randomUUID(),
    id,
    JSON.stringify({
      title: 'Isolated task',
      type_code: 'TASK',
      status: 'NEED_REVIEW',
      assignee_id: owner,
      remind_at: privateReminder ? '2030-01-01T12:00:00Z' : null,
      subtasks: [],
    }),
  ]);
  return id;
}
async function upload(id: string, kind: string, f: typeof photo) {
  await db.query("select set_config('storage.operation','object.upload',false)");
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('task-update-files',$1,$2)",
    [id + '/' + kind, JSON.stringify({ size: f.byte_size, mimetype: f.content_type })],
  );
}
it.each([owner, manager])(
  'supported UUID %s can create voice-only and photo+voice updates',
  async (actor) => {
    const task = await create(),
      o = await plan(task);
    await user(actor);
    const id = await entry(task, o.id);
    await upload(id, 'voice', voice);
    await reject(
      () => db.query('select public.finish_task_update($1,$2,1)', [id, actor]),
      'permission denied',
    );
    await db.exec('reset role');
    await db.query('select public.finish_task_update($1,$2,0.75)', [id, actor]);
    await user(actor);
    const rows = (
      await db.query<{ voice: { duration: number }; created_by: string; ready: boolean }>(
        'select * from public.task_updates where id=$1',
        [id],
      )
    ).rows;
    expect(rows[0]).toMatchObject({ voice: { duration: 0.75 }, created_by: actor, ready: true });
    const both = await entry(task, o.id, '', voice, photo);
    await upload(both, 'voice', voice);
    await upload(both, 'photo', photo);
    await db.exec('reset role');
    await db.query('select public.finish_task_update($1,$2,1)', [both, actor]);
    expect((await db.query('select * from public.task_updates where ready')).rows).toHaveLength(2);
  },
);
it('ordinary Tasks accept text+voice and photo-only; old photo history remains intact', async () => {
  const task = await ordinary();
  await entry(task, null, 'Checked', voice);
  await entry(task, null, '', null, photo);
  const mt = await create(),
    o = await plan(mt);
  await db.query('select public.add_maintenance_update($1,$2,$3,$4)', [
    crypto.randomUUID(),
    o.id,
    'Existing photo',
    JSON.stringify(photo),
  ]);
  expect((await db.query('select * from public.maintenance_updates')).rows).toHaveLength(1);
});
it.each([
  { ...voice, content_type: 'text/html' },
  { ...voice, byte_size: 5242881 },
  { ...voice, duration: 181 },
  { ...voice, duration: 0 },
])('rejects invalid audio metadata %j', async (v) => {
  const task = await ordinary();
  await reject(() => entry(task, null, '', v), 'INVALID_INPUT');
});
it('private reminders prevent another manager from reading files or adding updates', async () => {
  const task = await ordinary(true),
    id = await entry(task, null);
  await upload(id, 'voice', voice);
  await db.exec('reset role');
  await db.query('select public.finish_task_update($1,$2,1)', [id, owner]);
  await user(manager);
  expect((await db.query('select * from public.task_updates')).rows).toHaveLength(0);
  await db.query("select set_config('storage.operation','object.get_authenticated',false)");
  expect(
    (await db.query("select * from storage.objects where bucket_id='task-update-files'")).rows,
  ).toHaveLength(0);
  await reject(() => entry(task, null), 'FORBIDDEN');
  await db.exec('reset role;set role anon');
  await reject(() => db.query('select * from public.task_updates'), 'permission denied');
});
it('publication is atomic; files remain private, immutable and audited after reload', async () => {
  const task = await ordinary(),
    id = await entry(task, null, 'Photo and voice', voice, photo);
  await upload(id, 'voice', voice);
  await user(manager);
  expect((await db.query('select * from public.task_updates')).rows).toHaveLength(0);
  await db.exec('reset role');
  await reject(
    () => db.query('select public.finish_task_update($1,$2,1)', [id, owner]),
    'UPLOAD_INCOMPLETE',
  );
  await user(owner);
  await upload(id, 'photo', photo);
  await db.exec('reset role');
  await db.query('select public.finish_task_update($1,$2,1)', [id, owner]);
  await reject(
    () => db.query("update public.task_updates set body='changed' where id=$1", [id]),
    'IMMUTABLE_HISTORY',
  );
  await reject(() => db.query('delete from public.task_updates where id=$1', [id]), 'IMMUTABLE');
  expect(
    (
      await db.query(
        "select * from public.audit_events where entity_type='task_updates' and entity_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(2);
  await user(manager);
  await db.query("select set_config('storage.operation','object.get_authenticated',false)");
  expect(
    (await db.query("select * from storage.objects where bucket_id='task-update-files'")).rows,
  ).toHaveLength(2);
  await db.query("select set_config('storage.operation','object.sign',false)");
  expect(
    (await db.query("select * from storage.objects where bucket_id='task-update-files'")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query('select * from public.task_updates where id=$1', [id])).rows[0],
  ).toMatchObject({ body: 'Photo and voice', ready: true, created_by: owner });
});
it('inactive users, closed occurrences and archived tasks reject uploads', async () => {
  const task = await ordinary();
  await db.exec('reset role');
  await db.query('update public.tasks set archived=true where id=$1', [task]);
  await user(owner);
  await reject(() => entry(task, null), 'FORBIDDEN');
  const mt = await create(),
    o = await plan(mt);
  await progress(o.id, 1, 'IN_PROGRESS');
  await progress(o.id, 2, 'READY');
  await progress(o.id, 3, 'DONE');
  await reject(() => entry(mt, o.id), 'FORBIDDEN');
  await db.exec('reset role');
  await db.query('update public.profiles set active=false where id=$1', [manager]);
  await user(manager);
  expect((await db.query('select * from public.task_updates')).rows).toHaveLength(0);
});
