> Historical implementation snapshot. See [combined release audit](COMBINED-RELEASE-2026-09-16.md) for the later applied migrations and release checks.

# Maintenance and mobile reminders — local review

Not deployed. Production Cron remains paused; the existing configured VAPID/Vault material is unchanged. No production users, phone identities, stock, receipts or business history were modified.

## Pending migration order

1. `20260916000500_manager_document_upload.sql`
2. `20260916000600_web_push_reminders.sql`
3. `20260916000700_reminder_assignment.sql`
4. `20260916000800_mobile_push_snooze.sql` — mobile subscription qualification, desktop exclusion, audited recipient-only Snooze.
5. `20260916000900_maintenance_planning.sql` — maintenance rules, occurrences, immutable updates, private photos, calendar schedules and grouped mobile dispatch.

All remain local/unapplied. Apply in order before a deployment that uses the new tables/RPCs. The last two migrations extend the already reviewed rollout; do not activate the paused scheduler against the old app.

## Data model and Tasks integration

- `public.tasks`: existing stable UUID/title/creator and task audit architecture; type MAINTENANCE. Templates are not regenerated every day. Ordinary private reminders remain ordinary Tasks.
- `maintenance_rules`: one row per task, recurrence NONE/DAILY/WEEKLY/MONTHLY/CUSTOM, custom day interval, weekday/month-day, optional Belize local time, last completion and next due date.
- `maintenance_occurrences`: only explicitly selected work. Plan date, Pending/In progress/Ready/Done, authenticated assignee UUID OR manual name, current remaining-work summary, version, server creation/update/completion metadata. One open occurrence per template; completed occurrences are immutable.
- `maintenance_updates`: append-only text and optional private original photo, authenticated author UUID and database timestamp. A manual worker's name never supplies author identity or permissions.
- Existing non-private Maintenance tasks receive a NONE rule without rewriting their task history. Their original description, subtasks and audit remain accessible. The general Tasks list excludes these templates to avoid displaying stale generic status alongside occurrence status; Tasks links to Maintenance.

No assets, locations, time estimates, durations or tracking fields were added. No example work or operational records were seeded.

## Work planning

Tasks → Maintenance has Today, Pending and Recurring. Add → Today / Work plan opens `/tasks/maintenance/plan` and makes no write until explicit selection/submission. The planner groups currently due/overdue recurring checks and unfinished one-time jobs. It never selects every due job automatically. Already planned work cannot produce another open occurrence. Unfinished work carries forward into Today, retaining its original plan date.

Each occurrence can select an active Owner/Manager by UUID or a manual name. A different person may handle the next cycle. Manual names create neither accounts nor subscriptions. Both supported roles can manage operational maintenance; authorization never uses names.

Ready means awaiting confirmation. Only Ready → Done completes the occurrence. Ready → In progress allows further work. An authenticated staff member performs the confirmation; no additional Owner-only approval rule was invented. What remains? changes are audited with before/after values; explicit updates preserve a chronological narrative and photos independently.

## Belize recurrence semantics

All calculations use `America/Belize` in PostgreSQL. Local dates/times are scheduling intent, converted to absolute instants when determining notification eligibility. Device timezone does not change the schedule.

- Daily: next calendar day after completion, retaining the configured time.
- Weekly: next selected weekday strictly after completion date. For Monday 08:00, finishing late on Wednesday schedules the next Monday 08:00.
- Monthly: next selected month-day strictly after completion date. Day 31 clamps to a shorter month's last day, then returns to day 31 when possible.
- Custom: 1–3650 days after completion date, retaining time.
- Start date is inclusive; the first weekly/monthly date is normalized to the selected weekday/month-day on or after it.
- In progress and Ready never move next due. No backlog of future rows is generated. Done stores completion and calculates the next cycle atomically.
- NONE closes the one-time task permanently on Done.
- Without an optional time, work becomes due on its date; grouped push eligibility defaults to 09:00 Belize. With a time, eligibility begins at that time.

Schedule settings are entered at creation in this first implementation. A separate template schedule-editing screen is not included; existing occurrences can be assigned, updated and completed. Completed occurrences cannot be reopened or rewritten.

## Mobile-only push and Snooze

Notification settings and Snooze render only for detected Android/iOS/iPadOS devices in installed standalone mode. Desktop (including desktop-installed PWAs) and ordinary browser tabs receive no controls or permission prompt. Device detection uses platform/touch capabilities plus standalone state; viewport width alone never qualifies a desktop.

Subscriptions start unqualified. The authenticated server checks mobile request context, then uses a service-only RPC to qualify the exact user/endpoint. Old desktop/unclassified subscriptions are excluded from both scheduled and test delivery. These are capability checks, not hardware attestation: a deliberately forged browser user agent cannot be cryptographically distinguished from a phone. UUID authorization, recipient restrictions and secret isolation remain independent of device detection.

Existing task reminders support Snooze 30m/1h/2h/4h/Tomorrow. Tomorrow opens a time picker before confirmation. Default is 09:00; the last submitted time is remembered per user on that device. Database time determines tomorrow's Belize date. Only the recipient may snooze; audit and version checks are preserved. Snooze is in the mobile view, not an unreliable background notification action. Tapping a notification opens the relevant task without navigating an existing unfinished form away.

Recurring checks share the same VAPID sender, subscriptions, dispatcher and paused Cron. Each opted-in active supported staff user/device can receive a grouped count of newly due checks, without task/person names. All currently due unsent checks are grouped; at most one maintenance group is claimed per scheduler minute/device. A check's next-due occurrence is never sent repeatedly. Manual names are never notification targets. Assignment-specific maintenance pushes are not implemented.

Claims precede network sends (at-most-once attempts). A crash/ambiguous failure can lose a notification rather than risk repeats. Delivery still depends on OS/browser policy. Expired endpoints are removed. Real iOS/Android delivery remains unverified.

## Photos and security

JPEG/PNG/WebP, up to 20 MB. Original bytes go directly to private `maintenance-photos` Storage; only metadata crosses Server Actions. Server completion downloads and verifies hash, size and decoded image before a service-only publication RPC. Authenticated Storage reads, no signed/public URLs, no overwrite/delete. Failed uploads remain unpublished and can retry using the same update ID. HEIC is unsupported; export/convert to JPEG. Pending failed reservations are preserved rather than silently deleted.

Authenticated OWNER/MANAGER access is enforced by RLS and security-definer RPCs. Inactive/unsupported users cannot read or mutate Maintenance. Normal app users cannot edit/delete update history or completed occurrences. Immutable timestamps, authenticated author and before/after audit values remain server-owned.

## Main changed files

- `src/components/maintenance.tsx`, `add-hub.tsx`, `reminder-snooze.tsx`, `mobile-pwa-only.tsx`, `notification-settings.tsx`.
- `src/app/(workspace)/tasks/maintenance/**`, Tasks/detail/Add/More navigation; `src/app/maintenance-photo/[id]/route.ts`.
- `src/lib/maintenance.ts`, `maintenance-actions.ts`, `maintenance-upload.ts`, `mobile-pwa.ts`, Tasks/push actions, sender/dispatcher, database types and EN/ES dictionary.
- `src/pwa/worker.js`: permits the grouped Maintenance destination.
- Migrations 008/009; tests for database, server actions, direct Storage upload, mobile classification, browser flows and Snooze.

## Manual checks after a reviewed deployment

Use one real iPhone Home Screen app and one installed Android PWA. Explicitly enable notifications, send a test, close the app, and test a real authorized future reminder. Confirm no desktop controls or delivery. Test Tomorrow at a nondefault time and reopen another reminder to check the remembered default. Test several recurring checks scheduled at the same time, one grouped notification, and the Maintenance destination on tap. Check photo capture/upload/view, Ready without recurrence advancement, Done advancing the cycle, and a different assignee next time. Automation is not physical-device verification.

## Final local verification — 2026-09-16

- ESLint: passed.
- Typecheck: passed.
- Production build: passed.
- Vitest: 441 tests passed across 42 files.
- Playwright: 198 passed, 2 intentionally skipped (desktop-only receipt review and Owner inventory overview in the mobile project). Mobile/desktop viewport checks and simulated installed-PWA APIs are automation, not real-device delivery verification.
- `git diff --check`: passed; Git reports existing CRLF-to-LF normalization notices.
- Non-blocking tooling warnings: Node module-type autodetection during PWA asset generation and Playwright FORCE_COLOR/NO_COLOR.
- No production deployment, migrations or scheduler activation performed.
