import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ ua: 'Windows Chrome', rpc: vi.fn(), admin: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'user-agent': m.ua }) }));
vi.mock('@/lib/auth', () => ({
  requireProfile: async () => ({
    id: '40000000-0000-4000-8000-000000000001',
    role: 'MANAGER',
    language: 'en',
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock('@/lib/supabase/admin', () => ({ authAdmin: () => ({ rpc: m.admin }) }));
vi.mock('@/lib/push-sender', () => ({
  pushConfigured: () => true,
  deliverPush: async () => 'SENT',
}));
import { savePush, testPush } from '../src/lib/push-actions';
import { mobilePlatform } from '../src/lib/mobile-pwa';
const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.ua = 'Windows Chrome';
  m.rpc.mockResolvedValue({ data: sub, error: null });
  m.admin.mockResolvedValue({ error: null });
});
it('desktop registration and test sending fail without touching subscriptions', async () => {
  expect(await savePush(sub, 'android')).toBe(false);
  expect(await testPush(sub.endpoint, 'android')).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.admin).not.toHaveBeenCalled();
});
it('mobile registration qualifies only authenticated UUID endpoint using server Admin', async () => {
  m.ua = 'Android Chrome';
  expect(await savePush(sub, 'android')).toBe(true);
  expect(m.admin).toHaveBeenCalledWith('confirm_mobile_push', {
    p_endpoint: sub.endpoint,
    p_user: '40000000-0000-4000-8000-000000000001',
  });
});
it('detects iPad desktop UA with touch, rejects actual desktops', () => {
  expect(mobilePlatform('Macintosh', 5)).toBe('ios');
  expect(mobilePlatform('Macintosh', 0)).toBeNull();
  expect(mobilePlatform('Windows', 10)).toBeNull();
  expect(mobilePlatform('Android', 1)).toBe('android');
});
