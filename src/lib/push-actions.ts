'use server';
import { headers } from 'next/headers';
import { authAdmin } from './supabase/admin';
import { requireProfile } from './auth';
import { supabase } from './supabase/server';
import { subscriptionSchema } from './push-domain';
import { deliverPush, pushConfigured } from './push-sender';
async function allowed() {
  const p = await requireProfile();
  return ['OWNER', 'MANAGER'].includes(p.role) ? p : null;
}
async function mobileRequest(platform: unknown) {
  const ua = (await headers()).get('user-agent') ?? '';
  return (
    (platform === 'android' && /Android/i.test(ua)) ||
    (platform === 'ios' && /iPhone|iPad|iPod|Macintosh/i.test(ua))
  );
}
export async function savePush(value: unknown, platform?: unknown) {
  if (!(await mobileRequest(platform))) return false;
  if (!(await allowed()) || !pushConfigured()) return false;
  const v = subscriptionSchema.safeParse(value);
  if (!v.success) return false;
  const { error } = await (
    await supabase()
  ).rpc('save_push_subscription', {
    p_endpoint: v.data.endpoint,
    p_p256dh: v.data.keys.p256dh,
    p_auth: v.data.keys.auth,
  });
  if (error) return false;
  const actor = await requireProfile();
  return !(
    await authAdmin().rpc('confirm_mobile_push', { p_endpoint: v.data.endpoint, p_user: actor.id })
  ).error;
}
export async function removePush(endpoint: string) {
  if (!(await allowed()) || endpoint.length > 2048) return false;
  return !(await (await supabase()).rpc('remove_push_subscription', { p_endpoint: endpoint }))
    .error;
}
export async function hasPush(endpoint: string) {
  if (!(await allowed()) || endpoint.length > 2048) return false;
  const r = await (await supabase()).rpc('has_push_subscription', { p_endpoint: endpoint });
  return !r.error && r.data === true;
}
export async function testPush(endpoint: string, platform?: unknown) {
  if (!(await mobileRequest(platform))) return false;
  const p = await allowed();
  if (!p || !pushConfigured() || endpoint.length > 2048) return false;
  const db = await supabase();
  const r = await db.rpc('claim_push_test', { p_endpoint: endpoint });
  if (r.error || !r.data) return false;
  const outcome = await deliverPush(r.data, p.language);
  if (outcome === 'EXPIRED') await db.rpc('remove_push_subscription', { p_endpoint: endpoint });
  return outcome === 'SENT';
}
