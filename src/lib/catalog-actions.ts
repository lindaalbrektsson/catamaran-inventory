'use server';
import { z } from 'zod';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { revalidatePath } from 'next/cache';
import { itemSchema, type ItemInput, type ItemError } from './item-domain';
export async function updateCatalogItem(
  id: string,
  value: ItemInput,
): Promise<{ error?: ItemError; success?: boolean }> {
  const p = await requireProfile();
  if (p.role !== 'OWNER') return { error: 'ITEM_FAILED' };
  if (
    !z.uuid().safeParse(id).success ||
    !itemSchema.safeParse(value).success ||
    Number(value.quantity)
  )
    return { error: 'ITEM_INVALID' };
  const { error } = await (await supabase()).rpc('configure_item', { p_id: id, p_values: value });
  if (error)
    return {
      error: error.message.includes('ITEM_UNIT_CONFLICT') ? 'ITEM_UNIT_CONFLICT' : 'ITEM_INVALID',
    };
  revalidatePath('/inventory', 'layout');
  return { success: true };
}
export async function saveCategory(
  _previous: { error?: string; success?: boolean },
  form: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const p = await requireProfile();
  if (p.role !== 'OWNER') return { error: 'FORBIDDEN' };
  const parsed = z
    .object({
      id: z.uuid(),
      name_en: z.string().trim().min(1).max(100),
      name_es: z.string().trim().min(1).max(100),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'INVALID_INPUT' };
  const { error } = await (
    await supabase()
  )
    .from('categories')
    .upsert({ ...parsed.data, active: form.get('active') === 'on' });
  if (error) return { error: 'UNKNOWN' };
  revalidatePath('/inventory', 'layout');
  return { success: true };
}
