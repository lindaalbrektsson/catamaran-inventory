'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
const InstallContext = createContext<{
  event: InstallEvent | null;
  installed: boolean;
  consume: () => void;
}>({ event: null, installed: false, consume: () => {} });
const subscribeDevice = () => () => {};
function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}
function subscribeStandalone(callback: () => void) {
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);
  return () => {
    media.removeEventListener('change', callback);
    window.removeEventListener('appinstalled', callback);
  };
}
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const t = dictionary(locale);
  useEffect(() => {
    // Only a language preference, never a user ID, session, or inventory record.
    try {
      localStorage.setItem('coral-pwa-language', locale);
    } catch {
      /* Storage may be disabled. */
    }
  }, [locale]);
  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const installed = () => {
      setInstallEvent(null);
      setInstalled(true);
    };
    // Prevent known-offline form submissions. No queue or background sync exists.
    const submit = (event: Event) => {
      if (!navigator.onLine) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    document.addEventListener('submit', submit, true);
    let registration: ServiceWorkerRegistration | undefined;
    let lastCheck = 0;
    const checkUpdate = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60 * 60 * 1000) {
        lastCheck = Date.now();
        void registration?.update().catch(() => {});
      }
    };
    // Never install a development worker or cache hot-reload resources.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((value) => {
          registration = value;
          checkUpdate();
        })
        .catch(() => {
          /* Installation is optional; the online app remains usable. */
        });
    }
    document.addEventListener('visibilitychange', checkUpdate);
    return () => {
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('submit', submit, true);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, []);
  return (
    <InstallContext.Provider
      value={{ event: installEvent, installed, consume: () => setInstallEvent(null) }}
    >
      {!online && (
        <div role="alert" className="border-b bg-warning-soft px-5 py-3 text-sm text-warning">
          <p>{t.offlineBanner}</p>
          <Button className="mt-2" variant="outline" onClick={() => window.location.reload()}>
            {t.reconnect}
          </Button>
        </div>
      )}
      {children}
    </InstallContext.Provider>
  );
}

export function InstallControls({ locale }: { locale: Locale }) {
  const { event, installed, consume } = useContext(InstallContext);
  const [feedback, setFeedback] = useState<
    'installAccepted' | 'installDismissed' | 'installFailed' | null
  >(null);
  const [prompting, setPrompting] = useState(false);
  const ios = useSyncExternalStore(subscribeDevice, isIos, () => false);
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const t = dictionary(locale);
  if (standalone || installed) return null;
  return (
    <section className="mx-auto mt-6 max-w-lg rounded-xl border bg-card p-4 text-left">
      <h2 className="text-sm font-semibold">{t.installTitle}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.installHint}</p>
      {ios ? (
        <p className="mt-3 text-sm leading-6">{t.installIos}</p>
      ) : (
        <Button
          className="mt-3 w-full"
          variant="outline"
          disabled={!event || prompting}
          onClick={async () => {
            if (!event) {
              setFeedback('installFailed');
              return;
            }
            consume();
            setPrompting(true);
            setFeedback(null);
            try {
              await event.prompt();
              const choice = await event.userChoice;
              setFeedback(choice.outcome === 'accepted' ? 'installAccepted' : 'installDismissed');
            } catch {
              setFeedback('installFailed');
            } finally {
              setPrompting(false);
            }
          }}
        >
          {t.installApp}
        </Button>
      )}
      {feedback && (
        <p role="status" className="mt-3 text-sm leading-6">
          {t[feedback]}
        </p>
      )}
      {!ios && !event && !prompting && !feedback && (
        <p className="mt-3 text-sm leading-6">{t.installUnavailable}</p>
      )}
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 text-primary">
          {t.installInstructions}
        </summary>
        {!ios && <p className="leading-6">{t.installAndroid}</p>}
        <p className="mt-3 leading-6">{t.installDesktop}</p>
      </details>
    </section>
  );
}
