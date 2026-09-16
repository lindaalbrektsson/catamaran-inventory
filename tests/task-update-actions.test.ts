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
vi.mock('@/lib/voice-validation', () => ({ validateVoice: async () => 0.5 }));
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
import { prepareTaskUpdate, finishTaskUpdate } from '@/lib/task-update-actions';
const id = '50000000-0000-4000-8000-000000000001',
  bytes = Buffer.from('fixture'),
  voice = {
    content_type: 'audio/webm',
    byte_size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    duration: 1,
  };
beforeEach(() => {
  vi.clearAllMocks();
  m.role = 'MANAGER';
  m.rpc.mockResolvedValue({ error: null });
  m.admin.mockResolvedValue({ error: null });
  m.row.mockResolvedValue({ data: { id, voice, photo: null, ready: false } });
  m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
});
it.each(['OWNER', 'MANAGER'])('%s can reserve and publish validated audio', async (role) => {
  m.role = role;
  expect(await prepareTaskUpdate({ id, task: id, occurrence: '', body: '' }, null, voice)).toEqual(
    {},
  );
  expect(await finishTaskUpdate(id)).toEqual({});
  expect(m.admin).toHaveBeenCalledWith('finish_task_update', {
    p_id: id,
    p_actor: '40000000-0000-4000-8000-000000000001',
    p_duration: 0.5,
  });
});
it('rejects missing files and hash mismatch without publication', async () => {
  m.download.mockResolvedValueOnce({ data: null, error: {} });
  expect(await finishTaskUpdate(id)).toEqual({ error: 'docUploadIncomplete' });
  m.download.mockResolvedValueOnce({ data: new Blob(['wrong']), error: null });
  expect(await finishTaskUpdate(id)).toEqual({ error: 'voiceInvalid' });
  expect(m.admin).not.toHaveBeenCalled();
});
it('rejects unsupported roles and empty updates', async () => {
  expect(await prepareTaskUpdate({ id, task: id, occurrence: '', body: '' }, null, null)).toEqual({
    error: 'updateEmpty',
  });
  m.role = 'CREW';
  expect(await finishTaskUpdate(id)).toEqual({ error: 'FORBIDDEN' });
  expect(m.admin).not.toHaveBeenCalled();
});
