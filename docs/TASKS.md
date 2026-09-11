# Tasks

Tasks track things to do; Need to Purchase tracks things to buy. Neither task completion nor a linked purchase need changes stock or financial records.

Home includes a compact task summary, assigned tasks, due/reminder indicators and Add task. The full Tasks screen is available from More and desktop navigation, with status, assignee, type and due-date filters. Optional descriptions, reminders, subtasks and links are collapsed in the mobile creation form.

## Permissions

- OWNER and MANAGER can create, assign and edit operational tasks and complete subtasks.
- OWNER alone can archive or restore tasks. Archive preserves subtasks and audit history.
- Other active staff can read their assigned, unarchived tasks and change status or complete subtasks. They cannot create, reassign, edit metadata, or archive tasks.
- Inactive accounts have no task access. Names and UUIDs come from the existing staff directory; login identifiers are not exposed.

The database enforces these permissions through RLS and `manage_task`. Authenticated clients have SELECT only on task tables. The RPC uses optimistic versions and idempotent request IDs. Creator identity and timestamps are server-owned; edits, assignment/date/reminder/status changes, subtask completion/reversal and archiving produce immutable audit events. Existing subtasks cannot be deleted. Latest 100 events are shown per task; older audit records remain retained.

## Dates and reminders

Due dates are calendar dates in America/Belize. Reminder entry uses Belize time (UTC−06:00); timestamps are stored as UTC instants and displayed using the existing local-time component. Due today, tomorrow, overdue and reminder-due indicators refresh every minute while the task list/Home remains open. There are no background notifications, SMS, push messages or recurring reminders. Completed and archived tasks stop generating indicators.

## Relationships

Optional product, purchase need, receipt intake, location and related-task foreign keys preserve stable identity. Linking does not grant access to the linked entity. Receipt links retain existing private-storage authorization. The type catalog stores bilingual labels and can support additional types later without a new task status model.

## Rollout and verification

Apply `supabase/migrations/20260911001000_tasks.sql` before deploying the Tasks UI. It adds three public tables and private RPC request history, seeds only the four type labels, and adds no operational tasks, users, quantities or expenses. It does not depend on the pending account-administration migrations.

Tests cover database permissions, immutable audit fields, atomic writes, stale edits, retry identity, assignment, status and subtasks; domain tests cover Belize date boundaries and reminders. Browser fixtures run locally and never write production data.

For OneDrive build locks, use a fresh ignored QA output: set `NEXT_QA_BUILD=1` and a lowercase `NEXT_QA_RUN` such as `tasks`. Use the same variables for typecheck/build/browser tests. Production builds omit both variables.
