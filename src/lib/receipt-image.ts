import sharp from 'sharp';
import { MAX_RECEIPT_BYTES } from './spending-domain';

// Decode and re-encode untrusted upload bytes, enforce pixel/byte limits, strip
// GPS/EXIF metadata, normalize orientation. MIME/filename alone are not trusted.
export async function normalizeReceipt(input: Uint8Array): Promise<Buffer> {
  if (!input.length || input.length > MAX_RECEIPT_BYTES) throw new Error('RECEIPT_INVALID');
  const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
    throw new Error('RECEIPT_INVALID');
  const result = await image
    .rotate()
    .resize({ width: 2400, height: 4000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  if (result.length > MAX_RECEIPT_BYTES) throw new Error('RECEIPT_INVALID');
  return result;
}
