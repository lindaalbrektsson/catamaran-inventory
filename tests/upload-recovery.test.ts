import { it, expect } from 'vitest';
import { recoverUpload } from '../src/lib/upload-recovery';
it('returns retryable state after an ambiguous network error without resubmitting', async () => {
  let calls = 0;
  expect(
    await recoverUpload(
      async () => {
        calls++;
        throw new TypeError('Network error');
      },
      { error: 'incomplete' },
    ),
  ).toEqual({ error: 'incomplete' });
  expect(calls).toBe(1);
});
it('does not swallow framework redirects', async () => {
  const error = Object.assign(new Error('NEXT_REDIRECT'), {
    digest: 'NEXT_REDIRECT;replace;/expenses;303;',
  });
  await expect(
    recoverUpload(
      async () => {
        throw error;
      },
      { error: 'incomplete' },
    ),
  ).rejects.toBe(error);
});
