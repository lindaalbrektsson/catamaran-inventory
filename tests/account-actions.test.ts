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
const target = '40000000-0000-4000-8000-000000000002';
function form(kind = 'CREATE') {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    request: crypto.randomUUID(),
    kind,
    target: kind === 'CREATE' ? '' : target,
    name: 'Isolated staff',
    username: 'staff.test',
    role: 'MANAGER',
    language: 'es',
    active: 'on',
    country: '501',
    phone: '1234567',
    verified: 'on',
  }))
    f.set(key, value);
  if (kind !== 'PHONE') f.set('temporaryPassword', 'Manually-Chosen-Only');
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ role: 'OWNER', account_admin: true, language: 'es' });
  m.configured.mockReturnValue(true);
  process.env.AUTH_INTERNAL_EMAIL_DOMAIN = 'auth.example.test';
  m.rpc.mockResolvedValue({
    data: { target: null, completed: false, identity: 'u_123456781234123412341234567890ab' },
  });
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
it('creates a username staff account with an opaque email with the manually entered temporary password', async () => {
  const f = form(),
    result = await accountChange(f);
  expect(result.success).toBe(true);
  expect(m.create).toHaveBeenCalledWith({
    email: 'u_123456781234123412341234567890ab@auth.example.test',
    email_confirm: true,
    password: result.temporary,
    app_metadata: { account_operation: f.get('request') },
  });
  expect(m.finish).toHaveBeenCalledWith('finish_username_creation', {
    p_request: f.get('request'),
    p_contact: null,
    p_target: target,
    p_values: { name: 'Isolated staff', role: 'MANAGER', language: 'es', active: true },
  });
  expect(JSON.stringify(m.rpc.mock.calls) + JSON.stringify(m.finish.mock.calls)).not.toContain(
    result.temporary,
  );
});
it('allows creation without a contact phone', async () => {
  const f = form();
  f.delete('phone');
  f.delete('verified');
  expect((await accountChange(f)).success).toBe(true);
  expect(m.create.mock.calls[0][0]).not.toHaveProperty('phone');
});
it('reset uses the existing UUID and the manually entered password', async () => {
  m.rpc.mockResolvedValue({ data: { target, completed: false } });
  const result = await accountChange(form('RESET'));
  expect(result.temporary).toBe('Manually-Chosen-Only');
  expect(m.update).toHaveBeenCalledWith(target, { password: result.temporary });
  expect(m.create).not.toHaveBeenCalled();
});
it('contact updates never change the Auth identity', async () => {
  expect((await accountChange(form('CONTACT'))).success).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith('set_staff_contact', {
    p_target: target,
    p_phone: '+5011234567',
  });
  expect(m.update).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
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
        expect.objectContaining({ email_confirm: true, password: result.temporary }),
      );
    else expect(m.update).toHaveBeenCalledWith(target, { password: result.temporary });
    expect(JSON.stringify(m.rpc.mock.calls) + JSON.stringify(m.finish.mock.calls)).not.toContain(
      result.temporary,
    );
  },
);
it.each(['', 'short'])(
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

it.each(['CREATE', 'RESET'])('accepts six lowercase characters for %s', async (kind) => {
  const f = form(kind);
  f.set('temporaryMode', 'CHOOSE');
  f.set('temporaryPassword', 'abcdef');
  if (kind === 'RESET') m.rpc.mockResolvedValue({ data: { target, completed: false } });
  expect((await accountChange(f)).temporary).toBe('abcdef');
});

it('releases failed setup and retries the same linked Auth UUID', async () => {
  const f = form();
  m.finish.mockResolvedValueOnce({ error: { message: 'setup failed' } });
  expect(await accountChange(f)).toEqual({ error: 'accountChangeFailed' });
  expect(m.finish).toHaveBeenCalledWith('release_account_change', { p_request: f.get('request') });
  m.rpc.mockResolvedValue({ data: { target, completed: false } });
  expect((await accountChange(f)).success).toBe(true);
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.update).toHaveBeenCalledWith(target, { password: 'Manually-Chosen-Only' });
});

it.each(['OWNER', 'MANAGER'])(
  'creates %s using only four visible fields, ignoring obsolete phone inputs',
  async (role) => {
    const f = form();
    f.set('role', role);
    f.delete('language');
    f.delete('active');
    f.delete('verified');
    f.set('phone', 'this is not a phone');
    f.set('country', 'invalid');
    expect((await accountChange(f)).success).toBe(true);
    expect(m.create.mock.calls[0][0]).not.toHaveProperty('phone');
    expect(m.create.mock.calls[0][0]).not.toHaveProperty('phone_confirm');
    expect(m.finish).toHaveBeenCalledWith(
      'finish_username_creation',
      expect.objectContaining({
        p_contact: null,
        p_values: expect.objectContaining({ role, active: true, language: 'es' }),
      }),
    );
  },
);
