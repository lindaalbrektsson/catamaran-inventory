import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  has: vi.fn(),
  save: vi.fn(),
  request: vi.fn(),
  get: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/lib/push-actions', () => ({ hasPush: m.has, savePush: m.save }));
import { enableDevicePush } from '../src/lib/push-client';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { Notification: {}, PushManager: {}, dispatchEvent: vi.fn() });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: m.request });
  vi.stubGlobal('navigator', {
    userAgent: 'Android',
    maxTouchPoints: 1,
    serviceWorker: {
      getRegistration: async () => ({
        active: true,
        pushManager: { getSubscription: m.get, subscribe: m.subscribe },
      }),
    },
  });
  m.request.mockResolvedValue('granted');
  m.get.mockResolvedValue(null);
  m.save.mockResolvedValue(true);
  m.subscribe.mockResolvedValue({
    endpoint: 'fixture',
    toJSON: () => ({}),
    unsubscribe: m.unsubscribe,
  });
});
it('permission is requested synchronously from explicit invocation, then existing server save is used', async () => {
  const work = enableDevicePush('BBBB');
  expect(m.request).toHaveBeenCalledTimes(1);
  expect(await work).toBe(true);
  expect(m.save).toHaveBeenCalledTimes(1);
});
it.each(['denied', 'unsupported', 'desktop'])('%s cannot prompt or subscribe', async (kind) => {
  if (kind === 'denied') Object.defineProperty(Notification, 'permission', { value: 'denied' });
  if (kind === 'unsupported') delete (window as unknown as { PushManager?: unknown }).PushManager;
  if (kind === 'desktop') vi.stubGlobal('navigator', { userAgent: 'Windows', maxTouchPoints: 0 });
  expect(await enableDevicePush('BBBB')).toBe(false);
  expect(m.request).not.toHaveBeenCalled();
  expect(m.save).not.toHaveBeenCalled();
});
it('a denied gesture result does not create a subscription', async () => {
  m.request.mockResolvedValue('denied');
  expect(await enableDevicePush('BBBB')).toBe(false);
  expect(m.subscribe).not.toHaveBeenCalled();
});
it('another account subscription is replaced only after server ownership check', async () => {
  m.get.mockResolvedValue({ endpoint: 'other', unsubscribe: m.unsubscribe });
  m.has.mockResolvedValue(false);
  await enableDevicePush('BBBB');
  expect(m.unsubscribe).toHaveBeenCalledTimes(1);
  expect(m.subscribe).toHaveBeenCalledTimes(1);
});
it('failed save cleans the unregistered subscription and remains retryable', async () => {
  m.save.mockResolvedValue(false);
  await expect(enableDevicePush('BBBB')).rejects.toThrow('SAVE_FAILED');
  expect(m.unsubscribe).toHaveBeenCalledTimes(1);
});
