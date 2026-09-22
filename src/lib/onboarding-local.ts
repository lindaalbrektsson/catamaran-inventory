export const ONBOARDING_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const memory = new Map<string, string>();
export function readLocal(key: string) {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
export function writeLocal(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Device storage may be disabled. */
  }
  window.dispatchEvent(new Event('onboarding-change'));
}
export const dismissalKey = (user: string, kind: 'install' | 'push') =>
  `catamaran:onboarding:v1:${user}:${kind}`;
export function isDismissed(user: string, kind: 'install' | 'push', now = Date.now()) {
  const until = Number(readLocal(dismissalKey(user, kind)));
  return Number.isFinite(until) && until > now && until <= now + ONBOARDING_SNOOZE_MS;
}
export function dismissOnboarding(user: string, kind: 'install' | 'push') {
  writeLocal(dismissalKey(user, kind), String(Date.now() + ONBOARDING_SNOOZE_MS));
}
export const pushOffKey = (user: string) => `catamaran:onboarding:v1:${user}:push-off`;
export function markPush(user: string, enabled: boolean) {
  if (!user) return;
  writeLocal(pushOffKey(user), String(!enabled));
  if (enabled) writeLocal('catamaran:push-owner:v1', user);
  window.dispatchEvent(new Event('push-permission'));
}
export function subscribeOnboarding(fn: () => void) {
  const events = ['focus', 'pageshow', 'storage', 'onboarding-change', 'push-permission'];
  events.forEach((e) => window.addEventListener(e, fn));
  // Local expiry only; no network or background permission work.
  const timer = window.setInterval(fn, 60000);
  return () => {
    events.forEach((e) => window.removeEventListener(e, fn));
    clearInterval(timer);
  };
}
