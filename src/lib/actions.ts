'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabase } from './supabase/server';
import { isConfigured } from './supabase/config';
import { requireProfile } from './auth';
import { can, movementType, stockSchema } from './domain';
import type { Key } from './i18n';
import { z } from 'zod';
export type ActionState = {
  error?: Key;
  fields?: Partial<Record<'quantity' | 'reason' | 'notes', Key>>;
};
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};
export async function setLanguage(form: FormData) {
  const language = form.get('language');
  if (language !== 'en' && language !== 'es') return;
  if (isConfigured()) {
    const db = await supabase();
    const { data } = await db.auth.getClaims();
    if (data?.claims.sub) {
      const { error } = await db.rpc('set_language', { p_language: language });
      if (error) throw new Error('LANGUAGE_SAVE_FAILED');
    }
  }
  (await cookies()).set('coral-language', language, cookieOptions);
  revalidatePath('/', 'layout');
}
export async function signIn(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isConfigured()) redirect('/setup');
  const result = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(1024) })
    .safeParse(Object.fromEntries(form));
  if (!result.success) return { error: 'authError' };
  const db = await supabase();
  const { data, error } = await db.auth.signInWithPassword(result.data);
  if (error) return { error: 'authError' };
  const { data: profile } = await db
    .from('profiles')
    .select('language')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profile) (await cookies()).set('coral-language', profile.language, cookieOptions);
  redirect('/');
}
export async function signOut() {
  if (isConfigured()) {
    const { error } = await (await supabase()).auth.signOut();
    if (error) throw new Error('SIGN_OUT_FAILED');
  }
  redirect('/login');
}
export async function changeStock(_previous: ActionState, form: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  const parsed = stockSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fields: NonNullable<ActionState['fields']> = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'quantity') fields.quantity = 'fieldQuantity';
      if (issue.path[0] === 'reason') fields.reason = 'fieldReason';
      if (issue.path[0] === 'notes') fields.notes = 'fieldNotes';
    }
    return { error: 'INVALID_INPUT', fields };
  }
  const value = parsed.data;
  const type = movementType(value.mode, value.reason);
  const permission =
    value.mode === 'add'
      ? 'inventory.add'
      : type === 'TOUR_USE'
        ? 'inventory.consume'
        : 'inventory.remove';
  if (!can(profile.role, permission)) return { error: 'FORBIDDEN' };
  const db = await supabase();
  // Decimal quantity only (not money). Scale is validated and database uses numeric.
  const { error } = await db.rpc('change_stock', {
    p_request_id: value.requestId,
    p_product_id: value.productId,
    p_location_id: value.locationId,
    p_quantity: Number(value.quantity),
    p_type: type,
    p_reason: value.reason,
    p_notes: value.notes,
  });
  if (error) {
    const known = [
      'INSUFFICIENT_STOCK',
      'FORBIDDEN',
      'NOT_FOUND',
      'INVALID_INPUT',
      'REQUEST_CONFLICT',
    ] as const;
    return { error: known.find((code) => error.message.includes(code)) ?? 'UNKNOWN' };
  }
  revalidatePath('/', 'layout');
  redirect(`/inventory/${value.locationId}/${value.productId}?saved=1`);
}
