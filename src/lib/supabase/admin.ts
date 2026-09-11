import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
export function accountAdminConfigured() {
  return Boolean(process.env.SUPABASE_AUTH_ADMIN_KEY);
}
export function authAdmin() {
  const key = process.env.SUPABASE_AUTH_ADMIN_KEY;
  if (!key) throw new Error('ACCOUNT_ADMIN_NOT_CONFIGURED');
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
