'use client';
import { hasPush, savePush } from '@/lib/push-actions';
import { isMobilePwa, mobilePlatform } from './mobile-pwa';
export function notificationPermission(): NotificationPermission | 'unsupported' {
  return !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
    ? 'unsupported'
    : Notification.permission;
}
// Called only from a click handler. Keep requestPermission before any asynchronous work.
export async function enableDevicePush(publicKey: string) {
  if (!isMobilePwa() || !publicKey || ['unsupported', 'denied'].includes(notificationPermission()))
    return false;
  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  window.dispatchEvent(new Event('push-permission'));
  if (permission !== 'granted') return false;
  const r = await navigator.serviceWorker.getRegistration();
  if (!r?.active) throw Error('WORKER_NOT_READY');
  let s = await r.pushManager.getSubscription();
  // Existing server ownership check remains authoritative; never silently rebind accounts.
  if (s && !(await hasPush(s.endpoint))) {
    await s.unsubscribe();
    s = null;
  }
  const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
  s =
    s ??
    (await r.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    }));
  if (
    !(await savePush(s.toJSON(), mobilePlatform(navigator.userAgent, navigator.maxTouchPoints)))
  ) {
    await s.unsubscribe();
    throw Error('SAVE_FAILED');
  }
  return true;
}
