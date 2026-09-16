import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  profile: vi.fn(),
  configured: vi.fn(),
  rpc: vi.fn(),
  finish: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock('@/lib/supabase/admin', () => ({
  accountAdminConfigured: m.configured,
  authAdmin: () => ({
    auth: { admin: { createUser: m.create, updateUserById: m.update } },
    rpc: m.finish,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { accountChange } from '../src/lib/account-actions';
import { temporaryPassword } from '../src/lib/temporary-password';
const target = '40000000-0000-4000-8000-000000000002';
function form(kind = 'CREATE') {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    request: crypto.randomUUID(),
    kind,
    target: kind === 'CREATE' ? '' : target,
    name: 'Isolated staff',
    role: 'MANAGER',
    language: 'es',
    active: 'on',
    country: '501',
    phone: '1234567',
    verified: 'on',
  }))
    f.set(key, value);
  if (kind === 'CREATE') f.set('temporaryPassword', 'Manually-Chosen-Only');
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ role: 'OWNER', account_admin: true });
  m.configured.mockReturnValue(true);
  m.rpc.mockResolvedValue({ data: { target: null, completed: false } });
  m.create.mockResolvedValue({ data: { user: { id: target } }, error: null });
  m.update.mockResolvedValue({ error: null });
  m.finish.mockResolvedValue({ error: null });
});
it.each(['OWNER', 'MANAGER', 'CAPTAIN', 'CREW'])(
  'rejects %s without capability before any admin call',
  async (role) => {
    m.profile.mockResolvedValue({ role, account_admin: false });
    expect(await accountChange(form())).toEqual({ error: 'FORBIDDEN' });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  },
);
it('stops at missing server configuration', async () => {
  m.configured.mockReturnValue(false);
  expect(await accountChange(form())).toEqual({ error: 'accountAdminSetup' });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('creates a phone-only staff account with the manually entered temporary password', async () => {
  const f = form(),
    result = await accountChange(f);
  expect(result.success).toBe(true);
  expect(m.create).toHaveBeenCalledWith({
    phone: '+5011234567',
    phone_confirm: true,
    password: result.temporary,
    app_metadata: { account_operation: f.get('request') },
  });
  expect(m.finish).toHaveBeenCalledWith('finish_account_change', {
    p_request: f.get('request'),
    p_target: target,
    p_values: { name: 'Isolated staff', role: 'MANAGER', language: 'es', active: true },
  });
  expect(JSON.stringify(m.rpc.mock.calls) + JSON.stringify(m.finish.mock.calls)).not.toContain(
    result.temporary,
  );
});
it('rejects unverified phone ownership before starting an operation', async () => {
  const f = form();
  f.delete('verified');
  expect(await accountChange(f)).toEqual({ error: 'INVALID_INPUT' });
  expect(m.create).not.toHaveBeenCalled();
});
it('reset uses the existing UUID and generates a fresh password', async () => {
  m.rpc.mockResolvedValue({ data: { target, completed: false } });
  const a = await accountChange(form('RESET')),
    b = await accountChange(form('RESET'));
  expect(a.temporary).not.toEqual(b.temporary);
  expect(m.update).toHaveBeenCalledWith(target, { password: a.temporary });
  expect(m.create).not.toHaveBeenCalled();
});
it('phone recovery updates identity without replacing the user or changing profile metadata', async () => {
  m.rpc.mockResolvedValue({ data: { target, completed: false } });
  const result = await accountChange(form('PHONE'));
  expect(m.update).toHaveBeenCalledWith(target, { phone: '+5011234567', phone_confirm: true });
  expect(m.create).not.toHaveBeenCalled();
  expect(result.temporary).toBeUndefined();
});
it('replayed completed requests cannot retrieve a password', async () => {
  m.rpc.mockResolvedValue({ data: { target, completed: true } });
  expect(await accountChange(form('RESET'))).toEqual({ error: 'accountAlreadyCompleted' });
  expect(m.update).not.toHaveBeenCalled();
});
it('never returns a credential when profile finalization fails', async () => {
  m.finish.mockResolvedValue({ error: { message: 'failed' } });
  expect(await accountChange(form())).toEqual({ error: 'accountChangeFailed' });
});
it('generates readable random credentials without a shared preset', () => {
  const passwords = Array.from({ length: 100 }, temporaryPassword);
  expect(new Set(passwords).size).toBe(100);
  for (const password of passwords)
    expect(password).toMatch(/^Cat-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);
});
it('rejects creation of roles outside the operational onboarding choices', async () => {
  const value = form();
  value.set('role', 'CREW');
  expect(await accountChange(value)).toEqual({ error: 'INVALID_INPUT' });
  expect(m.create).not.toHaveBeenCalled();
});
it.each(['CREATE', 'RESET'])(
  'uses the admin-chosen temporary password for %s without sending it to database RPCs',
  async (kind) => {
    const f = form(kind);
    f.set('temporaryMode', 'CHOOSE');
    f.set('temporaryPassword', 'Chosen-Temporary-Only');
    if (kind === 'RESET') m.rpc.mockResolvedValue({ data: { target, completed: false } });
    const result = await accountChange(f);
    expect(result.temporary).toBe('Chosen-Temporary-Only');
    if (kind === 'CREATE')
      expect(m.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone_confirm: true, password: result.temporary }),
      );
    else expect(m.update).toHaveBeenCalledWith(target, { password: result.temporary });
    expect(JSON.stringify(m.rpc.mock.calls) + JSON.stringify(m.finish.mock.calls)).not.toContain(
      result.temporary,
    );
  },
);
it.each(['short', 'x'.repeat(129)])(
  'rejects invalid chosen passwords before acquiring an account lock',
  async (password) => {
    const f = form('RESET');
    f.set('temporaryMode', 'CHOOSE');
    f.set('temporaryPassword', password);
    expect(await accountChange(f)).toEqual({ error: 'passwordRules' });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  },
);

it('creation never falls back to generation when the password is missing', async () => {
  const f = form();
  f.delete('temporaryPassword');
  f.set('temporaryMode', 'GENERATE');
  expect(await accountChange(f)).toEqual({ error: 'passwordRules' });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
});
