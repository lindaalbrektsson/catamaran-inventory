# Production updates

The app checks the uncached `/app-version` endpoint on startup, foreground/reopen,
reconnection, and every five minutes while visible and online. The banner is
non-blocking and does not reload automatically. A normal online reload fetches
current production HTML, even if an update banner was ignored.

Update now / Actualizar ahora reloads only the current tab. If a form has been
edited, a translated confirmation warns that unsaved changes will be discarded.
Cancel keeps the form intact. Tracking is conservative: a failed save still warns.
The update waits for a waiting worker to activate, with a three-second reload
fallback. Other open tabs are never force-reloaded.

No logout, cookie deletion, local/session storage clearing, or auth reset occurs.
Supabase retains its existing cookies/session and normal refresh behavior. Invalid
or revoked sessions still require authentication. HTML, RSC and application data
are not cached by the worker; only the existing public offline/icon allowlist is.

## Verification

Automated Chromium and WebKit tests use the real PwaProvider and Supabase browser
SDK with an isolated auth transport. They cover browser and simulated Android/iOS
standalone signals, ignoring the banner, cancelling/accepting a dirty-form warning,
signed-in state after the update reload, Spanish, no worker, and an unresponsive
waiting worker. These are not real-device or real Supabase credential tests.

## Real-device acceptance (pending)

Repeat on an installed Android PWA, iPhone Safari Add to Home Screen, normal mobile
browser, and desktop browser:

1. Sign in; leave an Add form open with unsaved text before the next deployment.
2. After deployment, foreground the app or wait five minutes. Expect the small
   translated update banner; the form and signed-in session must remain unchanged.
3. Tap Update now, then Cancel. Expect the warning and all input still present.
4. Save or intentionally abandon the draft. Tap Update now and confirm if warned.
   Expect current production version and Home/protected pages without another login.
5. In another open tab, keep an unfinished form. Updating the first tab must not
   reload this other tab.
6. Alternatively ignore the banner and reopen/reload online. Expect current HTML.
   An OS may resume a suspended page instead of reloading; in that case the banner
   returns and the resumed draft remains intact.

Use approved operational data only. No physical phone verification has been done.
