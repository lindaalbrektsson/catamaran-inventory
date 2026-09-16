import 'server-only';

// Bound hung reads so the existing error/retry screen can render. Never retry or
// abort a mutation here: a timed-out write might already have committed.
export const READ_TIMEOUT_MS = 15_000;
// These RPCs only SELECT. Supabase transports them using POST by default.
// Keep this allowlist narrow: writes must never inherit the read timeout.
const readRpcs = new Set([
  'task_people',
  'task_history',
  'reminder_people',
  'reminder_delivery_status',
  'maintenance_people',
  'maintenance_history',
  'document_people',
  'document_history',
]);
export const readFetch: typeof fetch = (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  let readRpc = false;
  if (method === 'POST') {
    try {
      const path = new URL(request?.url ?? String(input)).pathname;
      const match = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path);
      readRpc = !!match && readRpcs.has(match[1]);
    } catch {
      /* Leave other fetch inputs unchanged. */
    }
  }
  if (method !== 'GET' && method !== 'HEAD' && !readRpc) return fetch(input, init);
  const signal = init?.signal ?? request?.signal;
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
  return fetch(input, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
};
