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
it.each(['MANAGER', 'CAPTAIN', 'CREW'])('%s cannot administer documents', async (role) => {
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
