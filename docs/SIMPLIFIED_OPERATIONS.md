# Catamaran Belize — simplified daily operations

The visible brand is Catamaran Belize. Existing technical identifiers, repository name, database objects and Supabase project remain unchanged. Cas Cat and Bodega / Storage are the only current locations.

## Operational mobile flow

Jackie, Ortega and future MANAGER users can tap **Add** on a location card, choose the item, enter quantity and save. The center Add navigation button leads to the same location choices. Tapping a location name opens its normal inventory list for remove/transfer actions. Location cards no longer contain item counts, low-stock counts or last-movement statistics. The dashboard hero, alert panels and stock-guide panel were removed.

Stock actor and timestamp come from authenticated PostgreSQL RPCs. The forms never request name, date or time. History displays server timestamps in the viewer's browser timezone. **Undo** appends a linked reversal, with its own actor and timestamp; it never changes the original transaction. Transfer Undo reverses both legs atomically. Undo is rejected if it would produce negative stock, for already reversed actions, or for reversal-of-reversal chains. Managers can undo their own actions from the last 30 days; owners can undo any original action. Managers see their own recent actions plus linked owner corrections; owners retain full audit/history access.

Receipt capture has two entry points: **Add fuel receipt** and **Add store receipt**. Choose/take a photo, select Cash/Card/Credit using radio buttons, and upload. No supplier, amount, date, time, paid-by, category, notes or itemization is requested. The server records FUEL/STORE, payment method, uploader and immutable creation timestamp. Files stay in the private receipts bucket, are decoded/resized to JPEG with metadata stripped, and are never cached by the PWA. Pending uploads can be retried without overwriting files.

## Owner administration and review

Linda, David and Patricia are the intended OWNER users. These names are reference data only; authorization uses active profile roles. This task does not create Auth users or reassign existing accounts.

Owners retain item creation/configuration. Excel download, import and export actions appear only on desktop/tablet layouts. All workbook endpoints, preview actions and catalog RPCs enforce OWNER on the server. Managers cannot perform administrative writes, even by calling an RPC directly.

The Receipts screen provides an owner review queue with NEW, REVIEWED and ARCHIVED statuses. On desktop, open a receipt to review the original photo/uploader/time and optionally record supplier, amount, currency, category and notes. Review details are separate from immutable upload metadata and every review update is audited. The review-details JSON supports later bookkeeping references without requiring operational users to supply them. No accounting posting or new purchasing/fuel module was introduced. Legacy financial records remain accessible only to owners through a secondary desktop link.

## PWA updates

The worker caches only the existing public asset allowlist, never application shells, API/RSC responses, receipt files or mutations. Reopening/reloading fetches current application code. A no-store deployment-version check on foregrounding and worker-update detection show a simple Update action when needed. Updating is explicit: no automatic reload during forms and no offline synchronization or queued stock writes.

## Additive migrations

- `20260910000500_simplified_access.sql`: owner-only catalog/financial administration and limited manager history.
- `20260910000600_stock_reversals.sql`: immutable linked stock and transfer reversals.
- `20260910000700_simple_receipt_capture.sql`: minimal receipt intake, owner review, and scoped private Storage policies.

Applied in that order to the linked production Supabase project on 2026-09-11. Migration history now contains eight migrations. No original stock, audit, receipt or financial rows were deleted or rewritten, and no quantities or financial data were seeded.

## Remaining simplification candidates

The owner-only legacy expense/purchase forms can be retired after existing records are reconciled. The More/settings page and optional stock reason/notes can be reduced further if the team does not use them. Keep the original records and audit trail when retiring UI entry points.
