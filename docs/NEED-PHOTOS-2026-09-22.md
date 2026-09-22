> Release update: included in the combined 22 September 2026 production release. See RELEASE-2026-09-22.md for final combined verification; earlier local-only status/counts below are historical.

# Need photos — local implementation, not deployed

Need creation/editing now shares `MediaPicker` with Receipts, Documents and Task Updates (also used by Maintenance Updates). Take photo, choose image/file, local preview, replace and remove selected media use the same component. Labels are EN/ES. Documents alone accepts PDF. Device camera behavior still needs real iOS/Android testing.

`image-processing-client.ts` owns decoding, EXIF orientation, resize, adaptive JPEG output and metadata stripping. Need sources allow JPEG/PNG/WebP up to 30 MiB, with a 3 MiB stored maximum, 3600×4800 bounding box and adaptive quality beginning at 0.9. Documents keep their 5 MiB image profile; receipts keep 3 MiB. Selected/processed File objects are memoized by profile so ordinary retries and component-to-uploader handoff do not encode again. PDFs stay unchanged and upload directly to Storage.

`need-upload.ts` saves audited Need metadata, reserves a photo, uploads optimized bytes directly to private Storage without overwrite, then calls `finishNeedPhoto`. No photo bytes pass through a Server Action request body. The server downloads authenticated bytes, verifies length/hash and decodes JPEG before invoking the privileged finalizer. There are no inventory writes.

## Pending migration order

1. `20260922000100_document_upload_limits.sql` (previous Documents work).
2. `20260922000200_need_photo_versions.sql` (this work).

The second adds `need_photos` and nullable `purchase_needs.current_photo_id`. A composite FK ensures the photo belongs to the exact Need. Existing no-photo Needs and legacy photos require no backfill. No files are rewritten. Versioned photo rows record uploader/server timestamps with immutable audit/history. Replacement switches the pointer only after validation; previous media remains immutable.

Authenticated callers can reserve but cannot finalize. The legacy finalizer is moved to private and revoked; new `complete_need_image` is executable only by service_role through the existing server admin client. No new secret/configuration is required. OWNER/MANAGER permissions and private Storage are retained; signed/public URL bypass is disallowed. Reads use the authenticated image route. The Need list shows an indicator rather than fetching media blobs.

## Retry/concurrency behavior

Need save and photo finalization are separate transactions. If upload fails, the Need still exists and the previous photo remains current. Request ID/hash/actor/Need/version bind the reservation; accepted uploads are not resent in the same browser session. Ambiguous upload responses are reconciled by trusted finalization. A repeated finalized request returns success without changing the current photo. Concurrent edits cause a stale-version error instead of publishing over newer work. The user can retry unchanged or reopen the entry after a conflict.

Pending failed reservations/objects are retained and linked to their Need/uploader; this feature introduces no destructive cleanup job. Old versions remain private for history. Removing a selection before save does not delete an existing finalized photo.

## Verification scope

Tests cover OWNER/MANAGER access, authenticated finalizer denial, real byte decoding and malformed bytes, immutable replacement, wrong-Need linkage, concurrent edits, storage operation restrictions, no stock writes, no-photo save, direct optimized upload and retry reconciliation. Browser fixtures exercise camera/file chooser, preview/replace/remove, EN/ES, large-source optimization and processed-byte reuse. Automated camera checks exercise browser file selection, not physical camera hardware. Production migration and upload testing await review/approval.

Final combined Documents/Need verification: lint PASS; typecheck PASS; production build PASS; 591 automated tests across 62 files PASS, including all migration/RLS suites; full browser suite 324 PASS and 2 expected skips (mobile access to desktop-only views); focused Chromium/WebKit upload compatibility 34/34 PASS. The settled full browser run took 4.9 minutes; compatibility took 58 seconds. Earlier failing legacy fake-image/input-state tests were updated to real JPEG fixtures and selected-file retention checks; the shared picker now exposes only one accessible Choose action. No production migration, deployment, account or business-data change was made.
