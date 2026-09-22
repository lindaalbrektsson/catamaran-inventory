vi.mock('@/lib/supabase/admin', () => ({ authAdmin: () => ({ rpc: m.rpc }) }));
import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  profile: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  download: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile, getProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: m.maybeSingle };
    return { from: () => q, rpc: m.rpc, storage: { from: () => ({ download: m.download }) } };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { prepareDocument, finishDocument } from '../src/lib/document-actions';
const values = () => ({
  id: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  version: 0,
  title: 'Fixture',
  description: '',
  category: '',
  expiry_date: '',
  favorite: true,
  archived: false,
  access_level: 'OWNERS',
  selected_users: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ role: 'OWNER', id: '40000000-0000-4000-8000-000000000001' });
  m.rpc.mockResolvedValue({ data: { id: 'saved' }, error: null });
});
it.each(['CAPTAIN', 'CREW'])('%s cannot administer documents', async (role) => {
  m.profile.mockResolvedValue({ role });
  expect(await prepareDocument(values(), null)).toEqual({ error: 'FORBIDDEN' });
  expect(await finishDocument(crypto.randomUUID())).toEqual({ error: 'FORBIDDEN' });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('owner changes go exclusively through the audited RPC', async () => {
  await prepareDocument(values(), null);
  expect(m.rpc).toHaveBeenCalledWith(
    'save_document',
    expect.objectContaining({
      p_values: expect.objectContaining({ favorite: true, access_level: 'OWNERS' }),
    }),
  );
});
it('invalid expiry and empty selected users are rejected before writes', async () => {
  expect(await prepareDocument({ ...values(), expiry_date: '2026-02-31' }, null)).toEqual({
    error: 'INVALID_INPUT',
  });
  expect(await prepareDocument({ ...values(), access_level: 'SELECTED' }, null)).toEqual({
    error: 'INVALID_INPUT',
  });
  expect(m.rpc).not.toHaveBeenCalled();
});
it('completion rejects mismatched stored bytes', async () => {
  m.maybeSingle.mockResolvedValue({
    data: {
      object_path: 'fixture',
      byte_size: 100,
      sha256: 'a'.repeat(64),
      content_type: 'application/pdf',
    },
  });
  m.download.mockResolvedValue({ data: new Blob(['wrong']), error: null });
  expect(await finishDocument(crypto.randomUUID())).toEqual({ error: 'docInvalidFile' });
  expect(m.rpc).not.toHaveBeenCalled();
});

it('manager can create but cannot administer document metadata', async () => {
  m.profile.mockResolvedValue({ role: 'MANAGER' });
  await prepareDocument(
    { ...values(), favorite: false, access_level: 'MANAGERS' },
    { id: crypto.randomUUID(), content_type: 'image/jpeg', byte_size: 20, sha256: 'a'.repeat(64) },
  );
  expect(m.rpc).toHaveBeenCalledWith('save_document', expect.anything());
  expect(await prepareDocument(values(), null)).toEqual({ error: 'FORBIDDEN' });
});

it.each(['OWNER', 'MANAGER'])(
  '%s server validates bytes before privileged finalization',
  async (role) => {
    const bytes = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const actor = '40000000-0000-4000-8000-000000000001';
    m.profile.mockResolvedValue({ role, id: actor });
    m.maybeSingle.mockResolvedValue({
      data: {
        object_path: 'fixture',
        document_id: 'document',
        byte_size: bytes.length,
        sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
        content_type: 'application/pdf',
      },
    });
    m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    const id = crypto.randomUUID();
    expect(await finishDocument(id)).toEqual({ id: 'document' });
    expect(m.rpc).toHaveBeenCalledWith('complete_document_file', { p_file: id, p_actor: actor });
  },
);

it.each(['application/pdf', 'image/jpeg'])(
  'matching hash does not allow malformed %s to finalize',
  async (mime) => {
    const bytes = Buffer.from('<html>disguised content</html>');
    m.profile.mockResolvedValue({ role: 'OWNER', id: '40000000-0000-4000-8000-000000000001' });
    m.maybeSingle.mockResolvedValue({
      data: {
        object_path: 'fixture',
        byte_size: bytes.length,
        sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
        content_type: mime,
      },
    });
    m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    expect(await finishDocument(crypto.randomUUID())).toEqual({ error: 'docInvalidFile' });
    expect(m.rpc).not.toHaveBeenCalled();
  },
);
