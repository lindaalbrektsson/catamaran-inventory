import 'server-only';
import { authAdmin } from './supabase/admin';

// Durable DB leases + idempotent Storage remove. Failed files remain queued.
export async function cleanTestStorage(limit = 10) {
  const db = authAdmin();
  let removed = 0;
  for (let i = 0; i < limit; i++) {
    const claim = await db.rpc('claim_test_storage_cleanup', {});
    if (claim.error) throw new Error('TEST_STORAGE_CLAIM_FAILED');
    if (!claim.data) break;
    const row = claim.data as { bucket: string; path: string; token: string };
    let success = false;
    try {
      success = !(await db.storage.from(row.bucket).remove([row.path])).error;
    } catch {
      /* retry after lease */
    }
    const done = await db.rpc('finish_test_storage_cleanup', {
      p_bucket: row.bucket,
      p_path: row.path,
      p_token: row.token,
      p_success: success,
    });
    if (done.error) throw new Error('TEST_STORAGE_FINISH_FAILED');
    if (success) removed++;
  }
  return removed;
}
