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

// Validate a complete decode without changing the original bytes retained in Storage.
export async function validateOriginalReceipt(input: Uint8Array, mime: string) {
  if (!input.length || input.length > 20 * 1024 * 1024) throw new Error('RECEIPT_INVALID');
  const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
  const metadata = await image.metadata();
  if (
    `image/${metadata.format}` !== mime ||
    !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error('RECEIPT_INVALID');
  await image
    .rotate()
    .resize({ width: 2400, height: 4000, fit: 'inside', withoutEnlargement: true })
    .jpeg()
    .toBuffer();
}

// Trusted validation of already-processed receipt bytes: fully decode, do not
// JPEG-encode a second time. The exact validated bytes are stored and hashed.
export async function validateProcessedReceipt(input: Uint8Array): Promise<Buffer> {
  if (!input.length || input.length > MAX_RECEIPT_BYTES) throw new Error('RECEIPT_INVALID');
  const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
  const m = await image.metadata();
  if (
    m.format !== 'jpeg' ||
    (m.pages ?? 1) !== 1 ||
    !m.width ||
    !m.height ||
    m.width > 2400 ||
    m.height > 4000 ||
    (m.orientation && m.orientation !== 1)
  )
    throw new Error('RECEIPT_INVALID');
  await image.stats();
  return Buffer.from(input);
}
