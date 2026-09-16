# Username login — local implementation, not deployed

## Mapping
The visible form sends username/password to the existing Next.js Server Action. Usernames are trimmed, lowercased and limited to 1–40 ASCII letters, digits, dot, underscore and hyphen. `profiles.username` is unique in PostgreSQL, including inactive/historical profiles. Authorization still uses the immutable Auth UUID and existing roles/gates/RLS.

A service-only resolver joins the profile UUID to the current Auth email. Its output is consumed on the server, never returned by the login action. The normal publishable-key Supabase SSR client checks the password and writes its usual session cookies. Invalid username/password share the same translated error. Shared DB rate limits (60 attempts/IP and 15/username per five minutes), HMAC identifiers, dummy Auth attempts and a randomized minimum response duration reduce enumeration. This is timing mitigation, not a claim of mathematically identical network timings. The trusted Vercel IP header is used; local/non-Vercel servers use a shared bucket.

Supabase's signed-in session/JWT can include the user's own email/phone claims. No lookup endpoint exposes them before authentication. A literal requirement that even authenticated session data contain no such claims needs a separately reviewed token-hook/session design; this implementation does not rewrite JWTs or session storage.

## Provisioning and recovery
New accounts require manual temporary passwords (minimum 6; no complexity rule) and use `email_confirm: true` through Admin Auth, without verification-email delivery. A database-generated opaque `u_<random-id>` is reserved with the account request, independent of username. `AUTH_INTERNAL_EMAIL_DOMAIN` supplies the domain server-side. Phone is optional private contact information; contact edits never change Auth phone.

Username reservations and the account operation are committed together. Retries reuse the same reservation and linked UUID. Reservations are not silently released on failure. Settled failed requests are released for retry and shown in Users as resumable forms. An operation still marked running stays blocked rather than assuming it is safe to retry concurrently. A crashed running operation requires administrative investigation; no automatic timeout clears its lock.

Unused account deletion removes profile/contact/setup/reservation rows through the pending safe Auth deletion trigger. Historical accounts retain Auth/UUID/username and history, with access deactivated. Original names reserved by completed provisioning requests remain reserved until the unused account is deleted; a renamed username does not become a new identity.

## Required rollout order — do not run until authorized
1. Review/apply `20260916000300_safe_user_deletion.sql`, then `20260916000400_username_login.sql` through the linked CLI migration workflow.
2. Add server-only `AUTH_INTERNAL_EMAIL_DOMAIN=auth.catamaranbelize.com` in Vercel Production. Use Preview only with an explicitly chosen test environment. Reuse existing `SUPABASE_AUTH_ADMIN_KEY`; never place it in NEXT_PUBLIC variables.
3. Ensure Supabase email/password authentication is enabled and public signup remains disabled. Confirm control of the internal domain and keep recovery admin-managed; do not configure outbound recovery/verification email delivery to staff's synthetic identities.
4. Run `node --env-file=.env.local scripts/migrate-usernames.mjs` for a read-only plan. The script refuses any project URL except the verified Catamaran production project. It never prints emails, phones, passwords or API errors.
5. After authorization, run the same command with `--apply`. This is separate from SQL migration deployment and uses Admin Auth only for identity updates.
6. Verify username login before removing any legacy phone identities. This implementation does not remove them. Do not recreate existing users or reset their passwords.

Mapping confirmed from production UUIDs (configuration only; not authorization logic):
- `3ea06162-de4a-4b3e-a121-304137e7098d` → `linda`
- `32a47dc1-ff66-48e0-9d39-cf5be120556f` → `test.manager`

The existing real email is preserved. Only the phone-only account receives a random internal email through `updateUserById`. No password or phone parameter is included in that update. Username assignment is idempotent and audited against the existing ACCOUNT_ADMIN actor. Identity updates are not performed with SQL.

Live migration, existing-password login, real-device persistence and production rollout have not been executed by these local tests.

## Changed implementation files
- `supabase/migrations/20260916000400_username_login.sql`: aliases, reservations, contact storage, resolver, rate limits and deletion integration.
- `src/lib/username-auth.ts`, `src/lib/actions.ts`, `src/lib/auth-domain.ts`: normalized server-side login and generic errors.
- `src/lib/account-actions.ts`, `src/lib/database.types.ts`: username provisioning, contact edits and rename operations.
- `src/components/login-form.tsx`, `src/components/account-form.tsx`, `src/components/staff-profile-form.tsx`, `src/app/(workspace)/staff/page.tsx`: login, onboarding and resumable setup UI.
- `src/lib/i18n.ts`, `.env.example`: translated labels and server-only domain configuration.
- `scripts/migrate-usernames.mjs`, `scripts/username-rollout.mjs`: explicit, idempotent Admin API rollout.
- Username/auth unit tests, migration integration tests, Auth test fixtures, browser tests and staff documentation updated.

Local verification: lint, typecheck and production build passed; 378 automated tests passed; full browser suite 165 passed / 3 expected skips. Browser coverage uses automated desktop/mobile emulation, not physical phones. Privileged resolver/admin-key references were absent from built browser chunks. No production migrations, Auth changes or deployment were executed.
