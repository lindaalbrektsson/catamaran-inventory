import 'server-only';
import { requireProfile } from './auth';
import { accountAdminConfigured, authAdmin } from './supabase/admin';

// Missing entry means unavailable; null means Auth confirms no sign-in yet.
export async function staffLastLogins(ids: string[]): Promise<Map<string, string | null>> {
  const viewer = await requireProfile();
  if (viewer.role !== 'OWNER' || !viewer.account_admin) throw new Error('FORBIDDEN');
  const result = new Map<string, string | null>();
  if (!ids.length || !accountAdminConfigured()) return result;
  const wanted = new Set(ids);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const admin = authAdmin().auth.admin;
    const read = async () => {
      // Bound both total work and page size; no per-user Auth requests.
      for (let page = 1; page <= 10 && !stopped; page++) {
        const { data, error } = await admin.listUsers({ page, perPage: 250 });
        if (stopped || error) return;
        for (const user of data.users) {
          if (!wanted.has(user.id)) continue;
          const value = user.last_sign_in_at;
          if (!value || Number.isFinite(Date.parse(value))) result.set(user.id, value || null);
        }
        if (result.size === wanted.size) return;
        if (data.users.length < 250 && !data.nextPage && !(data.total > page * 250)) return;
      }
    };
    await Promise.race([
      read(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 4000);
      }),
    ]);
  } catch {
    // Secondary Auth metadata must never take down account management.
  } finally {
    stopped = true;
    clearTimeout(timer);
  }
  return new Map(result);
}
