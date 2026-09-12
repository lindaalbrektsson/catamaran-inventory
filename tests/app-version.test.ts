import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../src/app/app-version/route';
afterEach(() => vi.unstubAllEnvs());
it('CLI deployment has a nonempty release marker when Git metadata is empty', async () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
  vi.stubEnv('APP_RELEASE_VERSION', 'public-commit-fixture');
  const response = GET();
  expect(await response.json()).toEqual({ version: 'public-commit-fixture' });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('Git deployments use the platform commit', async () => {
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'git-commit-fixture');
  vi.stubEnv('APP_RELEASE_VERSION', '');
  expect(await GET().json()).toEqual({ version: 'git-commit-fixture' });
});
