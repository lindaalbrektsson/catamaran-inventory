# Global Items catalogue

The Items link is available on desktop navigation and mobile More for every
approved, active staff role: OWNER, MANAGER, CAPTAIN and CREW. Pending passwords,
invalidated credentials and inactive accounts still confer no access.

Items is independent of location configuration. Create requires name, category
and unit; it creates no stock. Use the existing Add flow to receive stock at a
location. Stock-action permissions, category administration and Owner-only Excel
tools have not been broadened.

Delete requires confirmation and sets `products.active=false`. It retains the
product, balances, transactions and foreign keys. The Items UI has no active or
inactive controls. Existing historical/Owner recovery tools remain available.

## Explicit merge

Choose the item to keep and confirm. Units must match. The selected item's
metadata and existing location thresholds are retained; thresholds are copied
from the source only when creating a missing destination configuration.

Quantities are combined **within each location**, including future locations.
Each nonzero source balance becomes zero and is added to the target at that same
location. Paired immutable CORRECTION transactions use `ITEM_MERGE`, the merge
request ID, authenticated actor and database timestamp. The source product and
its original transactions are retained. No historical movement is reparented.
Merge legs cannot be undone independently. An incorrect merge requires deliberate
operational correction; there is no automatic unmerge in this release.

An immutable private mapping prevents stock from being added back to a merged
source or the source being reactivated. Locks serialize merges against catalogue
and balance changes; concurrent conflicts fail atomically and can be retried.
No direct balance-write privilege is granted to staff.

Active Needs follow the selected product, with audited before/after identity and
version changes. If both products have open Needs, the merge is blocked; staff
must resolve that conflict explicitly. Completed/archived Needs and all other
historical references retain the original product UUID. New active Need writes
resolve the canonical product and remain protected by the unique active-Need
constraint. All existing RLS visibility restrictions remain in force.

Similar-name detection is case/punctuation insensitive. New Items and quick Add
offer an existing match or explicit new-item choice. Excel preview additionally
warns about similar names; its original exact-duplicate and stock-overwrite
prohibitions remain. No automatic merge is performed.

## Rollout

Migration: `supabase/migrations/20260916000100_global_items.sql`.
Applied to production on 2026-09-16 through the reviewed CLI workflow, alongside
`20260916000200_supported_staff_roles.sql`. The role migration limits new staff
assignments to OWNER/MANAGER while retaining legacy enum values and permissions.
Migration history and unchanged production record counts/stock totals were verified.
No production stock, accounts or purchase records are seeded or changed by QA.

Browser checks use desktop/mobile Chromium emulation and isolated action
fixtures. Database integration tests execute the real migration and RPCs in
PGlite; they do not constitute hosted Supabase or physical-phone verification.

## Verification

- Lint and typecheck passed.
- 339 unit/integration tests passed across 33 files.
- 155 automated browser checks passed; 3 existing desktop-only checks skipped on mobile.
- Production build passed.
- Isolated English/Spanish catalogue, duplicate confirmation, delete/cancel and merge flows checked on desktop and mobile emulation.
