'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
import { Smartphone, TabletSmartphone, Share } from 'lucide-react';
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

export function useInstallAvailability() {
  const value = useContext(InstallContext);
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  return { ...value, installed: value.installed || standalone };
}

export function PwaProvider({
  locale,
  children,
  version = 'local',
}: {
  locale: Locale;
  children: React.ReactNode;
  version?: string;
}) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const editedForms = useRef(new Set<HTMLFormElement>());
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
    // Conservative: keep warning until an edited form leaves the page, including failed saves.
    const edited = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const form = target.closest('form');
        if (form) editedForms.current.add(form);
      }
    };
    document.addEventListener('input', edited, true);
    document.addEventListener('change', edited, true);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    document.addEventListener('submit', submit, true);
    let registration: ServiceWorkerRegistration | undefined;
    let lastCheck = 0;
    let lastVersionCheck = 0;
    const checkUpdate = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        Date.now() - lastVersionCheck >= 30000
      ) {
        lastVersionCheck = Date.now();
        void fetch('/app-version', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.version && data.version !== version) setUpdateAvailable(true);
          })
          .catch(() => {});
      }
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
          if (value.waiting) setUpdateAvailable(true);
          value.addEventListener('updatefound', () => {
            const worker = value.installing;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller)
                setUpdateAvailable(true);
            });
          });
          checkUpdate();
        })
        .catch(() => {
          /* Installation is optional; the online app remains usable. */
        });
    }
    // Version detection works even when service workers are unavailable or registration fails.
    checkUpdate();
    const interval = window.setInterval(checkUpdate, 5 * 60 * 1000);
    window.addEventListener('online', checkUpdate);
    window.addEventListener('pageshow', checkUpdate);
    document.addEventListener('visibilitychange', checkUpdate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', checkUpdate);
      window.removeEventListener('pageshow', checkUpdate);
      document.removeEventListener('input', edited, true);
      document.removeEventListener('change', edited, true);
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('submit', submit, true);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, [version]);
  return (
    <InstallContext.Provider
      value={{ event: installEvent, installed, consume: () => setInstallEvent(null) }}
    >
      {updateAvailable && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b bg-secondary p-3 text-sm"
        >
          <span>{t.newVersion}</span>
          <Button
            disabled={!online || updating}
            onClick={async () => {
              for (const form of editedForms.current) {
                if (!form.isConnected) editedForms.current.delete(form);
              }
              if (editedForms.current.size && !window.confirm(t.updateUnsaved)) return;
              setUpdating(true);
              // Only reload this tab after an explicit tap. Never touch auth cookies or storage.
              // The worker does not cache HTML; a normal reload gets the production document.
              let reloaded = false;
              const reload = () => {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
              };
              // Registration/controller events can fail on mobile. Do not leave a dead button.
              const fallback = window.setTimeout(reload, 3000);
              try {
                const registration = await navigator.serviceWorker?.getRegistration();
                if (registration?.waiting) {
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => {
                      window.clearTimeout(fallback);
                      reload();
                    },
                    { once: true },
                  );
                  registration.waiting.postMessage('SKIP_WAITING');
                } else {
                  window.clearTimeout(fallback);
                  reload();
                }
              } catch {
                window.clearTimeout(fallback);
                reload();
              }
            }}
          >
            {t.updateApp}
          </Button>
        </div>
      )}
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

export function InstallControls({
  locale,
  keepInstructions = false,
}: {
  locale: Locale;
  keepInstructions?: boolean;
}) {
  const { event, installed, consume } = useContext(InstallContext);
  const [feedback, setFeedback] = useState<
    'installAccepted' | 'installDismissed' | 'installFailed' | null
  >(null);
  const [prompting, setPrompting] = useState(false);
  const ios = useSyncExternalStore(subscribeDevice, isIos, () => false);
  const otherIosBrowser = useSyncExternalStore(
    subscribeDevice,
    () =>
      isIos() &&
      (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(navigator.userAgent) ||
        !/Version\/.+Safari\//.test(navigator.userAgent)),
    () => false,
  );
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const t = dictionary(locale);
  const alreadyInstalled = standalone || installed;
  if (alreadyInstalled && !keepInstructions) return null;
  return (
    <section className="mx-auto mt-6 max-w-lg rounded-xl border bg-card p-4 text-left">
      <h2 className="text-sm font-semibold">{t.installTitle}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.installHint}</p>
      {!ios && !alreadyInstalled && (
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
      {!ios && !alreadyInstalled && !event && !prompting && !feedback && (
        <p className="mt-3 text-sm leading-6">{t.installUnavailable}</p>
      )}
      <div className="mt-5" id="how-to-install">
        <h3 className="mb-3 font-semibold">{t.installInstructions}</h3>
        {otherIosBrowser && !alreadyInstalled && (
          <p role="status" className="mb-3 rounded-xl bg-secondary p-3 text-sm leading-6">
            {t.installSafariRequired}
          </p>
        )}
        <div className="grid gap-4">
          <section
            aria-labelledby="install-android-title"
            className="rounded-xl border bg-background p-4"
          >
            <h4 id="install-android-title" className="flex items-center gap-3 font-semibold">
              <Smartphone className="size-6 shrink-0 text-primary" aria-hidden="true" />
              {t.installAndroidTitle}
            </h4>
            <ol className="mt-3 list-decimal space-y-3 pl-6 text-sm leading-6">
              <li>{t.installAndroidStep1}</li>
              <li>{t.installAndroidStep2}</li>
              <li>{t.installAndroidStep3}</li>
            </ol>
          </section>
          <section
            aria-labelledby="install-apple-title"
            className="rounded-xl border bg-background p-4"
          >
            <h4 id="install-apple-title" className="flex items-center gap-3 font-semibold">
              <TabletSmartphone className="size-6 shrink-0 text-primary" aria-hidden="true" />
              {t.installAppleTitle}
            </h4>
            <ol className="mt-3 list-decimal space-y-3 pl-6 text-sm leading-6">
              <li>{t.installAppleStep1}</li>
              <li>
                {t.installAppleStep2}
                <Share className="ml-2 inline size-4" aria-hidden="true" />
              </li>
              <li>{t.installAppleStep3}</li>
              <li>{t.installAppleStep4}</li>
            </ol>
          </section>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{t.installDesktop}</p>
      </div>
    </section>
  );
}
