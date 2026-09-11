import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  send: vi.fn(),
  verify: vi.fn(),
  getUser: vi.fn(),
  setSession: vi.fn(),
  update: vi.fn(),
  login: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: m.send,
      verifyOtp: m.verify,
      getUser: m.getUser,
      setSession: m.setSession,
      updateUser: m.update,
    },
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: m.get, set: m.set }) }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('REDIRECT:' + path);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../src/lib/supabase/config', () => ({
  config: () => ({ url: 'https://test.supabase.co', key: 'test-public' }),
}));
vi.mock('../src/lib/supabase/server', () => ({
  supabase: async () => ({ auth: { signInWithPassword: m.login } }),
}));
import { recoverPassword } from '../src/lib/recovery-actions';
const user = { id: 'test-user-id', phone: '5011234567' };
function form(intent: string, extra: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({
    intent,
    country: '501',
    phone: '1234567',
    code: '123456',
    password: 'test-password-123',
    confirm: 'test-password-123',
    ...extra,
  }))
    result.set(key, value);
  return result;
}
function cookie(method = 'otp', age = 0) {
  const time = Math.floor(Date.now() / 1000) - age;
  const access = `e30.${Buffer.from(JSON.stringify({ sub: user.id, iat: time, amr: [{ method, timestamp: time }] })).toString('base64url')}.test`;
  return { value: JSON.stringify({ access, refresh: 'isolated-refresh' }) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SMS_RECOVERY_ENABLED', 'true');
  m.send.mockResolvedValue({ error: null });
  m.verify.mockResolvedValue({
    data: { session: { access_token: 'isolated-access', refresh_token: 'isolated-refresh' } },
  });
  m.get.mockReturnValue(cookie());
  m.getUser.mockResolvedValue({ data: { user } });
  m.setSession.mockResolvedValue({ data: { user } });
  m.update.mockResolvedValue({ error: null });
  m.login.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
it('requires explicit SMS configuration before contacting Auth', async () => {
  vi.stubEnv('SMS_RECOVERY_ENABLED', 'false');
  expect(await recoverPassword({}, form('send'))).toEqual({ error: 'recoveryUnavailable' });
  expect(m.send).not.toHaveBeenCalled();
});
it('never self-registers and gives identical responses for missing users/provider errors', async () => {
  const expected = await recoverPassword({}, form('send'));
  expect(m.send).toHaveBeenCalledWith({
    phone: '+5011234567',
    options: { shouldCreateUser: false, channel: 'sms' },
  });
  m.send.mockResolvedValue({ error: { message: 'private provider detail' } });
  expect(await recoverPassword({}, form('send'))).toEqual(expected);
  m.send.mockRejectedValue(new Error('private provider detail'));
  expect(await recoverPassword({}, form('send'))).toEqual(expected);
});
it('rejects malformed phone numbers without sending an SMS', async () => {
  expect(await recoverPassword({}, form('send', { phone: 'invalid' }))).toEqual({
    error: 'INVALID_INPUT',
  });
  expect(m.send).not.toHaveBeenCalled();
});
it('OTP verification stores only a short-lived HttpOnly recovery cookie; no normal login', async () => {
  expect(await recoverPassword({}, form('verify'))).toEqual({ step: 'password' });
  expect(m.set).toHaveBeenCalledWith(
    'catamaran-recovery',
    expect.any(String),
    expect.objectContaining({
      httpOnly: true,
      sameSite: 'strict',
      path: '/forgot-password',
      maxAge: 600,
    }),
  );
  expect(m.login).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
});
it('bad/expired OTP never establishes a recovery session', async () => {
  m.verify.mockResolvedValue({ error: {}, data: {} });
  expect(await recoverPassword({}, form('verify'))).toEqual({
    step: 'code',
    error: 'recoveryCodeError',
  });
  expect(m.set).not.toHaveBeenCalled();
});
it.each([undefined, { value: 'not-json' }, cookie('password'), cookie('otp', 601)])(
  'rejects absent, malformed, non-OTP or expired recovery',
  async (value) => {
    m.get.mockReturnValue(value);
    expect(await recoverPassword({}, form('password'))).toEqual({ error: 'recoveryExpired' });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.login).not.toHaveBeenCalled();
  },
);
it('rejects a revoked token before trusting its decoded claims', async () => {
  m.getUser.mockResolvedValue({ error: {}, data: {} });
  expect(await recoverPassword({}, form('password'))).toEqual({ error: 'recoveryExpired' });
  expect(m.setSession).not.toHaveBeenCalled();
});
it('requires matching passwords and does not log in if update fails', async () => {
  expect(await recoverPassword({}, form('password', { confirm: 'wrong' }))).toEqual({
    step: 'password',
    error: 'passwordRules',
  });
  expect(m.update).not.toHaveBeenCalled();
  m.update.mockResolvedValue({ error: {} });
  expect(await recoverPassword({}, form('password'))).toEqual({
    step: 'password',
    error: 'passwordChangeFailed',
  });
  expect(m.login).not.toHaveBeenCalled();
});
it('changes the verified account password then establishes persistent login and clears recovery', async () => {
  await expect(recoverPassword({}, form('password'))).rejects.toThrow('REDIRECT:/');
  expect(m.update).toHaveBeenCalledWith({ password: 'test-password-123' });
  expect(m.login).toHaveBeenCalledWith({ phone: user.phone, password: 'test-password-123' });
  expect(m.set).toHaveBeenCalledWith(
    'catamaran-recovery',
    '',
    expect.objectContaining({ maxAge: 0 }),
  );
});
