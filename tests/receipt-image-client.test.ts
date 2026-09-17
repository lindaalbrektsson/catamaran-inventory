import { it, expect, vi, afterEach } from 'vitest';
import { processReceiptImage } from '../src/lib/receipt-image-client';
import { validateProcessedReceipt } from '../src/lib/receipt-image';
import sharp from 'sharp';
afterEach(() => vi.unstubAllGlobals());
it('large camera image retries from source at bounded dimensions and quality', async () => {
  const close = vi.fn(),
    draw = vi.fn(),
    qualities: number[] = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 6000, close })),
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: draw }),
    toBlob: (done: (b: Blob) => void, _mime: string, q: number) => {
      qualities.push(q);
      done(new Blob([new Uint8Array(qualities.length === 1 ? 4 * 1024 * 1024 : 700000)]));
    },
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  const result = await processReceiptImage(
    new File(['fixture'], 'camera.jpg', { type: 'image/jpeg' }),
  );
  expect(canvas.width).toBe(2400);
  expect(canvas.height).toBe(3600);
  expect(qualities).toEqual([0.85, 0.78]);
  expect(result.size).toBe(700000);
  expect(close).toHaveBeenCalledOnce();
});
it('rejects unsupported HEIC and oversized input before decoding', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  await expect(
    processReceiptImage(new File(['x'], 'x.heic', { type: 'image/heic' })),
  ).rejects.toThrow();
  expect(decode).not.toHaveBeenCalled();
});
it('trusted validation decodes without changing the processed JPEG bytes', async () => {
  const bytes = await sharp({
    create: { width: 2400, height: 3600, channels: 3, background: 'white' },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  expect(await validateProcessedReceipt(bytes)).toEqual(bytes);
  await expect(validateProcessedReceipt(Buffer.from('not an image'))).rejects.toThrow();
  await expect(validateProcessedReceipt(await sharp(bytes).png().toBuffer())).rejects.toThrow();
});
