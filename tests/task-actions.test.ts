vi.mock('server-only', () => ({}));
import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error('REDIRECT:' + p);
  },
}));
import { saveTask, taskProgress } from '../src/lib/task-actions';
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    requestId: crypto.randomUUID(),
    id: crypto.randomUUID(),
    version: '0',
    title: 'Inspect engine',
    description: '',
    type_code: 'TASK',
    status: 'NEED_REVIEW',
    assignee_id: '',
    due_date: '',
    remind_at: '',
    product_id: '',
    need_id: '',
    receipt_id: '',
    location_id: '',
    related_task_id: '',
    subtasks: '[]',
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ role: 'OWNER' });
  m.rpc.mockResolvedValue({ error: null });
});
it.each(['OWNER', 'MANAGER'])('%s creates only via the audited RPC', async (role) => {
  m.profile.mockResolvedValue({ role });
  const f = form();
  await expect(saveTask({}, f)).rejects.toThrow('REDIRECT:/tasks/' + f.get('id'));
  expect(m.rpc).toHaveBeenCalledWith(
    'manage_task',
    expect.objectContaining({
      p_action: 'SAVE',
      p_version: 0,
      p_values: expect.objectContaining({ title: 'Inspect engine' }),
    }),
  );
});
it.each(['OWNER', 'MANAGER'])(
  '%s opts into test classification only when checked',
  async (role) => {
    m.profile.mockResolvedValue({ role });
    const f = form();
    f.set('is_test', 'on');
    await expect(saveTask({}, f)).rejects.toThrow('REDIRECT');
    expect(m.rpc).toHaveBeenCalledWith(
      'create_test_record',
      expect.objectContaining({
        p_function: 'manage_task',
        p_args: expect.objectContaining({ p_version: 0 }),
      }),
    );
  },
);
it.each(['CREW', 'CAPTAIN'])('%s cannot create tasks through the server action', async (role) => {
  m.profile.mockResolvedValue({ role });
  expect(await saveTask({}, form())).toEqual({ error: 'FORBIDDEN' });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('rejects invalid dates before calling the database', async () => {
  const f = form();
  f.set('due_date', '2026-02-31');
  expect(await saveTask({}, f)).toEqual({ error: 'INVALID_INPUT' });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('returns version conflicts without success redirect', async () => {
  m.rpc.mockResolvedValue({ error: { message: 'TASK_STALE' } });
  expect(await saveTask({}, form())).toEqual({ error: 'taskStale' });
});
it('server action preserves database denial for manager archiving another task', async () => {
  m.profile.mockResolvedValue({ role: 'MANAGER' });
  const f = form();
  f.set('version', '1');
  f.set('action', 'ARCHIVE');
  f.set('archived', 'true');
  m.rpc.mockResolvedValueOnce({ error: { message: 'FORBIDDEN' }, data: null });
  expect(await taskProgress({}, f)).toEqual({ error: 'FORBIDDEN' });
  expect(m.rpc).toHaveBeenCalled();
});
