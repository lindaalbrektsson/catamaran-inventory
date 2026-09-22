# Explicit test data

Release baseline: `main` at `91e1b8366af2357220a2bd811b7187d05a0cc3a9`, preserving Admin onboarding/Last login from `1c69aa072a0a06adf897ec3cc2102b2b27221199`.
This replaces creator/date/title-based pre-launch classification. Existing records
are **not** reclassified. No account restoration, account deletion, password reset,
production cleanup is part of this implementation. Production deployment was explicitly approved after hosted staging proved unavailable.

## Classification and UI

Migration: `20260922000300_explicit_test_data.sql`.

`is_test boolean NOT NULL DEFAULT false` is added to `products`, `tasks`,
`purchase_needs`, `documents`, `receipt_intake`, `expenses`, and `purchases`.
Maintenance inherits its Task's flag. Receipt files, document/Need versions,
stock movements/balances, subtasks, updates, photos, voice files and reminder
deliveries inherit from their owning record; they have no separate checkbox.

`products.created_by` is added as a nullable profile FK, populated from `auth.uid()`
for future inserts and immutable afterwards. Existing creators are not invented.
Neither false→true nor true→false reclassification is supported.

Shared EN/ES creation checkbox defaults OFF. It appears on Task, Maintenance,
Need, Document, Fuel/Store intake, legacy spending, global Item, quick **new**
Item and manual Item creation. Existing-item stock Add/Remove/Transfer do not
offer classification. Excel imports retain their existing behavior and create
ordinary records; there is no inferred classification or new spreadsheet format.

`TEST` badges identify records in their lists/details (including document
shortcuts). Detail views offer confirmed **Delete test data** where authorized.
Normal records retain their existing archive/deactivation/history behavior.

## Creation and authorization

The authenticated `create_test_record` RPC accepts a fixed whitelist of existing
creation RPCs. It does not accept arbitrary SQL/function names, edits, or stock
operations on existing products. Original RPC validation and authorization still
run. Classification is applied within that same transaction using an inaccessible
private context table, not a client-set configuration variable.

The deletion RPC checks actual locked database records:

- Manager: own test roots with existing object read access.
- Owner: accessible test roots.
- Active, fully provisioned Owner with account-admin: any test root.
- Independently owned linked roots receive the same checks individually.
- Dependent child content inherits its parent's deletion scope.

No direct DELETE grants are added to business tables. Auth/profile/account
management permissions are untouched. Existing media validation and service-only
finalizers remain unchanged.

## Deletion boundaries

The deletion transaction takes deterministic write locks on a fixed set of
business/dependency tables. Normal reads remain possible. It discovers incoming
foreign-key dependencies within that allowlist. It never follows outgoing links
to delete shared users, categories or locations.

A real root, inaccessible test root or unknown dependent table blocks the entire
operation. No partial DB deletion occurs. Document/current-photo FK cycles are
cleared only inside the validated deletion transaction. Inventory transactions
are deleted before balances/products; reversal and merge relationships remain
subject to FK checks. Cross-classification merges are rejected in both directions
and their entire transaction rolls back.

A private transaction manifest permits only those exact rows through existing
delete guards. No global trigger disabling or audit-deletion capability exists.
Original audit events remain, with an additional `TEST_DATA_DELETED` event for
each removed root containing actor, server timestamp and the pre-deletion record.

Request records without blocking FKs are retained for safe idempotency, including
shared/bulk requests. Removed quick-add requests receive a durable request
tombstone. Root/creation tombstones prevent replay from recreating deleted test
objects. This is intentional internal retry/audit retention, not visible
operational content. It is not a general audit purge.

## Storage and scheduling

Every owned file reservation is collected, including unfinished uploads, old
document/Need versions, legacy Need photos, receipt files, maintenance photos and
task photo/voice paths. A private durable queue stores exact bucket/path pairs.
There is no broad prefix/date deletion and no direct SQL deletion of
`storage.objects`.

After the DB commit, a bounded server-only worker calls Storage `remove`.
The existing authenticated `/api/reminders/dispatch` scheduler retries remaining
work alongside push dispatch. No new environment variable or external service is
required. Storage cleanup failure does not suppress push dispatch.

Claims use `FOR UPDATE SKIP LOCKED`, a two-minute lease and unique tokens. Failed
removals retry with exponential backoff capped at one hour. Only successful removal
is acknowledged; an expired lease is reclaimable. Repeated physical removal is
safe after an ambiguous response. Deleted paths remain tombstoned. Storage insert
and queue triggers serialize on the same path lock to reject late metadata
insertion after deletion.

Deletion removes ordinary access immediately through removal of the owning DB
metadata. Physical file removal is eventual and requires the existing scheduler
and server Admin key to remain operational. Queue records can be inspected by a
trusted administrator if Storage repeatedly fails. No additional public cleanup
endpoint is introduced.

## Review / manual QA before release

- Hosted staging was blocked by the current Supabase plan. The user approved a careful Production migration after local checks and schema comparison. Hosted destructive QA remains unverified; use only explicitly disposable TEST records for subsequent manual checks.
- Verify Owner/Manager creation and deletion across the six main modules, in EN/ES.
- Test a real record linked to a test record: deletion must block without changes.
- Verify historical/replaced/unfinished files with real Supabase Storage.
- Test real PostgreSQL concurrency: simultaneous stock writes, references,
  upload finalization, two deletions, scheduler claims and abandoned worker leases.
- Test interrupted deletion responses and unavailable Storage followed by recovery.
- Confirm scheduler health and queue drainage. In-flight push notifications already
  sent to a provider cannot be recalled by a later test-record deletion.
- Verify mobile checkbox/confirmation behavior on physical iPhone and Android.
- Admin onboarding/Last login and all account state must remain unchanged.

Database simulations and browser emulation do not replace those real-service and
physical-device checks. No real operational data should be used for destructive QA.

## Schema inventory

New private tables: `test_creation_context`, `test_creation_requests`,
`test_deleted_roots`, `test_delete_members`, `test_storage_cleanup`, and
`test_deleted_requests`. These store transaction authority, retry outcomes,
deletion tombstones and durable file cleanup; none is exposed as an application
CRUD table. Existing tables receive only the seven classification columns and
`products.created_by` described above. Existing business rows remain unchanged
apart from the new default-false column; no historical creator is backfilled.

Public authenticated entry points: `create_test_record` and `delete_test_record`.
Service-only cleanup entry points: `claim_test_storage_cleanup` and
`finish_test_storage_cleanup`. Trigger guards enforce immutable classification,
prevent mixed real/test merges and reject late uploads to deleted test paths.
Existing history guards gain an exact transaction-manifest exception for DELETE;
normal history mutation and all audit deletion remain prohibited.

Deletion briefly locks the participating business tables for writes while
checking dependencies and deleting. Ordinary reads remain available. This is a
rare explicit destructive action, not a query added to ordinary page loading.
No new Home/navigation/count requests, migrations to Auth, role changes, Vercel
configuration changes or environment variables are introduced.

## Local verification (22 September 2026)

- Lint, typecheck and production build: passed.
- Full automated suite: 635 tests across 68 files passed, including 14 disposable
  database migration/security tests, 3 cleanup-worker tests and Owner/Manager
  server-action coverage.
- Combined browser verification: 114 checks passed (mobile and desktop), EN/ES, existing
  Admin activity, Items/Inventory, Needs/photos, Tasks/Maintenance and uploads.
- Tests use disposable local databases and browser fixtures, not production users
  or production business data.
- Staff onboarding/activity and authentication/session behavior remain unchanged. The combined release separately includes the approved account-actions validation-message fix.
- No obvious secret patterns found in the changed/new files.
- The counts above describe the original local verification; see the final release report for the combined release verification and deployment status. No business cleanup is part of release verification.

The legacy spending deletion gate also preserves current spending access: a
creator downgraded from Owner to Manager cannot delete an otherwise inaccessible
expense/purchase. This case is covered by a database regression test.
