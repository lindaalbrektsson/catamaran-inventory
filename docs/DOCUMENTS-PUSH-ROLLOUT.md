> Historical implementation snapshot. See [combined release audit](COMBINED-RELEASE-2026-09-16.md) for the later applied migrations and release checks.

> Pending local change (not deployed): Documents will accept 30 MiB source images/PDFs, optimize images to JPEG <=5 MiB and preserve PDF bytes. See [Document upload review](DOCUMENT-UPLOAD-2026-09-22.md) and migration `20260922000100_document_upload_limits.sql`. The original 20 MB behavior below describes the deployed baseline.

> Current local scope: mobile installed-PWA push only. Migrations 008 (mobile push/Snooze) and 009 (Maintenance planning) also remain pending. See MAINTENANCE-MOBILE-REMINDERS.md. Production Cron remains paused; infrastructure notes below describe the earlier configuration snapshot.

# Documents, install guide and Web Push



Local implementation only. Application migrations have not been applied to production. Infrastructure preparation is tracked separately below.



## Documents and install guide



OWNER and MANAGER can upload images/PDFs. Camera and file controls preserve originals and use authenticated direct Storage upload plus existing server-side hash, byte-size and content validation. JPEG, PNG, WebP and PDF up to 20 MB are supported. HEIC needs conversion/export to JPEG.



Manager uploads default to Owners + Managers. Access administration, favorites, archive and replacement remain Owner-only. Pending files are accessible only to their uploader and Owners. Signed URL minting, public reads, overwrites and deletion remain blocked by restrictive Storage policies.



Migration: `20260916000500_manager_document_upload.sql`.



The translated installation guide is public at `/install`. It has been removed from More; the existing login guide remains.



## Notification behavior



Opt in explicitly at More → Notifications. Settings apply to this device/browser. iOS/iPadOS requires 16.4+ and an installed Home Screen app. Normal iOS browser tabs cannot be promised background push.



Active, fully provisioned Owners and Managers can create reminders for any active, fully provisioned Owner/Manager. Managers can still read/edit/archive only reminders addressed to themselves; assigning a reminder does not grant private access. Owners retain read access and can edit/archive reminders they created or receive. Only the recipient can Snooze. Deletion archives the task and preserves audit/history. Reminder-bearing tasks stay private for Managers even if the reminder time is later removed. Ordinary tasks retain their existing shared behavior. Unassigned tasks notify their creator. Only reminder timestamps at or after device opt-in are eligible; old overdue reminders are not replayed. Done/archived tasks, inactive users and accounts pending credential setup/password change are excluded. Database time determines when a reminder is due. See `STOCK-REMINDER-WORKFLOWS.md` for the current assignment UI and migration; earlier verification sections below describe their historical release.



Payloads contain the requested reminder title and task UUID route; they never include descriptions, staff identities or other business fields. Settings explain that titles can appear on the lock screen; put confidential details in the description. Opening the destination still requires authentication and existing authorization. Clicks open a new app page instead of navigating an unfinished form. Notifications may remain enabled while signed out; use Off on shared devices. Deactivating an account stops scheduled notifications.



Subscriptions are private and tied to the authenticated UUID. Another account cannot steal/rebind an endpoint; explicit opt-in unsubscribes/re-subscribes when the browser belongs to a different account. Endpoints and subscription keys are never logged/audited. Up to ten devices per account; test sends limited to once per minute per device. Only approved browser push-service HTTPS hosts are accepted to prevent arbitrary outbound requests.



A unique task + reminder timestamp + user + endpoint record deduplicates successful provider acceptance. The release-candidate migration `20260917000300_push_delivery_recovery.sql` replaces terminal claims with two-minute leases and per-attempt tokens. Temporary/ambiguous failures retry after 1, 5, 15 and 60 minutes, with five total attempts; abandoned leases recover. Confirmed SENT records are never reclaimed. HTTP 404/410 removes the matching user's expired subscription. A late old attempt cannot acknowledge a new lease. Ambiguous provider acceptance followed by a lost response can produce a bounded duplicate; this is at-least-once retry, not exactly-once delivery. OS delivery, sound and timing are not guaranteed. Push TTL is one hour; in-app reminders remain available. Apply the new migration and matching dispatcher together during the future approved rollout: old tokenless completion RPCs are intentionally revoked.



Migrations: `20260916000600_web_push_reminders.sql`, then `20260916000700_reminder_assignment.sql`. The latter adds sticky reminder privacy, active supported-role assignment, guarded reminder editing/archive, an authorized delivery-status RPC and title-only push text. Existing reminder-bearing task rows get the privacy flag (audited); no records/users are removed.



## Activation after review



1. Apply all three migrations in filename order. They do not schedule jobs, send notifications or modify inventory.

2. Generate a VAPID key pair securely using web-push. Keep it in a password manager, never in chat or Git. Keep the same pair across releases; rotation requires re-subscription.

3. Set Vercel Production server variables `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (production HTTPS site URI or real support mailto URI), and random `PUSH_CRON_SECRET`. Reuse existing server-only `SUPABASE_AUTH_ADMIN_KEY`. Only the VAPID public key is serialized into the settings UI.

4. Deploy, explicitly opt in on a test device and send a test notification.

5. Enable Supabase pg_cron, pg_net and Vault. Add Vault secret `catamaran_push_cron_secret` with the same value as Vercel PUSH_CRON_SECRET through private dashboard input.

6. Before deployment, `supabase/operations/prepare-push-schedule.sql` can create the named job paused in one transaction. After successful deployment and explicit test, review/run `supabase/operations/enable-push-schedule.sql`. It schedules one authenticated POST per minute to the Vercel dispatcher. Re-running replaces the same named schedule. No secret literal is stored in that file.

7. Inspect Cron/pg_net responses and private.push_deliveries outcomes. The endpoint returns counts only. A 503 requires investigation. Missing configuration fails before claiming tasks. Batches are bounded to at most 20 deliveries per invocation; larger backlogs drain on later ticks.

8. Pause with `select cron.unschedule('catamaran-reminder-push');` without deleting subscriptions/history.



Supabase Cron fits the existing architecture. Vercel Hobby cron supports only daily scheduling, so no Vercel cron entry is added. Normal Supabase/Vercel quotas and resource usage apply. Preview should use an isolated project and no production scheduler.



References: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Apple Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).



## Real-device checklist (not yet verified)



Use one iPhone and one Android after activation; record OS/browser versions and results.



1. Follow `/install`, launch the installed app and log in. Close/reopen: session should persist.

2. Documents → Upload → take photo → title → save. Repeat gallery image; on desktop upload PDF. Confirm permitted access and uploader/timestamp. Unsupported or oversized files must fail without publishing invalid content.

3. More has Notifications and no install guide. Opening settings must not prompt automatically. Tap Enable notifications and allow: permission becomes Allowed. Deny on another device: blocked status and recovery instructions.

4. Send test: a generic system notification appears.

5. Set an authorized real test task reminder a few minutes ahead for the account, then close the PWA. Expect one notification after due time and the next scheduler tick. Do not invent production records without authorization.

6. Tap notification: the correct task opens, requiring login if signed out. Another page's unfinished form must not be navigated away.

7. Invoke the scheduler twice for the same occurrence: one notification per device. A later reminder timestamp creates a new occurrence.

8. Complete/archive before due, or deactivate recipient: no notification. Unassigned task: creator only.

9. Turn Off: no further pushes to that device. Other opted-in devices remain enabled. Revoke browser permission/clear data: opt in again; expired endpoints should be removed on 404/410.

10. Save work and update PWA: session persists and the new worker handles push. Test iOS Home Screen background, Android installed/browser background and desktop Chrome/Edge.



Automated checks use emulated viewports, a simulated PushManager and simulated worker events. They do not establish real Apple/Google push delivery or physical camera behavior.



Earlier batch results (before reminder-assignment changes): lint/typecheck/build passed; 399 automated tests passed; 176 browser checks passed with two expected skips (the staff-auth suite was rerun after fixing a test locator). Forty-seven compiled client JavaScript files contained no private push, scheduler or Supabase admin key references.



## Reminder-specific verification



Automated database checks cover Manager self-only creation/edit/archive; cross-user reads, subtasks/history/status and RPC mutation denial; sticky privacy after clearing the date; Owner assignment to self, another Owner and Manager; inactive/unsupported-recipient rejection; one claim per occurrence/device; two devices; delivery status privacy and immutable audit. Browser fixtures cover Owner assignment and Manager self-only controls, explicit opt-in and denied permission. These are not real-device delivery tests.



After activation, test an Owner assigning a near-future reminder to a Manager and to another Owner. Close the recipient PWA on iOS and Android. Confirm one system notification per subscribed device, correct title, correct task on tap, and no notification to the assigning Owner unless also the recipient. Edit the reminder to a new future time to test a second occurrence; repeat scheduler calls must not repeat the previous occurrence. Confirm Manager cannot open another reminder URL and delete only archives their own reminder.



## Production preparation status — 2026-09-16



- Confirmed Vercel project `catamaran-inventory` and linked Supabase project `shxbhjpjbaknwukqqqoh`.

- Generated a valid matching VAPID pair. Configured Production `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `PUSH_CRON_SECRET`; private key and cron bearer are Vercel Secrets. No `NEXT_PUBLIC_*` private material. Existing server Admin credential reused.

- Recovery material is encrypted with Windows user DPAPI at `%LOCALAPPDATA%/CatamaranBelize/push-production.dpapi`, outside Git and OneDrive. It can only be decrypted in the appropriate Windows user context; maintain a separate secure recovery strategy before changing that Windows account/device. Values were not printed in chat or logs.

- Created Vault secret `catamaran_push_cron_secret`; verified its value matches the locally generated/configured cron bearer without displaying it.

- Enabled `pg_cron` and `pg_net` alongside existing Vault. Created `catamaran-reminder-push` with a one-minute schedule, **active=false**, zero runs. It has not called the app or sent any notifications.

- Migration dry run lists exactly `20260916000500_manager_document_upload.sql`, `20260916000600_web_push_reminders.sql`, `20260916000700_reminder_assignment.sql`, in that order. All remain unapplied. The third file implements the subsequent reminder-assignment request.

- No existing production users, phone identities, inventory or business records were changed. No app deployment performed.

- Local dispatcher tests reject missing/wrong bearer with 401 before database access. Current production still serves the previous deployment; POST to the future dispatcher path returns an HTML not-found page (HTTP 200), not the new API. After deployment, verify HTTP 401 for missing/wrong auth and authenticated dispatch before activating cron.

- No manual secret entry remains. Remaining ordered actions: apply reviewed migrations, deploy, verify dispatcher authorization, explicitly enable device notifications/send test, then run `enable-push-schedule.sql`. Real-device delivery is unverified.



Latest checks: 409 automated tests passed; 180 browser checks passed, two expected skips. Browser tests use Chromium desktop/mobile emulation and simulated push APIs, not physical iPhone/Android push delivery.
