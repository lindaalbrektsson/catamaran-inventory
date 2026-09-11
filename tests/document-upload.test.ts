import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ prepare: vi.fn(), finish: vi.fn(), open: vi.fn(), upload: vi.fn() }));
vi.mock('../src/lib/document-actions', () => ({
  prepareDocument: m.prepare,
  finishDocument: m.finish,
  openSavedDocument: m.open,
}));
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
