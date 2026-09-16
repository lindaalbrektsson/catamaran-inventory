'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { MobilePwaOnly } from './mobile-pwa-only';
import { isMobilePwa, mobilePlatform } from '@/lib/mobile-pwa';
import { hasPush, savePush, removePush, testPush } from '@/lib/push-actions';
function notificationPermission(): NotificationPermission | 'unsupported' {
  return !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
    ? 'unsupported'
    : Notification.permission;
}
function subscribePermission(callback: () => void) {
  window.addEventListener('focus', callback);
  window.addEventListener('push-permission', callback);
  return () => {
    window.removeEventListener('focus', callback);
    window.removeEventListener('push-permission', callback);
  };
}
export function NotificationSettings(props: { locale: Locale; publicKey: string }) {
  return (
    <MobilePwaOnly>
      <MobileNotificationSettings {...props} />
    </MobilePwaOnly>
  );
}
function MobileNotificationSettings({ locale, publicKey }: { locale: Locale; publicKey: string }) {
  const t = dictionary(locale);
  const permission = useSyncExternalStore(
    subscribePermission,
    notificationPermission,
    () => 'default' as const,
  );
  const [on, setOn] = useState(false),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    if (notificationPermission() === 'unsupported') return;
    navigator.serviceWorker
      .getRegistration()
      .then(async (r) => {
        const s = await r?.pushManager.getSubscription();
        const saved = s ? await hasPush(s.endpoint) : false;
        if (active) setOn(saved && Notification.permission === 'granted');
      })
      .catch(() => {
        if (active) setMessage(t.pushFailed);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [t.pushFailed]);
  async function toggle() {
    if (!isMobilePwa()) return;
    setBusy(true);
    setMessage('');
    try {
      // Permission request must be directly initiated by this user gesture on iOS.
      if (!on) {
        const permission = await Notification.requestPermission();
        window.dispatchEvent(new Event('push-permission'));
        if (permission !== 'granted') {
          setMessage(t.pushPermissionHelp);
          return;
        }
      }
      const r = await navigator.serviceWorker.getRegistration();
      if (!r?.active) throw new Error('WORKER_NOT_READY');
      let s = await r.pushManager.getSubscription();
      if (on) {
        if (s) {
          if (!(await removePush(s.endpoint))) throw new Error('REMOVE_FAILED');
          await s.unsubscribe();
        }
        setOn(false);
      } else {
        // A subscription from another signed-in account is never silently re-bound.
        if (s && !(await hasPush(s.endpoint))) {
          await s.unsubscribe();
          s = null;
        }
        const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        s =
          s ??
          (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
        if (
          !(await savePush(
            s.toJSON(),
            mobilePlatform(navigator.userAgent, navigator.maxTouchPoints),
          ))
        ) {
          await s.unsubscribe();
          throw new Error('SAVE_FAILED');
        }
        setOn(true);
      }
    } catch {
      setMessage(t.pushFailed);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const s = await (
        await navigator.serviceWorker.getRegistration()
      )?.pushManager.getSubscription();
      setMessage(
        s &&
          (await testPush(
            s.endpoint,
            mobilePlatform(navigator.userAgent, navigator.maxTouchPoints),
          ))
          ? t.pushTestSent
          : t.pushFailed,
      );
    } catch {
      setMessage(t.pushFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t.pushTitle}</h1>
      <p>{t.pushDeviceOnly}</p>
      <p>
        {t.pushPermission}:{' '}
        {permission === 'unsupported'
          ? t.pushUnsupported
          : permission === 'granted'
            ? t.pushGranted
            : permission === 'denied'
              ? t.pushDenied
              : t.pushAsk}
      </p>
      <p>
        {t.pushTitle}: {on ? t.pushOn : t.pushOff}
      </p>
      {!publicKey && <p role="status">{t.pushNotConfigured}</p>}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={
          busy ||
          permission === 'unsupported' ||
          (permission === 'denied' && !on) ||
          (!publicKey && !on)
        }
        onClick={toggle}
        className="min-h-12 rounded-xl border p-3"
      >
        {on ? t.pushDisable : t.pushEnable}
      </button>
      {on && (
        <button
          type="button"
          disabled={busy}
          onClick={test}
          className="min-h-12 rounded-xl border p-3"
        >
          {t.pushTest}
        </button>
      )}
      <p className="text-sm text-muted-foreground">{t.pushPrivacy}</p>
      {permission === 'unsupported' && <p>{t.pushIosHelp}</p>}
      {permission === 'denied' && <p>{t.pushPermissionHelp}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
