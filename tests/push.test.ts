import { beforeEach, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const mocks = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({ default: { sendNotification: mocks.send } }));
vi.mock('@/lib/supabase/admin', () => ({ authAdmin: () => ({ rpc: mocks.rpc }) }));
import { subscriptionSchema } from '../src/lib/push-domain';
import { deliverPush } from '../src/lib/push-sender';
import { POST } from '../src/app/api/reminders/dispatch/route';
const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public');
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private');
  vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:test@example.test');
  vi.stubEnv('PUSH_CRON_SECRET', 'test-cron');
});
it.each([
  'http://fcm.googleapis.com/x',
  'https://127.0.0.1/x',
  'https://fcm.googleapis.com.evil.test/x',
  'https://user@fcm.googleapis.com/x',
  'https://fcm.googleapis.com:444/x',
])('rejects arbitrary/unsafe push endpoint %s', (endpoint) => {
  expect(subscriptionSchema.safeParse({ ...sub, endpoint }).success).toBe(false);
});
it('sends generic localized payload with private VAPID only in server options', async () => {
  mocks.send.mockResolvedValue({});
  expect(await deliverPush(sub, 'es', '70000000-0000-4000-8000-000000000001')).toBe('SENT');
  const [, payload, options] = mocks.send.mock.calls[0];
  expect(payload).toContain('Recordatorio de tarea');
  expect(payload).not.toContain('test-private');
  expect(options.vapidDetails.privateKey).toBe('test-private');
  expect(JSON.parse(payload).url).toBe('/tasks/70000000-0000-4000-8000-000000000001');
});
it.each([404, 410])('cleans expired subscription outcome %s', async (statusCode) => {
  mocks.send.mockRejectedValue({ statusCode });
  expect(await deliverPush(sub, 'en')).toBe('EXPIRED');
});
it('ambiguous failure is reported once for scheduler-controlled retry', async () => {
  mocks.send.mockRejectedValue(new Error('timeout'));
  expect(await deliverPush(sub, 'en')).toBe('FAILED');
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it('scheduler rejects missing/wrong authentication before database access', async () => {
  expect((await POST(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('scheduler claims a delivery before sending and records expired endpoint', async () => {
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === 'claim_due_push' ? null : undefined,
    error: null,
  }));
  mocks.rpc.mockResolvedValueOnce({
    data: { ...sub, id: 'delivery', claim_token: 'lease', task: 'task', locale: 'en' },
    error: null,
  });
  mocks.send.mockRejectedValue({ statusCode: 410 });
  const response = await POST(
    new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron' },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ sent: 0, failed: 0, expired: 1 });
  expect(mocks.rpc).toHaveBeenCalledWith('finish_push', {
    p_id: 'delivery',
    p_token: 'lease',
    p_outcome: 'EXPIRED',
    p_endpoint: sub.endpoint,
  });
});
it('worker displays a system notification and click opens only local routes without navigating existing forms', async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const show = vi.fn().mockResolvedValue(undefined),
    open = vi.fn().mockResolvedValue(undefined);
  let done = Promise.resolve();
  runInNewContext(readFileSync('src/pwa/worker.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (name: string, fn: (event: unknown) => void) => (handlers[name] = fn),
      registration: { showNotification: show },
      clients: { openWindow: open },
    },
  });
  handlers.push({
    data: {
      json: () => ({
        title: 'Catamaran Belize',
        body: 'Task reminder',
        url: 'https://evil.test',
        tag: 'task',
      }),
    },
    waitUntil: (p: Promise<void>) => (done = p),
  });
  await done;
  expect(show).toHaveBeenCalledWith(
    'Catamaran Belize',
    expect.objectContaining({ data: { url: '/' } }),
  );
  handlers.notificationclick({
    notification: { close: vi.fn(), data: { url: '/tasks/70000000-0000-4000-8000-000000000001' } },
    waitUntil: (p: Promise<void>) => (done = p),
  });
  await done;
  expect(open).toHaveBeenCalledWith(
    'https://example.test/tasks/70000000-0000-4000-8000-000000000001',
  );
});

it('push exposes only the requested reminder title, never private keys or description data', async () => {
  mocks.send.mockResolvedValue({});
  await deliverPush(sub, 'en', '70000000-0000-4000-8000-000000000001', 'Check fuel level');
  const payload = JSON.parse(mocks.send.mock.calls[0][1]);
  expect(payload.body).toBe('Reminder: Check fuel level');
  expect(Object.keys(payload).sort()).toEqual(['body', 'tag', 'title', 'url']);
  expect(JSON.stringify(payload)).not.toContain('test-private');
});

it('scheduler rejects an incorrect bearer and missing configuration without claiming work', async () => {
  const request = (token: string) =>
    new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token },
    });
  expect((await POST(request('wrong-secret'))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', '');
  expect((await POST(request('test-cron'))).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('grouped maintenance push reuses sender without task names or manual assignees', async () => {
  mocks.send.mockResolvedValue({});
  await deliverPush(sub, 'en', undefined, undefined, 3);
  const payload = JSON.parse(mocks.send.mock.calls[0][1]);
  expect(payload.body).toBe('3 maintenance checks are due.');
  expect(payload.url).toBe('/tasks/maintenance?tab=recurring');
});

it.each([429, 500, 502, 503])('provider %s is a retryable failure', async (statusCode) => {
  mocks.send.mockRejectedValue({ statusCode });
  expect(await deliverPush(sub, 'en')).toBe('FAILED');
});
