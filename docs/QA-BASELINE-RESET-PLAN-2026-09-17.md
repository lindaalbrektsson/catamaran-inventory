# Proposed QA baseline reset — 17 September 2026

**Read-only inspection complete. No deletion, trigger change, scheduler change or application-code change performed for this request. Explicit approval is required.**

Production Supabase: `shxbhjpjbaknwukqqqoh`; app: https://catamaran-inventory.vercel.app. Linked CLI project confirmed. Counts are a snapshot and must be checked again under a maintenance window before execution.

## Business tables proposed for clearing

| Table | Rows |
|---|---:|
| private.catalog_requests | 0 |
| private.document_requests | 0 |
| private.item_batches | 2 |
| private.maintenance_push_batches | 0 |
| private.maintenance_push_checks | 0 |
| private.need_requests | 7 |
| private.product_merges | 0 |
| private.push_deliveries | 0 |
| private.quick_add_requests | 4 |
| private.task_requests | 5 |
| public.document_files | 0 |
| public.documents | 0 |
| public.expenses | 0 |
| public.inventory_balances | 19 |
| public.inventory_transactions | 27 |
| public.maintenance_occurrences | 1 |
| public.maintenance_rules | 1 |
| public.maintenance_updates | 0 |
| public.products | 16 |
| public.purchase_needs | 4 |
| public.purchases | 0 |
| public.receipt_intake | 2 |
| public.receipts | 0 |
| public.task_subtasks | 1 |
| public.task_updates | 0 |
| public.tasks | 3 |
| public.audit_events — business events only | 83 of 134 |

Transfers/reversals are represented by inventory_transactions; reminders belong to tasks; work-plan assignments belong to maintenance occurrences. There are no separate transfer/reminder/work-plan tables in this schema. Business request/idempotency rows are included so stale retries do not return deleted entities.

## Explicitly preserved

| Table | Rows |
|---|---:|
| private.account_changes | 5 |
| private.login_limits | 4 |
| private.profile_contacts | 0 |
| private.push_subscriptions | 0 |
| private.username_reservations | 0 |
| public.categories | 8 |
| public.expense_categories | 2 |
| public.location_assignments | 0 |
| public.locations | 2 |
| public.profiles | 2 |
| public.task_types | 4 |

Also preserve all Auth schemas/sessions/identities, 30 migration records, RLS/policies/functions/constraints, units/task types, bucket configuration, Vault secrets, cron configuration and account/security audit. Of 134 audit events, preserve 51: profiles 35, account_changes 5, categories 8, locations 3. No categories are clearly test-only.

| Username | UUID | Role | Account admin | Identities |
|---|---|---|---|---:|
| linda | 3ea06162-de4a-4b3e-a121-304137e7098d | OWNER | true | 2 |
| test.manager | 32a47dc1-ff66-48e0-9d39-cf5be120556f | MANAGER | false | 2 |

**test.owner was not found.** Production contains exactly 2 Auth users and 4 identities, matching the 2 profiles. Do not create, remove or change accounts during cleanup. Preserve all existing credentials and identities without reading or logging their values. There are currently 0 push subscriptions; the subscription table and registration functionality remain untouched.

## Categories — keep all

- Bar / Bar
- Food / Comida
- Boat Supplies / Suministros del barco
- Snorkeling / Esnórquel
- Maintenance / Mantenimiento
- Cleaning / Limpieza
- Spare Parts / Repuestos
- Tools / Herramientas

Expense categories: Fuel / Combustible; Other / Otro. Both active. Both locations remain active: Cas Cat and Bodega.

## Private storage manifest

| Bucket | Objects | Bytes |
|---|---:|---:|
| documents | 0 | 0 |
| maintenance-photos | 0 | 0 |
| need-photos | 0 | 0 |
| receipts | 2 | 2876205 |
| task-update-files | 0 | 0 |

Two JPEGs are linked to the two NEW receipt intake records (one STORE, one FUEL). Both are upload-ready. Exact removal manifest:

- `receipts/intake/fd3b41de-c1b5-4fb8-bbec-0c9d4df423fa/original.jpg` — 2680357 bytes.
- `receipts/intake/19005636-6a20-4a37-8d44-029a9eb5e38b/original.jpg` — 195848 bytes.

Total: 2,876,205 bytes. No document, need-photo, maintenance-photo or voice files currently appear in Storage. Preserve every bucket and policy. Delete approved objects through Supabase Storage API, never by deleting storage.objects SQL rows. Do not empty buckets indiscriminately.

## Data requiring explicit scope approval

Obvious test content: product Test; Needs Test 1 and Test 2; tasks First test and test. Other products have plausible operational names:

Life Jackets - Adult, Life Jackets - Kids, Snorkel Masks, Snorkel Fin Sets, Toilet Paper, Trash Bags, Engine Oil, Dock Rope - 10 mm, Bottled Water, Coca-Cola, Rum, Tortilla Chips, Paper Towels, First Aid Kit, Replacement Fuses.

Needs Trash Bags and Coca-Cola and task Help also look potentially operational. The STORE and FUEL images may contain real receipts; their contents were not downloaded or inspected. Your description identifies the current dataset as development content, but metadata alone cannot prove these records are fictitious. Approval must explicitly include these normal-looking records and both images; otherwise exclude them and recalculate the dependency scope.

## Dependency order and execution safeguards

1. Pause app writes and the every-minute catamaran-reminder-push job; drain in-flight dispatch/upload work. Preserve and restore its existing schedule (`* * * * *`) and active state. No scheduling changes have been made.
2. Securely export approved business rows, preserved-state fingerprints and the two original private files; confirm restore access. A database backup alone does not back up file bytes. Refresh counts/IDs/FKs; stop if scope differs.
3. Child-first dependency graph: push delivery/check rows and business request caches; task/maintenance updates and subtasks; maintenance occurrences; maintenance rules; tasks; Needs; inventory transactions before balances before products; receipts before purchases/expenses. Tasks precede receipt_intake. Document files and documents reference each other. Self-links also exist in tasks and inventory reversals.
4. For this full baseline reset, use one explicit multi-table TRUNCATE ... RESTRICT inside a transaction, covering the full business FK closure. This safely handles circular/self references without CASCADE or disabling FKs. All listed empty business tables are included because FK dependencies apply even to empty tables.
5. Existing immutable-history triggers reject DELETE/TRUNCATE. Temporarily disable only the explicitly listed BEFORE TRUNCATE guards on reset tables, plus immutable_audit for the filtered audit delete. Restore their original enabled states before commit. All inspected relevant triggers are normally enabled. Never use DISABLE TRIGGER ALL, disable RLS, drop constraints or change replication role. Any error rolls the transaction back, including trigger changes.
6. Keep all account/config audit events. Remove only the 83 approved business events, using a captured audit-ID allowlist and count assertion in the final executable script. The review SQL below illustrates entity scope; it must be tightened to the approved snapshot before execution.
7. Verify DB invariants before commit. Then remove only the approved Storage manifest through the authenticated server Storage API. Storage and PostgreSQL cannot be one atomic transaction: retain the backup and maintenance window until both succeed; retry failed object removals rather than broadening scope.
8. Restore scheduler/writes only after final verification. Do not seed new stock, users or test records.

## Proposed SQL (review only, not an execution-ready script)

The final guarded executable will be prepared after approval. This draft ends in ROLLBACK and has not been executed, even as a rehearsal.

```sql
-- PROPOSAL ONLY. NOT EXECUTED. Do not run until explicit approval, backup, writer pause and fresh checks.
BEGIN;
-- Required execution guards: verify approved IDs/counts, no new rows, preserved-state snapshot and full FK closure.
ALTER TABLE public.documents DISABLE TRIGGER document_no_truncate;
ALTER TABLE public.expenses DISABLE TRIGGER immutable_expenses_truncate;
ALTER TABLE public.receipt_intake DISABLE TRIGGER intake_no_truncate;
ALTER TABLE public.maintenance_occurrences DISABLE TRIGGER no_truncate;
ALTER TABLE public.task_subtasks DISABLE TRIGGER subtasks_no_truncate;
ALTER TABLE public.maintenance_rules DISABLE TRIGGER no_truncate;
ALTER TABLE public.purchase_needs DISABLE TRIGGER needs_no_truncate;
ALTER TABLE private.product_merges DISABLE TRIGGER merges_no_truncate;
ALTER TABLE public.inventory_transactions DISABLE TRIGGER immutable_movements_truncate;
ALTER TABLE public.document_files DISABLE TRIGGER document_files_no_truncate;
ALTER TABLE public.maintenance_updates DISABLE TRIGGER no_truncate;
ALTER TABLE public.tasks DISABLE TRIGGER tasks_no_truncate;
ALTER TABLE public.purchases DISABLE TRIGGER immutable_purchases_truncate;
ALTER TABLE public.task_updates DISABLE TRIGGER no_truncate;
ALTER TABLE public.receipts DISABLE TRIGGER immutable_receipts_truncate;
ALTER TABLE public.audit_events DISABLE TRIGGER immutable_audit;
TRUNCATE TABLE
  private.catalog_requests,
  private.document_requests,
  private.item_batches,
  private.maintenance_push_batches,
  private.maintenance_push_checks,
  private.need_requests,
  private.product_merges,
  private.push_deliveries,
  private.quick_add_requests,
  private.task_requests,
  public.document_files,
  public.documents,
  public.expenses,
  public.inventory_balances,
  public.inventory_transactions,
  public.maintenance_occurrences,
  public.maintenance_rules,
  public.maintenance_updates,
  public.products,
  public.purchase_needs,
  public.purchases,
  public.receipt_intake,
  public.receipts,
  public.task_subtasks,
  public.task_updates,
  public.tasks
CONTINUE IDENTITY RESTRICT;
DELETE FROM public.audit_events WHERE entity_type IN ('inventory_balances', 'inventory_transactions', 'maintenance_occurrences', 'maintenance_rules', 'products', 'purchase_needs', 'receipt_intake', 'task_subtasks', 'tasks');
ALTER TABLE public.documents ENABLE TRIGGER document_no_truncate;
ALTER TABLE public.expenses ENABLE TRIGGER immutable_expenses_truncate;
ALTER TABLE public.receipt_intake ENABLE TRIGGER intake_no_truncate;
ALTER TABLE public.maintenance_occurrences ENABLE TRIGGER no_truncate;
ALTER TABLE public.task_subtasks ENABLE TRIGGER subtasks_no_truncate;
ALTER TABLE public.maintenance_rules ENABLE TRIGGER no_truncate;
ALTER TABLE public.purchase_needs ENABLE TRIGGER needs_no_truncate;
ALTER TABLE private.product_merges ENABLE TRIGGER merges_no_truncate;
ALTER TABLE public.inventory_transactions ENABLE TRIGGER immutable_movements_truncate;
ALTER TABLE public.document_files ENABLE TRIGGER document_files_no_truncate;
ALTER TABLE public.maintenance_updates ENABLE TRIGGER no_truncate;
ALTER TABLE public.tasks ENABLE TRIGGER tasks_no_truncate;
ALTER TABLE public.purchases ENABLE TRIGGER immutable_purchases_truncate;
ALTER TABLE public.task_updates ENABLE TRIGGER no_truncate;
ALTER TABLE public.receipts ENABLE TRIGGER immutable_receipts_truncate;
ALTER TABLE public.audit_events ENABLE TRIGGER immutable_audit;
-- Verify empty targets, exactly 51 preserved audit events, all preserved rows/schema unchanged.
ROLLBACK; -- Review draft deliberately cannot commit. No production rehearsal has been run.
```

## Verification after approved cleanup

- Every target table has 0 rows; business audit subset is 0 and preserved audit subset remains exactly 51 (or the freshly approved snapshot count).
- Same 2 Auth UUIDs, same 4 identities, same profiles/roles/account-admin/credential state; compare protected server-side fingerprints without outputting credentials. No Auth API mutations.
- Same locations, categories, task types, account_changes, contacts, username reservations, login-limit state and push subscriptions as the frozen snapshot.
- Compare migration history, RLS enablement/policy definitions, bucket settings/policies, constraints/functions and trigger states against pre-reset snapshots. All restored guards enabled; no constraints removed or left invalid.
- Verify full FK closure and orphan checks, including task/Need/product links, inventory transaction-to-balance links, document current-file links and profile/Auth references.
- Storage lists show only the two approved objects gone; all 5 private buckets remain. No surviving DB file references point to deleted objects.
- Resume the original cron schedule and check dispatch health without creating reminders or sending test notifications.
- Non-destructive app check: existing session/login, empty Items/Inventory/Needs/Tasks/Documents/Receipts, both location cards, account administration and unchanged permissions. No test business data created.

## Approval boundary

Awaiting explicit approval for this exact reset scope, including the normal-looking products/Needs, Help task, both receipts/images and 83 business audit events. No cleanup will run before that approval. Existing uncommitted UX work is preserved and paused; no deployment is part of this request.
