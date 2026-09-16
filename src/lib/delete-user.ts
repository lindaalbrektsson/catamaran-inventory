'use server';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { authAdmin, accountAdminConfigured } from './supabase/admin';
import type { Key } from './i18n';
import { z } from 'zod';
export async function deleteUser(
  target: string,
): Promise<{ error?: Key; preserved?: boolean; success?: boolean }> {
  const actor = await requireProfile();
  if (actor.role !== 'OWNER' || !actor.account_admin || target === actor.id)
    return { error: 'FORBIDDEN' };
  if (!z.uuid().safeParse(target).success) return { error: 'INVALID_INPUT' };
  if (!accountAdminConfigured()) return { error: 'accountAdminSetup' };
  const db = await supabase();
  const { data, error } = await db.rpc('prepare_user_deletion', { p_target: target });
  if (error || !['DELETE', 'PRESERVED'].includes(data ?? '')) return { error: 'userDeleteFailed' };
  if (data === 'DELETE') {
    try {
      const result = await authAdmin().auth.admin.deleteUser(target);
      if (result.error) return { error: 'userDeleteFailed' };
    } catch {
      return { error: 'userDeleteFailed' };
    }
  }
  revalidatePath('/staff');
  return { success: true, preserved: data === 'PRESERVED' };
}
