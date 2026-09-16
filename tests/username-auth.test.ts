import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), delay: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('node:timers/promises', () => ({ setTimeout: m.delay }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/supabase/admin', () => ({
  accountAdminConfigured: () => true,
  authAdmin: () => ({ rpc: m.rpc }),
}));
import { authenticateUsername } from '../src/lib/username-auth';
import { loginCredentials } from '../src/lib/auth-domain';
const id = '40000000-0000-4000-8000-000000000001';
const db = { auth: { signInWithPassword: m.signIn, signOut: m.signOut } } as unknown as Parameters<
  typeof authenticateUsername
>[0];
beforeEach(() => {
  vi.resetAllMocks();
  process.env.SUPABASE_AUTH_ADMIN_KEY = 'isolated-test-key';
  m.rpc.mockImplementation(async (name: string) => ({
    data: name === 'consume_login_limit' ? true : { id, email: 'opaque@example.test' },
    error: null,
  }));
  m.signIn.mockResolvedValue({ data: { user: { id } }, error: null });
});
it('authenticates through Supabase and returns only the UUID', async () => {
  expect(await authenticateUsername(db, { username: 'linda', password: 'abcdef' })).toBe(id);
  expect(m.signIn).toHaveBeenCalledWith({ email: 'opaque@example.test', password: 'abcdef' });
  expect(m.delay).toHaveBeenCalled();
});
it.each(['unknown', 'wrong-password'])('returns the same failure for %s', async (kind) => {
  if (kind === 'unknown')
    m.rpc.mockImplementation(async (name: string) => ({
      data: name === 'consume_login_limit' ? true : null,
      error: null,
    }));
  m.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
  expect(await authenticateUsername(db, { username: 'someone', password: 'abcdef' })).toBeNull();
  expect(m.signIn).toHaveBeenCalledTimes(1);
  expect(m.delay).toHaveBeenCalled();
});
it('rate limits before username lookup', async () => {
  m.rpc.mockResolvedValue({ data: false, error: null });
  expect(await authenticateUsername(db, { username: 'linda', password: 'abcdef' })).toBeNull();
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.signIn).not.toHaveBeenCalled();
});
it('normalizes usernames without changing password characters', () => {
  const f = new FormData();
  f.set('username', ' Test.Manager ');
  f.set('password', ' abcd ');
  expect(loginCredentials(f)).toEqual({ username: 'test.manager', password: ' abcd ' });
});
