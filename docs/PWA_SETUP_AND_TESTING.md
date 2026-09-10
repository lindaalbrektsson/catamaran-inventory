# PWA setup and testing

Implemented and locally verified on 2026-09-10 in the existing Coral Tours project. No deployment, hosted database changes, Auth user changes or stock data were made for this task.

## Implementation

The App Router manifest names **Coral Tours Operations**, with short name **Coral Tours**, standalone display, portrait orientation, root start URL/scope and business/productivity categories. Existing green branding, navigation, accessibility zoom and English/Spanish dictionaries are preserved. iOS receives both mobile-web-app capability tags, Apple title/status-bar metadata and a 180px touch icon. Login and workspace layouts account for safe areas; mobile bottom navigation has matching content clearance.

The native service worker has no library or bundler plugin dependency. `npm run build` and `npm run dev` generate `public/sw.js` and `public/offline.html` from source and the shared dictionary. Registration happens only in production. `npm run start` requires a completed build. The build may show Node's harmless module-type detection warning while reading the TypeScript dictionary.

Cache Storage contains only these eight public files: `/offline.html`, `/offline.js`, `/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/apple-icon.png`, `/favicon.png`. Precache requests omit credentials. No route HTML, RSC payload, API response, profile, inventory record, Supabase response or mutation is cached there. Compiled JS/CSS/fonts use Next.js's normal content-hashed HTTP caching. Other same-origin GETs use `no-store`; cross-origin and non-GET requests are not intercepted. Existing private response headers and authorization remain in place.

Failed document navigations receive a public translated fallback with HTTP 503. Failed API/RSC requests never receive fallback HTML. An offline banner identifies potentially stale on-screen data. Known-offline form submissions are blocked; nothing is queued or synchronized later. Network failure after a submission still requires the existing idempotent retry flow—offline status cannot establish whether a server received a request.

The worker's version is a hash of its source and public assets. Registration bypasses HTTP worker caching and checks for updates on registration and when returning to the app (at most hourly). Old public caches are removed on activation. Updates wait until existing app tabs/windows close; there is no forced reload during forms. Live pages and app bundles remain network-based even while a worker update waits.

## Icon source

The existing local `public/icon.svg` sailboat is the temporary branded source. Existing 192px/512px PNGs and the 180px Apple icon are retained. New files are a 32px PNG favicon and an opaque 512px maskable icon with the sailboat scaled to fit the central safe area. Replace the SVG and regenerate the PNG variants when the final Coral Tours logo is available. No remote image is used.

## Local verification

Run from the project root:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run start
```

Browser tests start the production build on port 3100 and isolated UI fixtures on 4174. They do not log in or change hosted data. Auth-gate tests support both configured and unconfigured builds. A test POST is attempted only with browser networking disabled. Test quantities exist only in local fixtures. Use `npm run start -- --port 3200` if 3000 is busy.

Results: lint and typecheck passed; **69 unit/database tests and 12 browser tests passed**; production build passed. Reviewed login, inventory cards, stock form and offline fallback around 390px, plus automated desktop checks. Chromium exposed the native install event and the optional install button. Actual signed-in hosted flows and physical iOS/Android installation remain manual.

## Phone installation

Production requires **HTTPS**. Service workers also work on `http://localhost` on the same computer. A phone opening a computer's plain HTTP LAN address does not receive the localhost exception. For phone testing use a trusted HTTPS test address/certificate; no deployment or tunnel has been created here.

Android Chrome: open the HTTPS app, then use **Install app** in the browser menu or the optional button on login/More when Chrome offers it. Launch from the new home-screen icon. Installation availability is controlled by the browser; no automatic popup is shown.

iPhone Safari: open the HTTPS app, tap **Share → Add to Home Screen**, and enable **Open as Web App** if shown. Launch the home-screen icon. Confirm no Safari address bar, correct icon/title, readable status bar and unobstructed bottom navigation. There is no fake iOS install prompt. You may need to sign in separately in the installed app.

On either device, sign in privately, check inventory navigation and a stock form without saving, rotate/zoom and inspect safe areas. In browser developer tools, `matchMedia('(display-mode: standalone)').matches` should be true when installed; iOS also supports `navigator.standalone`.

## Offline and cache checks

1. Load online once and wait for the service worker to activate. In Chrome DevTools → Application → Service Workers, confirm `/sw.js` is activated and controls the page.
2. Set Network to Offline. Existing pages should show the offline warning. Reload an inventory URL: the public offline page should appear, with English/Spanish controls and an internet-required message. No stock details appear in that fallback.
3. Restore connectivity and select **Try again**. Navigation should recover through the normal Auth gate. No movement should appear as a consequence of reconnecting.
4. Inspect Application → Cache Storage → `coral-public-…`. Its keys must be exactly the eight files listed above. Inspect their response bodies: only public assets and generic offline copy. No inventory page, `_rsc` response, Supabase URL, tokens or profiles should appear.
5. Sign out through the normal app flow and sign in as another authorized user privately. Verify the normal role/location restrictions and that responses come from the network. Never share tokens or browser session exports.
6. After a later build/deployment, close all app tabs and installed windows, reopen online and confirm the new worker version. Do not force updates while a stock form is pending. During development, unregister any old production worker on that origin through DevTools before using `npm run dev`.

Offline fallback requires a successful first online installation. Browser storage can be evicted. `navigator.onLine` is only a connectivity hint; server validation remains authoritative. No full offline editing, background sync, push notifications or automatic account provisioning is implemented.

## Files

Created: `src/components/pwa-support.tsx`, `src/pwa/worker.js`, `scripts/build-pwa.mjs`, `public/offline.js`, `public/icon-maskable-512.png`, `public/favicon.png`, `tests/pwa.test.ts`, `tests/e2e/pwa.spec.ts`, and this guide. Generated/ignored: `public/sw.js`, `public/offline.html`.

Changed: `src/app/manifest.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(workspace)/layout.tsx`, `src/app/(workspace)/more/page.tsx`, `src/components/public-frame.tsx`, `src/lib/i18n.ts`, `src/proxy.ts` (public asset exclusions only), `next.config.ts`, `package.json`, `playwright.config.ts`, `tests/e2e/app.spec.ts`, `.gitignore`, `tsconfig.json`, `eslint.config.mjs`, and README. TypeScript/ESLint exclude generated test artifacts. An old generated build was preserved under ignored `artifacts/next-before-pwa/` after a OneDrive file-lock problem. Earlier Supabase migration work remains untouched by this PWA task.

References: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [MDN service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [browser install event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
