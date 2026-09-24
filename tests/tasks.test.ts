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
it('manager can create, assign and edit ordinary tasks without reminders', async () => {
  await user(manager);
  const id = crypto.randomUUID(),
    v = { ...values(), remind_at: '' };
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
    v = { ...values(), remind_at: '' };
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
it('manager cannot archive ordinary shared tasks', async () => {
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', { ...values(), remind_at: '' });
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

async function rejected(operation: () => Promise<unknown>, message = 'FORBIDDEN') {
  await db.exec('savepoint forbidden_attempt');
  await expect(operation()).rejects.toThrow(message);
  await db.exec('rollback to savepoint forbidden_attempt');
}
it('manager creates, edits, completes and deletes own reminder with immutable audit', async () => {
  await user(manager);
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v);
  await mutate(id, 1, 'SAVE', { ...v, title: 'Check fuel level' });
  await mutate(id, 2, 'STATUS', { status: 'DONE' });
  await mutate(id, 3, 'ARCHIVE', { archived: true });
  expect(await row(id)).toMatchObject({
    reminder_private: true,
    archived: true,
    created_by: manager,
    updated_by: manager,
  });
  const h = (
    await db.query<{ actor_id: string; before_data: unknown; after_data: unknown }>(
      'select * from public.task_history($1)',
      [id],
    )
  ).rows;
  expect(h).toHaveLength(5);
  expect(h.every((x) => x.actor_id === manager)).toBe(true);
  expect(h.some((x) => x.before_data && x.after_data)).toBe(true);
});
it('manager still cannot reassign an existing reminder or bypass scope by clearing reminder time', async () => {
  await user(manager);
  const id = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v);
  await rejected(() => mutate(id, 1, 'SAVE', { ...v, remind_at: '', assignee_id: owner }));
  await mutate(id, 1, 'SAVE', { ...v, remind_at: '' });
  expect(await row(id)).toMatchObject({ reminder_private: true, remind_at: null });
});
it('manager cannot read another recipient reminder, subtasks, history or delivery status, nor mutate any action', async () => {
  const id = crypto.randomUUID(),
    v = { ...values(), assignee_id: owner };
  await mutate(id, 0, 'SAVE', v);
  await user(manager);
  expect(await row(id)).toBeUndefined();
  expect(
    (await db.query('select * from public.task_subtasks where task_id=$1', [id])).rows,
  ).toEqual([]);
  expect((await db.query('select * from public.task_history($1)', [id])).rows).toEqual([]);
  expect((await db.query('select public.reminder_delivery_status($1) status', [id])).rows).toEqual([
    { status: null },
  ]);
  for (const [action, payload] of [
    ['SAVE', v],
    ['STATUS', { status: 'DONE' }],
    ['SUBTASK', { subtask_id: v.subtasks[0].id, completed: true }],
    ['ARCHIVE', { archived: true }],
  ] as const)
    await rejected(() => mutate(id, 1, action, payload));
});
it('privacy remains after clearing reminder time; managers cannot claim another shared task as a reminder', async () => {
  const id = crypto.randomUUID(),
    v = { ...values(), assignee_id: owner };
  await mutate(id, 0, 'SAVE', v);
  await mutate(id, 1, 'SAVE', { ...v, remind_at: '' });
  const shared = crypto.randomUUID();
  await mutate(shared, 0, 'SAVE', { ...values(), assignee_id: owner, remind_at: '' });
  await user(manager);
  expect(await row(id)).toBeUndefined();
  await rejected(() => mutate(shared, 1, 'SAVE', { ...values(), subtasks: [] }));
});
it('owner can assign self, manager and another active owner, but not unsupported/inactive recipients', async () => {
  const other = crypto.randomUUID();
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1)', [other]);
  await db.query(
    "update public.profiles set role='OWNER',active=true,must_change_password=false where id=$1",
    [other],
  );
  await user(owner);
  for (const recipient of [owner, manager, other]) {
    const id = crypto.randomUUID();
    await mutate(id, 0, 'SAVE', { ...values(), assignee_id: recipient });
    await mutate(id, 1, 'ARCHIVE', { archived: true });
    expect(await row(id)).toMatchObject({
      created_by: owner,
      assignee_id: recipient,
      archived: true,
    });
  }
  await db.exec('reset role');
  await db.query("update public.profiles set role='CREW' where id=$1", [other]);
  await user(owner);
  await rejected(
    () => mutate(crypto.randomUUID(), 0, 'SAVE', { ...values(), assignee_id: other }),
    'INVALID_INPUT',
  );
  await db.exec('reset role');
  await db.query("update public.profiles set role='OWNER',active=false where id=$1", [other]);
  await user(owner);
  await rejected(
    () => mutate(crypto.randomUUID(), 0, 'SAVE', { ...values(), assignee_id: other }),
    'INVALID_INPUT',
  );
  const directory = (await db.query<{ id: string }>('select * from public.reminder_people()')).rows;
  expect(directory.map((x) => x.id).sort()).toEqual([owner, manager].sort());
  await user(manager);
  expect(
    (await db.query<{ id: string }>('select * from public.reminder_people()')).rows.map(
      (x) => x.id,
    ),
  ).toEqual(expect.arrayContaining([owner, manager]));
});
it('owner cannot edit reminders they neither assigned nor received', async () => {
  await user(manager);
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', values());
  await user(owner);
  await rejected(() => mutate(id, 1, 'ARCHIVE', { archived: true }));
});
it('manager cannot edit or replay their own old request after Owner reassigns recipient', async () => {
  const id = crypto.randomUUID(),
    request = crypto.randomUUID(),
    v = values();
  await mutate(id, 0, 'SAVE', v, request);
  await mutate(id, 1, 'SAVE', { ...v, assignee_id: owner });
  await user(manager);
  await rejected(() => mutate(id, 0, 'SAVE', v, request));
});
it('one occurrence sends once to each assigned-user device, never creator devices; later time sends again', async () => {
  const subscribe = async (suffix: string) =>
    db.query('select public.save_push_subscription($1,$2,$3)', [
      'https://fcm.googleapis.com/fcm/send/' + suffix,
      'a'.repeat(87),
      'b'.repeat(22),
    ]);
  await subscribe('owner');
  await user(manager);
  await subscribe('manager-phone');
  await subscribe('manager-tablet');
  await db.exec('reset role;update private.push_subscriptions set mobile_pwa=true');
  await user(owner);
  const id = crypto.randomUUID();
  const now = (await db.query<{ t: string }>('select now()::text t')).rows[0].t
    .replace(' ', 'T')
    .replace(/\+00$/, '+00:00');
  await mutate(id, 0, 'SAVE', { ...values(), remind_at: now });
  await db.exec('reset role');
  const claim = async () =>
    (
      await db.query<{ r: { id: string; endpoint: string; title: string } | null }>(
        'select public.claim_due_push() r',
      )
    ).rows[0].r;
  const first = await claim(),
    second = await claim();
  expect(first?.endpoint).toContain('manager-');
  expect(second?.endpoint).toContain('manager-');
  expect(first?.endpoint).not.toBe(second?.endpoint);
  expect(first?.title).toBe('Check engine');
  expect(await claim()).toBeNull();
  await db.query("select public.finish_push($1,'SENT',$2)", [first!.id, first!.endpoint]);
  await user(manager);
  expect((await db.query('select public.reminder_delivery_status($1) status', [id])).rows).toEqual([
    { status: { sent: 1, failed: 0, claimed: 2 } },
  ]);
  await db.exec('reset role');
  await db.query("update private.push_subscriptions set created_at=now()-interval '2 minutes'");
  await db.query("update public.tasks set remind_at=now()-interval '1 minute' where id=$1", [id]);
  expect(await claim()).toBeTruthy();
  expect(await claim()).toBeTruthy();
  expect(await claim()).toBeNull();
});

async function addStaff(role = 'MANAGER', fields: Record<string, boolean> = {}) {
  const id = crypto.randomUUID();
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1)', [id]);
  await db.query(
    'update public.profiles set role=$1,active=$2,must_change_password=$3,credential_pending=$4 where id=$5',
    [
      role,
      fields.active ?? true,
      fields.must_change_password ?? false,
      fields.credential_pending ?? false,
      id,
    ],
  );
  return id;
}
it.each([
  ['MANAGER', 'MANAGER'],
  ['MANAGER', 'OWNER'],
  ['OWNER', 'MANAGER'],
  ['OWNER', 'OWNER'],
])(
  '%s creates a private reminder for another %s without account-admin capability',
  async (creatorRole, recipientRole) => {
    const creator = await addStaff(creatorRole),
      recipient = await addStaff(recipientRole);
    await user(creator);
    const id = crypto.randomUUID(),
      v = { ...values(), assignee_id: recipient };
    await mutate(id, 0, 'SAVE', { ...v, created_by: owner });
    if (creatorRole === 'MANAGER') {
      expect(await row(id)).toBeUndefined();
      expect((await db.query('select * from public.task_history($1)', [id])).rows).toEqual([]);
      await rejected(() => mutate(id, 1, 'SAVE', v));
      await rejected(() => mutate(id, 1, 'ARCHIVE', { archived: true }));
      await rejected(() => db.query("select public.snooze_reminder($1,1,60,'09:00')", [id]));
    }
    await user(recipient);
    expect(await row(id)).toMatchObject({
      assignee_id: recipient,
      created_by: creator,
      reminder_private: true,
    });
    expect(
      (
        await db.query<{ actor_id: string }>('select * from public.task_history($1)', [id])
      ).rows.every((x) => x.actor_id === creator),
    ).toBe(true);
    await db.query("select public.snooze_reminder($1,1,1440,'07:35')", [id]);
    expect(await row(id)).toMatchObject({
      assignee_id: recipient,
      created_by: creator,
      updated_by: recipient,
      version: 2,
    });
    const time = (
      await db.query<{ time: string }>(
        "select to_char(remind_at at time zone 'America/Belize','HH24:MI') time from public.tasks where id=$1",
        [id],
      )
    ).rows[0].time;
    expect(time).toBe('07:35');
  },
);
it('cross-recipient Manager creation can safely acknowledge an identical retry without granting private read', async () => {
  await user(manager);
  const id = crypto.randomUUID(),
    request = crypto.randomUUID(),
    v = { ...values(), assignee_id: owner };
  await mutate(id, 0, 'SAVE', v, request);
  await mutate(id, 0, 'SAVE', v, request);
  expect(await row(id)).toBeUndefined();
  await rejected(() => mutate(id, 0, 'SAVE', { ...v, title: 'Changed' }, request));
  await rejected(() => mutate(id, 0, 'SAVE', v, crypto.randomUUID()));
  await user(owner);
  expect((await db.query('select * from public.task_history($1)', [id])).rows).toHaveLength(2);
  await mutate(id, 1, 'STATUS', { status: 'IN_PROGRESS' });
  await user(manager);
  await mutate(id, 0, 'SAVE', v, request);
  expect(await row(id)).toBeUndefined();
});
it('fully provisioned staff directory excludes inactive/deactivated, missing, credential-pending, first-login and unsupported users', async () => {
  const invalid = [
    await addStaff('OWNER', { active: false }),
    await addStaff('MANAGER', { credential_pending: true }),
    await addStaff('OWNER', { must_change_password: true }),
    await addStaff('CREW'),
  ];
  const eligible = await addStaff();
  await db.exec('reset role');
  // A missing profile or arbitrary external-person ID must never be an eligible recipient.
  const external = crypto.randomUUID();
  for (const actor of [owner, manager]) {
    await user(actor);
    const directory = (
      await db.query<{ id: string }>('select * from public.reminder_people()')
    ).rows.map((x) => x.id);
    expect(directory).toEqual(expect.arrayContaining([owner, manager, eligible]));
    for (const recipient of [...invalid, external]) {
      expect(directory).not.toContain(recipient);
      await rejected(
        () => mutate(crypto.randomUUID(), 0, 'SAVE', { ...values(), assignee_id: recipient }),
        'INVALID_INPUT',
      );
    }
  }
});
it.each(['credential_pending', 'must_change_password'])(
  'staff with %s cannot create or discover reminder recipients',
  async (flag) => {
    const pending = await addStaff('MANAGER', { [flag]: true });
    await user(pending);
    expect((await db.query('select * from public.reminder_people()')).rows).toEqual([]);
    await rejected(() =>
      mutate(crypto.randomUUID(), 0, 'SAVE', { ...values(), assignee_id: owner }),
    );
  },
);
it('a Manager-created reminder pushes to both recipient devices and never the creator, preserving retry deduplication', async () => {
  const subscribe = async (suffix: string) =>
    db.query('select public.save_push_subscription($1,$2,$3)', [
      'https://fcm.googleapis.com/fcm/send/' + suffix,
      'a'.repeat(87),
      'b'.repeat(22),
    ]);
  await subscribe('recipient-phone');
  await subscribe('recipient-tablet');
  await user(manager);
  await subscribe('creator-phone');
  await db.exec('reset role;update private.push_subscriptions set mobile_pwa=true');
  await user(manager);
  const now = (await db.query<{ t: string }>('select now()::text t')).rows[0].t
    .replace(' ', 'T')
    .replace(/\+00$/, '+00:00');
  const id = crypto.randomUUID();
  await mutate(id, 0, 'SAVE', { ...values(), assignee_id: owner, remind_at: now });
  await db.exec('reset role');
  const claim = async () =>
    (
      await db.query<{ r: { id: string; endpoint: string; claim_token: string } | null }>(
        'select public.claim_due_push() r',
      )
    ).rows[0].r;
  for (let n = 0; n < 2; n++) {
    const delivery = await claim();
    expect(delivery?.endpoint).toContain('recipient-');
    await db.query("select public.finish_push($1,'SENT',$2,$3)", [
      delivery!.id,
      delivery!.endpoint,
      delivery!.claim_token,
    ]);
  }
  expect(await claim()).toBeNull();
  await db.exec(
    "update private.push_deliveries set claimed_at=now()-interval '15 minutes', lease_until=now()-interval '10 minutes'",
  );
  expect(await claim()).toBeNull();
  expect(
    (await db.query<{ user_id: string }>('select user_id from private.push_deliveries')).rows.every(
      (x) => x.user_id === owner,
    ),
  ).toBe(true);
});

it('recipient can edit their reminder retaining its private parent link without gaining parent access', async () => {
  const recipient = await addStaff();
  await user(manager);
  const parent = crypto.randomUUID(),
    otherPrivate = crypto.randomUUID(),
    id = crypto.randomUUID();
  await mutate(parent, 0, 'SAVE', values());
  await mutate(otherPrivate, 0, 'SAVE', values());
  const reminder = { ...values(), assignee_id: recipient, related_task_id: parent };
  await mutate(id, 0, 'SAVE', reminder);
  await user(recipient);
  expect(await row(parent)).toBeUndefined();
  expect((await db.query('select * from public.task_history($1)', [parent])).rows).toEqual([]);
  await mutate(id, 1, 'SAVE', { ...reminder, title: 'Updated by recipient' });
  expect(await row(id)).toMatchObject({
    title: 'Updated by recipient',
    related_task_id: parent,
    created_by: manager,
    assignee_id: recipient,
  });
  await rejected(
    () => mutate(id, 2, 'SAVE', { ...reminder, related_task_id: otherPrivate }),
    'INVALID_INPUT',
  );
  await rejected(
    () => mutate(id, 2, 'SAVE', { ...reminder, related_task_id: id }),
    'INVALID_INPUT',
  );
  expect(await row(parent)).toBeUndefined();
  expect((await db.query('select * from public.task_history($1)', [parent])).rows).toEqual([]);
});
