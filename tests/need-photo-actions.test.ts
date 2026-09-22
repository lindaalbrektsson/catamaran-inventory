import { beforeEach, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const m = vi.hoisted(() => ({
  profile: vi.fn(),
  rpc: vi.fn(),
  admin: vi.fn(),
  row: vi.fn(),
  download: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/admin', () => ({ authAdmin: () => ({ rpc: m.admin }) }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: m.row };
    return { from: () => q, rpc: m.rpc, storage: { from: () => ({ download: m.download }) } };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { finishNeedPhoto, prepareNeedPhoto } from '../src/lib/need-photo-actions';
const actor = '40000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ id: actor, role: 'OWNER' });
  m.admin.mockResolvedValue({ error: null });
  m.rpc.mockResolvedValue({ data: 'private/path.jpg', error: null });
});
async function stored(bytes: Buffer) {
  m.row.mockResolvedValue({
    data: {
      object_path: 'private/path.jpg',
      byte_size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  });
  m.download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null });
}
it.each(['OWNER', 'MANAGER'])(
  '%s can finalize only after actual image validation',
  async (role) => {
    m.profile.mockResolvedValue({ id: actor, role });
    await stored(
      await sharp({ create: { width: 16, height: 16, channels: 3, background: 'white' } })
        .jpeg()
        .toBuffer(),
    );
    const id = crypto.randomUUID();
    expect(await finishNeedPhoto(id)).toEqual({});
    expect(m.admin).toHaveBeenCalledWith('complete_need_image', { p_id: id, p_actor: actor });
    expect(m.rpc).not.toHaveBeenCalled();
  },
);
it('matching metadata/hash cannot finalize malformed bytes', async () => {
  await stored(Buffer.from('not a photo'));
  expect(await finishNeedPhoto(crypto.randomUUID())).toEqual({ error: 'needPhotoInvalid' });
  expect(m.admin).not.toHaveBeenCalled();
});
it('hash mismatch is rejected before finalizer', async () => {
  await stored(Buffer.from('fixture'));
  m.download.mockResolvedValue({ data: new Blob(['changed']), error: null });
  expect(await finishNeedPhoto(crypto.randomUUID())).toEqual({ error: 'needPhotoInvalid' });
  expect(m.admin).not.toHaveBeenCalled();
});
it.each(['CAPTAIN', 'CREW'])('%s cannot reserve or finalize', async (role) => {
  m.profile.mockResolvedValue({ role });
  expect(await prepareNeedPhoto({})).toEqual({ error: 'FORBIDDEN' });
  expect(await finishNeedPhoto(crypto.randomUUID())).toEqual({ error: 'FORBIDDEN' });
  expect(m.admin).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
});
it('reservation uses exact Need ID and version, never stock RPCs', async () => {
  const v = {
    id: crypto.randomUUID(),
    need: crypto.randomUUID(),
    version: 2,
    sha256: 'a'.repeat(64),
    byte_size: 123,
  };
  expect(await prepareNeedPhoto(v)).toEqual({ path: 'private/path.jpg' });
  expect(m.rpc).toHaveBeenCalledWith('reserve_need_image', {
    p_id: v.id,
    p_need: v.need,
    p_version: 2,
    p_hash: v.sha256,
    p_size: 123,
  });
});
it('stored size limit and absent own reservation are enforced', async () => {
  expect(
    await prepareNeedPhoto({
      id: crypto.randomUUID(),
      need: crypto.randomUUID(),
      version: 1,
      sha256: 'a'.repeat(64),
      byte_size: 3145729,
    }),
  ).toEqual({ error: 'needPhotoInvalid' });
  m.row.mockResolvedValue({ data: null });
  expect(await finishNeedPhoto(crypto.randomUUID())).toEqual({ error: 'FORBIDDEN' });
  expect(m.admin).not.toHaveBeenCalled();
});
it('interrupted download remains retryable', async () => {
  await stored(Buffer.from('fixture'));
  m.download.mockResolvedValue({ error: { message: 'network' } });
  expect(await finishNeedPhoto(crypto.randomUUID())).toEqual({ error: 'needPhotoRetry' });
  expect(m.admin).not.toHaveBeenCalled();
});
