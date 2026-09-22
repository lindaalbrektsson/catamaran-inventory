> Release update: included in the combined 22 September 2026 production release. See RELEASE-2026-09-22.md for final combined verification; earlier local-only status/counts below are historical.

# Documents / Receipts shared mobile upload — 22 September 2026

Status: local implementation only; awaiting review. No production deployment or migration applied.

The later combined Need-photo/shared-picker verification supersedes the Documents-only counts below: lint/typecheck/build PASS, 591 automated tests PASS, full browser 324 PASS / 2 expected skips, Chromium/WebKit upload compatibility 34/34 PASS. See [Need photo implementation report](NEED-PHOTOS-2026-09-22.md).

## Limits and formats

| Layer | Before | Proposed |
|---|---|---|
| Document source image / PDF | 20 MiB | 30 MiB (31,457,280 bytes) |
| Document browser image upload | Original bytes | Optimized JPEG, at most 5 MiB |
| Document database / bucket / server validator | 20 MiB | 30 MiB general file limit |
| Receipt source | 20 MiB | Unchanged |
| Receipt image upload | 3 MiB maximum, 1.5 MiB preferred | Unchanged |

Inputs are JPEG, PNG, WebP and PDF only. No Word, DOC/DOCX, HEIC, SVG or external conversion service. Existing document records/files remain valid and untouched. The general server limit remains 30 MiB for legacy image compatibility; 5 MiB is the optimized browser output ceiling, not a retroactive constraint on existing images.

## Shared pipeline

`src/lib/image-processing-client.ts` contains receipt/document profiles. The receipt wrapper retains the existing error contract and receipt processing thresholds. Documents decode locally once, initially target 3600 x 4800 bounds at JPEG quality 0.90, then adapt quality and scale only if above 5 MiB. Every attempt draws from the original decoded bitmap, not a previous JPEG. Canvas produces a white-backed JPEG without EXIF metadata. Bitmap resources close on success/failure. Receipts keep 2400 x 4000 bounds and their prior adaptive qualities.

JPEG uses browser orientation. PNG/WebP EXIF is read with bounded TIFF offsets; the PNG chunk is removed or WebP chunk neutralized before decode and the orientation transform is applied explicitly exactly once. Chromium ignored WebP orientation and WebKit ignored PNG orientation in testing, so both formats now use deterministic handling. The output has no EXIF. Document decoded sources retain a safety cap of 64 megapixels (supports 48 MP phone photos); receipt cap remains 40 MP. Oversized or unprocessable inputs fail rather than uploading invalid data.

The existing Document form has Take photo and Choose file, with camera capture on the image-only input and image/PDF acceptance on the normal picker. English/Spanish compact 30 MB copy is displayed. Native camera availability depends on device/browser and is not simulated certification.

## Reliability and security

Processed Document files are memoized per selected File with weak keys so ambiguous retries keep identical hashes/bytes without recompression. Existing stable request IDs, uploadOnce, non-overwriting Storage upload, finish reconciliation and slow-operation notice remain. Only metadata crosses Server Actions; PDF bytes go unchanged directly to private Supabase Storage. The trusted server downloads, checks length/SHA-256 and validates actual bytes before its service-only finalizer. Direct authenticated finalization remains denied. No new public Storage access, grants or RLS changes.

PDF validation is the existing header/end-marker validation; it is preserved, not replaced with a new parser, rendering service or malware scanner. Tests cover malformed/disguised content failing those checks. No claim of comprehensive PDF sanitization is made.

## Pending migration

`20260922000100_document_upload_limits.sql` widens the document_files byte constraint and the latest save_document reservation function to 31,457,280 bytes; updates only the documents bucket file-size limit and its existing four-type MIME allowlist. No finalizer definition/grant, receipt limit, RLS policy, existing file or record is changed. Apply through the existing Supabase migration workflow only after approval.

## Performance

Photos transmit optimized bytes instead of up to 30 MiB originals. A 25 MiB generated browser-test photo optimized below 5 MiB. PDFs do not gain a Vercel request-body bottleneck; server final validation still downloads the file from private Storage. No new dependencies, navigation queries, external APIs or eager media downloads. Processing consumes bounded local decode/canvas memory; physical iPhone/Android readability, camera and memory behavior still need manual checks.

## Verification

Final counts are recorded in the delivery report. Coverage includes real browser JPEG/PNG/WebP decoding and orientation, EXIF stripping, 25 MiB source processing, adaptive retry simulation with a 48 MP source, camera/picker controls, 30 MiB exact PDF boundary, malformed bytes, Owner/Manager reservations, direct-finalizer denial, supported server finalization and ambiguous upload retries. No production business data is used or modified.

Final verification: lint PASS; typecheck PASS; production build PASS (isolated output after an initial OneDrive EBUSY lock; no config change retained); 573 automated tests in 60 files PASS, including migration/role/finalizer/security and retry tests; full browser suite 316 PASS, 2 expected mobile skips for desktop-only receipt-review/owner-overview cases (4.4 minutes); focused Chromium/WebKit image/camera/picker compatibility 12/12 PASS. Existing non-blocking Node module-type warning remains. No deployment or production migration was performed. Real physical iPhone/Android camera, text readability and memory behavior still need manual QA.
