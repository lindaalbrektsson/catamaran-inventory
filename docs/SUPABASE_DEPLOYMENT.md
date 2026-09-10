# First hosted Supabase deployment

The app reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both are present locally. The server client and session-refresh proxy share `src/lib/supabase/config.ts`; there is no elevated client. Never paste environment values or CLI authentication material into chat or enable debug logging when sharing output.

## Review outcome

The first migration has not yet been confirmed applied. Its filename is now `20260909000100_inventory.sql`, using the standard 14-digit migration timestamp. Existing Git commits were not modified. Do not apply this revised initial migration over an older deployed copy; the preflight below detects existing objects.

Fixes made before deployment:

- Reject non-finite numeric values at table constraints, not just RPC input validation. PostgreSQL treats numeric NaN as greater than finite values, so a lower-bound-only check was insufficient.
- Validate null identifiers, excess threshold precision/range and balance overflow.
- Scope privilege revocations to application objects; do not revoke access to unrelated public-schema tables/functions.
- Backfill Auth users created before migration as inactive CREW, without trusting their role metadata.
- Audit assignment revocation, keep update timestamps current, and block truncation of ledger/audit tables as well as row updates/deletes.
- Lock new/existing inventory configurations consistently so threshold audit before-images are accurate.
- Add missing foreign-key-supporting indexes, a product/location ledger FK and movement-sign constraints.

All eight application tables still have RLS. Only active owners/managers have broad location access; captain/crew access is assignment-scoped. Every stock mutation still runs through the authorized, row-locked, idempotent RPC. Ordinary API roles cannot edit balances, alter history, or self-promote. Security-definer functions have empty search paths and explicit schema qualification.

## 1. Manual dashboard preflight — stop here first

Open the intended project in Supabase Dashboard. Go to **SQL Editor → New query**, paste the entire local file `supabase/checks/preflight.sql`, and run it. It is read-only and returns counts, not private records.

**All four counts must be zero.** If any count is nonzero, stop and share only the check names/counts. Do not delete tables, change RLS, reset the database, or run migration repair to force the migration through.

No dashboard action has been performed by the agent.

## 2. Apply through the CLI (recommended)

The CLI records migration history; directly pasting schema changes into SQL Editor does not. Local `supabase/config.toml` is already initialized. It contains local development settings only and does not change hosted Auth settings.

In PowerShell at the repository root, run each step separately:

```powershell
npx supabase@2.117.0 login
npx supabase@2.117.0 link
node scripts/check-supabase-link.mjs
npx supabase@2.117.0 migration list
npx supabase@2.117.0 db push --linked --dry-run --skip-vault
```

Complete CLI login yourself in the browser/terminal. In `link`, select the intended project. If it asks for the database password, enter it only into your local CLI prompt; do not send it here or put it in a command argument. No secret/service-role API key is needed. If login/link cannot complete, stop before the push.

The link check must say `Linked project matches .env.local.` The migration listing must show only `20260909000100` pending for this application. The dry run must list only `20260909000100_inventory.sql`. A different list, pre-existing remote version, or schema conflict means stop and review; do not use `--include-all`, `--include-roles`, or `db reset`.

After those checks succeed, apply:

```powershell
npx supabase@2.117.0 db push --linked --skip-vault
npx supabase@2.117.0 migration list
```

Confirm the displayed migration list at the CLI prompt. Verify `20260909000100` appears as applied remotely afterward. `--skip-vault` prevents unrelated vault synchronization. The migration runner owns the transaction; do not add `COMMIT` inside the migration.

The publishable key cannot apply SQL migrations and must not be given elevated grants. CLI authentication is a separate, manually completed administrative step. The user completed CLI login. Migration 20260909000100 was subsequently applied with explicit approval and verified; see HOSTED_MIGRATION_VERIFICATION.md.

## 3. Manual post-migration checks

In SQL Editor, run `supabase/checks/verify.sql` without modifying it. Expected:

- Eight application tables; every `rls_enabled` value is true.
- No anonymous execution on application functions. Authenticated access exists only for the three public RPCs and three private policy helpers; authorization remains checked inside them.
- Immutable update/delete and truncate triggers on both history tables, audit triggers and timestamp triggers are enabled.
- No PUBLIC/anonymous table grants. Authenticated SELECT on the eight tables; INSERT/UPDATE only on locations/categories/products, filtered by owner-only RLS. No DELETE, TRUNCATE or direct balance/history/profile writes.

Then optionally load the initial catalog using the CLI:

```powershell
npx supabase@2.117.0 db push --linked --include-seed --skip-vault
```

This seed creates two locations, eight products and zero balances. It does not create users, passwords or stock movements. Skip it if you want to define a different catalog. Do not put invented operational quantities in the database.

## 4. Manual Auth setup

1. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000`. Set the eventual production URL when deploying. The current sign-in uses email/password; it does not need a custom JWKS setting.
2. In Authentication settings, disable **Allow new users to sign up**. Keep email/password sign-in enabled. Local TOML settings are not automatically applied to hosted Auth by `db push`.
3. In **Authentication → Users → Add user → Create new user**, create your account with an email and password you choose privately. Mark the email confirmed if that option is available. Do not send the password here.
4. Skip activation if your intended profile is already an active OWNER. Otherwise, copy only your Auth user UUID. In SQL Editor, run the following once after substituting that UUID:

```sql
update public.profiles
set display_name = 'Linda', role = 'OWNER', active = true
where id = '<your-auth-user-uuid>'
returning display_name, role, active;
```

Exactly one row should be returned. This one-time administrator bootstrap is audited; ordinary users do not get profile-update privileges. Do not update `inventory_balances.quantity` in SQL Editor or Table Editor.

## 5. Resume live verification

Restart the local Next.js process if needed and sign in yourself. Tell the agent that migration, catalog setup and owner activation succeeded; share only errors/counts if they did not. No password, access token, session cookie, secret key or environment value is needed in chat.

The agent can then verify the authenticated UI and the Inventory slice in your signed-in browser. Use a clearly designated test item/location for write tests so the immutable ledger does not confuse test changes with actual inventory. Tests must still use normal Auth and the production stock RPC; no elevated client or direct balance writes.

Pending live checks: login/session refresh, active/inactive profiles, assigned-location RLS, add/remove persistence, negative-stock rejection, identical retries, actor/audit attribution, low-stock transitions and independent-session concurrency. Until then, local PostgreSQL tests do not constitute hosted Auth/PostgREST verification.

References: [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations), [function security](https://supabase.com/docs/guides/database/functions), [PostgreSQL numeric special values](https://www.postgresql.org/docs/14/datatype-numeric.html).
