import { useSyncExternalStore } from 'react';
const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
};
export function usePathname() {
  return useSyncExternalStore(subscribe, () =>
    document.querySelector('script[src="/back.tsx"]') ? location.pathname : '/inventory',
  );
}
export function useSearchParams() {
  return new URLSearchParams(location.search);
}
export function useRouter() {
  return {
    back: () => history.back(),
    replace: (url: string) => {
      history.replaceState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    push: (url: string) => {
      sessionStorage.setItem('navigation-fixture', url);
      window.dispatchEvent(new CustomEvent('fixture-navigation', { detail: url }));
    },
    refresh: () => sessionStorage.setItem('refreshed-fixture', 'yes'),
  };
}
export function unstable_rethrow(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'digest' in error &&
    String(error.digest).startsWith('NEXT_REDIRECT')
  )
    throw error;
}
