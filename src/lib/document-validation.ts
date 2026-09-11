import 'server-only';
import sharp from 'sharp';
import { documentLimit } from './document-domain';
export async function validateDocument(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > documentLimit) throw new Error('DOCUMENT_INVALID');
  if (mime === 'application/pdf') {
    const text = Buffer.from(bytes).toString('latin1');
    if (!text.startsWith('%PDF-') || !text.slice(-2048).includes('%%EOF'))
      throw new Error('DOCUMENT_INVALID');
    return;
  }
  const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!expected) throw new Error('DOCUMENT_INVALID');
  const image = sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000, failOn: 'error' });
  const info = await image.metadata();
  if (info.format !== expected || (info.pages ?? 1) > 1) throw new Error('DOCUMENT_INVALID');
  await image.stats();
}
