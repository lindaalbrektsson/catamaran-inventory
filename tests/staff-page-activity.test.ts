import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
const m = vi.hoisted(() => ({ profile: vi.fn(), list: vi.fn(), collect: vi.fn(), db: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile, getLocale: async () => 'en' }));
vi.mock('@/lib/supabase/admin', () => ({
  accountAdminConfigured: () => true,
  authAdmin: () => ({ auth: { admin: { listUsers: m.list } } }),
}));
vi.mock('@/lib/supabase/server', () => ({ supabase: m.db }));
vi.mock('@/lib/inventory', () => ({ collect: m.collect }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw Error('REDIRECT ' + path);
  },
}));
vi.mock('@/components/account-form', () => ({
  AccountForm: () => createElement('button', null, 'Manage account'),
}));
vi.mock('@/components/staff-profile-form', () => ({ StaffProfileForm: () => null }));
vi.mock('@/components/delete-user-button', () => ({ DeleteUserButton: () => null }));
vi.mock('@/components/desktop-only', () => ({
  DesktopOnly: ({ children }: { children: React.ReactNode }) => children,
}));
import Staff from '../src/app/(workspace)/staff/page';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ id: 'admin', role: 'OWNER', account_admin: true });
  m.collect.mockResolvedValue([
    { id: 'a', must_change_password: true, credential_pending: false },
    { id: 'b', must_change_password: false, credential_pending: false },
    { id: 'c', must_change_password: false, credential_pending: true },
  ]);
  m.db.mockResolvedValue({ rpc: async () => ({ data: [], error: null }) });
});
async function html() {
  const stream = await renderToReadableStream(await Staff());
  await stream.allReady;
  return new Response(stream).text();
}
it('renders existing onboarding flags and Auth timestamps for account-admin', async () => {
  m.list.mockResolvedValue({
    data: {
      users: [{ id: 'a' }, { id: 'b', last_sign_in_at: '2026-09-22T20:37:00Z' }, { id: 'c' }],
    },
    error: null,
  });
  const out = await html();
  expect(out.match(/First login not completed/g)).toHaveLength(2);
  expect(out).toContain('Setup complete');
  expect(out).toContain('Never signed in');
  expect(out).toContain('2026-09-22T20:37:00Z');
  expect(m.list).toHaveBeenCalledTimes(1);
});
it('renders working account controls and unavailable metadata when Auth fails', async () => {
  m.list.mockRejectedValue(new Error('Auth unavailable'));
  const out = await html();
  expect(out).toContain('Manage account');
  expect(out).toContain('Last login unavailable');
  expect(out).toContain('Setup complete');
});
it.each(['OWNER', 'MANAGER'])(
  'blocks the sensitive page for ordinary %s before any reads',
  async (role) => {
    m.profile.mockResolvedValue({ role, account_admin: false });
    await expect(Staff()).rejects.toThrow('REDIRECT /inventory');
    expect(m.db).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  },
);
