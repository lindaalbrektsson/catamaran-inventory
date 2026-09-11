# Final V1 QA — 2026-09-11

Current production: https://catamaran-inventory.vercel.app. Only Cas Cat and Bodega are active inventory locations. No production records were invented, overwritten or deleted during QA. No new database migration was needed for these fixes.

## Changes

- Fixed owner edits so renaming an item does not trigger Excel duplicate matching. Database protection still forbids changing units after stock history exists.
- Added an owner-only paginated audit history page over existing RLS-protected audit events, with actor, server time and before/after records.
- Direct mobile visits to desktop owner tools show an explanation and return link instead of an empty page.
- Receipt review accepts decimal commas and highlights the selected queue status; upload controls no longer expose duplicate hidden inputs to assistive technology.
- PWA update falls back to normal reload when service-worker lookup fails.
- Added isolated regression coverage for authenticated route boundaries, original receipt bytes and thumbnail responses, hash validation, review authorization, retries and stock reversal history.
- Added an optional ignored local build directory for OneDrive-locked caches; production configuration remains unchanged.

## Verification before deployment

- Lint and typecheck passed.
- 168 unit/integration tests passed, including PostgreSQL RLS/RPC and immutable stock/audit tests.
- Production build passed.
- 58 browser checks passed; 2 desktop-only checks intentionally skipped in the mobile project.
- Live OWNER login, location pages, empty inventory, receipt queue, capture screen and desktop owner actions verified.
- Live Excel template/export requests returned HTTP 200 without production error entries. The in-app browser did not report a normal download event, so saving/opening the workbook in a regular browser remains an acceptance check.
- Read-only hosted verification checks migration history, schema, functions/grants, RLS, triggers, indexes, constraints and private Storage configuration against local migrations.

## Verification limits and next acceptance review

Production currently has no operational inventory or receipts and only one existing OWNER account. Stock add/remove/transfer/undo, low-stock behavior, manager restrictions, receipt upload/review/download and Excel writes were tested in isolation, not by inventing production data. Complete live acceptance using approved catalog items, verified quantities, a genuine receipt and an actual Encargado account provisioned by an owner.

Native phone camera behavior, Android/iOS installation and updating an already installed physical PWA require device testing. Automated tests cover native prompt events, Safari instructions, standalone detection, safe cache rules and explicit version updates. No automatic reload interrupts unfinished forms.

Audit record payloads preserve original database values for inspection. Large inventory/history datasets may eventually require more server-side pagination. No new purchasing/accounting/fuel module is included.
