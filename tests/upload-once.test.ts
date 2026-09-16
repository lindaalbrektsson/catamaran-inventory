import { expect, it, vi } from 'vitest';
import { uploadOnce } from '@/lib/upload-once';
it('coalesces duplicate submissions and does not resend after successful storage upload', async () => {
  const send = vi.fn(async () => ({ error: null }));
  await Promise.all([uploadOnce('same', send), uploadOnce('same', send)]);
  await uploadOnce('same', send);
  expect(send).toHaveBeenCalledTimes(1);
  await uploadOnce('different', send);
  expect(send).toHaveBeenCalledTimes(2);
});
it('permits retry after an interrupted upload or a storage error', async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ error: 'failed' })
    .mockResolvedValue({ error: null });
  await expect(uploadOnce('retry', send)).rejects.toThrow('offline');
  await uploadOnce('retry', send);
  await uploadOnce('retry', send);
  expect(send).toHaveBeenCalledTimes(3);
});
