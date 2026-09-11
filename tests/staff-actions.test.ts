import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  profile: vi.fn(),
  password: vi.fn(),
  signIn: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getProfile: m.profile, requireProfile: m.profile }));
vi.mock('@/lib/supabase/config', () => ({ isConfigured: () => true }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    auth: { updateUser: m.password, signInWithPassword: m.signIn },
    from: () => {
      const q = { select: () => q, eq: () => q, single: m.single, maybeSingle: m.maybeSingle };
      return q;
    },
    rpc: m.rpc,
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: m.cookie }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error('REDIRECT:' + p);
  },
}));
import { changeFirstPassword, manageStaff } from '../src/lib/staff-actions';
import { signIn } from '../src/lib/actions';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({
    id: '40000000-0000-4000-8000-000000000001',
    role: 'OWNER',
    account_admin: true,
    active: true,
    must_change_password: true,
  });
});
it.each(['phone', 'email'])('signs in with %s password without calling signup', async (method) => {
  const f = new FormData();
  f.set('method', method);
  f.set('country', '501');
  f.set('phone', '1234567');
  f.set('email', 'staff@example.test');
  f.set('password', 'test-only-password');
  m.signIn.mockResolvedValue({ data: { user: { id: 'staff-id' } }, error: null });
  m.maybeSingle.mockResolvedValue({ data: { language: 'es', must_change_password: true } });
  await expect(signIn({}, f)).rejects.toThrow('REDIRECT:/change-password');
  expect(m.signIn).toHaveBeenCalledWith(
    method === 'phone'
      ? { phone: '+5011234567', password: 'test-only-password' }
      : { email: 'staff@example.test', password: 'test-only-password' },
  );
  expect(m.cookie).toHaveBeenCalledWith('coral-language', 'es', expect.any(Object));
});
it('fails closed when the Auth password update fails', async () => {
  const f = new FormData();
  f.set('password', 'new-test-password');
  f.set('confirm', 'new-test-password');
  m.password.mockResolvedValue({ error: { message: 'rejected' } });
  expect(await changeFirstPassword({}, f)).toEqual({ error: 'passwordChangeFailed' });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('does not unlock the app if the trusted trigger did not clear the gate', async () => {
  const f = new FormData();
  f.set('password', 'new-test-password');
  f.set('confirm', 'new-test-password');
  m.password.mockResolvedValue({ error: null });
  m.single.mockResolvedValue({ data: { must_change_password: true }, error: null });
  expect(await changeFirstPassword({}, f)).toEqual({ error: 'passwordChangeFailed' });
});
it('opens the workspace only after Auth and profile confirmation succeed', async () => {
  const f = new FormData();
  f.set('password', 'new-test-password');
  f.set('confirm', 'new-test-password');
  m.password.mockResolvedValue({ error: null });
  m.single.mockResolvedValue({ data: { must_change_password: false }, error: null });
  await expect(changeFirstPassword({}, f)).rejects.toThrow('REDIRECT:/');
  expect(m.rpc).not.toHaveBeenCalled();
});
it('rejects manager profile administration before calling RPC', async () => {
  m.profile.mockResolvedValue({ role: 'MANAGER' });
  expect(await manageStaff({}, new FormData())).toEqual({ error: 'FORBIDDEN' });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('owner saves only allowed staff profile fields', async () => {
  const f = new FormData();
  f.set('id', '40000000-0000-4000-8000-000000000002');
  f.set('name', 'Staff');
  f.set('role', 'MANAGER');
  f.set('language', 'es');
  f.set('active', 'on');
  f.set('must_change_password', 'false');
  m.rpc.mockResolvedValue({ error: null });
  expect(await manageStaff({}, f)).toEqual({ success: true });
  expect(m.rpc).toHaveBeenCalledWith('manage_staff', {
    p_id: f.get('id'),
    p_name: 'Staff',
    p_role: 'MANAGER',
    p_language: 'es',
    p_active: true,
  });
});
