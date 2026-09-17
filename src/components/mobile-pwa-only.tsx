'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { isMobilePwa, mobilePlatform } from '@/lib/mobile-pwa';
function subscribe(fn: () => void) {
  const media = matchMedia('(display-mode: standalone)');
  media.addEventListener('change', fn);
  window.addEventListener('focus', fn);
  return () => {
    media.removeEventListener('change', fn);
    window.removeEventListener('focus', fn);
  };
}
function isMobile() {
  return Boolean(mobilePlatform(navigator.userAgent, navigator.maxTouchPoints));
}
export function MobilePwaOnly({
  children,
  includeBrowser = false,
}: {
  children: ReactNode;
  includeBrowser?: boolean;
}) {
  const show = useSyncExternalStore(
    subscribe,
    includeBrowser ? isMobile : isMobilePwa,
    () => false,
  );
  return show ? children : null;
}
