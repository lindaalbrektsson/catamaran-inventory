# Smart Scan MVP

## Operating model

Add → Smart Scan → Scan note / Scan receipt → camera or image → Read image →
review and correct → choose an action for each row → approve.

All rows start as Ignore. Matching never creates, merges or changes a product.
Exact normalized matches suggest the existing UUID; partial/fuzzy matches show
Check this and require selection. Editing a name clears its selected match.

Note approval can add a reviewed positive quantity through the existing
`quick_add_stock` / `change_stock` transaction model, create a product, or create
a Need. Location/category/unit are required where applicable. Need country is
Belize or USA. Existing active linked Needs are rejected rather than duplicated.

Receipt scans are OWNER-only. Supplier, date, total, currency and lines can be
corrected. Approval can link/create catalog items at zero stock or create Needs.
It **never adds stock or creates an expense**. Receipt metadata remains a reviewed
scan document, not an accounting record. The original image remains accessible.

OWNER can review all scans; MANAGER can scan/review their own notes. CAPTAIN and
CREW cannot scan or approve. Permissions are enforced in server actions, RPCs,
RLS and private Storage policies, including restrictive bucket guards.

## Data and integrity

`smart_scans` retains original image path/hash/type/size, scanner UUID and server
timestamp, immutable original extracted JSON/model, reviewed values, approver
UUID/timestamp and resulting action identifiers. Audit events retain before/after
snapshots. Note stock actions include their transaction request IDs. No normal
delete or overwrite operation is granted for scans or source images.

Upload, analysis and review do write scan/audit records and private image storage;
they **do not write operational Inventory or Needs**. Approval is one database
transaction: any invalid row rolls everything back. Repeating an identical
approved request is a no-op; changing its contents afterward is rejected.

Provider output is untrusted candidate data, never executable instructions or
authorization. The immutable extraction is a workflow audit record, not a signed
attestation from OpenAI. Matching stays local; no catalog, user profile, session,
or inventory history is included in the AI request.

The server validates the original JPEG/PNG/WebP, checks its SHA-256, normalizes
orientation and strips image metadata from the AI copy. The original file remains
private. Maximum original: 20 MB / 40 megapixels. Maximum extraction: 50 rows.
Users must compare the original image for missing lines, incorrect units or
handwriting. The interface does not promise complete or perfect OCR.

Analysis claims are single-use to avoid duplicate charges from retries; there is
a database-backed limit of 20 scans per user per hour and a 40-second provider
timeout. A process interrupted by hosting termination may remain PROCESSING;
inspect history before creating a replacement scan. No automatic retry loops.

## Manual setup boundary — not yet enabled in production

1. In an OpenAI API project, create a project API key and configure its budget.
   Enter the key directly in local `.env.local` or Vercel sensitive server-side
   environment variables. Never paste it into chat or prefix it with NEXT_PUBLIC.
2. Configure:

   ```dotenv
   OPENAI_API_KEY=<enter privately>
   SMART_SCAN_MODEL=gpt-4.1-mini
   SMART_SCAN_ENABLED=false
   ```

   `gpt-4.1-mini` is a starting model for evaluation, not a handwriting accuracy
   guarantee. The chosen model must be available to your API project and support
   image inputs and Responses structured outputs.
3. Review and apply **only**
   `supabase/migrations/20260911001200_smart_scans.sql` after the existing Inventory,
   linked Needs and Documents migrations. Do not run all pending migrations from
   the development branch: account/SMS migrations have separate prerequisites.
   Use the existing controlled migration deployment workflow so Supabase migration
   history records version `20260911001200`. The migration creates no stock data.
4. Check `storage.allow_only_operation(text)` exists in the live Storage schema.
   Storage access fails closed if that operation guard is unavailable.
5. Deploy the reviewed feature branch with the server-only variables. Set
   `SMART_SCAN_ENABLED=true` after schema checks and initial isolated evaluation.
   Until configured, Add does not show Smart Scan; direct visits explain it is
   unavailable. Existing normal inventory/receipt flows continue working.

No live schema, Auth user, operational stock, financial data, or AI key was changed
while implementing this feature.

## Validation and first live evaluation

Automated tests cover PostgreSQL approval/rollback/idempotency, role restrictions,
private image policies, audit history, matching, wrong quantities/corrections,
Need creation and duplicate protection, and browser review/camera-picker flows.
Provider tests use mocked printed and handwritten extraction responses; **they
do not verify OCR accuracy or call OpenAI**. No real phone camera was tested.

Before operational use, scan approved non-operational test images in an isolated
environment: a clear printed list, actual staff handwriting, misspellings, two
similar catalog items, a new item, and an ambiguous receipt. Compare every line
and quantity against the image; verify missing values remain editable. Check
that closing/cancelling review produces no stock/Need changes. Approve corrected
test actions, retry approval, and inspect transaction/audit links. Repeat camera
and gallery selection on one iPhone and one Android. Do not invent live stock.

Official API references used for the server adapter:
[image inputs](https://developers.openai.com/api/docs/guides/images-vision) and
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
