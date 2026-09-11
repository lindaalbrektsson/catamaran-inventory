'use server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { config } from './supabase/config';
import { supabase } from './supabase/server';
import { newPasswordSchema, phoneIdentity } from './auth-domain';
import type { Key } from './i18n';

export type RecoveryState = { step?: 'code' | 'password'; error?: Key };
const recoveryCookie = 'catamaran-recovery';
function isolatedClient() {
  const { url, key } = config();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function recoverPassword(
  _previous: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  if (process.env.SMS_RECOVERY_ENABLED !== 'true') return { error: 'recoveryUnavailable' };
  const intent = form.get('intent');
  const phone = phoneIdentity(String(form.get('country') ?? ''), String(form.get('phone') ?? ''));
  if (intent === 'send') {
    if (!phone) return { error: 'INVALID_INPUT' };
    (await cookies()).set(recoveryCookie, '', {
      path: '/forgot-password',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    // Identical UI for unknown numbers, throttling and provider errors. Never create a user.
    try {
      await isolatedClient().auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false, channel: 'sms' },
      });
    } catch {
      /* Avoid disclosing account existence or provider details. */
    }
    return { step: 'code' };
  }
  if (intent === 'verify') {
    const code = String(form.get('code') ?? '');
    if (!phone || !/^\d{6,10}$/.test(code)) return { step: 'code', error: 'recoveryCodeError' };
    try {
      const { data, error } = await isolatedClient().auth.verifyOtp({
        phone,
        token: code,
        type: 'sms',
      });
      if (error || !data.session) return { step: 'code', error: 'recoveryCodeError' };
      // This short-lived, HttpOnly cookie is NOT the application's Supabase session.
      // Never return recovery tokens to component state or grant workspace access here.
      (await cookies()).set(
        recoveryCookie,
        JSON.stringify({
          access: data.session.access_token,
          refresh: data.session.refresh_token,
        }),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/forgot-password',
          maxAge: 600,
        },
      );
      return { step: 'password' };
    } catch {
      return { step: 'code', error: 'recoveryCodeError' };
    }
  }
  if (intent !== 'password') return { error: 'INVALID_INPUT' };
  const value = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!value.success) return { step: 'password', error: 'passwordRules' };
  const jar = await cookies();
  try {
    const saved = JSON.parse(jar.get(recoveryCookie)?.value ?? 'null');
    if (!saved || typeof saved.access !== 'string' || typeof saved.refresh !== 'string')
      return { error: 'recoveryExpired' };
    const db = isolatedClient();
    // Auth validates the token before any password update. Cookie fields are untrusted.
    const verified = await db.auth.getUser(saved.access);
    if (verified.error || !verified.data.user?.phone) return { error: 'recoveryExpired' };
    const claims = JSON.parse(Buffer.from(saved.access.split('.')[1], 'base64url').toString());
    const now = Date.now() / 1000;
    if (
      claims.sub !== verified.data.user.id ||
      !Number.isFinite(claims.iat) ||
      now - claims.iat > 600 ||
      claims.iat > now + 60 ||
      !Array.isArray(claims.amr) ||
      !claims.amr.some(
        (method: { method?: string; timestamp?: number }) =>
          method.method === 'otp' &&
          typeof method.timestamp === 'number' &&
          now - method.timestamp <= 600 &&
          method.timestamp <= now + 60,
      )
    )
      return { error: 'recoveryExpired' };
    const restored = await db.auth.setSession({
      access_token: saved.access,
      refresh_token: saved.refresh,
    });
    if (restored.error || restored.data.user?.id !== verified.data.user.id)
      return { error: 'recoveryExpired' };
    const changed = await db.auth.updateUser({ password: value.data.password });
    if (changed.error) return { step: 'password', error: 'passwordChangeFailed' };
    jar.set(recoveryCookie, '', {
      path: '/forgot-password',
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    // Only successful password recovery establishes the normal persistent session.
    const login = await (
      await supabase()
    ).auth.signInWithPassword({ phone: verified.data.user.phone, password: value.data.password });
    if (login.error) return { error: 'recoverySignIn' };
  } catch {
    return { error: 'recoveryExpired' };
  }
  revalidatePath('/', 'layout');
  redirect('/');
}
