import { beforeEach, it, expect, vi } from 'vitest';
import {
  dismissOnboarding,
  isDismissed,
  ONBOARDING_SNOOZE_MS,
  dismissalKey,
  markPush,
  readLocal,
  pushOffKey,
} from '../src/lib/onboarding-local';
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
it('Not now expires after three days and is scoped per user and purpose', () => {
  const user = crypto.randomUUID();
  const now = Date.now();
  dismissOnboarding(user, 'install');
  expect(isDismissed(user, 'install', now + 1)).toBe(true);
  expect(isDismissed(user, 'push')).toBe(false);
  expect(isDismissed('other', 'install')).toBe(false);
  expect(isDismissed(user, 'install', now + ONBOARDING_SNOOZE_MS + 100)).toBe(false);
});
it('blocked storage still suppresses repeated prompts in this page session', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
  });
  const user = crypto.randomUUID();
  dismissOnboarding(user, 'push');
  expect(isDismissed(user, 'push')).toBe(true);
});
it('explicit Settings off is distinct from temporary Not now; account binding is local hint only', () => {
  const user = crypto.randomUUID();
  markPush(user, false);
  expect(readLocal(pushOffKey(user))).toBe('true');
  markPush(user, true);
  expect(readLocal(pushOffKey(user))).toBe('false');
  expect(readLocal('catamaran:push-owner:v1')).toBe(user);
  expect(readLocal(dismissalKey(user, 'push'))).toBeNull();
});
