# First-user usability refinement — 2026-09-20

## Scope
Focused operational refinements, retaining Home | Add | Need | More, fra1, location streaming, auth/RLS, stock transactions, maintenance recurrence and existing visual language. No production QA names, balances or statuses changed during implementation.

## Changes
- Home retains the existing maximum of four open tasks, now selecting from all permitted open tasks in due-date order: overdue, today, upcoming, then undated. My tasks remains available; View all tasks is explicit. Existing independent Tasks/Documents Suspense boundaries are unchanged.
- Eligible maintenance detail pages offer Add to today's plan. The link opens the existing planner with that task preselected; it calls the unchanged planMaintenance action/RPC. An open occurrence displays Already in work plan instead. Future recurring tasks remain unplannable until due, as required by existing rules.
- Task and maintenance details offer Add reminder. It opens the existing TaskForm with title/related_task_id prefilled and reminder controls expanded/required. Manager assignment stays self-only; Owner uses existing active-staff assignment. Settings/Test push remain separate.
- The same TransferForm shows source and destination stock and an arithmetic after-transfer preview. Oversized/invalid quantities do not show a misleading preview. Server stock validation remains authoritative.
- Current-location catalog presentation is Bodega then Cas Cat. Transfer keeps source-to-destination order.
- Existing linked Need is displayed in a prominent secondary-color panel with status chip and Open action, while duplicate creation remains disabled.
- Optional Quantity to buy on Add/Edit Need and compact list. Linked unit appears where available. Blank remains null. No automatic minimum/target prefill. Existing edit permissions/status behavior retained.

## Database
`20260920000100_need_quantity.sql`: nullable quantity_needed numeric(14,3), range 0..99999999999.999, same precision/range as stock. Existing save_purchase_need RPC validates precision, saves the value in the same audited/versioned/idempotent write and preserves it when older callers omit it. Existing records stay null; no balances or transactions are changed. RLS and grants remain unchanged.
The source release also records already-applied `20260917000500_auth_creation_metadata.sql` in its separate prerequisite Auth fix commit.

## Network/performance
No new dependencies, decoration requests, Home queries, normal location queries or reminder queries. Item-detail transfer reuses already-fetched destination balances. The location Transfer picker adds one parallel paginated read selecting only product_id/location_id/quantity for destination locations; Remove and normal inventory do not run it. Existing 100ms simulated-read performance tests assert parallel scheduling and independently streamed location content. No new history fetching.

## Deferred
No redesign, movement of established location controls, broader Home reorganization, automatic Need-to-stock mutation, or QA task/maintenance renaming. Real-device camera/push behavior remains a manual check; browser emulation is not real-device certification.

## Future Receive into inventory recommendation (not implemented)
Use an explicit Receive into inventory action linked to the Need UUID and existing product UUID. Ask quantity actually received and destination, optionally prefill the manually entered quantity needed, then explicitly confirm. Use the normal audited ADD stock transaction with a unique receipt-operation idempotency key. Record the relation to the Need/actor; retry must return the same result. Track partial receipts separately so genuine later receipts remain possible. Need Done must never itself write stock. Unmatched Needs must explicitly select/create an item through the existing workflow first.

## QA name proposal — NOT APPLIED
Keep UUIDs/categories/minimums/balances/statuses/history unchanged; linked Needs continue to reference the same product. Current live names were read before preparing this table.

| Current name | Proposed name | Category |
|---|---|---|
| QA - Stock Actions | QA - Life Jackets | Boat Supplies |
| Sprit (formerly QA - Low Stock) | QA - Dish Soap | Cleaning |
| QA - Minimum Boundary | QA - Dock Lines | Boat Supplies |
| QA - Running Low | QA - Whiskey Bottles | Bar |
| QA - Healthy Stock | QA - Snorkel Masks | Snorkeling |
| QA - No Minimum 0 | QA - Adjustable Wrench | Tools |
| QA - Zero Stock | QA - Engine Oil Filters | Spare Parts |
| QA - Merge Practice | QA - Engine Oil | Maintenance |
| QA - Delete Practice (archived) | QA - Mooring Fenders | Boat Supplies |

The additional product Meat is outside these nine original QA IDs and is not included. Archived Delete Practice remains archived. Approval is needed before applying the name proposal.

## Verification
Results and deployment identity are reported after completion. Tests cover optional/null/decimal/invalid quantities, idempotency, quantity audit and zero inventory mutations; Home cap; contextual planning/preselection; reminder permissions; stock preview and EN/ES mobile layout. Existing migration/RLS/stock/maintenance/push suites remain required gates.

Final local gates: lint PASS; typecheck PASS; production build PASS; 559 automated tests across 59 files PASS; 304 browser checks PASS, 2 skipped (4.2 minutes); focused EN/ES mobile/desktop usability checks 20/20 PASS. Browser checks use automation/emulation, not real mobile devices. Existing test-only visual-polish edits were exercised locally but remain excluded from this focused release.

Production migration applied through the linked Supabase CLI to shxbhjpjbaknwukqqqoh. Migration history confirms 20260920000100 and the subsequent dry run is empty. Before/after checksums of all existing Need fields and inventory balances match; all four existing Needs have null quantity. No QA names/balances/statuses were modified. Existing prebuild module-type warning is non-blocking. Production deployment identity and authenticated smoke availability are reported separately after deployment.
