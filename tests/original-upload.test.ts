import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), finish: vi.fn(), upload: vi.fn() }));
vi.mock('../src/lib/operational-actions', () => ({
  prepareOriginalReceipt: mocks.reserve,
  finishOriginalReceipt: mocks.finish,
}));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ upload: mocks.upload }) } }),
}));
import { uploadOriginalReceipt } from '../src/lib/original-upload';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.reserve.mockResolvedValue({ path: 'intake/test/original.png' });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.finish.mockResolvedValue({});
});
function data() {
  const f = new FormData();
  f.set('receipt', new File([new Uint8Array([1, 2, 3, 4])], 'source.png', { type: 'image/png' }));
  f.set('requestId', '50000000-0000-4000-8000-000000000001');
  f.set('receiptType', 'STORE');
  f.set('payment', 'CARD');
  return f;
}
it('uploads exact original bytes without upsert and finishes only after upload', async () => {
  const form = data();
  await uploadOriginalReceipt({}, form);
  const file = mocks.upload.mock.calls[0][1] as File;
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  expect(mocks.upload.mock.calls[0][2]).toEqual({
    contentType: 'image/png',
    cacheControl: '0',
    upsert: false,
  });
  expect(mocks.reserve.mock.calls[0][0]).toMatchObject({
    size: 4,
    mime: 'image/png',
    payment: 'CARD',
    type: 'STORE',
  });
  expect(mocks.finish).toHaveBeenCalledWith(form.get('requestId'));
});
it('provides feedback on network failure and permits a retry using the same request', async () => {
  mocks.upload.mockRejectedValueOnce(new Error('offline'));
  const form = data();
  expect(await uploadOriginalReceipt({}, form)).toEqual({ error: 'RECEIPT_UPLOAD_INCOMPLETE' });
  expect(mocks.finish).not.toHaveBeenCalled();
  await uploadOriginalReceipt({}, form);
  expect(mocks.reserve.mock.calls[0][0].id).toBe(mocks.reserve.mock.calls[1][0].id);
  expect(mocks.finish).toHaveBeenCalledTimes(1);
});
it('handles an existing immutable upload through server verification, never overwrite', async () => {
  mocks.upload.mockResolvedValue({ error: { message: 'already exists' } });
  await uploadOriginalReceipt({}, data());
  expect(mocks.finish).toHaveBeenCalledTimes(1);
});
