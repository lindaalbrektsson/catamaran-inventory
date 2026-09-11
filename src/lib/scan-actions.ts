'use server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { extractScan, scanConfigured } from './scan-ai';
import { normalizeReceipt, validateOriginalReceipt } from './receipt-image';
import { scanReviewSchema } from './scan-domain';
import { revalidatePath } from 'next/cache';
import type { Key } from './i18n';
import type { Json } from './database.types';
export type ScanState = { error?: Key; path?: string; id?: string };
const failure = (message: string): ScanState =>
  message.includes('INVALID_INPUT')
    ? { error: 'scanInvalid' }
    : {
        error:
          (
            [
              'DUPLICATE_NEED',
              'ITEM_DUPLICATE',
              'SIMILAR_ITEM',
              'REQUEST_CONFLICT',
              'FORBIDDEN',
              'SCAN_LIMIT',
            ] as Key[]
          ).find((k) => message.includes(k)) ?? 'scanFailed',
      };
export async function prepareScan(input: unknown): Promise<ScanState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  if (!scanConfigured()) return { error: 'scanUnavailable' };
  const parsed = z
    .object({
      id: z.uuid(),
      type: z.enum(['NOTE', 'RECEIPT']),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.number().int().min(1).max(20971520),
      mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    })
    .safeParse(input);
  if (!parsed.success) return { error: 'RECEIPT_INVALID' };
  const v = parsed.data;
  if (v.type === 'RECEIPT' && p.role !== 'OWNER') return { error: 'FORBIDDEN' };
  const result = await (
    await supabase()
  ).rpc('reserve_scan', {
    p_id: v.id,
    p_type: v.type,
    p_hash: v.hash,
    p_size: v.size,
    p_mime: v.mime,
  });
  return result.error ? failure(result.error.message) : { path: result.data!, id: v.id };
}
export async function analyzeScan(id: string): Promise<ScanState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role) || !z.uuid().safeParse(id).success)
    return { error: 'FORBIDDEN' };
  if (!scanConfigured()) return { error: 'scanUnavailable' };
  const db = await supabase();
  const { data: scan } = await db.from('smart_scans').select('*').eq('id', id).single();
  if (!scan || scan.created_by !== p.id || (scan.scan_type === 'RECEIPT' && p.role !== 'OWNER'))
    return { error: 'FORBIDDEN' };
  if (['REVIEW', 'APPROVED'].includes(scan.status)) return { id };
  const claim = await db.rpc('claim_scan', { p_id: id });
  if (claim.error || !claim.data) return { error: 'scanBusy' };
  try {
    const downloaded = await db.storage.from('smart-scans').download(scan.object_path);
    if (downloaded.error || !downloaded.data) throw new Error('SCAN_UPLOAD');
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    if (
      bytes.length !== scan.byte_size ||
      createHash('sha256').update(bytes).digest('hex') !== scan.sha256
    )
      throw new Error('SCAN_UPLOAD');
    await validateOriginalReceipt(bytes, scan.content_type);
    const { result, model } = await extractScan(await normalizeReceipt(bytes), scan.scan_type);
    const saved = await db.rpc('finish_scan', { p_id: id, p_result: result, p_model: model });
    if (saved.error) throw new Error('SCAN_SAVE');
  } catch {
    // Keep original image and failure audit; never expose provider responses or keys.
    await db.rpc('finish_scan', { p_id: id, p_result: null, p_model: '' });
    return { error: 'scanFailed' };
  }
  revalidatePath('/scan', 'layout');
  return { id };
}
export async function approveScan(id: string, review: unknown): Promise<ScanState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role) || !z.uuid().safeParse(id).success)
    return { error: 'FORBIDDEN' };
  const parsed = scanReviewSchema.safeParse(review);
  if (!parsed.success) return { error: 'scanInvalid' };
  const db = await supabase();
  const saved = await db.rpc('approve_scan', { p_id: id, p_review: parsed.data as Json });
  if (saved.error) return failure(saved.error.message);
  revalidatePath('/inventory', 'layout');
  revalidatePath('/needs', 'layout');
  revalidatePath('/scan', 'layout');
  return { id };
}
