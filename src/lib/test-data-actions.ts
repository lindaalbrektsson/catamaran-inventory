'use server';
import { z } from 'zod';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { cleanTestStorage } from './test-storage-cleanup';
import type { Key } from './i18n';
export async function deleteTestData(table: string, id: string): Promise<{ error?: Key }> {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) return { error: 'FORBIDDEN' };
  if (
    !z.uuid().safeParse(id).success ||
    ![
      'products',
      'tasks',
      'purchase_needs',
      'documents',
      'receipt_intake',
      'expenses',
      'purchases',
    ].includes(table)
  )
    return { error: 'INVALID_INPUT' };
  const result = await (await supabase()).rpc('delete_test_record', { p_table: table, p_id: id });
  if (result.error)
    return {
      error: result.error.message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'testDeleteBlocked',
    };
  after(async () => {
    try {
      await cleanTestStorage(3);
    } catch {
      /* durable scheduler retry; database deletion is already committed */
    }
  });
  revalidatePath('/', 'layout');
  return {};
}
