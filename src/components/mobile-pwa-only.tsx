'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { isMobilePwa } from '@/lib/mobile-pwa';
function subscribe(fn: () => void) {
  const media = matchMedia('(display-mode: standalone)');
  media.addEventListener('change', fn);
  window.addEventListener('focus', fn);
  return () => {
    media.removeEventListener('change', fn);
    window.removeEventListener('focus', fn);
  };
}
export function MobilePwaOnly({ children }: { children: ReactNode }) {
  const show = useSyncExternalStore(subscribe, isMobilePwa, () => false);
  return show ? children : null;
}
