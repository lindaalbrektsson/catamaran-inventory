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
      byte_size: 20971521,
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
