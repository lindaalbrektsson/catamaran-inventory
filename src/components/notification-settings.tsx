'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
import { MobilePwaOnly } from './mobile-pwa-only';
import { isMobilePwa, mobilePlatform } from '@/lib/mobile-pwa';
import { hasPush, removePush, testPush } from '@/lib/push-actions';
import { enableDevicePush } from '@/lib/push-client';
import { markPush } from '@/lib/onboarding-local';
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
export function NotificationSettings(props: {
  locale: Locale;
  publicKey: string;
  userId?: string;
}) {
  return (
    <MobilePwaOnly includeBrowser>
      <NotificationAccess {...props} />
    </MobilePwaOnly>
  );
}
function NotificationAccess(props: { locale: Locale; publicKey: string; userId?: string }) {
  const installed = useSyncExternalStore(subscribePermission, isMobilePwa, () => false);
  const t = dictionary(props.locale);
  return installed ? (
    <MobileNotificationSettings {...props} />
  ) : (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t.pushTitle}</h1>
      <p>{t.uxInstallNotifications}</p>
      <Link href="/install" className="inline-flex min-h-12 items-center underline">
        {t.uxInstallGuide}
      </Link>
    </section>
  );
}
function MobileNotificationSettings({
  locale,
  publicKey,
  userId = '',
}: {
  locale: Locale;
  publicKey: string;
  userId?: string;
}) {
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
        if (active) {
          setOn(saved && Notification.permission === 'granted');
          if (saved && Notification.permission === 'granted') markPush(userId, true);
        }
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
  }, [t.pushFailed, userId]);
  async function toggle() {
    if (!isMobilePwa()) return;
    setBusy(true);
    setMessage('');
    try {
      if (!on) {
        if (!(await enableDevicePush(publicKey))) {
          setMessage(t.pushPermissionHelp);
          return;
        }
        markPush(userId, true);
        setOn(true);
        return;
      }
      const r = await navigator.serviceWorker.getRegistration();
      if (!r?.active) throw new Error('WORKER_NOT_READY');
      const s = await r.pushManager.getSubscription();
      if (on) {
        if (s) {
          if (!(await removePush(s.endpoint))) throw new Error('REMOVE_FAILED');
          await s.unsubscribe();
        }
        setOn(false);
        markPush(userId, false);
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
