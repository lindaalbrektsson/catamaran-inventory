# SMS recovery rollout

Phone/password remains the primary sign-in. Email/password is available as a
secondary option. Forgot password is visible in English and Spanish. No public
registration flow is provided, and SMS requests specify `shouldCreateUser: false`.

## Manual boundary before production

1. Supabase project `shxbhjpjbaknwukqqqoh`: Authentication → Sign In / Providers
   → Phone. Enable phone authentication and configure a supported SMS provider
   using provider credentials entered directly in Supabase. Enable destinations
   Belize (+501), Colombia (+57), and Sweden (+46) in that provider as appropriate.
   Keep OTP expiry, resend throttles and rate limits enabled. Review SMS spend
   limits before activation. Do not send provider credentials in chat.
2. Disable public signups and anonymous sign-in in Supabase. Keep the configured
   password security and refresh-token protections. Set password minimum to 12.
3. Vercel project `catamaran-inventory` → Settings → Environment Variables:
   - `SUPABASE_AUTH_ADMIN_KEY`: a fresh dedicated Supabase secret API key,
     Production, Sensitive, server-only. Never use a NEXT_PUBLIC prefix.
   - `SMS_RECOVERY_ENABLED`: literal `true`, Production, only after SMS is ready.
   The feature defaults to disabled and offers contact-Linda recovery meanwhile.
4. Follow [staff setup](STAFF_AUTH.md) to apply pending migrations 007 and 008,
   verify migration history/RLS and bootstrap the verified existing Linda UUID
   as ACCOUNT_ADMIN. Check whether the capability is already present first.
   Never infer identity from a name or grant all Owners account administration.
5. Deploy the verified main commit only after database and server configuration
   are ready. Check `/app-version` and perform the acceptance tests below.

The configuration review found only the two public Supabase environment variables
in Vercel Production. Admin credentials and the SMS feature flag were not present.
No production secret, SMS, account reset, phone change or permission assignment was
performed by this implementation.

## Recovery behavior

The sequence is phone → SMS code → new password and confirmation → Home. Unknown
numbers and provider errors return the same generic send response. Invalid codes
return a generic verification error; raw Auth responses are never displayed.

After OTP verification, a separate HttpOnly, SameSite Strict recovery cookie is
scoped to `/forgot-password` for ten minutes (Secure in production). It contains
the recovery session and is never returned in component state, logs or audit.
It does not establish the app's normal cookie session. Before a password update,
Auth verifies the access token, the server checks recent OTP authentication, and
the restored session must belong to the same UUID. Password success then signs
in with the new password through the existing SSR cookie client. Server-side
active-account and first-password checks remain in force.

This uses Supabase's supported phone OTP authentication, not an email-only reset
API. Supabase also exposes its own public Auth endpoints; application UI is not
a replacement for hosted signup restrictions, rate limits or Auth security.

Account creation/reset/phone maintenance continue through the existing server-only
ACCOUNT_ADMIN workflow. Existing tests cover denied Owners without the capability,
Managers and other roles; unique temporary passwords; stable UUIDs; masked phone
audit; and immutable profile/audit history. Business ownership alone grants no
credential administration. Lost phone/SIM users contact Linda.

## Acceptance checks after configuration

- With the user's explicit participation, send one real code to their registered
  phone, verify it privately, set a new password and open Home. Do not record a
  trace or screenshot containing the code/password.
- Confirm invalid/expired codes cannot complete recovery and unknown numbers do
  not create Auth users. Verify no sensitive values appear in application logs.
- Verify Linda's capability, then test an explicitly authorized staff reset and
  phone change. Confirm UUID/history unchanged and masks in audit. Do not modify
  real credentials merely to create QA records.
- Follow [persistent-session device checks](SESSION-PERSISTENCE.md) on physical
  Android and iPhone/iPad installed apps, plus mobile and desktop browsers.

Local tests use isolated transports and UI fixtures; no real SMS is sent. They do
not certify SMS delivery, physical PWA lifecycle or live account administration.

Sources: [Supabase phone authentication](https://supabase.com/docs/guides/auth/phone-login),
[OTP without account creation](https://supabase.com/docs/reference/javascript/auth-signinwithotp),
[password updates](https://supabase.com/docs/reference/javascript/auth-updateuser).
