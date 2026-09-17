import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { timed, timeDatabaseRead } from '@/lib/performance';
import { readFetch, READ_TIMEOUT_MS } from '@/lib/supabase/read-fetch';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('database timing labels exclude host, filters, identities and response content', async () => {
  vi.stubEnv('PERFORMANCE_LOGGING', '1');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  await timeDatabaseRead('https://PRIVATE.test/rest/v1/profiles?id=eq.PRIVATE', async () => ({
    secret: 'PRIVATE',
  }));
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).not.toContain('PRIVATE');
  expect(JSON.parse(log.mock.calls[0][0]).operation).toBe('db.profiles');
  await timeDatabaseRead('relative-path', async () => true);
  await timeDatabaseRead('https://PRIVATE.test/unlisted', async () => true);
  expect(log).toHaveBeenCalledTimes(1);
});
it.each([
  'task_people',
  'task_history',
  'reminder_people',
  'reminder_delivery_status',
  'maintenance_people',
  'maintenance_history',
  'document_people',
  'document_history',
])('bounds read-only POST RPC %s without retrying', async (rpc) => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const fetcher = vi.fn(
    (_input, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(new Error('READ_TIMEOUT'))),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const result = readFetch('https://example.test/rest/v1/rpc/' + rpc, {
    method: 'POST',
    body: '{}',
  });
  const assertion = expect(result).rejects.toThrow('READ_TIMEOUT');
  controller.abort();
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('timings are opt-in and never log result or exception data', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  await timed('profile.load', async () => ({ password: 'PRIVATE' }));
  expect(log).not.toHaveBeenCalled();
  vi.stubEnv('PERFORMANCE_LOGGING', '1');
  await timed('profile.load', async () => ({ error: { message: 'PRIVATE' }, user_id: 'PRIVATE' }));
  await expect(
    timed('auth.claims', async () => {
      throw new Error('PRIVATE');
    }),
  ).rejects.toThrow('PRIVATE');
  expect(log).toHaveBeenCalledTimes(2);
  for (const [line] of log.mock.calls) {
    expect(line).not.toContain('PRIVATE');
    expect(JSON.parse(line)).toEqual({
      event: 'server_timing',
      operation: expect.any(String),
      duration_ms: expect.any(Number),
      outcome: 'error',
    });
  }
});
it('a hung read is aborted at the configured deadline, without retry', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const fetcher = vi.fn(
    (_input, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(new Error('READ_TIMEOUT'))),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const reading = readFetch('https://example.test/rest/v1/profiles');
  const assertion = expect(reading).rejects.toThrow('READ_TIMEOUT');
  controller.abort();
  await assertion;
  expect(timeout).toHaveBeenCalledWith(READ_TIMEOUT_MS);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('preserves caller cancellation and does not alter, retry or time out writes', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  await readFetch('https://example.test/rest/v1/products', { signal: controller.signal });
  const signal = fetcher.mock.calls[0][1].signal;
  controller.abort();
  expect(signal.aborted).toBe(true);
  const options = { method: 'POST', body: 'PRIVATE' };
  await readFetch('https://example.test/rest/v1/rpc/change', options);
  expect(fetcher.mock.calls[1][1]).toBe(options);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
