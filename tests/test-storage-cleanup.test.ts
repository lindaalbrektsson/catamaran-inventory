import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  authAdmin: () => ({
    rpc: m.rpc,
    storage: {
      from: (bucket: string) => ({ remove: (paths: string[]) => m.remove(bucket, paths) }),
    },
  }),
}));
import { cleanTestStorage } from '../src/lib/test-storage-cleanup';
beforeEach(() => vi.resetAllMocks());
it.each([false, true])(
  'storage cleanup acknowledges only successful removals (%s)',
  async (success) => {
    m.rpc
      .mockResolvedValueOnce({
        data: { bucket: 'documents', path: 'owned/version', token: 'lease' },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ data: null });
    m.remove.mockResolvedValue({ error: success ? null : { message: 'network' } });
    expect(await cleanTestStorage()).toBe(success ? 1 : 0);
    expect(m.remove).toHaveBeenCalledWith('documents', ['owned/version']);
    expect(m.rpc).toHaveBeenCalledWith('finish_test_storage_cleanup', {
      p_bucket: 'documents',
      p_path: 'owned/version',
      p_token: 'lease',
      p_success: success,
    });
  },
);
it('an interrupted request remains retryable and work is bounded', async () => {
  m.rpc.mockResolvedValue({
    data: { bucket: 'need-photos', path: 'owned/version', token: 'lease' },
  });
  m.remove.mockRejectedValue(new Error('offline'));
  expect(await cleanTestStorage(2)).toBe(0);
  expect(m.remove).toHaveBeenCalledTimes(2);
});
