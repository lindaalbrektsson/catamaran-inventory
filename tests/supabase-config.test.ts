import { afterEach, it, expect, vi } from 'vitest';
import { config, isConfigured } from '../src/lib/supabase/config';
afterEach(() => vi.unstubAllEnvs());
it('uses only the two documented public variable names', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'test-url-marker');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-public-marker');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'unused-test-marker');
  expect(config()).toEqual({ url: 'test-url-marker', key: 'test-public-marker' });
  expect(isConfigured()).toBe(true);
});
it('does not fall back to alternate or secret variable names', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('SUPABASE_URL', 'unused-test-marker');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'unused-test-marker');
  expect(isConfigured()).toBe(false);
  expect(() => config()).toThrow('SUPABASE_NOT_CONFIGURED');
});
