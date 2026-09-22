import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  prepare: vi.fn(),
  finish: vi.fn(),
  open: vi.fn(),
  upload: vi.fn(),
  process: vi.fn(),
}));
vi.mock('../src/lib/document-actions', () => ({
  prepareDocument: m.prepare,
  finishDocument: m.finish,
  openSavedDocument: m.open,
}));
vi.mock('../src/lib/image-processing-client', () => ({ optimizedImage: m.process }));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ upload: m.upload }) } }),
}));
import { uploadDocument } from '../src/lib/document-upload';
beforeEach(() => {
  vi.resetAllMocks();
  m.prepare.mockResolvedValue({ id: 'doc', path: 'doc/file', file_id: 'file' });
  m.finish.mockResolvedValue({ id: 'doc' });
  m.upload.mockResolvedValue({ error: null });
});
it('sends only metadata to Server Actions and original bytes directly to Storage', async () => {
  const f = new FormData();
  f.set('id', crypto.randomUUID());
  f.set('requestId', crypto.randomUUID());
  f.set('title', 'Fixture');
  f.set('file', new File(['%PDF-1.4\nfixture\n%%EOF'], 'fixture.pdf', { type: 'application/pdf' }));
  await uploadDocument({}, f);
  const [values, manifest] = m.prepare.mock.calls[0];
  expect(values).not.toHaveProperty('file');
  expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(m.upload).toHaveBeenCalledWith(
    'doc/file',
    expect.any(File),
    expect.objectContaining({ upsert: false }),
  );
  expect(m.finish).toHaveBeenCalledWith('file');
  expect(m.open).toHaveBeenCalledWith('doc');
});
it('does not open the document when file completion fails', async () => {
  m.finish.mockResolvedValue({ error: 'docUploadIncomplete' });
  const f = new FormData();
  f.set('file', new File(['fixture'], 'fixture.pdf', { type: 'application/pdf' }));
  expect(await uploadDocument({}, f)).toEqual({ error: 'docUploadIncomplete' });
  expect(m.open).not.toHaveBeenCalled();
});

it('optimizes once and preserves upload hash/bytes across ambiguous finalization retry', async () => {
  const optimized = new File(['optimized-unique-jpeg'], 'document.jpg', { type: 'image/jpeg' });
  m.process.mockResolvedValue(optimized);
  const f = new FormData();
  f.set('requestId', crypto.randomUUID());
  f.set('file', new File(['original-large'], 'camera.png', { type: 'image/png' }));
  m.finish.mockResolvedValueOnce({ error: 'docUploadIncomplete' }).mockResolvedValue({ id: 'doc' });
  await uploadDocument({}, f);
  await uploadDocument({}, f);
  expect(m.process).toHaveBeenCalledTimes(2);
  expect(m.upload).toHaveBeenCalledOnce();
  expect(m.finish).toHaveBeenCalledTimes(2);
  expect(m.upload.mock.calls[0][1]).toBe(optimized);
  expect(m.prepare.mock.calls[0][1]).toEqual(m.prepare.mock.calls[1][1]);
  expect(m.prepare.mock.calls[0][1].content_type).toBe('image/jpeg');
});
it('rejects decoding failure before reservation or upload', async () => {
  m.process.mockRejectedValue(Error('decode'));
  const f = new FormData();
  f.set('file', new File(['html'], 'fake.jpg', { type: 'image/jpeg' }));
  expect(await uploadDocument({}, f)).toEqual({ error: 'docInvalidFile' });
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.upload).not.toHaveBeenCalled();
});
it('30 MiB PDF travels unchanged to Storage; oversized PDF never reserves', async () => {
  const file = new File([new Uint8Array(30 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    }),
    f = new FormData();
  f.set('file', file);
  await uploadDocument({}, f);
  expect(m.upload.mock.calls[0][1]).toBe(file);
  expect(m.prepare.mock.calls[0][0]).not.toHaveProperty('file');
  expect(m.process).not.toHaveBeenCalled();
  m.prepare.mockClear();
  f.set(
    'file',
    new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'too-big.pdf', { type: 'application/pdf' }),
  );
  expect(await uploadDocument({}, f)).toEqual({ error: 'docInvalidFile' });
  expect(m.prepare).not.toHaveBeenCalled();
});
