'use server';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { quickAddSchema, needSchema } from './quick-domain';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { normalizeReceipt } from './receipt-image';
import { createHash } from 'node:crypto';
import type { ActionState } from './actions';
import type { Key } from './i18n';
function errorKey(message: string): Key {
  return (
    (
      [
        'ITEM_DUPLICATE',
        'SIMILAR_ITEM',
        'DUPLICATE_NEED',
        'STALE_NEED',
        'REQUEST_CONFLICT',
        'FORBIDDEN',
        'INVALID_INPUT',
      ] as Key[]
    ).find((k) => message.includes(k)) ?? 'UNKNOWN'
  );
}
export async function quickAdd(_previous: ActionState, form: FormData): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const result = quickAddSchema.safeParse({
    ...Object.fromEntries(form),
    confirmDuplicate: form.get('confirmDuplicate') === 'on',
  });
  if (!result.success) return { error: 'INVALID_INPUT' };
  const v = result.data;
  const { data, error } = await (
    await supabase()
  ).rpc('quick_add_stock', {
    p_request: v.requestId,
    p_location: v.location,
    p_product: v.product || null,
    p_name: v.name,
    p_category: v.category || null,
    p_quantity: Number(v.quantity),
    p_confirm_duplicate: v.confirmDuplicate,
  });
  if (error || !data) return { error: errorKey(error?.message ?? '') };
  revalidatePath('/inventory', 'layout');
  redirect(`/inventory/${v.location}/${data}?saved=1`);
}
export async function saveNeed(_previous: ActionState, form: FormData): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const result = needSchema.safeParse({
    ...Object.fromEntries(form),
    confirmDuplicate: form.get('confirmDuplicate') === 'on',
  });
  if (!result.success) return { error: 'INVALID_INPUT' };
  const file = form.get('photo');
  let bytes: Buffer | undefined;
  if (file instanceof File && file.size) {
    if (file.size > 3145728) return { error: 'needPhotoInvalid' };
    try {
      bytes = await normalizeReceipt(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return { error: 'needPhotoInvalid' };
    }
  }
  const v = result.data,
    db = await supabase();
  const { error } = await db.rpc('save_purchase_need', {
    p_request: v.requestId,
    p_id: v.id,
    p_version: v.version,
    p_confirm_duplicate: v.confirmDuplicate,
    p_values: {
      name: v.name,
      product_id: v.product_id,
      location_id: v.location_id,
      country: v.country,
      status: v.status,
      product_url: v.product_url,
      comment: v.comment,
    },
  });
  if (error) return { error: errorKey(error.message) };
  if (bytes) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const reserved = await db.rpc('reserve_need_photo', {
      p_id: v.id,
      p_hash: hash,
      p_size: bytes.length,
    });
    if (reserved.error || !reserved.data) return { error: 'needPhotoRetry' };
    const upload = await db.storage
      .from('need-photos')
      .upload(reserved.data, bytes, {
        contentType: 'image/jpeg',
        cacheControl: '0',
        upsert: false,
      });
    if (upload.error) {
      const existing = await db.storage.from('need-photos').download(reserved.data);
      if (
        existing.error ||
        !existing.data ||
        createHash('sha256')
          .update(Buffer.from(await existing.data.arrayBuffer()))
          .digest('hex') !== hash
      )
        return { error: 'needPhotoRetry' };
    }
    const complete = await db.rpc('complete_need_photo', { p_id: v.id });
    if (complete.error) return { error: 'needPhotoRetry' };
  }
  revalidatePath('/needs', 'layout');
  redirect(`/needs/${v.id}`);
}
