import { expect, it, vi } from 'vitest';
import { migrateAliases } from '../scripts/username-rollout.mjs';
it('preserves UUIDs, real email, phones and passwords during migration', async () => {
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: { id, email: id === 'owner' ? 'real@example.test' : null, phone: 'unchanged' } },
    error: null,
  }));
  const updateUserById = vi.fn(async (id: string, values: unknown) => ({
    data: { user: { id, phone: 'unchanged', ...(values as object) } },
    error: null,
  }));
  const rpc = vi.fn(async () => ({ error: null }));
  const admin = { auth: { admin: { getUserById, updateUserById } }, rpc };
  const entries = [
    { id: 'owner', username: 'linda' },
    { id: 'staff', username: 'test.manager' },
  ];
  await migrateAliases(admin, entries, 'owner', 'auth.example.test', false);
  expect(updateUserById).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  await migrateAliases(admin, entries, 'owner', 'auth.example.test', true);
  expect(updateUserById).toHaveBeenCalledTimes(1);
  expect(updateUserById.mock.calls[0][0]).toBe('staff');
  expect(updateUserById.mock.calls[0][1]).toEqual({
    email: expect.stringMatching(/^u_[a-f0-9]{32}@auth\.example\.test$/),
    email_confirm: true,
  });
  expect(rpc).toHaveBeenCalledWith('migrate_username_alias', {
    p_actor: 'owner',
    p_target: 'staff',
    p_username: 'test.manager',
  });
});
