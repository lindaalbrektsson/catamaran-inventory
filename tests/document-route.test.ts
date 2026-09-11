import { beforeEach, it, expect, vi, afterEach } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), row: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: m.row };
    return {
      from: () => q,
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'fixture-only-not-a-real-token' } },
        }),
      },
    };
  },
}));
import { GET } from '../src/app/document-file/[id]/route';
const id = '70000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', m.fetch);
  m.profile.mockResolvedValue({ active: true, role: 'MANAGER' });
});
afterEach(() => vi.unstubAllGlobals());
it('rejects anonymous and inactive users before fetching any files', async () => {
  m.profile.mockResolvedValue(null);
  const r = await GET(new Request('https://app.test/document-file/' + id), {
    params: Promise.resolve({ id }),
  });
  expect(r.status).toBe(401);
  expect(m.fetch).not.toHaveBeenCalled();
  expect(r.headers.get('Cache-Control')).toContain('no-store');
});
it('does not disclose or retrieve RLS-hidden documents', async () => {
  m.row.mockResolvedValue({ data: null, error: null });
  expect(
    (
      await GET(new Request('https://app.test/document-file/' + id), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(404);
  expect(m.fetch).not.toHaveBeenCalled();
});
it('streams permitted files without signed redirects or cached responses', async () => {
  m.row
    .mockResolvedValueOnce({
      data: { current_file_id: id, title: 'Safety instructions' },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { object_path: id + '/' + id, content_type: 'application/pdf' },
    });
  m.fetch.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70])));
  const r = await GET(new Request('https://app.test/document-file/' + id + '?download=1'), {
    params: Promise.resolve({ id }),
  });
  expect(r.status).toBe(200);
  expect(r.headers.get('Content-Type')).toBe('application/pdf');
  expect(r.headers.get('Content-Disposition')).toContain('attachment');
  expect(r.headers.get('Content-Disposition')).toContain('Safety%20instructions.pdf');
  expect(r.headers.get('Location')).toBeNull();
  expect(r.headers.get('Content-Length')).toBeNull();
  expect(r.headers.get('Cache-Control')).toContain('no-store');
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
});
