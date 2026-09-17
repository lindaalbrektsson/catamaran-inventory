# Release candidate: trusted uploads and recoverable push

Not deployed. No production migration, user, business-data, Storage or configuration write was performed. A read-only production profile query found zero CAPTAIN/CREW profiles. Production approval remains required.

## Preserved work

Includes the existing complete mobile UX work, Documents naming and automatic per-user/device Frequently used shortcuts, Home | Add | Need | More, Need auto-filters, external/app-user assignee distinction, three-minute voice timer, independent location streaming and `regions: ["fra1"]`. No further visual-polish changes were made during blocker work. Item Merge's original transactional function body, stock arithmetic, movement/audit history and existing normal catalogue permissions are preserved.

## New migrations, in order

1. `20260917000100_category_visual_metadata.sql`: previously completed nullable category visual metadata; retained without expanding the polish work.
2. `20260917000200_trusted_media_finalization.sql`: moves the original single-argument `complete_document_file`, `complete_intake`, `complete_receipt` functions into private schema, revoking client/service execution. Public replacement functions require an explicit trusted actor and are executable only by service_role. They recheck active OWNER/MANAGER, password/setup state, then preserve the original uploader/access/version/metadata checks and audit actor. Existing Storage RLS stays intact.
3. `20260917000300_push_delivery_recovery.sql`: additive delivery state, attempts, lease, token and next-attempt fields/indexes; service-only recovery wrappers and token-checked completion functions for ordinary and maintenance reminders.
4. `20260917000400_merge_access_and_relationship.sql`: a permission wrapper restricts MERGE to OWNER/MANAGER without rewriting its transactional implementation; authenticated read-only historical merge relationship RPC. Other normal Items permissions remain unchanged.

Earlier migrations remain unchanged. These local additions have not been applied remotely. Apply migration and matching app code together during the future approved release: an old frontend/dispatcher cannot call the revoked finalizers/tokenless completion APIs.

## Trusted media boundary

Documents and receipt intake read the reserved private object under the authenticated user's RLS, compare size and SHA-256, decode/validate content, and only then invoke service-only finalization from a `use server` module. Normal attached receipts validate the exact bytes before uploading; an ambiguous existing-object response is reconciled by hash. Service credentials stay behind the existing server-only Supabase Admin module. No new secret/environment variable is introduced.

Database metadata alone is not a content validator. Privileged server code is the trust boundary; ordinary authenticated users cannot supply a forged actor to finalize. PDFs retain the existing signature/end-marker validation; this is not antivirus or a full PDF safety scanner.

## Receipt processing before / after

Before: attached receipts were canvas JPEG-encoded and then Sharp JPEG-encoded again; Fuel/Store retained up to 20 MiB original camera files.

After: every supported receipt UI calls `processReceiptImage` before networking. JPEG/PNG/WebP inputs up to 20 MiB / 40 million pixels are decoded with camera orientation, drawn on white, fit within 2400 x 4000 without enlargement and encoded as JPEG. Try quality .85, then .78; if necessary scale .85 at .78 and .70 at .75. Every attempt starts from the original decoded bitmap, not the previous JPEG. Aim <=1.5 MiB, hard ceiling 3 MiB. No new library.

The trusted server separately fully decodes the processed JPEG, checks dimensions/format/size and validates without a second JPEG encode. Normal and new Fuel/Store stored bytes are the optimized image. New intake uses the existing processed-image reservation path and `original_preserved=false`; legacy originals remain unchanged and their pending finalization remains validated. HEIC/HEIF is not accepted directly: camera/browser conversion to JPEG may work, but actual iPhone/Android capture needs device verification.

Synthetic browser fixture (4000 x 6000 plain image): 84,587-byte PNG -> 51,383-byte JPEG at 2400 x 3600 in Chromium. A synthetic text receipt through equivalent Sharp geometry: 1,019,467-byte PNG -> 471,881-byte JPEG. These are fixtures, not representative measured camera receipts or proof of field legibility. Adaptive oversized-output behavior also has a controlled unit test.

## Slow and ambiguous uploads

Receipt and Document forms show a non-destructive message after 14 seconds. It does not abort, mark failure, replace request IDs or automatically retry. Fields remain preserved and submission controls disabled while pending. Intake shows Uploading / Checking stages. Browser offline behavior and no-offline-write-queue policy remain unchanged.

Receipt uploads coalesce accepted objects in memory. A failed Storage response still proceeds to trusted finalization/reconciliation; a retry reconciles the same existing request first. Non-overwriting Storage paths and hash checks remain authoritative. Documents also reconcile after an ambiguous upload response. Selecting a new receipt image creates a new request; correcting a definitively invalid new Document starts a fresh draft/file identity. No immutable file is overwritten.

## Pending upload cleanup decision

Deferred, explicitly post-release debt. A correct cleanup requires a coordinated lease/tombstone around reservations and Storage API deletion, with finalization rechecking cancellation. Blind age-based metadata deletion or deleting `storage.objects` directly would risk legitimate slow uploads or orphan physical files. Proposed threshold: pending for at least seven days, dry-run report first, delete only reservation-owned unfinalized paths, recheck under lock, and never target READY/current/historical finalized files. No cleanup scheduler or deletion is introduced here. Abandoned pending reservations/objects still consume storage until that work is completed.

## Thumbnails

Retain authorization on every private thumbnail request and no-store responses. Local 15-sample synthetic text-receipt Sharp benchmark: original thumbnail median 140.1 ms (127.8–184.3), optimized median 13.4 ms (11.3–14.8). This excludes Supabase/network latency. No derivative/cache complexity is added; repeated network downloads remain a limitation, especially for legacy full originals.

## Push delivery state

PENDING -> CLAIMED -> SENT / RETRYABLE / EXPIRED / EXHAUSTED. Unique occurrence/user/device keys remain. Claims use advisory transaction locks and per-attempt UUID tokens; a two-minute lease recovers an abandoned worker. Maximum five sends, with failure delays 1, 5, 15, 60 minutes. Exhaustion is terminal and visible in stored state. 404/410 removes only the matching user's invalid subscription after a valid current-token acknowledgement. SENT is never reclaimed. Eligibility is rechecked for active user, current task occurrence, assignment, completion/archive state and mobile PWA subscription. Maintenance retries recheck current due rules with America/Belize semantics. Snooze still produces its own reminder occurrence.

This is bounded at-least-once behavior: a provider may accept a notification before its response is lost, so retry can duplicate it. Stable notification tags mitigate visible stacking but cannot guarantee exactly-once device delivery. Successful acceptance does not prove OS display.

## Merge confirmation and historical references

Shows Source -> Surviving item, target category/unit, per-location resulting quantities, minimum/target consequences, an explicit warning when target has no minimum, and the inactive-source/no ordinary Undo notice. Preview uses location-specific sums at database stock precision. Stock remains freshly calculated by the unchanged transaction when confirmed; concurrent changes can make the earlier preview stale. Task/Maintenance history is not rewritten; linked tasks show Previous item X / merged into Y and link to an active survivor (plain text if archived). A linked-task detail performs one small relationship RPC; item editing loads balances in parallel with its catalogue. No Home/location blocking calls are introduced.

## Verification and remaining boundaries

Pre-commit development checks passed 546 tests and 12 receipt browser checks; these are not the final candidate results. The final lint, typecheck, production build, full unit/migration/RLS, full browser and compatibility suites are run AFTER the release commit; their exact counts and SHA are reported separately. Test fixtures/mock credentials are non-production values. Artifacts, benchmarks, media captures, environment secrets, generated service-worker output and QA build folders are excluded from Git.

Physical iPhone/Android checks remain: actual camera orientation/receipt readability including faint thermal text and long receipts; HEIC conversion; interrupted mobile uploads; reopen/session behavior; background push, sleep/battery restrictions, multiple real devices, notification click and ambiguous-provider duplicate behavior. Automated WebKit/Chromium tests are emulation only. Real Supabase/Vercel rollout verification is pending approval; no production delivery is claimed.
