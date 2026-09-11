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
it('inactive staff cannot read task types or call task RPCs', async () => {
  await db.exec("reset role;update public.profiles set active=false where id='" + manager + "'");
  await user(manager);
  expect((await db.query('select * from public.task_types')).rows).toEqual([]);
  await expect(mutate(crypto.randomUUID(), 0, 'SAVE', values())).rejects.toThrow('FORBIDDEN');
});
it('completion fields cannot be supplied during task creation', async () => {
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', {
    ...v,
    subtasks: [
      { ...v.subtasks[0], completed: true, completed_by: manager, completed_at: '1990-01-01' },
    ],
  });
  expect(
    (await db.query('select completed,completed_by,completed_at from public.task_subtasks'))
      .rows[0],
  ).toEqual({ completed: false, completed_by: null, completed_at: null });
});
it('links to real related tasks and locations using stable foreign keys', async () => {
  const parent = crypto.randomUUID(),
    child = crypto.randomUUID();
  await mutate(parent, 0, 'SAVE', values());
  await mutate(child, 0, 'SAVE', {
    ...values(),
    related_task_id: parent,
    location_id: '10000000-0000-4000-8000-000000000003',
  });
  expect(await row(child)).toMatchObject({
    related_task_id: parent,
    location_id: '10000000-0000-4000-8000-000000000003',
  });
});
it('rejects hard deletion of task history', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', values());
  await db.exec('reset role');
  await expect(db.query('delete from public.tasks where id=$1', [id])).rejects.toThrow();
});
const values = () => ({
  title: 'Check engine',
  description: '',
  type_code: 'MAINTENANCE',
  status: 'NEED_REVIEW',
  assignee_id: manager,
  due_date: '2026-10-01',
  remind_at: '2026-10-01T14:00:00Z',
  subtasks: [{ id: crypto.randomUUID(), title: 'Check oil' }],
});
async function mutate(
  id: string,
  version: number,
  action: string,
  v: object,
  request = crypto.randomUUID(),
) {
  return db.query<Record<string, unknown>>('select public.manage_task($1,$2,$3,$4,$5)', [
    request,
    id,
    version,
    action,
    JSON.stringify(v),
  ]);
}
async function row(id: string) {
  return (await db.query<Record<string, unknown>>('select * from public.tasks where id=$1', [id]))
    .rows[0];
}
it('creates assigned tasks with due dates, reminders and server-owned audit fields', async () => {
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', { ...v, created_by: manager, created_at: '1990-01-01' });
  expect(await row(id)).toMatchObject({
    title: v.title,
    status: 'NEED_REVIEW',
    assignee_id: manager,
    created_by: owner,
    updated_by: owner,
    version: 1,
  });
  const history = await db.query<Record<string, unknown>>('select * from public.task_history($1)', [
    id,
  ]);
  expect(history.rows).toHaveLength(2);
  expect(history.rows.every((x) => x.actor_id === owner)).toBe(true);
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select due_date::text,remind_at::text from public.tasks where id=$1',
        [id],
      )
    ).rows[0],
  ).toMatchObject({ due_date: '2026-10-01', remind_at: '2026-10-01 14:00:00+00' });
});
it('manager can create, assign and edit operational tasks', async () => {
  await user(manager);
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v);
  await mutate(id, 1, 'SAVE', {
    ...v,
    title: 'Check wiring',
    assignee_id: owner,
    due_date: '2026-10-02',
    remind_at: '',
  });
  expect(await row(id)).toMatchObject({
    title: 'Check wiring',
    assignee_id: owner,
    updated_by: manager,
    version: 2,
    remind_at: null,
  });
  const h = (await db.query<Record<string, unknown>>('select * from public.task_history($1)', [id]))
    .rows;
  expect(h.some((x) => x.before_data && x.after_data)).toBe(true);
});
it('records subtask completion and reversal without losing history', async () => {
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v);
  await user(manager);
  await mutate(id, 1, 'SUBTASK', { subtask_id: v.subtasks[0].id, completed: true });
  expect(
    (await db.query<Record<string, unknown>>('select * from public.task_subtasks')).rows[0],
  ).toMatchObject({
    completed: true,
    completed_by: manager,
  });
  await mutate(id, 2, 'SUBTASK', { subtask_id: v.subtasks[0].id, completed: false });
  expect(
    (await db.query<Record<string, unknown>>('select * from public.task_subtasks')).rows[0],
  ).toMatchObject({
    completed: false,
    completed_by: null,
    completed_at: null,
  });
  expect(
    (await db.query<Record<string, unknown>>('select * from public.task_history($1)', [id])).rows,
  ).toHaveLength(6);
});
it('assigned crew can update status but cannot create or administer tasks', async () => {
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v);
  await db.exec("reset role;update public.profiles set role='CREW' where id='" + manager + "'");
  await user(manager);
  expect(await row(id)).toBeTruthy();
  await mutate(id, 1, 'STATUS', { status: 'IN_PROGRESS' });
  expect(await row(id)).toMatchObject({ status: 'IN_PROGRESS' });
  await expect(mutate(crypto.randomUUID(), 0, 'SAVE', v)).rejects.toThrow('FORBIDDEN');
});
it('unassigned crew cannot read or mutate another task', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', { ...values(), assignee_id: owner });
  await db.exec("reset role;update public.profiles set role='CREW' where id='" + manager + "'");
  await user(manager);
  expect(await row(id)).toBeUndefined();
  expect(
    (await db.query<Record<string, unknown>>('select * from public.task_history($1)', [id])).rows,
  ).toEqual([]);
  await expect(mutate(id, 1, 'STATUS', { status: 'DONE' })).rejects.toThrow('FORBIDDEN');
});
it('manager cannot archive', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', values());
  await user(manager);
  await expect(mutate(id, 1, 'ARCHIVE', { archived: true })).rejects.toThrow('FORBIDDEN');
});
it('owner can archive and restore while retaining all history', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', values());
  await mutate(id, 1, 'ARCHIVE', { archived: true });
  expect(await row(id)).toMatchObject({ archived: true });
  await mutate(id, 2, 'ARCHIVE', { archived: false });
  expect(
    (await db.query<Record<string, unknown>>('select * from public.task_history($1)', [id])).rows,
  ).toHaveLength(4);
});
it('rejects direct writes even for owner', async () => {
  await expect(
    db.query<Record<string, unknown>>(
      "insert into public.tasks(id,title,type_code,created_by,updated_by) values(gen_random_uuid(),'Bypass','TASK',$1,$1)",
      [owner],
    ),
  ).rejects.toThrow('permission denied');
});
it('preserves immutable creation history', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', values());
  await db.exec('reset role');
  await expect(
    db.query<Record<string, unknown>>(
      "update public.tasks set created_at='1990-01-01' where id=$1",
      [id],
    ),
  ).rejects.toThrow('IMMUTABLE_HISTORY');
});
it('rejects stale edits and prevents lost updates', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', values());
  await mutate(id, 1, 'STATUS', { status: 'DONE' });
  await expect(mutate(id, 1, 'STATUS', { status: 'IN_PROGRESS' })).rejects.toThrow('TASK_STALE');
});
it('retries the same request without duplicate audit events', async () => {
  const id = crypto.randomUUID(),
    v = values(),
    r = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', v, r);
  await mutate(id, 0, 'SAVE', v, r);
  expect(
    (await db.query<Record<string, unknown>>('select * from public.task_history($1)', [id])).rows,
  ).toHaveLength(2);
});
it('rolls back the whole task if a subtask is invalid', async () => {
  const id = crypto.randomUUID();
  await db.exec('savepoint invalid');
  await expect(
    mutate(id, 0, 'SAVE', { ...values(), subtasks: [{ id: crypto.randomUUID(), title: '' }] }),
  ).rejects.toThrow('INVALID_INPUT');
  await db.exec('rollback to savepoint invalid');
  expect(await row(id)).toBeUndefined();
});
it('does not allow subtasks to be removed from history', async () => {
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v);
  await expect(mutate(id, 1, 'SAVE', { ...v, subtasks: [] })).rejects.toThrow('IMMUTABLE_HISTORY');
});
