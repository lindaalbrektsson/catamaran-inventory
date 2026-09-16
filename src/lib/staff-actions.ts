'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getProfile, requireProfile } from './auth';
import { supabase } from './supabase/server';
import { newPasswordSchema } from './auth-domain';
import { staffRoles } from './domain';
import type { ActionState } from './actions';
export async function changeFirstPassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.credential_pending) return { error: 'authError' };
  if (!profile.must_change_password) redirect('/');
  const value = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!value.success)
    return {
      error: value.error.issues.some((issue) => issue.code === 'custom')
        ? 'passwordMismatch'
        : 'passwordRules',
    };
  const db = await supabase();
  const { error } = await db.auth.updateUser({ password: value.data.password });
  if (error) return { error: 'passwordChangeFailed' };
  // A trusted Auth trigger clears the flag; browser/user metadata cannot clear it.
  const { data, error: profileError } = await db
    .from('profiles')
    .select('must_change_password')
    .eq('id', profile.id)
    .single();
  if (profileError || !data || data.must_change_password) return { error: 'passwordChangeFailed' };
  revalidatePath('/', 'layout');
  redirect('/');
}
export async function manageStaff(
  _previous: ActionState & { success?: boolean },
  form: FormData,
): Promise<ActionState & { success?: boolean }> {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER' || !profile.account_admin) return { error: 'FORBIDDEN' };
  const value = z
    .object({
      id: z.uuid(),
      name: z.string().trim().min(1).max(100),
      role: z.enum(staffRoles),
      language: z.enum(['en', 'es']),
    })
    .safeParse(Object.fromEntries(form));
  if (!value.success) return { error: 'INVALID_INPUT' };
  const { error } = await (
    await supabase()
  ).rpc('manage_staff', {
    p_id: value.data.id,
    p_name: value.data.name,
    p_role: value.data.role,
    p_language: value.data.language,
    p_active: form.get('active') === 'on',
  });
  if (error)
    return {
      error: error.message.includes('ACCOUNT_ADMIN_PROTECTED')
        ? 'accountAdminProtected'
        : error.message.includes('LAST_OWNER')
          ? 'lastOwner'
          : 'UNKNOWN',
    };
  revalidatePath('/', 'layout');
  return { success: true };
}
