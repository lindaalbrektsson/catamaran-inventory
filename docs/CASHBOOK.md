# Cashbook / Caja — implementation review

Review date: September 24, 2026. **Production rollout approved; local release verification complete.**

Cashbook is a separate manual operational money area at `/cashbook`. It tracks cash on hand, Jackie's account, food debt, and recurring payments. It does not create, require, upload, scan, or modify receipts. No Production business records, users, roles, passwords, receipts, balances, or opening amounts were changed during this work.

The user's later clarification supersedes the original TEST requirement: **Cashbook has no TEST mode or TEST records.** The existing application's Test Data system remains unchanged. After an approved rollout, an Owner will enter the accurate opening amounts and configure actual recurring amounts and due days.

## 1. Final schema

Migration: `supabase/migrations/20260924000100_cashbook.sql`.

| Object                         | Purpose and principal fields                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cashbook_members`             | Explicit authorized Manager profile UUID membership, plus server creation timestamp.                                                                                                                                                              |
| `cashbook_templates`           | Reusable `FOOD` / `MONTHLY` concepts, EN/ES names, nullable default cents, nullable due day, active flag, configured `start_month`, creator and timestamps.                                                                                       |
| `cashbook_transactions`        | Immutable posted operation: UUID, request UUID, kind, effective date, positive magnitude in cents (opening can be zero), source/destination account, comment, actor UUID, server timestamp, reversal target and correction target.                |
| `cashbook_entries`             | Immutable account legs: transaction UUID, `CASH` / `ACCOUNT`, signed integer cents, server timestamp. One leg per transaction/account.                                                                                                            |
| `cashbook_debts`               | Stored food lines or materialized monthly occurrences, template/name snapshot, effective date, monthly period, quantity, unit cents, amount cents, comment, creator, timestamps and optimistic version. Unique template/month for recurring dues. |
| `cashbook_allocations`         | Immutable links from one payment to included debts, actual allocated amount, paid debt snapshot and timestamp.                                                                                                                                    |
| `private.cashbook_requests`    | Stable request UUID, authenticated actor UUID, action, exact payload, result and timestamp for duplicate protection. No client table access.                                                                                                      |
| `cashbook_due`                 | Security-invoker view combining stored debts with pending monthly projections, and deriving paid status and payer details from unreversed payment allocations.                                                                                    |
| `cashbook_transaction_history` | Security-invoker view with derived status, creator name, original operation type, payment/debt references and related correction/reversal IDs.                                                                                                    |

The main public RPCs are `cashbook_access`, `cashbook_balances`, `cashbook_mutate`, `cashbook_report` and `cashbook_payment_details`. Financial writes go through the authorized mutation RPC. Private posting/materialization helpers are not executable by client roles.

## 2. Access rules for Jackie and Owners

- Active, credential-valid Owners retain full Cashbook access, including opening balances, template management and Excel export.
- Jackie is authorized by profile UUID `b54670b2-df51-4247-83fb-55a456db6011`, recorded in `cashbook_members`, together with her Manager role. The migration inserts membership only if that profile exists. It never identifies her by display name or changes her profile/role.
- Other Managers, including Ortega, and other roles cannot access Cashbook. Naming another profile “Jackie” grants no access.
- Navigation checks permission; the page checks permission independently. Database RLS, RPC role/membership checks and revoked direct writes enforce the same boundary.
- Export checks Owner status in its route, database report RPC and workbook generation. The control is shown only to Owners on desktop layouts. Screen size is a presentation rule; Owner authentication is the security boundary.

Relevant application files: `src/lib/cashbook.ts`, `src/lib/cashbook-actions.ts`, `src/components/cashbook-navigation-link.tsx`, and `src/app/(workspace)/cashbook/`.

## 3. Ledger and balances

Amounts are integer BZD cents. Form parsing converts decimal text to cents without floating-point multiplication. A single operation is bounded to 999,999,999,999 cents; the application rejects unsafe aggregate JavaScript integers rather than silently losing precision. Food quantity is a positive whole number from 1 to 100,000.

`cashbook_balances()` sums the signed ledger entries in the database. Cash plus account equals total funds. Browser arithmetic is used for entry previews and report reconciliation only.

Income adds to its destination. Expense/payment subtracts from its source. A transfer creates both linked legs atomically and leaves total funds unchanged. Negative resulting balances remain visible; an expense is not silently blocked merely because it exceeds the recorded funds.

Opening amounts are never seeded or guessed. An Owner explicitly initializes each account, including an intentional zero if accurate. Operations require the involved account to be initialized. Initial balances preserve actor/date/time. Once an account has entries, its initial history cannot be replaced silently.

The operational date is a `date`; recording time is a separate server `timestamptz`. Belize day defaults and grouping use `America/Belize`. Financial effective dates are validated from 2000 through 2100. Views and exports use inclusive From/To dates.

## 4. Corrections and voids

Posted transactions, account legs and payment allocations reject update, delete and truncate. Existing audit infrastructure records Cashbook changes and actors. No ordinary hard-delete action is available.

Void creates a new reversal with the original operation's exact opposite legs. Correct creates that reversal plus a replacement operation in one transaction. The original and the replacement retain creator UUIDs, timestamps, reasons/comments and links. An operation can be reversed only once; a reversal cannot itself be reversed.

Only an Owner can correct an opening balance; an opening balance cannot simply be voided. For a food payment, the paid total remains fixed to its included food detail. To change that detail, void the payment, correct the reopened debt, review it and pay again.

Voiding a payment restores its included debts to Pending by removing its effective allocation through the reversal relationship. Correcting a payment keeps the debt linkage. Immutable allocation snapshots preserve what was paid even if reopened debt is edited later.

## 5. Food debt and settlement

Owners can add, rename, activate/deactivate and price reusable food concepts. Seeded names are Food/Comida, Ceviche, Guacamole and Fruit/Fruta; the model is open to additional concepts. No default prices are invented.

A food line stores its date, concept/name snapshot, integer quantity, unit cents, exact total, optional comment, creator and version. Changing an individual price never updates its template price. Pending lines can be edited with an optimistic version check.

The food display groups unpaid detail by Belize date. Current settlement periods run **Thursday through Wednesday inclusive**, with Today, This period and Previous views. The full unpaid total and payment review retain old unpaid lines regardless of the selected viewing tab.

Pay food total shows included lines and their combined total, asks for Cash or Account, and requires explicit confirmation. The request includes reviewed IDs, versions and expected total. One atomic mutation creates one `PAYMENT` transaction, its expense leg and all debt allocations. Pending debts do not affect balances before this action.

## 6. Recurring payment model

Owners manage EN/ES names, normal amounts, due days and active status. Names are initially available, while real amounts/due days remain unconfigured.

Once an active monthly template has an amount and due day, its start month is the current Belize month. The read view projects one pending occurrence for each configured month through the current month, using stable IDs. GET requests do not create financial records. A due day beyond a month's last day clamps to that last day, including February/leap years.

Projected occurrences are materialized when explicitly edited or paid. Before a template change, existing projected pending months are snapshotted so a new normal amount does not rewrite earlier obligations. Reactivation starts from its newly configured month; previously materialized unpaid months remain due.

Changing one occurrence leaves future template defaults intact. Paying one monthly occurrence accepts the actual amount and chosen source, preserves actual payer/time/amount, creates one linked payment expense and atomically marks it paid. Merely reaching a due date never moves money.

## 7. Bodega rent

The migration provides the editable `MONTHLY` concept Bodega rent / Renta de bodega. An Owner supplies the accurate normal amount and due day. Thereafter it uses the shared monthly occurrence and explicit payment flow. No rent amount, payment or arrears is seeded.

## 8. Social Security

The migration provides the editable `MONTHLY` concept Social Security / Seguro Social. It uses the same configurable monthly model, one-occurrence override and linked explicit payment. No Social Security amount, payment or due day is guessed.

## 9. Cashbook linkage and concurrency

`cashbook_allocations` links every settled debt to the single payment operation. History rows expose the payment/settlement reference and included debt IDs. `cashbook_payment_details()` returns immutable paid snapshots so an Owner can inspect the original daily detail.

All mutations use a transaction-scoped book advisory lock; debt and correction paths also lock relevant rows. Unique constraints, reviewed versions, expected-total checks and existing effective-payment checks prevent partial transfers, stale review, concurrent double payment and repeated reversal.

Stable UUID requests are recorded with actor and exact payload. Repeating an identical committed request returns its original result. Reusing a request UUID for another actor/action/payload fails. A transport failure is treated as uncertain: the UI preserves the same ID and payload for retry. The form prevents rapid duplicate submission before the pending render.

`src/lib/cashbook-input.ts` passes only recognized fields to the RPC. Client actor UUIDs, server timestamps, statuses and TEST flags are not forwarded. Database code derives the actor and recording timestamp itself.

## 10. Test Data behavior

The user's final instruction is to begin with accurate operational figures, without Cashbook TEST functionality. No Cashbook table has an `is_test` field; there is no TEST toggle, filter, balance, seed money, or cleanup path. The existing Test Data wrapper and deletion allowlist are not extended. A direct Cashbook RPC payload containing `is_test` is rejected.

Automated development tests use isolated fixtures and the repository's existing Vitest, PGlite and Playwright infrastructure. These fixtures are not production operational records and do not introduce an application Test Data feature.

## 11. Owner Excel export

Route: `/cashbook/export?from=YYYY-MM-DD&to=YYYY-MM-DD`. Implementation: `src/lib/cashbook-excel.ts`, using the project's existing ExcelJS dependency and EN/ES dictionary.

One authorized database snapshot returns complete ledger history through the selected end date, including prior history needed for opening balances. It does not page independent mutable reads. Reports above **20,000 transactions through the end date** explicitly fail rather than truncate. This is a full-history ceiling, so narrowing From alone does not reduce it.

The `.xlsx` contains:

- A period summary with each account's opening, income, expense, transfers in/out, opening adjustments and closing balance; total funds appear separately.
- Transactions within the selected inclusive period, with effective date, Belize recording time/date, operation type, account/source/destination, income, expense, signed amount, comment, creator name/UUID, status, correction/void reference, settlement reference and transaction UUID.

Transfers never inflate income or expense. Reversals net within the original income/expense category and remain identifiable. Original rows retain references to corrections outside the selected period. Those later corrections do not change the earlier period's balance. Status describes the current history state.

Amounts and dates are typed spreadsheet cells; comments remain literal text, never formulas. Summary calculations validate expected ledger legs and reject missing, duplicate, unbalanced or unsafe input. The download uses private/no-store headers. All balances remain authoritative in the database.

## 12. Migration and release boundary

The new migration adds only Cashbook tables, views, functions, permissions, audit hooks, names-only concepts and the verified UUID membership row. It does not alter Receipt behavior, existing production users/roles, inventory, credentials or existing business amounts. No migration has been applied to Production as part of this work.

Before an approved rollout, verify the authenticated Jackie profile UUID in the target environment, apply/review the migration in an isolated environment, and validate the deployed permission boundary. No real opening amounts or template amounts should be entered until the user supplies and approves the accurate values.

## 13. Test results

The full automated regression suite passes **779 tests across 73 files**, including **26 database/RLS tests** for Cashbook and 85 focused domain, input, Excel and server tests. Coverage includes exact cents and bounds, food multiplication, calendar validity, Belize midnight/year boundaries, Wednesday settlement periods, leap-year due-day clamping, date filters, monthly input normalization, explicit confirmation, RFC-compatible deterministic monthly UUIDs, version checks, allowed request fields, Owner export authorization, transfers, reversals, pre-period openings, settlement references and later correction references.

Completed local release validation:

| Check                                              | Result                         |
| -------------------------------------------------- | ------------------------------ |
| Full lint                                          | Passed |
| Next.js typecheck                                  | Passed |
| Production build                                   | Passed, including final build with public Supabase configuration |
| Full Vitest regression and database/security tests | 779 passed |
| Playwright Cashbook browser cases                  | 28 passed (mobile emulation + desktop, including action deep links) |
| Cashbook EN/ES responsive checks                   | 36 passed: ledger/payments/templates at 320, 360, 375, 390, 412 and 430px; no runtime errors |
| Full application browser regression                | 398 distinct cases passed across full run and targeted rerun; 2 skipped |

The final full browser run passed 397 cases and skipped 2. One existing Quick Add case timed out during local fixture hot reloading after a formatting-only edit. With sources held fixed it passed six consecutive reruns (three mobile, three desktop); no Quick Add code was changed. The resulting distinct passing browser coverage is 398 cases, including 28 Cashbook cases. The final production build, lint and typecheck pass. Non-blocking existing Node module-type and terminal color warnings remain.

Database coverage is implemented in `tests/cashbook-db.test.ts`; server/route authorization and export coverage is in `tests/cashbook-server.test.ts`. Browser coverage lives in the existing `tests/e2e/cashbook.spec.ts` harness. The PGlite concurrent-call test exercises its embedded serialized queue; it is not equivalent to two independent PostgreSQL sessions.

## 14. Remaining manual QA

Use an isolated environment with accurate permission fixtures; do not test by changing Production balances.

1. Sign in as Jackie, an Owner and Ortega/another Manager. Verify navigation, page, export, RLS and direct RPC boundaries; verify renamed Jackie and stale/inactive credentials.
2. Confirm the Owner opening-balance workflow uses supplied amounts with blank initial inputs. Verify cash/account income, expense, transfer, negative visible balances, correction and void.
3. Review EN/ES on a real phone and desktop: labels, keyboard, touch targets, narrow layouts, account selection and date filters. Verify export is absent for Jackie and hidden on mobile.
4. Add food on both sides of Belize midnight and Wednesday. Check old unpaid lines in the full review, per-entry price overrides, confirmation, one payment and original paid-detail history after void/edit/re-payment.
5. Configure actual rent and Social Security terms in the isolated environment. Check monthly appearance, month-end clamping, inactive/reactivated templates, template changes preserving old pending months and a one-month actual-payment override.
6. Use two independent PostgreSQL sessions/users to submit overlapping payments, distinct request IDs for the same debt, duplicate IDs, concurrent correction/payment and a retry after simulated lost response. Confirm one effective payment, no partial transfer and intact audit actors/timestamps.
7. Open both EN and ES exports in desktop Excel. Check formatting, dates, balances, literal comments, transaction/settlement references and a reversal dated outside the exported period.

The user approved Production rollout after the automated release gates and read-only Production preflight. Do not enter actual opening amounts during smoke verification. Jackie currently still requires her first-login password change; that state is preserved.


## Approved contextual navigation

- Home: compact authorized balance card, streamed independently after location cards. It reads only `cashbook_balances()` after server authorization, reuses the ledger balance parser, and shows unconfigured accounts as an em dash. Failed reads do not display invented zero amounts.
- Add: authorized compact income, expense, transfer and food-debt links. Query parameters select the existing forms; navigation never posts a financial operation.
- More: authorized Cashbook/Caja link. The existing desktop sidebar link remains. Mobile bottom navigation remains unchanged.
- Main sections: Cashbook/Caja and Payments due/Pagos pendientes. Owner template controls remain within Cashbook.
- Successful Cashbook mutations invalidate both Cashbook and Home, preserving fresh summary amounts.
- Unauthorized Managers receive no financial payload from Home. Access is still independently checked by the page, server actions and database.

Production preflight: current main `9974d0ab14e0138e3c7d1d5039eae422ccf59414`; all 41 existing migrations matched; no Cashbook object-name collision. Dry run lists only `20260924000100_cashbook.sql`. Jackie UUID matches the reviewed membership. No environment changes are required; `fra1` remains configured.
