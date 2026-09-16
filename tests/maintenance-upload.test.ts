import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ prepare: vi.fn(), finish: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/maintenance-actions', () => ({
  prepareMaintenanceUpdate: m.prepare,
  finishMaintenancePhoto: m.finish,
}));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ upload: m.upload }) } }),
}));
import { addMaintenanceUpdate } from '../src/lib/maintenance-upload';
beforeEach(() => {
  vi.clearAllMocks();
  m.prepare.mockResolvedValue({});
  m.finish.mockResolvedValue({});
  m.upload.mockResolvedValue({ error: null });
});
it('photo bytes go to private Storage, only hash/size/type go to server reservation', async () => {
  const f = new FormData();
  f.set('id', '50000000-0000-4000-8000-000000000001');
  f.set('occurrence', '50000000-0000-4000-8000-000000000002');
  f.set('body', 'Inspected');
  f.set('photo', new File(['fixture'], 'work.jpg', { type: 'image/jpeg' }));
  expect(await addMaintenanceUpdate({}, f)).toEqual({});
  expect(m.prepare.mock.calls[0][0].photo).toBeUndefined();
  expect(m.prepare.mock.calls[0][1]).toEqual({
    byte_size: 7,
    content_type: 'image/jpeg',
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(m.upload).toHaveBeenCalled();
  expect(m.finish).toHaveBeenCalledWith('50000000-0000-4000-8000-000000000001');
});
it('a failed reservation never uploads or publishes', async () => {
  m.prepare.mockResolvedValue({ error: 'FORBIDDEN' });
  const f = new FormData();
  f.set('photo', new File(['x'], 'work.jpg', { type: 'image/jpeg' }));
  expect(await addMaintenanceUpdate({}, f)).toEqual({ error: 'FORBIDDEN' });
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.finish).not.toHaveBeenCalled();
});
