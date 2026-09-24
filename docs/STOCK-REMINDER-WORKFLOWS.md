# Location shopping prompts and staff reminder recipients

Production baseline: `f1949488d66abbb1d6fa196c7b0c1714f6df5c60`.
This release does not change user accounts, passwords, roles, inventory quantities
or existing Needs/reminders. No notification configuration or new scheduler is required.

## Location shopping prompt

On Item/location detail, current quantity at or below a configured minimum shows
**+ Add to shopping list / + Agregar a Por comprar**. A null minimum is off;
configured zero remains a valid minimum. Existing low-stock badge semantics are
unchanged. When a target exceeds current stock, the suggestion is target minus
current stock, rounded to the supported three decimals. No target means no
invented quantity. Bodega and Cas Cat are calculated independently.

The existing Need form receives the Item and location and an editable suggested
quantity. Saving still requires the user's explicit action. Active Pending/Ordered
Needs for that Item/location replace the add prompt with a link to the existing
entry. Legacy active Needs with no location remain global blockers; they are not
reassigned. New locationless linked Needs cannot bypass an existing scoped Need.

Linked Item/Need classification must agree at the database boundary: a TEST Item
requires a TEST Need, and a normal Item requires a normal Need. Existing records
are not reclassified. Manual text-only Needs retain their explicit test checkbox.

## Reminder recipients and privacy

Active, fully provisioned Owners and Managers can create reminders for any active,
fully provisioned Owner/Manager. Account-admin capability is not required. The
**For / Para** selector uses app-user UUIDs and display names; inactive accounts,
pending setup/password changes and external Maintenance assignees are excluded.
The Task's eligible app assignee is preselected, otherwise the current user.

The existing private Task model stores the recipient as `assignee_id` and the
authenticated creator as immutable `created_by`. Recipient push routing, device
subscriptions, multi-device delivery, Belize scheduling and delivery recovery
remain unchanged. **Created by / Creado por** identifies the creator in detail.

Existing read/edit/archive permissions are preserved. Managers may read and
manage only reminders addressed to themselves; creating for someone else does
not grant access. They return to Tasks after creating for another recipient.
Owners retain their existing reminder visibility and can edit/archive reminders
they created or receive. Only the recipient can Snooze. Normal Task collaboration
is unchanged. A recipient may retain an unchanged link to a private parent while
editing their own reminder; this does not allow reading that parent or adding a
different inaccessible link. Exact creation retries acknowledge the original
caller's request without exposing the recipient's private reminder.

## Migrations

Apply in order:

1. `20260923000100_location_shopping_needs.sql`: replaces the global active-product
   index with location/unscoped indexes and updates the existing Need save RPC.
   Its serialized duplicate check also protects conflicts between unscoped and
   scoped Needs. Existing merge conflict checks remain conservatively unchanged.
2. `20260923000200_staff_reminder_recipients.sql`: updates only the existing
   Task mutation and reminder-recipient directory functions. No read policy,
   push/Snooze function, Auth/profile schema or existing record is rewritten.

Neither migration changes existing operational rows, classification, user accounts,
Storage configuration, scheduler configuration or environment variables.

## Verification and rollout

Only disposable local database/browser fixtures may be mutated during automated
verification. Production verification is read-only. Device notification delivery
still requires a recipient to opt in on a real supported mobile PWA; automated
push tests do not establish physical delivery. Final checks, migration names and
deployed commit are recorded in the release report.

### Verified candidate

- Lint, TypeScript and production build passed.
- Full automated suite: 668 tests across 68 files passed (including SQL/RLS,
  classification, duplicate, reminder authorization and push regression coverage).
- Full browser suite: 370 passed; two mobile skips for desktop-only tools.
  Browser checks use disposable local fixtures, not production writes.
- Production schema preflight matched the 39-migration baseline; after migration,
  all 857 compared schema objects match the 41-migration candidate.
- Both new indexes and reminder RPC grants verified on production.
- Before/after counts and fingerprints across 32 account/business/configuration/
  Storage tables were identical. No existing user or business record was rewritten.
- Deployment retains Frankfurt (`fra1`) and the existing configuration.
- Real mobile push delivery requires a later opted-in physical-device check;
  no production reminder was created or sent during this verification.
