'use server';
import { z } from 'zod';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { authAdmin, accountAdminConfigured } from './supabase/admin';
import { temporaryPassword } from './temporary-password';
import { phoneIdentity } from './auth-domain';
import { roles } from './domain';
import { revalidatePath } from 'next/cache';
import type { Key } from './i18n';
export type AccountResult = { error?: Key; success?: boolean; temporary?: string };
export async function accountChange(form: FormData): Promise<AccountResult> {
  const actor = await requireProfile();
  if (actor.role !== 'OWNER' || !actor.account_admin) return { error: 'FORBIDDEN' };
  if (!accountAdminConfigured()) return { error: 'accountAdminSetup' };
  const parsed = z
    .object({
      request: z.uuid(),
      kind: z.enum(['CREATE', 'RESET', 'PHONE']),
      target: z.uuid().or(z.literal('')),
      name: z.string().trim().max(100),
      role: z.enum(roles),
      language: z.enum(['en', 'es']),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'INVALID_INPUT' };
  const v = parsed.data,
    phone =
      v.kind === 'RESET'
        ? null
        : phoneIdentity(String(form.get('country')), String(form.get('phone')));
  if (
    (v.kind !== 'RESET' && (!phone || form.get('verified') !== 'on')) ||
    (v.kind === 'CREATE' && !v.name) ||
    (v.kind !== 'CREATE' && !v.target)
  )
    return { error: 'INVALID_INPUT' };
  const db = await supabase();
  const { data, error } = await db.rpc('begin_account_change', {
    p_request: v.request,
    p_target: v.target || null,
    p_kind: v.kind,
  });
  if (error || !data) return { error: 'accountChangeFailed' };
  const op = data as { target: string | null; completed: boolean };
  if (op.completed) return { error: 'accountAlreadyCompleted' };
  const admin = authAdmin();
  let password: string | undefined,
    target = op.target;
  try {
    if (v.kind === 'CREATE') {
      password = temporaryPassword();
      if (target) {
        const updated = await admin.auth.admin.updateUserById(target, { password });
        if (updated.error) return { error: 'accountChangeFailed' };
      } else {
        const created = await admin.auth.admin.createUser({
          phone: phone!,
          phone_confirm: true,
          password,
          app_metadata: { account_operation: v.request },
        });
        if (created.error || !created.data.user) return { error: 'accountChangeFailed' };
        target = created.data.user.id;
      }
    } else if (v.kind === 'RESET') {
      password = temporaryPassword();
      const updated = await admin.auth.admin.updateUserById(target!, { password });
      if (updated.error) return { error: 'accountChangeFailed' };
    } else {
      const updated = await admin.auth.admin.updateUserById(target!, {
        phone: phone!,
        phone_confirm: true,
      });
      if (updated.error) return { error: 'accountChangeFailed' };
    }
    const finished = await admin.rpc('finish_account_change', {
      p_request: v.request,
      p_target: target!,
      p_values: {
        name: v.name,
        role: v.role,
        language: v.language,
        active: form.get('active') === 'on',
      },
    });
    if (finished.error) return { error: 'accountChangeFailed' };
    revalidatePath('/staff');
    // Password lives only in this one response and ephemeral browser state, never tables/logs.
    return { success: true, temporary: password };
  } catch {
    return { error: 'accountChangeFailed' };
  }
}
export async function changeAccountPermission(form: FormData): Promise<AccountResult> {
  const actor = await requireProfile();
  if (actor.role !== 'OWNER' || !actor.account_admin) return { error: 'FORBIDDEN' };
  const target = z.uuid().safeParse(form.get('target'));
  if (!target.success) return { error: 'INVALID_INPUT' };
  const { error } = await (
    await supabase()
  ).rpc('set_account_admin', { p_target: target.data, p_enabled: form.get('enabled') === 'on' });
  if (error) return { error: 'accountPermissionFailed' };
  revalidatePath('/staff');
  return { success: true };
}
