# Quick Add and Need to Purchase

## Operational Add

Tap Add on Cas Cat or Bodega, type a name, choose an existing match or the explicit new-item option, enter quantity and save. The location is preselected. Bottom navigation Add opens the same form with a location selector. Only a new item requires a category. No costs, currency, thresholds, dates, actor fields or configuration pages are part of this flow. New items use pieces; after movements exist, unit changes remain prohibited to avoid reinterpreting history. Owners can edit names/categories/thresholds from desktop tools and create/rename categories there.

Case-insensitive partial search and punctuation-insensitive matches surface possible duplicates. Exact duplicates cannot be created. Similar punctuation variants require confirmation. Spellcheck uses the selected EN/ES locale and the browser's keyboard capabilities; names are never silently corrected or merged. Owner naming cleanup is by explicit rename/deactivation; no automatic or bulk historical merge is provided.

The narrow OWNER/MANAGER `quick_add_stock` RPC creates a product if needed, creates missing zero-stock location configurations and records quantity through `change_stock`, in one transaction. Existing catalog administration remains OWNER-only. Stable request IDs make exact retries idempotent; changed payloads cannot reuse a request. Original transaction/audit history remains immutable. New products are configured at active locations to support immediate transfers without configuration screens.

## Need to Purchase

Available from Inventory, More and Add. OWNER and MANAGER can create/update operational needs. CAPTAIN/CREW cannot access this module. Each need supports name, optional inventory item/location, Belize/USA, HTTP(S) product link, private optional photo, comment and Pending/Ordered/Done. Lists filter by country/status/location/item. Creator/time are immutable; updater/time and all before/after revisions are audited. Optimistic version checks prevent lost edits and open duplicates need explicit confirmation. No hard delete endpoint exists.

Photos use a separate private `need-photos` bucket. A creator can attach one validated JPEG/PNG/WebP input up to 3 MB, normalized to JPEG. The saved metadata remains if upload fails; retry with the same photo or reopen the saved entry. Originals are not promised for purchase-need reference photos. Completed photos cannot be overwritten or deleted by application roles. The existing receipt bucket/original preservation rules are unchanged. Reading photos requires authenticated OWNER/MANAGER access and is never cached.

## Rollout

Apply only `20260911000500_quick_add_and_purchase_needs.sql` after dry-run review, then run `scripts/verify-hosted-supabase.mjs` before deploying the matching commit. The pending phone-auth work on `codex/staff-auth` is not part of this rollout. Its unapplied migration must be renumbered after this migration before a future merge to avoid out-of-order history.

Automated QA uses isolated records. No operational production stock, purchase needs or photos are invented to test a deployment. Live acceptance of saved stock and uploaded photos uses the next genuine item/purchase need authorized by an owner.

## Mobile navigation update

Mobile navigation is Home, Add, More. Home shows Need to Purchase directly below the location cards, with exact RLS-scoped Pending/Ordered counts and View needs/Add need links. Need remains in the desktop sidebar. Home has Bodega and Cas Cat cards with direct Add/Remove/Transfer actions. Add opens exactly inventory, fuel receipt and store receipt choices. Remove and Transfer choose the item inline; a single other active location is inferred. More retains receipt history. Desktop keeps Inventory and Receipts navigation and existing Owner tools.

New Needs start Pending, with optional details collapsed. The list defaults Pending and offers one-button Ordered/Done progression through the existing version-checked audited RPC. Low-stock inventory suggestions require a saved confirmation; existing open needs are linked instead of automatically duplicated.

Migration 20260911000600_transfer_destination_configuration.sql creates a missing zero destination within the atomic transfer, recording configuration and both movement audit events. Failed transfers roll the configuration back.
