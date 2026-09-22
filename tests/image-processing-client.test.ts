import { it, expect, vi, afterEach } from 'vitest';
import { processUploadImage } from '../src/lib/image-processing-client';
afterEach(() => vi.unstubAllGlobals());
it('48MP phone image uses orientation, adaptive retries from original, and closes decoded source', async () => {
  const bitmap = { width: 6000, height: 8000, close: vi.fn() },
    draw = vi.fn(),
    sizes: number[][] = [],
    qualities: number[] = [];
  const decode = vi.fn(async () => bitmap);
  vi.stubGlobal('createImageBitmap', decode);
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: draw }),
    toBlob: (cb: (b: Blob) => void, _mime: string, q: number) => {
      qualities.push(q);
      sizes.push([canvas.width, canvas.height]);
      cb(new Blob([new Uint8Array(qualities.length < 3 ? 6 * 1024 * 1024 : 4 * 1024 * 1024)]));
    },
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  const source = new File([new Uint8Array(25 * 1024 * 1024)], 'phone.jpg', { type: 'image/jpeg' });
  const out = await processUploadImage(source, 'document');
  expect(out.size).toBe(4 * 1024 * 1024);
  expect(out.type).toBe('image/jpeg');
  expect(qualities).toEqual([0.9, 0.78, 0.78]);
  expect(sizes).toEqual([
    [3600, 4800],
    [3600, 4800],
    [3060, 4080],
  ]);
  expect(draw.mock.calls.every((c) => c[0] === bitmap)).toBe(true);
  expect(decode).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
  expect(bitmap.close).toHaveBeenCalledOnce();
});
it('rejects oversized or unsupported source before decode', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  await expect(
    processUploadImage(
      new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }),
      'document',
    ),
  ).rejects.toThrow();
  await expect(
    processUploadImage(
      new File(['x'], 'x.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'document',
    ),
  ).rejects.toThrow();
  expect(decode).not.toHaveBeenCalled();
});
it('rejects malformed bytes if actual browser decoding fails', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw Error('decode');
    }),
  );
  await expect(
    processUploadImage(new File(['not-image'], 'fake.jpg', { type: 'image/jpeg' }), 'document'),
  ).rejects.toThrow();
});
