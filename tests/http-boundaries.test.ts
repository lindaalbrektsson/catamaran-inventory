import { it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
const mock = vi.hoisted(() => ({
  profile: vi.fn(),
  row: vi.fn(),
  download: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getProfile: mock.profile, requireProfile: mock.profile }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mock.row,
        single: mock.row,
      };
      return query;
    },
    storage: { from: () => ({ download: mock.download }) },
    rpc: mock.rpc,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('REDIRECT:' + path);
  },
}));
import { GET } from '../src/app/intake-image/[id]/route';
import { reviewReceipt, finishOriginalReceipt } from '../src/lib/operational-actions';
import { createHash } from 'node:crypto';
const id = '80000000-0000-4000-8000-000000000001';
let bytes: Buffer;
beforeEach(async () => {
  vi.resetAllMocks();
  bytes = await sharp({ create: { width: 20, height: 30, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  mock.profile.mockResolvedValue({
    id: '40000000-0000-4000-8000-000000000001',
    role: 'OWNER',
    active: true,
  });
  mock.row.mockResolvedValue({
    data: {
      object_path: `intake/${id}/original.png`,
      content_type: 'image/png',
      original_preserved: true,
      byte_size: bytes.length,
      content_sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    error: null,
  });
  mock.download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null });
  mock.rpc.mockResolvedValue({ error: null });
});
const request = (suffix = '') =>
  GET(new Request('https://example.test/intake-image/' + id + suffix), {
    params: Promise.resolve({ id }),
  });
it('returns exact original bytes as an owner-only private attachment', async () => {
  const r = await request('?download=1');
  expect(r.status).toBe(200);
  expect(r.headers.get('content-disposition')).toBe(`attachment; filename="receipt-${id}.png"`);
  expect(r.headers.get('cache-control')).toContain('no-store');
  expect(Buffer.from(await r.arrayBuffer()).equals(bytes)).toBe(true);
});
it('denies unauthenticated receipt access without querying Storage', async () => {
  mock.profile.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  expect(mock.download).not.toHaveBeenCalled();
});
it('denies manager downloads even when the item belongs to them', async () => {
  mock.profile.mockResolvedValue({ role: 'MANAGER', active: true });
  expect((await request('?download=1')).status).toBe(403);
  expect(mock.download).not.toHaveBeenCalled();
});
it('respects RLS-filtered missing receipts', async () => {
  mock.row.mockResolvedValue({ data: null, error: null });
  expect((await request()).status).toBe(404);
  expect(mock.download).not.toHaveBeenCalled();
});
it('generates a JPEG thumbnail without overwriting the original', async () => {
  const r = await request('?thumb=1');
  expect(r.status).toBe(200);
  expect((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).format).toBe('jpeg');
  expect(mock.download).toHaveBeenCalledTimes(1);
});
it('does not complete an original with a mismatched hash', async () => {
  mock.row.mockResolvedValue({
    data: {
      original_preserved: true,
      object_path: 'x',
      content_type: 'image/png',
      byte_size: bytes.length,
      content_sha256: '0'.repeat(64),
    },
  });
  expect(await finishOriginalReceipt(id)).toEqual({ error: 'RECEIPT_INVALID' });
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('completes a verified original and returns to the receipt queue', async () => {
  await expect(finishOriginalReceipt(id)).rejects.toThrow('REDIRECT:/expenses?saved=1');
  expect(mock.rpc).toHaveBeenCalledWith('complete_intake', { p_id: id });
});
it('denies manager receipt review before any database write', async () => {
  mock.profile.mockResolvedValue({ role: 'MANAGER', active: true });
  expect(await reviewReceipt({}, new FormData())).toEqual({ error: 'FORBIDDEN' });
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('reviews receipts with decimal-comma amounts', async () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id,
    status: 'REVIEWED',
    supplier: 'Test fixture',
    amount: '12,50',
    currency: 'BZD',
    category: 'Fuel',
    notes: '',
  }))
    f.set(k, v);
  await expect(reviewReceipt({}, f)).rejects.toThrow('REDIRECT:/expenses');
  expect(mock.rpc).toHaveBeenCalledWith(
    'review_intake',
    expect.objectContaining({
      p_status: 'REVIEWED',
      p_details: expect.objectContaining({ amount: '12.50' }),
    }),
  );
});
