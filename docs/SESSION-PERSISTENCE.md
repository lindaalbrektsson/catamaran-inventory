# Persistent staff sessions

The root layout initializes the Supabase SSR browser singleton on every app launch.
The SDK stores access/refresh tokens in persistent first-party cookies shared with
the server, automatically rotates refresh tokens, and resumes refresh when the
browser becomes visible. The Next.js proxy refreshes expired sessions on requests
and propagates updated cookies to both rendering and the response. Do not replace
this with sessionStorage, a service-worker token cache, or a custom refresh timer.

Closing a tab, backgrounding, installing, or a temporary offline/network failure
must not call signOut. Explicit logout clears the session. A cleared browser
profile, new device, revoked/invalid session or account recovery can require login.
RLS, active-account checks and the first-password gate still apply on the server.
Password change does not intentionally log the user out; the trusted Auth trigger
must complete before the application grants access.

Supabase project session lifetime/inactivity limits can override client persistence.
Review Authentication > Settings > Sessions with the Owner; do not increase JWT
lifetime or disable refresh-token reuse protections to work around repeated login.
No dashboard security setting was changed by this implementation.

## Device acceptance checks (real devices required)

For Android Chrome installed PWA, iPhone/iPad Safari Add to Home Screen, normal
mobile browser and desktop browser:

1. Sign in with a provisioned staff account; complete the password change if required.
2. Close the app/browser completely and reopen it: Home should load without login.
3. Background it beyond access-token expiry, then reopen online: session refreshes.
4. Repeat offline then online: offline is not logout. Retry opening Home online.
5. Explicitly sign out, close and reopen: login is required.
6. On a separate test browser profile, clear site data: login is required.

The installed iOS app may use a separate storage context from Safari. Sign in once
inside the installed app if requested; do not assume installing transfers Safari's
session. Browser emulation is not proof of installed OS lifecycle behavior.

Automated SDK tests use an isolated Auth transport to check persistent cookie
expiry, session restoration, refresh-token rotation and explicit logout. These do
not create production users or test physical Android/iOS installation.

Current rollout dependency: phone login and forced-password-change account work
remain in the local branch pending the separate secure account-admin rollout.
Vercel deployment is also blocked by CLI authorization. Do not report those flows
as live until the required account setup and deployment have been verified.
