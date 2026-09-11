# Documents

Documents remain files; they never change inventory or become interactive checklists automatically. Favorites on Home open the current file directly. See all opens the permitted document list with search, category, Favorites and Archived filters. Uploaded examples are not seeded.

Owners administer documents on desktop. Other active staff can view/download documents shared with their role or stable user UUID. V1 uploads are Owner-only. The category is optional free text with suggestions from existing documents. No predefined document categories or staff names are required.

Supported originals: PDF, JPEG, PNG and WebP, up to 20 MB. SVG, HTML, executables and office macros are not supported. Image decoding and MIME/size/hash checks run before the application completes an upload. PDFs must have a PDF header and end marker; this is format validation, not antivirus scanning. Files are served with a fixed permitted MIME type, nosniff, sandbox CSP and private/no-store headers.

## Permissions and history

The private `documents` bucket is protected by document-specific RLS and restrictive Storage policies. Only authenticated object downloads and reserved Owner uploads are allowed. Signed URL generation, listing, object overwrite and object deletion are not granted. File routes authenticate and use the caller's token; they never use a service-role key, redirect to signed URLs or cache private bytes. Storage independently checks permissions on each download. Operation-aware Storage helpers must be available; the policies fail closed otherwise.

Owners can share with Owners, Owners + Managers, all active staff, or selected users + Owners. Archived documents disappear from active/favorite lists but remain available in Archived to users who retain permission. Archive is not access revocation. Earlier file versions are Owner-only, even when the current file is shared. Files already downloaded to a device are copies, as with any document download.

All metadata and file-version writes use audited RPCs. Actor and timestamps are server-owned. Original upload identity/time, prior versions, before/after metadata and access changes remain preserved. Optimistic versions prevent silent lost edits, and request UUIDs allow retries after network failures. Completing a replacement refuses a stale metadata version. An upload failure may leave saved metadata and an Owner-only pending version; the previous published file remains available. Retry with the same file, or upload a new replacement. Normal UI never deletes history or old bytes.

## Expiry and future work

Owner views show expired, expiring today and expiring within 30 days using Belize calendar dates. The indexed expiry date and stable document UUID are suitable for future Task links/reminders; no automatic task creation or notification service is enabled.

The existing Cas Cat pre-tour checklist can be uploaded as a document, marked Favorite and shared with the relevant staff. No copy was found among the available project files, so its contents have not been invented or imported.

## Rollout

Apply `20260911001100_documents.sql` before deploying the UI. It adds document metadata, immutable file versions, a private Storage bucket and audited RPCs. It seeds no documents or files and has no dependency on pending account-administration migrations. Check that `storage.allow_only_operation(text)` exists before applying it.

Security reference: [Supabase operation-aware Storage policies](https://supabase.com/docs/guides/storage/schema/helper-functions).
