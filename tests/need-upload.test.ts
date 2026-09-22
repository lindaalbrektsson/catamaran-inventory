import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  save: vi.fn(),
  open: vi.fn(),
  prepare: vi.fn(),
  finish: vi.fn(),
  image: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/lib/quick-actions', () => ({ saveNeed: m.save, openSavedNeed: m.open }));
vi.mock('@/lib/need-photo-actions', () => ({
  prepareNeedPhoto: m.prepare,
  finishNeedPhoto: m.finish,
}));
vi.mock('@/lib/image-processing-client', () => ({ optimizedImage: m.image }));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ upload: m.upload }) } }),
}));
import { uploadNeed } from '../src/lib/need-upload';
const need = '90000000-0000-4000-8000-000000000001';
function form(photo = true) {
  const f = new FormData();
  f.set('requestId', crypto.randomUUID());
  f.set('version', '0');
  f.set('name', 'Fixture');
  if (photo) f.set('photo', new File(['source'], 'phone.png', { type: 'image/png' }));
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.save.mockResolvedValue({ needId: need });
  m.prepare.mockImplementation(async ({ id }) => ({ path: need + '/' + id + '.jpg' }));
  m.finish.mockResolvedValue({});
  m.image.mockResolvedValue(new File(['optimized'], 'phone.jpg', { type: 'image/jpeg' }));
  m.upload.mockResolvedValue({ error: null });
});
it('existing no-photo flow still saves and opens without Storage', async () => {
  await uploadNeed({}, form(false));
  expect(m.open).toHaveBeenCalledWith(need);
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.upload).not.toHaveBeenCalled();
});
it('optimizes before metadata save and sends only optimized bytes directly to Storage', async () => {
  await uploadNeed({}, form());
  expect(m.image).toHaveBeenCalledWith(expect.any(File), 'need');
  expect(m.save.mock.calls[0][1].has('photo')).toBe(false);
  expect(m.prepare).toHaveBeenCalledWith(
    expect.objectContaining({ need, version: 1, byte_size: 9 }),
  );
  expect(m.upload.mock.calls[0][1].size).toBe(9);
  expect(m.upload.mock.calls[0][2].upsert).toBe(false);
});
it('invalid image produces no metadata or storage writes', async () => {
  m.image.mockRejectedValue(Error('decode'));
  expect(await uploadNeed({}, form())).toEqual({ error: 'needPhotoInvalid' });
  expect(m.save).not.toHaveBeenCalled();
});
it('accepted upload is not repeated after finalization retry', async () => {
  const f = form();
  m.finish.mockResolvedValueOnce({ error: 'needPhotoRetry' });
  expect(await uploadNeed({}, f)).toEqual({ error: 'needPhotoRetry' });
  await uploadNeed({}, f);
  expect(m.upload).toHaveBeenCalledTimes(1);
  expect(m.finish).toHaveBeenCalledTimes(2);
  expect(m.open).toHaveBeenCalledTimes(1);
});
it('ambiguous upload response is reconciled before retry', async () => {
  m.upload.mockRejectedValue(Error('network'));
  await uploadNeed({}, form());
  expect(m.finish).toHaveBeenCalledTimes(1);
  expect(m.open).toHaveBeenCalledWith(need);
});
