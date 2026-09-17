import { it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
const m = vi.hoisted(() => ({
  profile: vi.fn(),
  rpc: vi.fn(),
  finalize: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    rpc: m.rpc,
    storage: { from: () => ({ upload: m.upload, download: m.download }) },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ authAdmin: () => ({ rpc: m.finalize }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT');
  },
}));
import { uploadReceipt } from '../src/lib/spending-actions';
const actor = '40000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ id: actor, role: 'OWNER' });
  m.rpc.mockResolvedValue({ data: 'path', error: null });
  m.upload.mockResolvedValue({ error: null });
  m.finalize.mockResolvedValue({ error: null });
});
function form(bytes: Uint8Array) {
  const f = new FormData();
  f.set('requestId', crypto.randomUUID());
  f.set('parentId', crypto.randomUUID());
  f.set('kind', 'EXPENSE');
  f.set('receipt', new File([new Uint8Array(bytes)], 'receipt.jpg', { type: 'image/jpeg' }));
  return f;
}
it.each(['OWNER', 'MANAGER'])(
  '%s normal receipt validates then uses service-only finalizer',
  async (role) => {
    m.profile.mockResolvedValue({ id: actor, role });
    const bytes = await sharp({
      create: { width: 20, height: 30, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    const f = form(bytes);
    await expect(uploadReceipt({}, f)).rejects.toThrow('REDIRECT');
    expect(m.upload.mock.calls[0][1]).toEqual(bytes);
    expect(m.finalize).toHaveBeenCalledWith('complete_receipt', {
      p_id: f.get('requestId'),
      p_actor: actor,
    });
    expect(m.rpc).toHaveBeenCalledTimes(1);
  },
);
it('malformed receipt never reserves or finalizes', async () => {
  expect(await uploadReceipt({}, form(Buffer.from('malformed')))).toEqual({
    error: 'RECEIPT_INVALID',
  });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.finalize).not.toHaveBeenCalled();
});
it('unauthorized role never accesses privileged finalization', async () => {
  m.profile.mockResolvedValue({ id: actor, role: 'CREW' });
  expect(await uploadReceipt({}, form(Buffer.from('x')))).toEqual({ error: 'FORBIDDEN' });
  expect(m.finalize).not.toHaveBeenCalled();
});
