'use server';
import { z } from 'zod';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { authAdmin, accountAdminConfigured } from './supabase/admin';
import { passwordSchema } from './password-policy';
import { phoneIdentity, usernameSchema } from './auth-domain';
import { roles } from './domain';
import { revalidatePath } from 'next/cache';
type AccountError = 'FORBIDDEN' | 'accountAdminSetup' | 'accountFormInvalid' | 'accountNameInvalid' | 'accountRoleInvalid' | 'accountLanguageInvalid' | 'accountUsernameInvalid' | 'accountPhoneInvalid' | 'accountUsernameUnavailable' | 'passwordRules' | 'accountChangeFailed' | 'accountAlreadyCompleted' | 'accountPermissionFailed';
export type AccountResult = { error?: AccountError; success?: boolean; temporary?: string };
export async function accountChange(form: FormData): Promise<AccountResult> {
  const actor = await requireProfile();
  if (actor.role !== 'OWNER' || !actor.account_admin) return { error: 'FORBIDDEN' };
  if (!accountAdminConfigured()) return { error: 'accountAdminSetup' };
  const parsed = z
    .object({
      request: z.uuid(),
      kind: z.enum(['CREATE', 'RESET', 'CONTACT', 'USERNAME']),
      target: z.uuid().or(z.literal('')),
      name: z.string().trim().max(100),
      role: z.enum(roles),
      language: z.enum(['en', 'es']),
    })
    .safeParse({
      ...Object.fromEntries(form),
      ...(form.get('kind') === 'CREATE' ? { language: actor.language ?? 'en' } : {}),
    });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === 'name' ? 'accountNameInvalid' : field === 'role' ? 'accountRoleInvalid' : field === 'language' ? 'accountLanguageInvalid' : 'accountFormInvalid' };
  }
  const v = parsed.data;
  const rawPhone = v.kind === 'CONTACT' ? String(form.get('phone') ?? '').trim() : '';
  const contact = rawPhone ? phoneIdentity(String(form.get('country')), rawPhone) : null;
  const username = usernameSchema.safeParse(form.get('username'));
  if (rawPhone && !contact) return { error: 'accountPhoneInvalid' };
  if (v.kind === 'CREATE' && !v.name) return { error: 'accountNameInvalid' };
  if (v.kind === 'CREATE' && !['OWNER', 'MANAGER'].includes(v.role)) return { error: 'accountRoleInvalid' };
  if ((v.kind === 'CREATE' || v.kind === 'USERNAME') && !username.success) return { error: 'accountUsernameInvalid' };
  if (v.kind !== 'CREATE' && !v.target) return { error: 'accountFormInvalid' };
  const db = await supabase();
  if (v.kind === 'USERNAME' || v.kind === 'CONTACT') {
    const result =
      v.kind === 'USERNAME'
        ? await db.rpc('set_staff_username', { p_target: v.target, p_username: username.data! })
        : await db.rpc('set_staff_contact', { p_target: v.target, p_phone: contact });
    if (result.error) return { error: result.error.message.includes('USERNAME_UNAVAILABLE') ? 'accountUsernameUnavailable' : 'accountChangeFailed' };
    revalidatePath('/staff');
    return { success: true };
  }
  const chosen = form.get('temporaryPassword');
  if (!passwordSchema.safeParse(chosen).success) return { error: 'passwordRules' };
  const domain = process.env.AUTH_INTERNAL_EMAIL_DOMAIN?.trim().toLowerCase();
  if (
    v.kind === 'CREATE' &&
    (!domain || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain))
  )
    return { error: 'accountAdminSetup' };
  const { data, error } =
    v.kind === 'CREATE'
      ? await db.rpc('begin_username_creation', {
          p_request: v.request,
          p_username: username.data!,
        })
      : await db.rpc('begin_account_change', {
          p_request: v.request,
          p_target: v.target,
          p_kind: 'RESET',
        });
  if (error || !data) return { error: error?.message.includes('USERNAME_UNAVAILABLE') ? 'accountUsernameUnavailable' : 'accountChangeFailed' };
  const op = data as { target: string | null; completed: boolean; identity?: string };
  if (op.completed) return { error: 'accountAlreadyCompleted' };
  const admin = authAdmin();
  let password: string | undefined,
    target = op.target;
  try {
    if (v.kind === 'CREATE') {
      password = chosen as string;
      if (target) {
        const updated = await admin.auth.admin.updateUserById(target, { password });
        if (updated.error) return { error: 'accountChangeFailed' };
      } else {
        if (!op.identity || !/^u_[a-f0-9]{32}$/.test(op.identity))
          return { error: 'accountChangeFailed' };
        const created = await admin.auth.admin.createUser({
          email: `${op.identity}@${domain}`,
          email_confirm: true,
          password,
          app_metadata: { account_operation: v.request },
        });
        if (created.error || !created.data.user) return { error: 'accountChangeFailed' };
        target = created.data.user.id;
      }
    } else if (v.kind === 'RESET') {
      password = chosen as string;
      const updated = await admin.auth.admin.updateUserById(target!, { password });
      if (updated.error) return { error: 'accountChangeFailed' };
    }
    const args = {
      p_request: v.request,
      p_target: target!,
      p_values: {
        name: v.name,
        role: v.role,
        language: v.language,
        active: v.kind === 'CREATE' ? true : form.get('active') === 'on',
      },
    };
    const finished =
      v.kind === 'CREATE'
        ? await admin.rpc('finish_username_creation', { ...args, p_contact: null })
        : await admin.rpc('finish_account_change', args);
    if (finished.error) return { error: 'accountChangeFailed' };
    revalidatePath('/staff');
    // Password lives only in this one response and ephemeral browser state, never tables/logs.
    return { success: true, temporary: password };
  } catch {
    return { error: 'accountChangeFailed' };
  } finally {
    // Keep the operation ID and linked UUID retryable after a settled Auth request.
    try {
      await admin.rpc('release_account_change', { p_request: v.request });
    } catch {
      /* Still fail closed; never expose credentials. */
    }
  }
}
export async function changeAccountPermission(form: FormData): Promise<AccountResult> {
  const actor = await requireProfile();
  if (actor.role !== 'OWNER' || !actor.account_admin) return { error: 'FORBIDDEN' };
  const target = z.uuid().safeParse(form.get('target'));
  if (!target.success) return { error: 'accountFormInvalid' };
  const { error } = await (
    await supabase()
  ).rpc('set_account_admin', { p_target: target.data, p_enabled: form.get('enabled') === 'on' });
  if (error) return { error: 'accountPermissionFailed' };
  revalidatePath('/staff');
  return { success: true };
}
