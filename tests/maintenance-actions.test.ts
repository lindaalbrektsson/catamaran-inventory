import { beforeEach, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
const m = vi.hoisted(() => ({
  role: 'MANAGER',
  rpc: vi.fn(),
  admin: vi.fn(),
  download: vi.fn(),
  row: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireProfile: async () => ({ id: '40000000-0000-4000-8000-000000000001', role: m.role }),
}));
vi.mock('@/lib/document-validation', () => ({ validateDocument: m.validate }));
vi.mock('@/lib/supabase/admin', () => ({ authAdmin: () => ({ rpc: m.admin }) }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    rpc: m.rpc,
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: m.row };
      return q;
    },
    storage: { from: () => ({ download: m.download }) },
  }),
}));
import { prepareMaintenanceUpdate, finishMaintenancePhoto } from '../src/lib/maintenance-actions';
const id = '50000000-0000-4000-8000-000000000001',
  bytes = Buffer.from('isolated image bytes'),
  hash = createHash('sha256').update(bytes).digest('hex');
beforeEach(() => {
  vi.clearAllMocks();
  m.role = 'MANAGER';
  m.rpc.mockResolvedValue({ error: null });
  m.admin.mockResolvedValue({ error: null });
  m.validate.mockResolvedValue(undefined);
  m.row.mockResolvedValue({
    data: {
      id,
      photo_path: id,
      content_type: 'image/jpeg',
      byte_size: bytes.length,
      sha256: hash,
      photo_ready: false,
    },
  });
  m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
});
it('reserves update/photo metadata with no image bytes in Server Action', async () => {
  expect(
    await prepareMaintenanceUpdate(
      { id, occurrence: id, body: 'Checked wiring' },
      { content_type: 'image/jpeg', byte_size: bytes.length, sha256: hash },
    ),
  ).toEqual({});
  expect(m.rpc).toHaveBeenCalledWith(
    'add_maintenance_update',
    expect.objectContaining({ p_id: id, p_body: 'Checked wiring' }),
  );
  expect(m.admin).not.toHaveBeenCalled();
});
it('validates original photo hash and decoded image before publishing', async () => {
  expect(await finishMaintenancePhoto(id)).toEqual({});
  expect(m.validate).toHaveBeenCalled();
  expect(m.admin).toHaveBeenCalledWith('finish_maintenance_photo', {
    p_id: id,
    p_actor: '40000000-0000-4000-8000-000000000001',
  });
});
it('rejects mismatched or invalid image without publishing', async () => {
  m.download.mockResolvedValueOnce({ data: new Blob(['wrong']), error: null });
  expect(await finishMaintenancePhoto(id)).toEqual({ error: 'docInvalidFile' });
  expect(m.admin).not.toHaveBeenCalled();
  m.validate.mockRejectedValueOnce(new Error('invalid bytes'));
  expect(await finishMaintenancePhoto(id)).toEqual({ error: 'docInvalidFile' });
  expect(m.admin).not.toHaveBeenCalled();
});
it('missing upload remains recoverable and unpublished', async () => {
  m.download.mockResolvedValueOnce({ data: null, error: {} });
  expect(await finishMaintenancePhoto(id)).toEqual({ error: 'docUploadIncomplete' });
  expect(m.admin).not.toHaveBeenCalled();
  expect(await finishMaintenancePhoto(id)).toEqual({});
});
it('unsupported role cannot prepare or publish updates', async () => {
  m.role = 'CREW';
  expect(await prepareMaintenanceUpdate({ id, occurrence: id, body: 'x' }, null)).toEqual({
    error: 'FORBIDDEN',
  });
  expect(await finishMaintenancePhoto(id)).toEqual({ error: 'FORBIDDEN' });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.admin).not.toHaveBeenCalled();
});
