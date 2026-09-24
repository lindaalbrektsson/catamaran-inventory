'use server';
import { creationRpc } from './test-data';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { quickAddSchema, needSchema } from './quick-domain';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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
  const { data, error } = await creationRpc(
    await supabase(),
    !v.product && form.get('is_test') === 'on',
    'quick_add_item',
    {
      p_request: v.requestId,
      p_location: v.location,
      p_product: v.product || null,
      p_name: v.name,
      p_category: v.category || null,
      p_quantity: Number(v.quantity),
      p_unit: v.unit,
      p_minimum: v.minimum ? Number(v.minimum) : null,
      p_confirm_duplicate: v.confirmDuplicate,
    },
  );
  if (error || !data) return { error: errorKey(error?.message ?? '') };
  revalidatePath('/inventory', 'layout');
  revalidatePath('/items', 'layout');
  redirect(`/inventory/${v.location}/${data}?saved=1`);
}
export async function saveNeed(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState & { existingNeed?: string; needId?: string }> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const result = needSchema.safeParse({
    ...Object.fromEntries(form),
    confirmDuplicate: form.get('confirmDuplicate') === 'on',
  });
  if (!result.success) return { error: 'INVALID_INPUT' };
  const v = result.data,
    db = await supabase();
  const { error } = await creationRpc(
    db,
    v.version === 0 && form.get('is_test') === 'on',
    'save_purchase_need',
    {
      p_request: v.requestId,
      p_id: v.id,
      p_version: v.version,
      p_confirm_duplicate: v.product_id ? false : v.confirmDuplicate,
      p_values: {
        name: v.name,
        quantity_needed: v.quantity_needed === '' ? null : Number(v.quantity_needed),
        product_id: v.product_id,
        location_id: v.location_id,
        country: v.country,
        status: v.status,
        product_url: v.product_url,
        comment: v.comment,
      },
    },
  );
  if (error) {
    if (error.message.includes('DUPLICATE_NEED') && v.product_id) {
      let query = db
        .from('purchase_needs')
        .select('id')
        .eq('product_id', v.product_id)
        .eq('archived', false)
        .in('status', ['PENDING', 'ORDERED'])
        .neq('id', v.id);
      if (v.location_id) query = query.or(`location_id.eq.${v.location_id},location_id.is.null`);
      const { data: existing } = await query.limit(1);
      return { error: 'DUPLICATE_NEED', existingNeed: existing?.[0]?.id };
    }
    return {
      error: error.message.includes('TEST_CLASSIFICATION_CONFLICT')
        ? 'needClassificationConflict'
        : errorKey(error.message),
    };
  }
  revalidatePath('/needs', 'layout');
  revalidatePath('/inventory', 'layout');
  revalidatePath('/items', 'layout');
  return { needId: v.id };
}

export async function advanceNeed(_previous: ActionState, form: FormData): Promise<ActionState> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  const id = String(form.get('id') ?? ''),
    version = Number(form.get('version'));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version)) return { error: 'INVALID_INPUT' };
  const db = await supabase();
  const { data: n, error } = await db.from('purchase_needs').select('*').eq('id', id).single();
  if (error || !n) return { error: 'FORBIDDEN' };
  if (n.version !== version) return { error: 'STALE_NEED' };
  if (n.status === 'DONE') return { error: 'INVALID_INPUT' };
  const { error: saveError } = await db.rpc('save_purchase_need', {
    p_request: String(form.get('requestId')),
    p_id: id,
    p_version: version,
    p_confirm_duplicate: false,
    p_values: {
      name: n.name,
      quantity_needed: n.quantity_needed,
      product_id: n.product_id,
      location_id: n.location_id,
      country: n.country,
      status: n.status === 'PENDING' ? 'ORDERED' : 'DONE',
      product_url: n.product_url,
      comment: n.comment,
    },
  });
  if (saveError) return { error: errorKey(saveError.message) };
  revalidatePath('/needs', 'layout');
  revalidatePath('/inventory', 'layout');
  revalidatePath('/items', 'layout');
  return {};
}

export async function openSavedNeed(id: string) {
  await requireProfile();
  if (/^[0-9a-f-]{36}$/i.test(id)) redirect('/needs/' + id);
}
