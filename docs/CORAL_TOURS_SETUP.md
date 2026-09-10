# Coral Tours Inventory, receipts and Fuel

Implemented locally on September 10, 2026. All three migrations below were applied to the hosted project on September 10, 2026; all four migration-history entries and live schema/Storage metadata checks passed. Existing authentication and inventory history remain in place.

## Catalog and people

`supabase/seed.sql` contains Cas Cat and Bodega / Storage; Bar, Food, Cleaning, Boat Supplies, Snorkeling, Maintenance, Spare Parts and Tools. It inserts only catalog examples, with no stock balances, movements, costs, expenses or Auth users. Existing matching IDs are preserved. Review the catalog before applying it, especially if your database already has independently created locations or categories.

Reference onboarding list only:

| People | Intended role |
| --- | --- |
| Linda, David, Patricia | OWNER |
| Jackie, Ortega | MANAGER / Encargado |

Names are never used for authorization. Account creation and role activation remain separate manual owner actions. Configure each actual product/location through the existing authorized `configure_inventory` RPC. Record verified physical quantities through inventory transactions. Transfers require both location balances to be configured.

## Review and apply

From the project root, review these additive migrations:

- `supabase/migrations/20260910000100_inventory_transfers.sql`
- `supabase/migrations/20260910000200_receipts_and_fuel.sql`
- `supabase/migrations/20260910000300_v1_locations.sql`

Verify the linked project matches `.env.local`, then preview pending changes:

```powershell
node scripts/check-supabase-link.mjs
npx supabase@2.117.0 db push --linked --dry-run --skip-vault
```

The preview should list exactly the three migrations above if the initial inventory migration is already applied. Stop on unexpected changes. After reviewing the preview, apply and verify:

```powershell
npx supabase@2.117.0 db push --linked --skip-vault
npx supabase@2.117.0 migration list --linked
node scripts/verify-hosted-supabase.mjs
```

Expect four migration history records and passing metadata comparisons. If CLI login is required, run `npx supabase@2.117.0 login` yourself in the terminal and finish browser authentication. Never put credentials into source code or chat. These commands do not seed the catalog. Review `supabase/seed.sql` separately before explicitly applying catalog data.

The receipts migration creates a private JPEG-only, 3 MB Storage bucket and restrictive object policies. An existing incompatible bucket causes migration failure rather than silently changing it. Do not make the bucket public or relax policies to resolve upload failures.

## Receipt and Fuel behavior

Active Owners and Managers can record an expense or capture a purchase draft, then attach a camera photo or an existing JPEG, PNG or WebP image. Fuel / Combustible is an expense category with amount, BZD/USD currency, boat/location, active payer, payment method, notes and device-local date/time. Transaction details show Belize time.

Purchase capture is a receipt draft only: no purchasing workflow, line items, stock posting or reimbursement logic is implemented. Expenses are immutable; a future controlled correction workflow is needed for mistakes. Fuel does not yet track litres, engines or tank levels.

The browser resizes images; the server decodes, normalizes and strips metadata again. Receipts are accessed through an authenticated, uncached route. Upload reservations, digest checks and immutable finalized metadata protect retries. A failed upload leaves the saved expense intact. Retry from the same open form; interrupted reservations remain pending and may require a future reviewed cleanup workflow. There is no receipt delete/replace function.

## Live acceptance checks after migration

Use existing authorized accounts; do not create test stock or expenses in production. Confirm location/category reads, scoped Inventory visibility and transfer destinations. With the next genuine expense, select Fuel, enter the actual details, save and upload the actual receipt. Open the receipt from its detail screen. Check camera capture and gallery selection on a real phone, then verify another authorized account can view it and an unauthorized account cannot. HEIC is not accepted; select JPEG/PNG/WebP. Camera access and uploads require an online HTTPS deployment (localhost is suitable for desktop tests).

Local PostgreSQL tests exercise RLS, atomic transfers, append-only financial records, audit events and Storage policies, including unrelated permissive policies. These simulations do not replace a real authenticated Supabase Storage upload check. No live receipt or operational write was performed during implementation.

## Current V1 locations

Cas Cat is the onboard catamaran inventory. Bodega / Storage is the main land-based storage. Transfers operate in both directions between them. The corrective location migration deactivates the retired seed ID without deleting balances, transactions or audit history, and standardizes the storage name. Apply it to existing databases before using the corrected active catalog. Future locations remain database-configurable; there is no two-location limit in the schema or UI.

## Live rollout status

All four migrations are recorded and verified on the linked Supabase project. Cas Cat and Bodega / Storage are the only active locations. No production products, stock quantities, expenses or receipts have been invented. One active OWNER exists. Authenticated operational acceptance tests require real product/transaction details and an owner browser login. Vercel project `catamaran-inventory` is linked to the GitHub repository. Production public Supabase configuration was compared with the local configuration without displaying values and matches. Preview environment variables are not configured.
