'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import type { Json } from './database.types';

export async function manageGlobalItem(input: {
  request: string;
  action: 'CREATE' | 'EDIT' | 'DELETE' | 'MERGE';
  id: string | null;
  expected: string | null;
  values: Record<string, Json>;
}): Promise<{ id?: string; error?: string }> {
  await requireProfile();
  if (
    !z.uuid().safeParse(input.request).success ||
    (input.id !== null && !z.uuid().safeParse(input.id).success)
  )
    return { error: 'ITEM_INVALID' };
  const { data, error } = await (
    await supabase()
  ).rpc('manage_catalog_item', {
    p_request: input.request,
    p_action: input.action,
    p_id: input.id,
    p_values: input.values,
    p_expected: input.expected,
  });
  if (error) {
    const known = [
      'ITEM_SIMILAR',
      'ITEM_UNIT_CONFLICT',
      'ITEM_NEED_CONFLICT',
      'ITEM_STALE',
      'ITEM_NOT_FOUND',
    ];
    return { error: known.find((key) => error.message.includes(key)) ?? 'ITEM_INVALID' };
  }
  for (const path of ['/items', '/inventory', '/needs']) revalidatePath(path, 'layout');
  revalidatePath('/');
  revalidatePath('/add');
  return { id: data };
}
