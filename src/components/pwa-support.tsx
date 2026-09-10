'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { Button } from './ui/button';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
const InstallContext = createContext<InstallEvent | null>(null);
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
    const installed = () => setInstallEvent(null);
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
    <InstallContext.Provider value={installEvent}>
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
  const event = useContext(InstallContext);
  const [usedEvent, setUsedEvent] = useState<InstallEvent | null>(null);
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const t = dictionary(locale);
  if (standalone) return null;
  return (
    <section className="mx-auto mt-6 max-w-lg rounded-xl border bg-card p-4 text-left">
      <h2 className="text-sm font-semibold">{t.installTitle}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.installHint}</p>
      {event && event !== usedEvent && (
        <Button
          className="mt-3 w-full"
          variant="outline"
          onClick={async () => {
            setUsedEvent(event);
            try {
              await event.prompt();
              await event.userChoice;
            } catch {
              /* Browser menu remains available. */
            }
          }}
        >
          {t.installApp}
        </Button>
      )}
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 text-primary">
          {t.installInstructions}
        </summary>
        <p className="mb-3 leading-6">{t.installIos}</p>
        <p className="leading-6">{t.installAndroid}</p>
      </details>
    </section>
  );
}
