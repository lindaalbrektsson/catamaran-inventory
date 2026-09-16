> Historical implementation snapshot. See [combined release audit](COMBINED-RELEASE-2026-09-16.md) for the later applied migrations and release checks.

# Task and Maintenance voice notes — local implementation

Not deployed. No production migration, data change, secret change or scheduler activation was performed.

## Migration and historical compatibility

New additive migration: `20260916001000_task_voice_updates.sql`, after pending migrations 005–009.

`public.task_updates` contains a generated update UUID, stable task UUID, optional Maintenance occurrence UUID, optional text, photo/voice metadata, publication state, authenticated creator UUID and immutable database timestamp. Metadata holds MIME type, byte size, SHA-256 and audio duration. Paths are derived from the generated UUID, never the submitted filename. An update requires at least text, photo or voice; all combinations are supported.

The preexisting `maintenance_updates` and `maintenance-photos` records, files and audit history are unchanged and remain visible. New ordinary Task and Maintenance updates share the new model rather than maintaining two audio implementations. Maintenance completion rules are unchanged.

## Storage and publication

- Private bucket `task-update-files`.
- Object paths `<update-uuid>/voice` and `<update-uuid>/photo`.
- Photos remain JPEG/PNG/WebP up to 20 MB. Audio is limited to 5 MB and 180 seconds.
- Metadata is reserved through an authenticated RPC; bytes upload directly to authenticated Storage, avoiding the Server Action body-size limit. No client admin credentials.
- The server downloads original bytes, checks size/hash and validates photos or probes audio. All attachments must pass before the whole update becomes published. Failed reservations remain unpublished and are retryable with the same ID. Editing a draft starts a new ID; abandoned reservations are retained, not silently deleted.
- Audio probing uses platform-specific `@ffprobe-installer/ffprobe`, server-only, with a ten-second timeout, bounded output, restricted input formats/protocols and temporary-file cleanup. It checks actual container, codec, audio-only stream, channels and packet timestamps; it does not trust the client duration. No transcription, transcoding, external processing or paid API.
- Published duration replaces the initial client estimate in an audited transition. Ready updates, author, relationship and timestamp cannot be edited/deleted by normal users.

## Recording and playback

Task → Add update → Record voice note → Start recording. Microphone permission is requested only on Start. Recording state and elapsed time are visible, with Stop recording. The timer stops slightly before three minutes to leave room for encoder finalization; the server strictly rejects more than 180 seconds. A size overrun is rejected. Stop never saves automatically.

Preview supports native play/pause/seek. Delete recording and Record again affect only the unsaved draft. Text is optional. Save stays disabled while requesting/recording. Failed saves retain the draft. Navigating away warns while a draft exists; recording also marks the form dirty for the existing PWA-update confirmation. Hiding the page stops recording and releases the microphone. Unmount releases tracks, timers and object URLs.

Saved players stream through `/task-update-file/<id>/voice`, rechecking authenticated RLS and private Storage on every request. Byte-range responses support seeking, with inline disposition and private/no-store caching. There is no public or signed permanent file URL. Playback failure has translated feedback.

The app Permissions-Policy now allows `microphone=(self)`; it does not grant permission itself or permit other origins to use the microphone.

## Formats and compatibility

Runtime `MediaRecorder.isTypeSupported` chooses MP4/AAC first (explicit codec, then Safari's MP4 default), WebM/Opus next, Ogg/Opus last. The recorder's actual MIME container is retained, normalized without codec parameters; the server verifies the allowed codec. Original bytes are preserved. Unsupported browsers receive a clear message.

Sources inspected:
- [MediaRecorder MIME feature detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
- [WebKit MediaRecorder MP4/AAC support](https://webkit.org/blog/11353/mediarecorder-api/)
- [Safari 18.4 adds WebM recording and Ogg support](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)

Older iOS versions may record MP4 but fail to play WebM/Ogg from another device. Prefer current Safari/Chrome; no claim of universal or physical-device compatibility. Automatic transcoding is intentionally absent. Microphone use requires HTTPS (localhost is permitted for development). OS interruptions and background behavior require physical-device checks.

## Permissions and audit

OWNER/MANAGER can append where existing Task permissions allow it. Private reminder recipient/creator restrictions are preserved; merely hiding controls is not the enforcement. Archived/Done tasks and completed Maintenance occurrences reject new updates. Manual assignees are not upload identities.

Table RLS, RPC validation and restrictive Storage policies enforce access. Only the uploader can upload a pending object, no overwrite/delete is allowed, and sign/public operations are excluded. Other users cannot read an unpublished update. Secure server-only publication records the validated actor. Insert/publication events retain before/after metadata in existing immutable audit events. Foreign keys preserve user and task history, including the existing safe-user-deletion reference checks.

## Files introduced or changed for this request

- Migration `20260916001000_task_voice_updates.sql`.
- `src/components/voice-recorder.tsx`, `task-update-form.tsx`, `task-update-history.tsx`; Maintenance form wrapper and both Task detail routes.
- `src/lib/voice-domain.ts`, `voice-validation.ts`, `task-update-actions.ts`, `task-update-upload.ts`, database types and EN/ES translations.
- `src/app/task-update-file/[id]/[kind]/route.ts`.
- `next.config.ts`: same-origin microphone and server binary tracing; package manifests: platform audio probe dependency.
- Five unit/integration test files, `tests/e2e/voice.spec.ts`, isolated browser adapters and synthetic audio fixtures. Existing Maintenance photo browser checks remain.

## Verification and remaining rollout checks

Local lint, typecheck and production build passed. Full Vitest: **465 tests passed across 47 files**. Focused Maintenance/voice browser checks: **26 passed**. Full Playwright regression: **208 passed, 2 intentionally skipped** (desktop-only checks in the mobile project). Lint is clean and `git diff --check` passed.

Tests cover Owner/Manager, voice-only, photo-only, combinations, permission denial, record/stop, no automatic save, preview, deletion/re-recording, persistence in an isolated reload fixture, invalid MIME, oversize, real encoded duration overrun, immutable history, private reminder isolation, anonymous rejection, byte ranges and existing photos. Audio fixtures are synthetic tones, not staff recordings. Browser microphone permission is simulated with a generated MediaStream; production database/storage are not used by these tests.

Real devices still required: one iPhone Home Screen PWA and one Android installed PWA. Record, deny/re-enable permission, stop, preview, re-record and save a real authorized update. Close/reopen and play it. Play each device's recording on the other device. Test seek/pause, an interruption/lock, three-minute cutoff, photo+voice, offline retry and access with another account. Confirm app update warns for an unsaved voice draft. Also verify the Linux ffprobe binary on the eventual Vercel deployment; local build tracing includes the installed Windows binary, while Vercel installs its Linux platform package.
