import { z } from 'zod';
import { belizeDate } from './task-domain';
export const documentMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const documentAccess = ['OWNERS', 'MANAGERS', 'STAFF', 'SELECTED'] as const;
export const documentLimit = 30 * 1024 * 1024;
export const documentSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    version: z.coerce.number().int().min(0),
    title: z.string().trim().min(1).max(150),
    description: z.string().max(2000),
    category: z.string().trim().max(80),
    expiry_date: z
      .string()
      .refine(
        (v) =>
          !v ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            !Number.isNaN(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
      ),
    favorite: z.boolean(),
    archived: z.boolean(),
    access_level: z.enum(documentAccess),
    selected_users: z.array(z.uuid()).max(200),
  })
  .refine((v) => v.access_level !== 'SELECTED' || v.selected_users.length > 0);
export const documentFileSchema = z.object({
  id: z.uuid(),
  content_type: z.enum(documentMimes),
  byte_size: z.number().int().min(1).max(documentLimit),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export function documentExpiry(date: string | null, now = new Date()) {
  if (!date) return null;
  const days = Math.round(
    (Date.parse(date + 'T12:00:00Z') - Date.parse(belizeDate(now) + 'T12:00:00Z')) / 86400000,
  );
  return days < 0
    ? 'docExpired'
    : days === 0
      ? 'docExpiresToday'
      : days <= 30
        ? 'docExpiresSoon'
        : null;
}
export function documentExtension(mime: string) {
  return mime === 'application/pdf'
    ? 'pdf'
    : mime === 'image/png'
      ? 'png'
      : mime === 'image/webp'
        ? 'webp'
        : 'jpg';
}
