import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  rows: [] as object[],
  authorized: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({
  requireProfile: async () => {
    if (!state.authorized) throw new Error('AUTH');
    return { id: 'actor' };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    from: (table: string) => {
      state.calls.push(['from', table]);
      const q: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => resolve({ data: state.rows, error: null }),
      };
      for (const method of ['select', 'eq', 'is', 'or', 'order', 'limit'])
        q[method] = (...args: unknown[]) => {
          state.calls.push([method, ...args]);
          return q;
        };
      return q;
    },
  }),
}));
import { readTaskUpdates } from '@/lib/task-update-history';
import { belizeClock } from '@/lib/maintenance';
beforeEach(() => {
  state.calls = [];
  state.rows = [];
  state.authorized = true;
});
const task = '50000000-0000-4000-8000-000000000001';
it('loads only one bounded page of authorized task metadata', async () => {
  state.rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i) }));
  const page = await readTaskUpdates({ task, occurrence: null, before: null });
  expect(page.rows).toHaveLength(20);
  expect(page.more).toBe(true);
  expect(state.calls).toContainEqual(['limit', 21]);
  expect(state.calls).toContainEqual(['eq', 'task_id', task]);
  expect(state.calls).toContainEqual(['is', 'occurrence_id', null]);
  expect(state.calls.filter((c) => c[0] === 'from')).toHaveLength(1);
});
it('uses a stable timestamp/UUID cursor and validates it before querying', async () => {
  await readTaskUpdates({
    task,
    occurrence: task,
    before: { at: '2026-09-16T10:00:00+00:00', id: task },
  });
  expect(state.calls).toContainEqual(['eq', 'occurrence_id', task]);
  expect(state.calls.find((c) => c[0] === 'or')?.[1]).toContain('id.lt.' + task);
  state.calls = [];
  await expect(
    readTaskUpdates({ task, occurrence: null, before: { at: 'bad,or', id: task } }),
  ).rejects.toThrow();
  expect(state.calls).toHaveLength(0);
});
it('never queries history without an authorized profile', async () => {
  state.authorized = false;
  await expect(readTaskUpdates({ task, occurrence: null, before: null })).rejects.toThrow('AUTH');
  expect(state.calls).toHaveLength(0);
});
it('new maintenance date calculation needs no reads and uses Belize day boundary', () => {
  expect(belizeClock(new Date('2026-09-16T05:30:00Z'))).toEqual({
    today: '2026-09-15',
    clock: '23:30:00',
  });
  expect(state.calls).toHaveLength(0);
});
