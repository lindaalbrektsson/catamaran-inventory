# Coral Tours V1

## Current milestone
Establish the foundation and complete the inventory vertical slice before adding financial workflows.

1. Bootstrap strict Next.js App Router, Tailwind and shadcn/ui.
2. Version PostgreSQL migrations for profiles, assignments, locations, categories, products, balances, immutable movements and audit events.
3. Supabase SSR authentication, active-profile checks and centralized permissions enforced again by RLS and database functions.
4. Typed English/Spanish dictionaries, profile/cookie language persistence and a touch-first navigation shell.
5. Location selection, searchable/category-filtered inventory, item details, low-stock states, add/remove forms and paginated history.
6. Verify database invariants, authorization, validation, translation coverage, lint, TypeScript, production build and mobile layout.

## Subsequent milestones
- Atomic transfers and physical stock-count sessions.
- Purchases and purchase items finalized in one database transaction.
- Expenses, private receipt storage and reimbursements with decimal-safe amounts.
- Shopping-list overrides, owner catalog/user management and operational reports.

## Decisions
- Single company deployment; role/assignment authorization, not hardcoded names. Multi-company tenancy requires a separate migration and policy review.
- PostgreSQL is the stock authority. Clients cannot write balances or movements directly. Stock mutations lock a balance row, validate stock, write a movement and an audit event atomically.
- Negative quantities are prohibited in this milestone, including for owners. An explicit audited override can be added later.
- UUID idempotency keys make retries safe; request-key collisions with a different payload are rejected.
- Never cache authenticated inventory publicly. Supabase publishable key only; no service-role key is required by the web app.
- Products/categories/locations are database content; all interface copy and unit/reason labels come from translation keys.
- Phone workflows use 44px minimum controls, stacked cards, sticky bottom navigation and dedicated item/action pages. Desktop gets a sidebar and wider grids. Light surfaces favor outdoor dock use.
- No fake inventory fallback. Missing configuration displays a setup state; database failures display a retryable error.
- PWA manifest and icons only. No offline writes or service-worker caching of private data.

## Integration boundary
Hosted Supabase credentials and a provisioned user are required for live Auth/PostgREST verification. Embedded PostgreSQL tests exercise the actual migration/RLS/functions locally; they do not replace hosted integration verification.
