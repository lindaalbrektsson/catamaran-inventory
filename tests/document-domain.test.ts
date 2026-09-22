import { it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import sharp from 'sharp';
import { documentExpiry, documentFileSchema } from '../src/lib/document-domain';
import { validateDocument } from '../src/lib/document-validation';
it('evaluates expiry dates in Belize including 30-day threshold', () => {
  const now = new Date('2026-10-01T02:00:00Z');
  expect(documentExpiry('2026-09-29', now)).toBe('docExpired');
  expect(documentExpiry('2026-09-30', now)).toBe('docExpiresToday');
  expect(documentExpiry('2026-10-30', now)).toBe('docExpiresSoon');
  expect(documentExpiry('2026-10-31', now)).toBeNull();
  expect(documentExpiry(null, now)).toBeNull();
});
it('rejects unsupported MIME types and oversize files', () => {
  expect(
    documentFileSchema.safeParse({
      id: crypto.randomUUID(),
      content_type: 'image/svg+xml',
      byte_size: 100,
      sha256: 'a'.repeat(64),
    }).success,
  ).toBe(false);
  expect(
    documentFileSchema.safeParse({
      id: crypto.randomUUID(),
      content_type: 'application/pdf',
      byte_size: 30 * 1024 * 1024 + 1,
      sha256: 'a'.repeat(64),
    }).success,
  ).toBe(false);
});
it('validates actual image bytes and rejects renamed HTML', async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  await expect(validateDocument(png, 'image/png')).resolves.toBeUndefined();
  await expect(
    validateDocument(Buffer.from('<script>alert(1)</script>'), 'image/png'),
  ).rejects.toThrow();
  await expect(validateDocument(png, 'image/jpeg')).rejects.toThrow();
  await expect(
    validateDocument(Buffer.from('<html>not PDF</html>'), 'application/pdf'),
  ).rejects.toThrow();
});

it.each(['image/jpeg', 'image/png', 'image/webp'])(
  'validates decoded %s documents',
  async (mime) => {
    const image = sharp({ create: { width: 10, height: 20, channels: 3, background: 'white' } });
    const bytes = await (
      mime === 'image/jpeg' ? image.jpeg() : mime === 'image/png' ? image.png() : image.webp()
    ).toBuffer();
    await expect(validateDocument(bytes, mime)).resolves.toBeUndefined();
  },
);
it('PDF limit is exactly 30 MiB; PDF bytes are validated unchanged', async () => {
  const bytes = Buffer.alloc(30 * 1024 * 1024, 32);
  bytes.write('%PDF-1.4\n');
  bytes.write('\n%%EOF', bytes.length - 6);
  await expect(validateDocument(bytes, 'application/pdf')).resolves.toBeUndefined();
  await expect(
    validateDocument(Buffer.concat([bytes, Buffer.from(' ')]), 'application/pdf'),
  ).rejects.toThrow();
  expect(
    documentFileSchema.safeParse({
      id: crypto.randomUUID(),
      content_type: 'application/pdf',
      byte_size: bytes.length,
      sha256: 'a'.repeat(64),
    }).success,
  ).toBe(true);
});
