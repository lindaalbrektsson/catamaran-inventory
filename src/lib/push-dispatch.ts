import 'server-only';
import { authAdmin } from './supabase/admin';
import { deliverPush, pushConfigured } from './push-sender';
export async function dispatchDuePush() {
  if (!pushConfigured()) throw new Error('PUSH_NOT_CONFIGURED');
  const db = authAdmin();
  let sent = 0,
    failed = 0,
    expired = 0;
  // Bounded batches fit the server execution limit; each claim is committed
  // before sending. Concurrent scheduler calls cannot claim the same occurrence.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let i = 0; i < 5; i++) {
        const r = await db.rpc('claim_due_push', {});
        if (r.error) throw new Error('PUSH_CLAIM_FAILED');
        let maintenance = false;
        if (!r.data) {
          const next = await db.rpc('claim_due_maintenance_push', {});
          if (next.error) throw new Error('PUSH_CLAIM_FAILED');
          if (!next.data) return;
          r.data = next.data;
          maintenance = true;
        }
        const d = r.data as {
          id: string;
          task: string;
          title: string;
          count?: number;
          locale: 'en' | 'es';
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        const outcome = await deliverPush(
          d,
          d.locale,
          d.task,
          d.title,
          maintenance ? d.count : undefined,
        );
        const done = await db.rpc(maintenance ? 'finish_maintenance_push' : 'finish_push', {
          p_id: d.id,
          p_outcome: outcome,
          p_endpoint: d.endpoint,
        });
        if (done.error) throw new Error('PUSH_RECORD_FAILED');
        if (outcome === 'SENT') sent++;
        else if (outcome === 'EXPIRED') expired++;
        else failed++;
      }
    }),
  );
  return { sent, failed, expired };
}
