'use server';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { itemCatalog } from './item-catalog';
import { itemSchema, validateItems, type ItemInput, type ItemError } from './item-domain';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Json } from './database.types';
import { parseItems } from './item-excel';
export async function uploadItemPreview(data: FormData) {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER') return { error: 'ITEM_FAILED' as const };
  const file = data.get('file');
  if (
    !(file instanceof File) ||
    !file.name.toLowerCase().endsWith('.xlsx') ||
    file.size > 1024 * 1024
  )
    return { error: 'ITEM_FILE' as const };
  try {
    const catalog = await itemCatalog();
    return {
      rows: validateItems(
        await parseItems(Buffer.from(await file.arrayBuffer()), catalog),
        catalog,
      ),
    };
  } catch {
    return { error: 'ITEM_FILE' as const };
  }
}
export async function saveItems(
  id: string,
  values: ItemInput[],
): Promise<{ error?: ItemError; success?: boolean }> {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER') return { error: 'ITEM_FAILED' };
  if (
    !z.uuid().safeParse(id).success ||
    !z.array(itemSchema).min(1).max(200).safeParse(values).success
  )
    return { error: 'ITEM_INVALID' };
  // RPC repeats validation under a catalog lock. It also handles exact request retries.
  const { error } = await (
    await supabase()
  ).rpc('save_inventory_items', { p_id: id, p_rows: values as unknown as Json });
  if (error)
    return {
      error: [
        'ITEM_INVALID',
        'ITEM_DUPLICATE',
        'ITEM_SIMILAR',
        'ITEM_STOCK_CONFLICT',
        'ITEM_UNIT_CONFLICT',
      ].includes(error.message)
        ? (error.message as ItemError)
        : 'ITEM_FAILED',
    };
  revalidatePath('/inventory', 'layout');
  revalidatePath('/items', 'layout');
  return { success: true };
}
export async function previewItems(values: ItemInput[]) {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER' || !Array.isArray(values) || values.length > 200)
    throw new Error('FORBIDDEN');
  return validateItems(values, await itemCatalog());
}
