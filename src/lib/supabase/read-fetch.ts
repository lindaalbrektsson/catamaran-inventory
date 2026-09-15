import 'server-only';

// Bound hung reads so the existing error/retry screen can render. Never retry or
// abort a mutation here: a timed-out write might already have committed.
export const READ_TIMEOUT_MS = 15_000;
export const readFetch: typeof fetch = (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return fetch(input, init);
  const signal = init?.signal ?? request?.signal;
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
  return fetch(input, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
};
