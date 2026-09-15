import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ claims: vi.fn(), profile: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('REDIRECT:' + path);
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase/config', () => ({ isConfigured: () => true }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    auth: { getClaims: m.claims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.profile }) }) }),
  }),
}));
import { requireProfile } from '@/lib/auth';
beforeEach(() => {
  vi.clearAllMocks();
  m.claims.mockResolvedValue({ data: { claims: { sub: 'fixture', iat: 100 } }, error: null });
  m.profile.mockResolvedValue({
    data: {
      id: 'fixture',
      role: 'OWNER',
      active: true,
      credential_epoch: 0,
      must_change_password: false,
      credential_pending: false,
    },
    error: null,
  });
});
it('profile outage fails closed and a fresh retry recovers without changing identity or policies', async () => {
  m.profile.mockResolvedValueOnce({ data: null, error: { message: 'temporary unavailable' } });
  await expect(requireProfile()).rejects.toThrow('PROFILE_LOAD_FAILED');
  await expect(requireProfile()).resolves.toMatchObject({ id: 'fixture', active: true });
});
it('temporary auth network errors surface a retryable failure instead of treating user as signed out', async () => {
  m.claims.mockResolvedValueOnce({
    data: null,
    error: { name: 'AuthRetryableFetchError', status: 503 },
  });
  await expect(requireProfile()).rejects.toThrow('AUTH_LOAD_FAILED');
  expect(m.profile).not.toHaveBeenCalled();
  await expect(requireProfile()).resolves.toMatchObject({ id: 'fixture' });
});
it('invalid sessions still require login and password gates stay enforced', async () => {
  m.claims.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', status: 401 } });
  await expect(requireProfile()).rejects.toThrow('REDIRECT:/login');
  m.profile.mockResolvedValueOnce({
    data: { active: true, must_change_password: true, credential_epoch: 0 },
    error: null,
  });
  await expect(requireProfile()).rejects.toThrow('REDIRECT:/change-password');
  m.profile.mockResolvedValueOnce({ data: { active: true, credential_epoch: 101 }, error: null });
  await expect(requireProfile()).rejects.toThrow('REDIRECT:/login');
});
