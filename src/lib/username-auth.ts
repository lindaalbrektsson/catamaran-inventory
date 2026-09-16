import 'server-only';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { headers } from 'next/headers';
import { authAdmin, accountAdminConfigured } from './supabase/admin';
import type { supabase } from './supabase/server';
export async function authenticateUsername(
  db: Awaited<ReturnType<typeof supabase>>,
  credentials: { username: string; password: string } | null,
): Promise<string | null> {
  const started = Date.now();
  const floor = 650 + randomInt(150);
  try {
    if (!accountAdminConfigured()) return null;
    const admin = authAdmin();
    const requestHeaders = await headers();
    // Vercel sets this proxy header; never trust a submitted username as an IP.
    const ip = process.env.VERCEL
      ? requestHeaders.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'shared'
      : 'local';
    const hash = (value: string) =>
      createHmac('sha256', process.env.SUPABASE_AUTH_ADMIN_KEY!).update(value).digest('hex');
    const limit = await admin.rpc('consume_login_limit', {
      p_ip: hash('ip:' + ip),
      p_username: hash('username:' + (credentials?.username ?? 'invalid')),
    });
    if (limit.error || limit.data !== true) return null;
    const resolved = credentials
      ? await admin.rpc('resolve_username', { p_username: credentials.username })
      : { data: null, error: null };
    if (resolved.error) return null;
    const match = resolved.data as { id?: string; email?: string } | null;
    // Unknown usernames still follow the Auth password path. No public lookup result.
    const result = await db.auth.signInWithPassword({
      email: match?.email || `missing-${randomUUID()}@invalid.invalid`,
      password: credentials?.password ?? randomUUID(),
    });
    if (result.error) return null;
    if (!match?.id || result.data.user.id !== match.id) {
      await db.auth.signOut();
      return null;
    }
    return match.id;
  } catch {
    return null;
  } finally {
    await delay(Math.max(0, floor - (Date.now() - started)));
  }
}
