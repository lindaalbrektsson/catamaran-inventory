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
async function rule(id: string) {
  return (
    await db.query<{ next_due: string | null; last_completed: string | null }>(
      'select next_due::text,last_completed::text from public.maintenance_rules where task_id=$1',
      [id],
    )
  ).rows[0];
}
it.each(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])(
  'creates %s template without generating future occurrences',
  async (kind) => {
    const id = await create(kind);
    expect((await db.query('select id from public.tasks where id=$1', [id])).rows).toHaveLength(1);
    expect((await db.query('select * from public.maintenance_occurrences')).rows).toHaveLength(0);
    if (kind !== 'NONE') expect((await rule(id)).next_due).toBeTruthy();
  },
);
it('plan selects only chosen due/pending work, remains idempotent, and rejects future work atomically', async () => {
  const due = await create('DAILY'),
    pending = await create(),
    future = await create('DAILY', '2099-01-01'),
    untouched = await create();
  await db.query('select public.plan_maintenance($1)', [[due, pending]]);
  await db.query('select public.plan_maintenance($1)', [[due, pending]]);
  expect((await db.query('select * from public.maintenance_occurrences')).rows).toHaveLength(2);
  await reject(
    () => db.query('select public.plan_maintenance($1)', [[untouched, future]]),
    'NOT_DUE',
  );
  expect((await db.query('select * from public.maintenance_occurrences')).rows).toHaveLength(2);
});
it.each(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])(
  '%s stays due through Ready and advances only on Done, retaining completed history',
  async (kind) => {
    const id = await create(kind),
      initial = await rule(id),
      o = await plan(id);
    await progress(o.id, 1, 'IN_PROGRESS', null, 'Charlie', 'Install hinge');
    expect(await rule(id)).toEqual(initial);
    await progress(o.id, 2, 'READY', manager);
    expect(await rule(id)).toEqual(initial);
    await progress(o.id, 3, 'DONE', manager);
    const final = await rule(id);
    expect(final.last_completed).toBeTruthy();
    expect(final.next_due! > '2020-01-01').toBe(true);
    expect(
      (
        await db.query(
          'select status,manual_assignee,completed_by from public.maintenance_occurrences where id=$1',
          [o.id],
        )
      ).rows,
    ).toEqual([{ status: 'DONE', manual_assignee: '', completed_by: owner }]);
    await reject(() => progress(o.id, 4, 'IN_PROGRESS'), 'IMMUTABLE_HISTORY');
    await db.exec('reset role');
    await db.query("update public.maintenance_rules set next_due='2020-01-01' where task_id=$1", [
      id,
    ]);
    await user(manager);
    const second = await plan(id);
    expect(second.id).not.toBe(o.id);
    await progress(second.id, 1, 'IN_PROGRESS', null, 'External mechanic');
    expect(
      (await db.query('select * from public.maintenance_occurrences where task_id=$1', [id])).rows,
    ).toHaveLength(2);
  },
);
it('one-time completion closes template and cannot be planned again', async () => {
  const id = await create(),
    o = await plan(id);
  await progress(o.id, 1, 'IN_PROGRESS');
  await progress(o.id, 2, 'READY');
  await progress(o.id, 3, 'DONE');
  expect((await rule(id)).next_due).toBeNull();
  await reject(() => plan(id), 'FORBIDDEN');
});
it('manual assignees are occurrence text only and create no users or subscriptions', async () => {
  const id = await create(),
    o = await plan(id);
  await progress(o.id, 1, 'IN_PROGRESS', null, 'Samuel', 'Waiting for part');
  await db.exec('reset role');
  expect((await db.query('select * from auth.users')).rows).toHaveLength(2);
  expect((await db.query('select * from private.push_subscriptions')).rows).toHaveLength(0);
});
it('updates and remaining changes are chronological, immutable and audited by real UUID', async () => {
  const id = await create(),
    o = await plan(id);
  await user(manager);
  await progress(o.id, 1, 'IN_PROGRESS', null, 'Charlie', 'Buy hinge');
  const update = crypto.randomUUID();
  await db.query('select public.add_maintenance_update($1,$2,$3,null)', [
    update,
    o.id,
    'Removed old hinge',
  ]);
  await progress(o.id, 2, 'IN_PROGRESS', null, 'Charlie', 'Install hinge');
  const h = (
    await db.query<{ actor_id: string; before_data: unknown }>(
      'select * from public.maintenance_history($1)',
      [id],
    )
  ).rows;
  expect(h.filter((x) => x.actor_id === manager).length).toBeGreaterThanOrEqual(3);
  await db.exec('reset role');
  await reject(
    () => db.query("update public.maintenance_updates set body='rewrite' where id=$1", [update]),
    'IMMUTABLE_HISTORY',
  );
  await reject(
    () => db.query('delete from public.maintenance_occurrences where id=$1', [o.id]),
    'IMMUTABLE',
  );
});
it('weekly/monthly Belize calendar anchors and month-end clamping are stable', async () => {
  await db.exec('reset role');
  const r = await db.query<{ d: string }>(
    "select private.maintenance_next_date('WEEKLY',null,1,null,date '2026-09-23')::text d union all select private.maintenance_next_date('MONTHLY',null,null,1,date '2026-09-23')::text union all select private.maintenance_next_date('MONTHLY',null,null,31,date '2027-01-31')::text union all select private.maintenance_next_date('MONTHLY',null,null,31,date '2027-02-28')::text",
  );
  expect(r.rows.map((x) => x.d)).toEqual(['2026-09-28', '2026-10-01', '2027-02-28', '2027-03-31']);
});
it('stores explicit due times and normalizes the first weekly/monthly date', async () => {
  const weekly = await create('WEEKLY', '2026-09-16', '08:00', 1),
    monthly = await create('MONTHLY', '2026-09-16', '09:00', null, 1);
  expect((await rule(weekly)).next_due).toBe('2026-09-21');
  expect((await rule(monthly)).next_due).toBe('2026-10-01');
  expect(
    (
      await db.query<{ t: string }>(
        'select due_time::text t from public.maintenance_rules where task_id=$1',
        [weekly],
      )
    ).rows[0].t,
  ).toBe('08:00:00');
});
it('private photo reservation is not published until server completion; overwrite/signed access denied', async () => {
  const id = await create(),
    o = await plan(id),
    u = crypto.randomUUID();
  await db.query('select public.add_maintenance_update($1,$2,$3,$4)', [
    u,
    o.id,
    'Photo update',
    JSON.stringify({ content_type: 'image/jpeg', byte_size: 12, sha256: 'a'.repeat(64) }),
  ]);
  await db.query("select set_config('storage.operation','object.upload',false)");
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('maintenance-photos',$1,$2)",
    [u, JSON.stringify({ size: 12, mimetype: 'image/jpeg' })],
  );
  await reject(
    () => db.query('select public.finish_maintenance_photo($1,$2)', [u, owner]),
    'permission denied',
  );
  await db.exec('reset role');
  await db.query('select public.finish_maintenance_photo($1,$2)', [u, owner]);
  await user(manager);
  await db.query("select set_config('storage.operation','object.get_authenticated',false)");
  expect(
    (await db.query("select * from storage.objects where bucket_id='maintenance-photos'")).rows,
  ).toHaveLength(1);
  await db.query("select set_config('storage.operation','object.sign',false)");
  expect(
    (await db.query("select * from storage.objects where bucket_id='maintenance-photos'")).rows,
  ).toHaveLength(0);
});
it('only confirmed mobile subscriptions receive grouped due checks, at most one group per scheduler minute with no repeat occurrence', async () => {
  await create('DAILY');
  await create('WEEKLY');
  const endpoint = 'https://fcm.googleapis.com/fcm/send/mobile';
  await db.query('select public.save_push_subscription($1,$2,$3)', [
    endpoint,
    'a'.repeat(87),
    'b'.repeat(22),
  ]);
  await db.exec('reset role');
  expect((await db.query('select public.claim_due_maintenance_push() r')).rows).toEqual([
    { r: null },
  ]);
  await db.query('select public.confirm_mobile_push($1,$2)', [endpoint, owner]);
  const result = (
    await db.query<{ r: { count: number; id: string } }>(
      'select public.claim_due_maintenance_push() r',
    )
  ).rows[0].r;
  expect(result.count).toBe(2);
  expect((await db.query('select public.claim_due_maintenance_push() r')).rows).toEqual([
    { r: null },
  ]);
  await db.query("update private.maintenance_push_batches set created_at=now()-interval '2 hours'");
  expect((await db.query('select public.claim_due_maintenance_push() r')).rows).toEqual([
    { r: null },
  ]);
  await db.query("select public.finish_maintenance_push($1,'EXPIRED',$2)", [result.id, endpoint]);
  expect((await db.query('select * from private.push_subscriptions')).rows).toEqual([]);
});
it('inactive and unsupported roles cannot read or mutate maintenance', async () => {
  await create();
  await db.exec("reset role;update public.profiles set active=false where id='" + manager + "'");
  await user(manager);
  expect((await db.query('select * from public.maintenance_rules')).rows).toEqual([]);
  await reject(() => create(), 'FORBIDDEN');
});
it('Tomorrow snooze honors chosen Belize time and preserves audit; other recipient is denied', async () => {
  const id = crypto.randomUUID();
  await db.query("select public.manage_task($1,$2,0,'SAVE',$3)", [
    crypto.randomUUID(),
    id,
    JSON.stringify({
      title: 'Reminder',
      type_code: 'TASK',
      status: 'NEED_REVIEW',
      assignee_id: owner,
      remind_at: '2020-01-01T12:00:00Z',
      subtasks: [],
    }),
  ]);
  await db.query("select public.snooze_reminder($1,1,1440,'07:35')", [id]);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select remind_at=(((now() at time zone 'America/Belize')::date+1)+time '07:35') at time zone 'America/Belize' ok from public.tasks where id=$1",
        [id],
      )
    ).rows[0].ok,
  ).toBe(true);
  await user(manager);
  await reject(() => db.query("select public.snooze_reminder($1,2,60,'09:00')", [id]), 'FORBIDDEN');
});

it('explicit reminder time is interpreted in Belize and does not notify before it', async () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/scheduled';
  await db.query('select public.save_push_subscription($1,$2,$3)', [
    endpoint,
    'a'.repeat(87),
    'b'.repeat(22),
  ]);
  const today = (
    await db.query<{ d: string }>("select (now() at time zone 'America/Belize')::date::text d")
  ).rows[0].d;
  const id = await create('DAILY', today, '23:59:59');
  await reject(() => plan(id), 'NOT_DUE');
  await db.exec('reset role');
  await db.query('select public.confirm_mobile_push($1,$2)', [endpoint, owner]);
  expect((await db.query('select public.claim_due_maintenance_push() r')).rows).toEqual([
    { r: null },
  ]);
  await db.query("update public.maintenance_rules set due_time='00:00' where task_id=$1", [id]);
  expect(
    (await db.query<{ r: { count: number } }>('select public.claim_due_maintenance_push() r'))
      .rows[0].r.count,
  ).toBe(1);
});
it('regular desktop subscription cannot claim a test or due reminder', async () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/desktop';
  await db.query('select public.save_push_subscription($1,$2,$3)', [
    endpoint,
    'a'.repeat(87),
    'b'.repeat(22),
  ]);
  await reject(() => db.query('select public.claim_push_test($1)', [endpoint]), 'TEST_UNAVAILABLE');
  await reject(
    () => db.query('select public.confirm_mobile_push($1,$2)', [endpoint, owner]),
    'permission denied',
  );
});
