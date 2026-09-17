# Complete Mobile UX — final implementation review, 17 September 2026

Status: LOCAL REVIEW ONLY. No deployment, push, migration or production business-data change was performed for this reconciliation. This report supersedes MOBILE-UX-REVIEW-2026-09-17.md. The working tree, including pre-existing uncommitted work, is preserved.

## Requirement audit

| Requirement | Classification | Final behavior / evidence |
|---|---|---|
| Mobile navigation | IMPLEMENTED | Home / Add / Need / More; ShoppingBag icon; current destination highlighted. Desktop retains its broader navigation. |
| Need badge | IMPLEMENTED WITH INTENTIONAL DEVIATION | Explicit later decision: no badge and no badge/count query. Future optional enhancement only. |
| Remove Need from More | IMPLEMENTED | More lists Items, Receipts, Tasks, Documents; no location or Need duplication. |
| Shared selected-state styling | IMPLEMENTED | selection-control uses pressed/current/data-active state; applied to stock, catalogue, Need, Tasks and Maintenance controls. |
| Status chips vs actions | IMPLEMENTED | Shared StatusBadge/StockBadge; informational chips remain distinct from outline or primary action buttons. |
| Button hierarchy | IMPLEMENTED | Home stock actions equal outline weight; global Add primary; attachment tools secondary; update submit primary. |
| Whole-row navigation | IMPLEMENTED | Inventory and Items use full row links and chevrons, comfortable minimum touch height. |
| Shared search | IMPLEMENTED | SearchField with search icon used in Inventory, Items, Documents and owner inventory. |
| Compact dates / relative due | IMPLEMENTED | Locale-aware compact dates; Tasks show relative due or No due date; full history timestamps retained. Belize calendar semantics preserved. |
| Home branding | IMPLEMENTED | Redundant heading removed; operational location cards remain immediately accessible. |
| Home summary counts | IMPLEMENTED WITH INTENTIONAL DEVIATION | No new blocking location summary/count request; performance takes precedence over optional counts. Existing available summaries retained. |
| Home Tasks shortcuts | IMPLEMENTED | My tasks and All tasks are bordered navigation links with chevrons, not selected tabs. No fake pressed/current state. Tasks-page selectors remain real filters. |
| Stock classification | IMPLEMENTED | Null minimum → No minimum set. Quantity below minimum → Low stock. Otherwise quantity ≤ minimum × 1.25 → Running low. Above threshold → In stock. Minimum 12: below 12 low, 12–15 running, above 15 healthy. |
| Stock ordering | IMPLEMENTED | Default low, running, remaining A–Z; alternate A–Z and quantity sorts. Display-only: no stock mutation or changed low-stock eligibility. |
| Inventory rows/counts/filters | IMPLEMENTED | Compact rows, quantity/status aligned, category/unit metadata, low/running summary, obvious active/category/low filters. |
| Inventory information banner | IMPLEMENTED | Compact collapsible low-stock/Need information; no loss of linked Need actions. |
| Need filters | IMPLEMENTED | Status auto-applies through URL navigation; separate Apply removed. Country retained under More filters, current filter visually explicit; pending transition disables competing controls. |
| Need status transitions | IMPLEMENTED | Existing versioned RPC and revalidation preserved; successful Ordered/Done transitions leave the previous filtered list; failed writes retain row and error. |
| Items catalogue | IMPLEMENTED | A–Z default, category/newest sorts, shared search/category style, compact rows without implying stock editing. |
| Task status and filters | IMPLEMENTED | Need review remains valid. My/All controls have one selected state; full filter functionality retained. |
| Maintenance navigation | IMPLEMENTED | Calendar/clock navigation row, not a misleading floating filter chip. |
| Work-plan grouping | IMPLEMENTED | Task details with assignee/status/What remains/Save changes separate from open Add update section and historical updates. |
| Maintenance states | IMPLEMENTED | Pending → In progress → Ready → Done unchanged; recurrence advances only at Done. |
| Assignees | IMPLEMENTED | Manual name appears only for Enter another name. Shared App user / External labels and icons distinguish UUID users from non-user names; no new accounts/permissions/push recipients. |
| Previous work / updates | IMPLEMENTED | Explicit Previous work history heading; task update history remains on-demand, paginated in 20s; Add update stays open. |
| Voice timer | IMPLEMENTED | Visible MM:SS / 03:00 timer, last-30-second warning; existing ~179-second automatic stop and 5 MB guard retained. Record/stop/preview/remove/re-record/save preserved. |
| Add menu | IMPLEMENTED | Add stock, Add task, Plan today's work, Add purchase need, Add receipt, Add document; distinct planning icon. |
| Add descriptions | IMPLEMENTED WITH INTENTIONAL DEVIATION | Optional helper descriptions omitted to keep compact, self-explanatory action rows. |
| More identity | IMPLEMENTED | Compact name and Admin for OWNER with account_admin; otherwise role label. No access-scope paragraph. Backend roles unchanged. |
| Language | IMPLEMENTED WITH INTENTIONAL DEVIATION | Existing interactive global language switch retained rather than a second competing Settings switch. |
| Notifications | IMPLEMENTED | More → Settings on mobile. Installed supported PWA shows explicit opt-in/status/test controls; ordinary mobile browser gets installation guidance. Desktop has no push controls. |
| Documents naming | IMPLEMENTED | Documents throughout normal navigation/Home/list. No visible Favorites filter, star, checkbox, or separate page. |
| Frequently used documents | IMPLEMENTED | Automatic top-three, per-user/device-local ranking; authorized active ready documents only; ordinary list/search remains below. |
| Empty/loading/error states | IMPLEMENTED | Existing domain empty states retained, explicit No updates after empty history load, truthful independent loading and retryable errors. |
| Success feedback | IMPLEMENTED | Existing saved navigation, refreshed server state and filtered-row removal retained; no new noisy success modal. |
| Location streaming | IMPLEMENTED | Authorized header/actions independent of inventory, secondary Needs nested separately; no combined blocking boundary. Exactly one implementation, no wholesale patch application. |
| Frankfurt configuration | IMPLEMENTED | vercel.json contains regions: [fra1]. Local configuration only. |
| Permissions / integrity | IMPLEMENTED | OWNER/MANAGER, UUID authorization, RLS/RPCs, manual inventory, receipt/stock separation, Need uniqueness, reminder assignment and immutable history unchanged. |
| Black/empty scroll-end area | REQUIRES REAL-DEVICE TEST | Not reproduced in earlier authenticated Chromium inspection or current responsive fixtures. Body background and safe-bottom spacing retained; iOS overscroll/browser chrome require physical-device confirmation. |
| Fresh production-after-release measurements | NOT IMPLEMENTED | Deliberately not run: deployment is prohibited. Earlier paired-preview evidence is clearly identified below. |
| Real phone/PWA behavior | REQUIRES REAL-DEVICE TEST | Camera/microphone permissions, actual push delivery, keyboard/chrome/safe-area/overscroll and installed-PWA persistence need iPhone/Android checks. Emulation is not real-device verification. |

No agreed mandatory source requirement is intentionally omitted. Fresh post-deployment measurements are intentionally deferred until deployment is approved. Device-dependent acceptance remains unverified until physical-device QA.

## Documents implementation

`document-usage.ts` stores only document IDs, counts and last-open timestamps under `catamaran:document-usage:v1:<user UUID>`. Entries are capped at 200; counts are bounded. Rankings sort by count, then recency, then title, displaying at most three. Different users do not share rankings. Clearing browser storage resets them; they do not synchronize between devices.

An authorized active document detail mount records one open (React repeated-effect protected). A Home direct-file click also records an opening intent; it does not guarantee that a later network download succeeded. This is convenience ranking, not audit or proof of viewing. No background media fetch, database/API call, new dependency or migration is introduced. Blocked/corrupt storage fails harmlessly. Shortcuts are intersected with the server's current RLS-filtered document list; cached IDs never grant access. Archived/draft/revoked documents are excluded. Shortcuts are hidden while searching/filtering so they cannot conflict with list results.

The legacy favorite column/RPC and historic values remain for compatibility. Create uses false; editing preserves the existing value in a hidden field instead of clearing it as an unintended side effect. No manual Favorites controls or stars remain. Historic audit values remain available under the neutral Legacy preference label; audit records are not altered.

## Performance and configuration

No new database or API reads were introduced. Need filter changes intentionally issue the same navigation/read that Apply previously required. Document usage is bounded local storage work after hydration. Stock classifications/sorts use already loaded data. No eager media/history fetch was added. Safe diagnostics use static operation labels/durations only and remain opt-in.

Location reads retain fresh inventory semantics, existing timeouts, authorization, and independent Suspense boundaries. Frankfurt is configured once in vercel.json. No migration or environment change is required. Existing scheduler/Vault/push configuration is untouched. This report does not claim the live production region changed.

Previously measured identical-source protected preview comparison (12 samples/location/region; Chromium emulation, Stockholm ingress), milliseconds median (range):

| Location / measure | iad1 | fra1 |
|---|---:|---:|
| Bodega RSC TTFB | 285 (267–513) | 127 (97–162) |
| Bodega RSC total | 936 (706–1302) | 215 (167–250) |
| Bodega inventory usable | 924 (832–1389) | 339 (319–843) |
| Cas Cat RSC TTFB | 445 (267–1415) | 121 (100–182) |
| Cas Cat RSC total | 998 (673–1415) | 204 (162–247) |
| Cas Cat inventory usable | 1080 (830–1873) | 835 (344–846) |

Full methodology/header/after-header/server-read ranges are in REGION-COMPARISON-2026-09-17.md. These are earlier preview observations, not fresh final-tree or production-after-deployment measurements. No new performance improvement is asserted for this reconciliation. A real Belize connection may differ.

## Real-device acceptance

On one iPhone Safari/installed PWA and one Android Chrome/installed PWA, in EN and ES: reopen authenticated app; check four-tab navigation and bottom safe area; open both locations and use keyboard search; verify task/maintenance scroll end without black area; record/stop/preview a voice note through the warning threshold; exercise camera/upload; check mobile Settings/install guidance and explicit notification permission/test; confirm ordinary desktop has no push controls. Use controlled QA records only after separate authorization for that dataset.

## Release gate

Final local checks are green; no unresolved reproducible application failure was found in these checks. No production deployment is authorized by this report. Review and explicit approval are required. Real-device media/push/PWA acceptance and final post-deploy authenticated timing/smoke checks remain outstanding. Local tests use isolated fixtures/database emulation and do not certify all live production flows. No production data was created, deleted or changed.

## Verification results

- Lint: PASS (`npm run lint`).
- Typecheck: PASS (`npm run typecheck`).
- Production build: PASS (`NEXT_QA_BUILD=1 NEXT_QA_RUN=final-ux-reviewed npm run build`), compilation 21.5 seconds in the recorded final build.
- Automated unit/integration: **511 passed, 54 files**. Includes OWNER/MANAGER/RPC/storage authorization and history safeguards in isolated test databases.
- Full browser: **264 passed, 2 skipped**. The skips are Owner-only desktop review/workspace checks in the mobile project. Chromium mobile emulation plus desktop; this is not physical iPhone testing.
- Compatibility: **157 passed, 1 skipped** across Chromium and WebKit emulation, completed with one worker in 9.6 minutes. The skip is the known Windows WebKit `setOffline` engine limitation; the separate actual-network-loss service-worker test passed. The repository compatibility configuration includes Documents and the full Mobile UX regression suite in addition to its previous cases. Command: `NEXT_QA_BUILD=1 NEXT_QA_RUN=final-ux-reviewed npx playwright test --config playwright.compat.config.ts --workers=1`.
- An initial compatibility run was interrupted by long local execution pauses and memory pressure, with timeout failures. It was stopped and restarted with one worker; only the completed restart counts toward acceptance. The interrupted log is retained separately.
- `git diff --check`: PASS; Git emits existing LF/CRLF normalization advisories.
- Build warning: Node reports MODULE_TYPELESS_PACKAGE_JSON for the existing translation-file build import. Non-fatal; no unrelated package module-mode change was made. Browser runners warn about NO_COLOR/FORCE_COLOR; non-fatal.
- An initial empty-history regression test addressed the wrong fixture URL; corrected to `voice-update`, then full suite passed. An artifact-config working-directory startup issue was corrected before compatibility execution; neither required an application workaround.
- Viewports: EN/ES 320, 360, 375, 390, 412, 430, 768, 1440 in the UX suite; compatibility also covers 1024 and reduced-height/scrolling scenarios.
- Visual fixture inspection: Documents screenshot `artifacts/final-documents.png` confirms no Favorites controls. Fixture shell includes a Cas Cat heading and is not a production screenshot.

## Exact working tree and changed files

Generated inventory below is relative to this worktree; no commit has been created for this reconciliation.

Worktree: `C:/Users/linda/OneDrive/Documents/ChatGPT/App inventory Cat Belize/artifacts/needs-release`

Branch: `codex/location-navigation-investigation`

HEAD/base: `be3eac063584179db2c179701b79407b1e8099dd`

Working-tree status: **46 modified tracked files and 21 untracked files**, including reports and tests. All implementation changes below remain uncommitted. No existing commit was modified. Separate preparation worktrees were not merged or used to overwrite this tree.

```text
 M playwright.compat.config.ts
 M src/app/(workspace)/documents/[id]/page.tsx
 M src/app/(workspace)/documents/page.tsx
 M src/app/(workspace)/inventory/[locationId]/page.tsx
 M src/app/(workspace)/more/page.tsx
 M src/app/(workspace)/needs/page.tsx
 M src/app/(workspace)/page.tsx
 M src/app/(workspace)/tasks/maintenance/[id]/page.tsx
 M src/app/(workspace)/tasks/page.tsx
 M src/app/globals.css
 M src/components/add-hub.tsx
 M src/components/document-form.tsx
 M src/components/document-list.tsx
 M src/components/global-items.tsx
 M src/components/inventory-list.tsx
 M src/components/location-cards.tsx
 M src/components/low-need-suggestions.tsx
 M src/components/maintenance.tsx
 M src/components/mobile-pwa-only.tsx
 M src/components/navigation.tsx
 M src/components/need-progress.tsx
 M src/components/notification-settings.tsx
 M src/components/owner-inventory.tsx
 M src/components/product-overview.tsx
 M src/components/task-list.tsx
 M src/components/task-update-form.tsx
 M src/components/task-update-history.tsx
 M src/components/voice-recorder.tsx
 M src/lib/i18n.ts
 M src/lib/performance.ts
 M src/lib/supabase/read-fetch.ts
 M src/proxy.ts
 M tests/e2e/app.spec.ts
 M tests/e2e/documents.spec.ts
 M tests/e2e/maintenance.spec.ts
 M tests/e2e/mobile-actions.spec.ts
 M tests/e2e/mobile-compatibility.spec.ts
 M tests/e2e/voice.spec.ts
 M tests/performance.test.ts
 M tests/route-performance.test.ts
 M tests/ui/documents.tsx
 M tests/ui/main.tsx
 M tests/ui/navigation.ts
 M tests/ui/quick-actions.ts
 M tsconfig.json
 M vercel.json
?? docs/LOCATION-NAVIGATION-INVESTIGATION-2026-09-17.md
?? docs/MOBILE-UX-FINAL-IMPLEMENTATION-2026-09-17.md
?? docs/MOBILE-UX-REVIEW-2026-09-17.md
?? docs/QA-BASELINE-RESET-PLAN-2026-09-17.md
?? docs/REGION-COMPARISON-2026-09-17.md
?? src/components/assignee-label.tsx
?? src/components/document-opened.tsx
?? src/components/need-filters.tsx
?? src/components/search-field.tsx
?? src/components/status-badge.tsx
?? src/components/stock-badge.tsx
?? src/lib/document-usage.ts
?? src/lib/list-presentation.ts
?? src/lib/stock-status.ts
?? tests/document-usage.test.ts
?? tests/e2e/mobile-ux-review.spec.ts
?? tests/list-presentation.test.ts
?? tests/needs-list-filters.test.ts
?? tests/stock-list-presentation.test.ts
?? tests/stock-status.test.ts
?? tests/ui/need-workflow.tsx
```

Evidence: `artifacts/final-ux-{lint,typecheck,build,tests,browser,compat}.log`. Logs/screenshots are ignored local artifacts, not production data.

Permission evidence includes isolated database/RPC suites `documents.test.ts`, `maintenance.test.ts`, `tasks.test.ts`, reminder/push tests, and server-action/route tests. Browser role fixtures cover OWNER and MANAGER. No real production user or business row was modified to obtain these results.
