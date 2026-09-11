# Catamaran Belize — simplified daily operations

The visible brand is Catamaran Belize. Existing technical identifiers, repository name, database objects and Supabase project remain unchanged. Cas Cat and Bodega are the only current locations.

## Operational mobile flow

Jackie, Ortega and future MANAGER users can tap **Add** on a location card, choose the item, enter quantity and save. The center Add navigation button leads to the same location choices. Tapping a location name opens its normal inventory list for remove/transfer actions. Location cards no longer contain item counts, low-stock counts or last-movement statistics. The dashboard hero, alert panels and stock-guide panel were removed.

Stock actor and timestamp come from authenticated PostgreSQL RPCs. The forms never request name, date or time. History displays server timestamps in the viewer's browser timezone. **Undo** appends a linked reversal, with its own actor and timestamp; it never changes the original transaction. Transfer Undo reverses both legs atomically. Undo is rejected if it would produce negative stock, for already reversed actions, or for reversal-of-reversal chains. Managers can undo their own actions from the last 30 days; owners can undo any original action. Managers see their own recent actions plus linked owner corrections; owners retain full audit/history access.

Receipt capture has two entry points: **Add fuel receipt** and **Add store receipt**. Choose/take a photo, select Cash/Card/Credit using radio buttons, and upload. No supplier, amount, date, time, paid-by, category, notes or itemization is requested. The server records FUEL/STORE, payment method, uploader and immutable creation timestamp. New files stay in the private receipts bucket with original bytes preserved (JPEG/PNG/WebP, up to 20 MB). The server validates the image and digest; thumbnails are generated separately. Older processed receipts are explicitly labeled. Receipt files are never cached by the PWA. Pending uploads can be retried without overwriting files.

## Owner administration and review

Linda, David and Patricia are the intended OWNER users. These names are reference data only; authorization uses active profile roles. This task does not create Auth users or reassign existing accounts.

Owners retain item creation/configuration in the desktop workspace. Unit selection uses the existing supported units; a unit can change only before any stock history exists. The database enforces that rule even for direct owner updates. Owners can edit category names in English/Spanish and active status. Excel download, import and export actions appear only on desktop/tablet layouts. All workbook endpoints, preview actions and catalog RPCs enforce OWNER on the server. Managers cannot perform administrative writes, even by calling an RPC directly.

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


## Mobile entry and owner workspace — September 11 update

The Add hub and both location cards now offer Add, Remove and Transfer. Location inventory also exposes these actions directly. An action opens a searchable item chooser, then the quantity form, without first opening product detail. Transfer automatically uses the only configured destination; a selector remains only if future configuration introduces multiple destinations. The existing atomic transfer and linked Undo RPCs are unchanged. Owners must configure a product at both locations before it can be transferred; managers cannot provision catalog/location pairs.

Home links owners to `/inventory/overview` on desktop/tablet. The workspace combines current inventory (including inactive items), location/category/product filters, quantity and thresholds, item editing, Excel and searchable movement history. History currently loads the complete RLS-visible ledger and displays it in batches of 50; switch to server search/pagination when data volume warrants it. Item configuration can rename products and change metadata/thresholds without changing balances. Inactive items retain owner history access. Category editing uses existing owner RLS and audit triggers. No configurable-unit registry or new module was added: supported units remain the existing database enum.

Receipt queue cards include private thumbnails, uploader, original server timestamp, payment method and status; NEW is labeled Needs Review. Owners can open/download an individual receipt from its detail screen. New minimal receipts preserve the selected JPEG/PNG/WebP bytes (maximum 20 MB, 40 megapixels) through authenticated direct Storage upload. Server completion verifies hash, size, MIME and image decoding. Thumbnail derivatives are generated on demand, never written over the original. Original paths, hash, uploader and timestamp are immutable; Storage overwrites/deletes remain prohibited. Older processed receipts are explicitly labeled because their original source bytes cannot be recovered. HEIC is not currently accepted; phone capture must provide JPEG, PNG or WebP.

Applied to the linked production database on 2026-09-11: `20260911000100_receipt_originals.sql` and `20260911000200_catalog_configuration.sql`. Migration history now contains ten entries. These contain no operational seeds and do not replace old image objects or stock records.


The naming migration `20260911000300_bodega_name.sql` was applied on 2026-09-11. The only active V1 locations are **Cas Cat** and **Bodega**. It renames the existing location ID in place without modifying balances or transactions. Earlier migration files are retained as deployment history; the location type model still supports future locations.
