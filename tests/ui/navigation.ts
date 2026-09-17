// Test-only adapter for the isolated component fixture, not authentication.
export function usePathname() {
  return '/inventory';
}

export function useRouter() {
  return {
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
