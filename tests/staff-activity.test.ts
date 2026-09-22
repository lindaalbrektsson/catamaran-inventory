import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), list: vi.fn(), configured: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/admin', () => ({
  accountAdminConfigured: m.configured,
  authAdmin: () => ({ auth: { admin: { listUsers: m.list } } }),
}));
import { staffLastLogins } from '../src/lib/staff-activity';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ role: 'OWNER', account_admin: true });
  m.configured.mockReturnValue(true);
});
afterEach(() => vi.useRealTimers());
it('maps only requested UUIDs, including never signed in, in one Auth call', async () => {
  m.list.mockResolvedValue({
    data: {
      users: [
        { id: 'other', last_sign_in_at: '2026-01-01T00:00:00Z', email: 'private@example.test' },
        { id: 'b' },
        { id: 'a', last_sign_in_at: '2026-09-22T20:37:00Z' },
      ],
      nextPage: null,
    },
    error: null,
  });
  expect(await staffLastLogins(['a', 'b', 'missing'])).toEqual(
    new Map([
      ['b', null],
      ['a', '2026-09-22T20:37:00Z'],
    ]),
  );
  expect(m.list).toHaveBeenCalledExactlyOnceWith({ page: 1, perPage: 250 });
});
it('follows paginated Auth users and stops once displayed UUIDs are resolved', async () => {
  m.list
    .mockResolvedValueOnce({
      data: { users: [{ id: 'other' }], nextPage: 2, total: 251 },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { users: [{ id: 'wanted', last_sign_in_at: '2026-09-22T20:37:00Z' }], nextPage: 3 },
      error: null,
    });
  expect((await staffLastLogins(['wanted'])).get('wanted')).toBe('2026-09-22T20:37:00Z');
  expect(m.list).toHaveBeenNthCalledWith(2, { page: 2, perPage: 250 });
  expect(m.list).toHaveBeenCalledTimes(2);
});
it('uses a full-page fallback when pagination headers are absent and bounds requests', async () => {
  m.list.mockResolvedValue({
    data: {
      users: Array.from({ length: 250 }, (_, i) => ({ id: 'other' + i })),
      nextPage: null,
      total: 0,
    },
    error: null,
  });
  expect((await staffLastLogins(['missing'])).size).toBe(0);
  expect(m.list).toHaveBeenCalledTimes(10);
});
it.each(['OWNER', 'MANAGER'])(
  'denies %s without account-admin before Auth access',
  async (role) => {
    m.profile.mockResolvedValue({ role, account_admin: false });
    await expect(staffLastLogins(['a'])).rejects.toThrow('FORBIDDEN');
    expect(m.list).not.toHaveBeenCalled();
  },
);
it('also denies a Manager with an inconsistent account-admin flag', async () => {
  m.profile.mockResolvedValue({ role: 'MANAGER', account_admin: true });
  await expect(staffLastLogins(['a'])).rejects.toThrow('FORBIDDEN');
  expect(m.list).not.toHaveBeenCalled();
});
it.each(['error', 'throw'])(
  'returns unavailable instead of failing account management: %s',
  async (mode) => {
    if (mode === 'throw') m.list.mockRejectedValue(new Error('unavailable'));
    else m.list.mockResolvedValue({ data: { users: [] }, error: { message: 'unavailable' } });
    expect((await staffLastLogins(['a'])).size).toBe(0);
  },
);
it('bounds a hung Auth lookup and starts no further requests after timeout', async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  m.list.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const result = staffLastLogins(['a']);
  await vi.advanceTimersByTimeAsync(4001);
  expect((await result).size).toBe(0);
  resolve({ data: { users: [{ id: 'a' }], nextPage: 2 }, error: null });
  await Promise.resolve();
  expect(m.list).toHaveBeenCalledTimes(1);
});
it('unconfigured metadata and empty staff lists do not call Auth', async () => {
  m.configured.mockReturnValue(false);
  expect((await staffLastLogins(['a'])).size).toBe(0);
  m.configured.mockReturnValue(true);
  await staffLastLogins([]);
  expect(m.list).not.toHaveBeenCalled();
});
it('invalid Auth timestamps are unavailable rather than breaking formatting', async () => {
  m.list.mockResolvedValue({
    data: { users: [{ id: 'a', last_sign_in_at: 'invalid' }] },
    error: null,
  });
  expect((await staffLastLogins(['a'])).has('a')).toBe(false);
});
