import { it, expect } from 'vitest';
import sharp from 'sharp';
import { validateOriginalReceipt } from '../src/lib/receipt-image';
it('validates originals without altering PNG bytes or metadata', async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  const before = Buffer.from(bytes);
  await validateOriginalReceipt(bytes, 'image/png');
  expect(bytes.equals(before)).toBe(true);
});
it('rejects mismatched MIME and malformed original bytes', async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  await expect(validateOriginalReceipt(bytes, 'image/jpeg')).rejects.toThrow('RECEIPT_INVALID');
  await expect(validateOriginalReceipt(new Uint8Array([1, 2, 3]), 'image/png')).rejects.toThrow();
});
