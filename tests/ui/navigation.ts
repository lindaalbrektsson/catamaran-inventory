// Test-only adapter for the isolated component fixture, not authentication.
export function usePathname() {
  return '/inventory';
}

export function useRouter() {
  return { refresh: () => sessionStorage.setItem('refreshed-fixture', 'yes') };
}
