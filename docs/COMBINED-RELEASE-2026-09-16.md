# Combined release audit — 2026-09-16

This records the completed pre-deployment audit. The deployment SHA/URL and live smoke results are reported in the release handoff.

## Scope confirmed

- Owner/Manager Documents uploads: mobile camera/image, desktop image/PDF; existing private access administration preserved.
- More has no installation guide; public direct `/install` remains.
- Push controls and qualification restricted to installed mobile PWAs; desktop no permission request or subscriptions. Reminder recipient permissions are enforced in SQL/RPC. Snooze Tomorrow offers a remembered per-user/device time, 09:00 initially; scheduling uses America/Belize. Delivery claims prevent duplicate attempts per occurrence/device.
- New staff creation has only display name, username, supported role and manual temporary password. No phone field/verification/phone Auth creation; existing legacy phone identities untouched.
- Maintenance is under Tasks: Today/Pending/Recurring, explicit work planning, Add shortcut, UUID/manual assignees, Pending/In progress/Ready/Done, immutable updates/photos/remaining summary. Daily/weekly/monthly/custom recurrence with optional Belize time advances only on Done.
- Shared Task/Maintenance updates support optional text, photo and voice combinations; explicit recording and saving, preview/re-record/playback, private files, server-probed audio duration/type and limits of 180 seconds/5 MB. No WhatsApp, transcription or paid AI integration.

## Production targets and migration evidence

Vercel `catamaran-inventory` (`prj_BBSAHPFRaLb9gApMza8AtbpRQBnI`); Supabase `shxbhjpjbaknwukqqqoh`.

Applied successfully, in order:
1. `20260916000500_manager_document_upload.sql`
2. `20260916000600_web_push_reminders.sql`
3. `20260916000700_reminder_assignment.sql`
4. `20260916000800_mobile_push_snooze.sql`
5. `20260916000900_maintenance_planning.sql`
6. `20260916001000_task_voice_updates.sql`

Post-migration dry run: up to date, no pending migrations/seeds/roles. New tables have RLS; protected publisher/dispatcher RPCs deny ordinary authenticated callers. `documents`, `maintenance-photos`, `task-update-files` are private with required policies/MIME lists. Audio-specific metadata/policies and server validation enforce 5 MB inside the shared 20 MB photo-capable bucket. Push tables are private and not client-readable.

Checksums confirmed Auth identity fields, profiles, inventory transactions and balances unchanged. Active locations remain Bodega and Cas Cat. No operational test records created.

## Infrastructure

Production Vercel public Supabase configuration targets the project above. WEB_PUSH_PUBLIC_KEY/PRIVATE_KEY/SUBJECT and PUSH_CRON_SECRET are configured server variables; no private NEXT_PUBLIC variables. VAPID pair validated, Vault `catamaran_push_cron_secret` matches the scheduler bearer. Cron `catamaran-reminder-push` is staged every minute and held paused until successful live dispatcher authorization checks. No device subscriptions existed at the pre-deployment check. Production authenticated dispatcher and Cron activation must be verified after deployment; physical delivery remains unverified.

## Quality checks on the entire release

Lint, typecheck, production build: passed. Vitest: 465 tests / 47 files passed. Playwright: 208 passed; 2 intentional skips for desktop-only screens in the mobile project. `git diff --check` passed. No private push/admin/audio-probe code in client bundles. Native ffprobe is explicitly traced server-side; Vercel Linux build must complete successfully.

Non-blocking tooling warnings: Node module-type autodetection in PWA generation and FORCE_COLOR/NO_COLOR in Playwright.

## Real-device checklist after deployment

On one physical iPhone Home Screen PWA and one installed Android PWA:
1. Sign in by username; reopen and confirm session persistence.
2. Opt in explicitly; send a test notification; test an authorized due reminder while closed, exactly once per device, then tap through.
3. Test Tomorrow with a nondefault Belize time and verify the remembered choice. Confirm Manager self-only and Owner assignment behavior.
4. Test grouped due Maintenance notifications, explicit Today selection and Done-only recurrence advancement with approved real work.
5. Record microphone audio, deny/re-enable permission, preview, re-record, explicitly save and reopen. Play iPhone audio on Android and vice versa; test seek/pause, interruption and maximum duration.
6. Test photo+voice and Documents camera/image/PDF using authorized content; verify restricted users cannot read private attachments.
7. Confirm an update does not discard an unfinished voice/text draft and desktop has no push controls.

Emulation and generated synthetic audio do not verify physical microphone, OS background delivery or cross-device codec compatibility. Older Safari can have WebM/Ogg limitations; no automatic transcoding is introduced.
