import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock('@/lib/supabase/admin', () => ({
  accountAdminConfigured: () => true,
  authAdmin: () => ({ auth: { admin: { deleteUser: m.remove } } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { deleteUser } from '../src/lib/delete-user';
const target = '40000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({
    id: '40000000-0000-4000-8000-000000000001',
    role: 'OWNER',
    account_admin: true,
  });
  m.rpc.mockResolvedValue({ data: 'DELETE', error: null });
  m.remove.mockResolvedValue({ error: null });
});
it('uses Admin Auth only after the authenticated deletion preflight', async () => {
  expect(await deleteUser(target)).toEqual({ success: true, preserved: false });
  expect(m.rpc).toHaveBeenCalledWith('prepare_user_deletion', { p_target: target });
  expect(m.remove).toHaveBeenCalledWith(target);
});
it('preserves Auth and profile for historical users', async () => {
  m.rpc.mockResolvedValue({ data: 'PRESERVED', error: null });
  expect(await deleteUser(target)).toEqual({ success: true, preserved: true });
  expect(m.remove).not.toHaveBeenCalled();
});
it('reports failed Auth deletion without claiming success', async () => {
  m.remove.mockResolvedValue({ error: { message: 'Database error' } });
  expect(await deleteUser(target)).toEqual({ error: 'userDeleteFailed' });
});
it.each(['MANAGER', 'OWNER'])('rejects %s without account-admin capability', async (role) => {
  m.profile.mockResolvedValue({ role, account_admin: false });
  expect(await deleteUser(target)).toEqual({ error: 'FORBIDDEN' });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.remove).not.toHaveBeenCalled();
});
it('never uses Admin Auth when database authorization fails', async () => {
  m.rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });
  expect(await deleteUser(target)).toEqual({ error: 'userDeleteFailed' });
  expect(m.remove).not.toHaveBeenCalled();
});
