import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), row: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: m.row };
    return { from: () => q, storage: { from: () => ({ download: m.download }) } };
  },
}));
import { GET } from '../src/app/task-update-file/[id]/[kind]/route';
const params = Promise.resolve({ id: '50000000-0000-4000-8000-000000000001', kind: 'voice' });
beforeEach(() => {
  vi.clearAllMocks();
  m.profile.mockResolvedValue({ active: true, role: 'MANAGER' });
  m.row.mockResolvedValue({ data: { voice: { content_type: 'audio/mp4' } } });
  m.download.mockResolvedValue({ data: new Blob(['0123456789']), error: null });
});
it('authenticated inline playback supports byte ranges and private no-store', async () => {
  const r = await GET(new Request('http://localhost/file', { headers: { Range: 'bytes=2-5' } }), {
    params,
  });
  expect(r.status).toBe(206);
  expect(r.headers.get('content-range')).toBe('bytes 2-5/10');
  expect(r.headers.get('cache-control')).toContain('no-store');
  expect(r.headers.get('content-disposition')).toBe('inline');
  expect(await r.text()).toBe('2345');
});
it('rejects anonymous, unauthorized/missing rows and invalid ranges', async () => {
  m.profile.mockResolvedValueOnce(null);
  expect((await GET(new Request('http://localhost/file'), { params })).status).toBe(401);
  m.row.mockResolvedValueOnce({ data: null });
  expect((await GET(new Request('http://localhost/file'), { params })).status).toBe(404);
  expect(
    (
      await GET(new Request('http://localhost/file', { headers: { Range: 'bytes=50-60' } }), {
        params,
      })
    ).status,
  ).toBe(416);
});
