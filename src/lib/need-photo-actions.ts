'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { authAdmin } from './supabase/admin';
import { validateDocument } from './document-validation';
import { revalidatePath } from 'next/cache';
import type { ActionState } from './actions';
const schema = z.object({
  id: z.uuid(),
  need: z.uuid(),
  version: z.number().int().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byte_size: z
    .number()
    .int()
    .min(1)
    .max(3 * 1024 * 1024),
});
export async function prepareNeedPhoto(value: unknown): Promise<ActionState & { path?: string }> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const v = schema.safeParse(value);
  if (!v.success) return { error: 'needPhotoInvalid' };
  const { data, error } = await (
    await supabase()
  ).rpc('reserve_need_image', {
    p_id: v.data.id,
    p_need: v.data.need,
    p_hash: v.data.sha256,
    p_size: v.data.byte_size,
    p_version: v.data.version,
  });
  if (error)
    return { error: error.message.includes('STALE_NEED') ? 'STALE_NEED' : 'needPhotoRetry' };
  return { path: data };
}
export async function finishNeedPhoto(id: string): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  if (!z.uuid().safeParse(id).success) return { error: 'INVALID_INPUT' };
  const db = await supabase();
  const { data: f } = await db
    .from('need_photos')
    .select('*')
    .eq('id', id)
    .eq('uploaded_by', p.id)
    .maybeSingle();
  if (!f) return { error: 'FORBIDDEN' };
  const { data, error } = await db.storage.from('need-photos').download(f.object_path);
  if (error || !data) return { error: 'needPhotoRetry' };
  try {
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (
      bytes.length !== f.byte_size ||
      bytes.length > 3 * 1024 * 1024 ||
      createHash('sha256').update(bytes).digest('hex') !== f.sha256
    )
      return { error: 'needPhotoInvalid' };
    await validateDocument(bytes, 'image/jpeg');
  } catch {
    return { error: 'needPhotoInvalid' };
  }
  const result = await authAdmin().rpc('complete_need_image', { p_id: id, p_actor: p.id });
  if (result.error)
    return { error: result.error.message.includes('STALE_NEED') ? 'STALE_NEED' : 'needPhotoRetry' };
  revalidatePath('/needs', 'layout');
  return {};
}
