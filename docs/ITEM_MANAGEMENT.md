# Inventory item management

Owners and Managers can use **Inventory → Add item** to create a product and its location configuration in one transaction. Categories come from the database; units use the existing shared stock-unit enum. New items start at zero. Inactive items remain hidden from operational lists. Category administration stays owner-only.

**Download Excel template** creates an empty `.xlsx` with stable English interchange headers and an EN/ES Instructions sheet containing the current catalog choices. There are no example quantities to accidentally import. **Export inventory to Excel** creates a read-only quantity snapshot; its quantity column deliberately differs from the import template.

**Import items from Excel** accepts a maximum of 200 rows and 1 MB, with a 10 MB decompressed archive limit. Formulas and non-scalar cells are invalid. The full file is parsed on the server before preview. No database writes happen during preview. Fix invalid rows in Excel and upload again. Each existing product requires an explicit skip or metadata-update choice. Repeated names within one file must be resolved in the workbook. Initial stock for existing products is rejected; skip the row or enter zero. Unit changes for existing products are rejected to avoid reinterpreting stock history.

Confirmation calls `save_inventory_items`. The RPC checks active OWNER/MANAGER authorization, serializes catalog writes, validates every row and performs one database transaction. Any failed row rolls back the whole batch. Request IDs prevent duplicate creation on retries. Metadata updates never assign an existing balance quantity. Positive initial quantity on a new active product calls the existing `change_stock` RPC (`ADD`, reason `other`, notes `INITIAL_IMPORT; batch=…`), preserving actor and audit history. Product metadata is shared across locations; thresholds apply to the selected location.

## Rollout

Migration applied to the linked hosted project during this implementation:

`supabase/migrations/20260910000400_item_import.sql`

The migration was reviewed, dry-run checked and applied before deploying the item-management UI. It adds a restricted private idempotency table and the authorized RPC; it does not seed products, stock or financial records and does not relax existing RLS. The eight user-approved inventory categories are configured. No live operational data was created during development.

## PWA install correction

The install event is consumed once, with accepted/dismissed/error feedback. The native button is disabled until a browser supplies an install event. iPhone/iPad get visible Share → Add to Home Screen instructions. Standalone sessions and the `appinstalled` event hide installation controls. Browsers may suppress a prompt due to installation state or eligibility; this is explained instead of silently ignored. Automated tests simulate Android Chromium install events, iOS detection and standalone mode. Physical-device installation remains a manual acceptance check.
