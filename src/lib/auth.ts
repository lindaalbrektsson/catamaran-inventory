import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabase } from './supabase/server';
import { isConfigured } from './supabase/config';
import type { Locale } from './i18n';
export const getProfile = cache(async () => {
  if (!isConfigured()) return null;
  const db = await supabase();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  const result = await db.from('profiles').select('*').eq('id', data.claims.sub).maybeSingle();
  if (result.error) throw new Error('PROFILE_LOAD_FAILED');
  // Direct route handlers also use getProfile: pending passwords confer no active access.
  return result.data
    ? { ...result.data, active: result.data.active && !result.data.must_change_password }
    : null;
});
export async function requireProfile() {
  if (!isConfigured()) redirect('/setup');
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.must_change_password) redirect('/change-password');
  if (!profile.active) redirect('/pending');
  return profile;
}
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get('coral-language')?.value;
  // Cookie is the fast rendering preference; sign-in synchronizes it from profile.
  return value === 'es' ? 'es' : 'en';
});
