'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Download } from 'lucide-react';
import { dictionary, type Locale } from '@/lib/i18n';
import { mobilePlatform, isMobilePwa } from '@/lib/mobile-pwa';
import { enableDevicePush, notificationPermission } from '@/lib/push-client';
import {
  dismissOnboarding,
  isDismissed,
  markPush,
  pushOffKey,
  readLocal,
  subscribeOnboarding,
} from '@/lib/onboarding-local';
import { useInstallAvailability } from './pwa-support';
import { MobilePwaOnly } from './mobile-pwa-only';
import { Button } from './ui/button';

export function InstallationSettings({ locale }: { locale: Locale }) {
  const { installed } = useInstallAvailability();
  return (
    <MobilePwaOnly includeBrowser>
      {!installed && (
        <Link
          href="/install"
          prefetch={false}
          className="mt-2 flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3"
        >
          <Download aria-hidden="true" className="size-5 text-primary" />
          {dictionary(locale).uxInstallGuide}
        </Link>
      )}
    </MobilePwaOnly>
  );
}
export function MobileOnboarding(props: { locale: Locale; userId: string; publicKey: string }) {
  return (
    <MobilePwaOnly includeBrowser>
      <Onboarding {...props} />
    </MobilePwaOnly>
  );
}
function Onboarding({
  locale,
  userId,
  publicKey,
}: {
  locale: Locale;
  userId: string;
  publicKey: string;
}) {
  const t = dictionary(locale),
    router = useRouter(),
    install = useInstallAvailability();
  const installDismissed = useSyncExternalStore(
    subscribeOnboarding,
    () => isDismissed(userId, 'install'),
    () => true,
  );
  const pushDismissed = useSyncExternalStore(
    subscribeOnboarding,
    () => isDismissed(userId, 'push') || readLocal(pushOffKey(userId)) === 'true',
    () => true,
  );
  const permission = useSyncExternalStore(
    subscribeOnboarding,
    notificationPermission,
    () => 'unsupported' as const,
  );
  const standalone = useSyncExternalStore(subscribeOnboarding, isMobilePwa, () => false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const check = () => {
      if (!standalone || notificationPermission() === 'unsupported') return;
      const revision = ++generation;
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => {
          if (alive && revision === generation)
            setSubscribed(Boolean(s && readLocal('catamaran:push-owner:v1') === userId));
        })
        .catch(() => {
          if (alive && revision === generation) setSubscribed(false);
        });
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('push-permission', check);
    return () => {
      alive = false;
      window.removeEventListener('focus', check);
      window.removeEventListener('push-permission', check);
    };
  }, [standalone, userId]);
  const showInstall = !install.installed && !installDismissed;
  const showPush =
    standalone &&
    publicKey &&
    !pushDismissed &&
    permission !== 'unsupported' &&
    permission !== 'denied' &&
    (permission === 'default' || subscribed === false);
  return (
    <div className="grid gap-3">
      {showInstall && (
        <section className="rounded-xl border bg-card p-4" aria-label={t.installApp}>
          <h2 className="flex items-center gap-2 font-semibold">
            <Download className="size-5" aria-hidden="true" />
            {t.installApp}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.onboardInstallHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  !install.event ||
                  mobilePlatform(navigator.userAgent, navigator.maxTouchPoints) === 'ios'
                ) {
                  router.push('/install');
                  return;
                }
                setBusy(true);
                setMessage('');
                install.consume();
                try {
                  await install.event.prompt();
                  const c = await install.event.userChoice;
                  setMessage(c.outcome === 'accepted' ? t.installAccepted : t.installDismissed);
                  dismissOnboarding(userId, 'install');
                } catch {
                  router.push('/install');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t.installApp}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => dismissOnboarding(userId, 'install')}
            >
              {t.onboardNotNow}
            </Button>
          </div>
        </section>
      )}
      {showPush && (
        <section className="rounded-xl border bg-card p-4" aria-label={t.onboardStayUpdated}>
          <h2 className="flex items-center gap-2 font-semibold">
            <Bell className="size-5" aria-hidden="true" />
            {t.onboardStayUpdated}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.onboardPushHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage('');
                try {
                  if (await enableDevicePush(publicKey)) {
                    markPush(userId, true);
                    setSubscribed(true);
                  }
                } catch {
                  setMessage(t.pushFailed);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t.pushEnable}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => dismissOnboarding(userId, 'push')}
            >
              {t.onboardNotNow}
            </Button>
          </div>
        </section>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
