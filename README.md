# Coral Tours operations

A real local, mobile-first Next.js application for Coral Tours, Belize. English/Spanish interface, Supabase Auth and PostgreSQL inventory with immutable stock movements.

## Project root

This folder is both the Next.js project root and the Git repository root:

`C:\Users\linda\OneDrive\Documents\ChatGPT\App inventory Cat Belize`

Run all commands from this folder. There is no nested app or monorepo package.

## Local setup

Requires Node.js 24 LTS and npm. Dependencies are pinned by package-lock.json.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Until Supabase is configured, the app displays a setup screen; it does not invent inventory or users.

In `.env.local`, set only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Use the project URL and publishable key from Supabase Project Settings > API. Never use a service-role key in this application. `.env.local` and all other environment files are ignored; `.env.example` is deliberately tracked with empty values.

## Supabase provisioning (pending)

1. Create a Supabase project. Run `supabase/migrations/202609090001_inventory.sql` in its SQL editor, or apply versioned migrations using the Supabase CLI.
2. Optionally run `supabase/seed.sql`. This creates catalog entries and zero balances only. It contains no credentials or user accounts.
3. Create a confirmed user through the Supabase Auth dashboard. Set the user's display name in their profile. New profiles are inactive CREW regardless of user metadata; users cannot self-promote.
4. Bootstrap the first owner in the SQL editor, replacing the UUID with the actual Auth user ID:

```sql
update public.profiles
set display_name = 'Linda', role = 'OWNER', active = true
where id = '<actual-auth-user-uuid>';
```

5. Other users can be provisioned the same way with the appropriate role. CAPTAIN and CREW need rows in `location_assignments`. User management UI is a later milestone. Database profile changes are audited.
6. Set Auth Site URL to your local or deployed URL. Disable public signups for this staff-only deployment. Configure Auth rate limits and production email delivery before rollout. This milestone uses password sign-in for administrator-provisioned users.
7. Set the environment variables, restart Next.js, sign in and verify the inventory flow. To configure thresholds or add product/location combinations, use the owner-only `configure_inventory` RPC. Initial quantities must be recorded through `change_stock`, never by updating balances.

Generate fresh TypeScript database definitions after provisioning:

```powershell
npx supabase gen types typescript --project-id YOUR_PROJECT_ID --schema public > src/lib/database.generated.ts
```

Review generated types against the checked-in contract before replacing it. No generated file is claimed to have come from a hosted project yet.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Database tests use embedded PostgreSQL (PGlite) with minimal Supabase Auth roles/functions. They exercise the actual migration and RLS; live Supabase Auth, cookie refresh and PostgREST still require a real project. Browser verification instructions and test coverage will be updated with the vertical slice.

## Structure

- `src/app/` — App Router pages, authenticated route group and public auth/setup pages
- `src/components/` — mobile shell, focused domain components and shadcn/ui source
- `src/lib/` — typed domain rules, bilingual dictionaries, server actions and Supabase access
- `supabase/migrations/` — versioned PostgreSQL schema, RLS and transactional functions
- `supabase/seed.sql` — optional catalog, with no invented operational quantities
- `IMPLEMENTATION_PLAN.md` — milestone scope and architecture decisions
- `.env.example` — required public environment variable names
- `vercel.json` — standard Next.js build configuration

## GitHub

Create an empty GitHub repository (do not add a README, license or gitignore there), then replace YOUR-ACCOUNT:

```powershell
git remote add origin https://github.com/YOUR-ACCOUNT/coral-tours-operations.git
git push -u origin main
```

If origin is already configured, inspect it with `git remote -v`; use `git remote set-url origin ...` to change it. GitHub authentication is handled by your Git credential manager or GitHub CLI, never by a token stored in this repository.

## Vercel

Import the GitHub repository, select Next.js and keep Root Directory at the repository root. Set both public Supabase environment variables for the appropriate Preview/Production environments. Use a separate Supabase project for testing. No deployment or cloud resource has been created by this local setup.

## Scope and integrity

Current work is the foundation and the first inventory slice, not the complete financial V1. Balances are locked and updated atomically with immutable transactions/audit events. Negative stock is prohibited. Request UUIDs prevent duplicate writes on retry. OWNER/MANAGER have broad operational access; CAPTAIN/CREW can see assigned locations and record tour consumption only. No frontend role check substitutes for RLS/RPC authorization.

Future purchases, transfers, stock counts, receipts and reimbursements will be implemented module by module. Money must use PostgreSQL numeric and integer minor-unit calculations. No offline synchronization or private-data service-worker caching is implemented.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions).
