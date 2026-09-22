> Release update: included in the combined 22 September 2026 production release. See RELEASE-2026-09-22.md for final combined verification; earlier local-only status/counts below are historical.

# Mobile install / notification onboarding — pending review

No deployment, production configuration, RLS or migration changes are included in this onboarding work. The earlier Documents/Need migrations remain separately pending.

## Visibility

- Home install card: authenticated OWNER/MANAGER on a detected iPhone/iPad/Android browser, not standalone and no `appinstalled` event observed in the current PWA provider, with no active install snooze. Desktop receives no card. Native APIs cannot reliably detect an installation in another browser or an unreported previous browser session; standalone/display-mode and the available install event are the signals used.
- Install button: consume the existing `beforeinstallprompt` only on a tap. On iOS, absent native prompt, or prompt error, open the existing `/install` guide. The guide retains Safari → Share → Add to Home Screen and Android menu instructions. Accepting/dismissing a native prompt snoozes the card; an `appinstalled` event hides it immediately.
- Notification card: supported installed mobile PWA, eligible role and configured public push key, permission neither denied nor unsupported, no snooze and no explicit Settings Off preference. Show for default permission, or granted permission without an active locally attributed subscription. Do not prompt automatically.
- Granted permission plus a local subscription attributed to this UUID hides the card. The local attribution is only a UX hint, never authorization. Existing subscriptions without a local owner hint require one explicit confirmation (or visiting Notifications Settings, which already verifies server ownership). This avoids an extra Home server read and avoids treating another user's device subscription as current-user enrollment.
- Enable invokes the same shared server-backed subscription path as Settings, with the permission call before any await when permission is default. Existing server ownership, save, failure cleanup and mobile-only restrictions remain authoritative. No automatically triggered subscription/network reconciliation is introduced on Home.
- Denied permission produces no Home card or repeated prompt. More → Settings → Notifications retains Blocked/Off status and browser/device re-enable guidance. Unsupported contexts do not get a misleading Home Enable action. An ordinary mobile browser receives installation guidance in Notifications Settings.

## Not now and local state

Not now suppresses only that card for three days (72 hours). It survives navigation/reload and expires on a later visit/focus, or a local one-minute expiry check while Home is mounted. It is not an opt-out. If storage is unavailable, a memory fallback suppresses repeated prompts within the current page session.

Keys:

- `catamaran:onboarding:v1:<user UUID>:install`: expiry timestamp.
- `catamaran:onboarding:v1:<user UUID>:push`: expiry timestamp.
- `catamaran:onboarding:v1:<user UUID>:push-off`: explicit Settings Off, separate from Not now; Settings Enable clears it.
- `catamaran:push-owner:v1`: UUID associated with the most recently confirmed subscription in this browser. This is a local hint only. No endpoint, key, password or token is stored here.

Users on one device do not inherit another user's dismissal/Off preferences. The existing Settings server check can establish attribution for a valid older subscription. No display-name relationship or new account field exists.

## Settings and performance

More → Settings retains Notifications and adds Installation guide only on mobile when relevant, regardless of temporary Home dismissal. The guide link has prefetch disabled. No extra database query, API endpoint, external service, navigation count, server action on Home mount, or schema is added. Local capability/permission checks and service-worker `getRegistration/getSubscription` do not hold up Home or location rendering. Existing provider version/network behavior remains unchanged. Only an explicit Enable tap invokes the existing subscription server actions and browser push enrollment.

Existing role rules, RLS, service worker, scheduler, push delivery and session behavior are retained. New strings use EN/ES dictionaries and the existing Button/card styling.

## Verification

Automated browser tests use emulated platform/permission/subscription APIs. They do not certify physical-device installation, OS notification permission or background delivery. Real iPhone/Android acceptance should check browser Home → install → open standalone → Enable → receive a real reminder while closed, followed by Not now/denial and Settings recovery behavior.

Final verification: lint PASS (no warnings); typecheck PASS; production build PASS; full automated suite 601/601 PASS across 64 files, including existing push/RLS suites; full browser suite 344 PASS, 2 expected mobile skips for desktop-only views (5.1 minutes); Chromium/WebKit onboarding and notification compatibility 32/32 PASS (41.8 seconds). Earlier fixture import/navigation expectations were corrected; the settled suite has no failures. Standard test-runner color-environment warnings are non-blocking. Generated isolated-build tsconfig includes were restored; no production configuration was changed.

Implementation files: `src/components/mobile-onboarding.tsx`, `src/lib/onboarding-local.ts`, `src/lib/push-client.ts`; the existing `pwa-support.tsx` now exposes install availability, `notification-settings.tsx` reuses the shared opt-in helper, and Home/More/Notifications pass the existing user/public-key context. EN/ES copy is in `src/lib/i18n.ts`. Focused unit tests cover local state and secure opt-in sequencing; `tests/e2e/onboarding.spec.ts` covers the browser behavior.
