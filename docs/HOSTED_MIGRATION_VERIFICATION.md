# Hosted migration verification — 2026-09-10

Applied `20260909000100_inventory.sql` through the authenticated, linked Supabase CLI with explicit user approval. No seed flag or secret/service-role API key was used.

Migration SHA256: `0af142c2fea8b94b4bda0d26067f96120b440e2c90c9539606add9e9c0472126`.

Read-only comparison against the exact migration executed locally passed:

- Migration history: one record, version `20260909000100`, name `inventory`.
- Eight tables with RLS enabled; fourteen policies including their expressions.
- Three public RPCs and seven private helpers, matching bodies, search paths and execution grants.
- Eleven application triggers and the Auth profile trigger.
- Fourteen table grants, eighteen indexes, forty-one constraints and fifty-six column definitions/defaults/nullability checks.
- Auth settings endpoint HTTP 200; anonymous inventory request denied with HTTP 401.

The initial comparison needed portable metadata queries: role arrays serialize differently between clients, and NOT NULL constraints appear in different catalogs across PostgreSQL versions. Verification now checks column nullability separately. No hosted schema or RLS changes were made to resolve these reporting differences.

Lint, typecheck, all 58 tests and production build passed. Authenticated hosted inventory writes and concurrent sessions remain untested pending manual account confirmation.

No locations, products, balances or inventory movements exist. No operational quantities were seeded. One Auth user exists. The active OWNER count changed from zero to one between read-only checks; the agent did not create or modify Auth users or activate an OWNER. The migration itself backfills inactive profiles for pre-existing Auth users as reviewed.

Next manual step: inspect Authentication → Users and public.profiles in the dashboard. Confirm the existing active OWNER belongs to the intended account. Do not create a duplicate or repeat activation if it is already correct. Sign in locally yourself and report success without sharing a password or session token. Account changes and further authenticated verification are paused at the requested boundary.

Re-run schema verification with `node scripts/verify-hosted-supabase.mjs`. Its local report under `artifacts/supabase-verification/` is ignored by Git and contains only schema results and aggregate counts.
