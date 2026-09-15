# Local performance and Archive review — 15 September 2026

Status: LOCAL ONLY. No deployment, push, hosted migration, production data mutation or AI call was performed. Changes are in branch `codex/performance-archive`, based on production commit `fc3646da8ffa3e940883afdc7158ece17746f9f8`.

Working folder:
`C:\Users\linda\OneDrive\Documents\ChatGPT\App inventory Cat Belize\artifacts\needs-release`

This is the existing production-safe Git worktree, not a rebuilt application. The root development checkout and Smart Scan work remain intact.

## Confirmed bottlenecks and measured improvement

Home previously awaited the Needs counts, then locations, then Tasks, then Documents. These reads do not depend on each other once the profile is authorized. Location view waited for the location row before requesting balances/catalog; Add waited before requesting its catalog; Transfer also waited before requesting destination locations.

The regression benchmark invokes the actual async route functions, with each independent data source replaced by a controlled 100 ms read. Auth/locale resolve immediately. It measures route-function completion/data scheduling, not complete browser rendering, database query execution, internet latency or physical-phone performance.

| Route path | Before | After | Independent read concurrency before → after |
| --- | ---: | ---: | --- |
| Home | 458 ms | 173 ms | 2 → 5 (two Needs counts) |
| Location view | 211 ms | 109 ms | 1 → 2 |
| Location Add | 207 ms | 118 ms | 1 → 2 |
| Location Transfer | 330 ms | 106 ms | 1 → 3 |

A second post-change run returned 167 / 116 / 110 / 105 ms respectively. Wall-clock numbers vary with local load; tests assert concurrency rather than fragile timing thresholds. There is no claim that production improved by these exact percentages.

Reproduce: `npx vitest run tests/route-performance.test.ts --silent=false --reporter=verbose`.

The inventory Need suggestion component also fetched every active Need, including unrelated text-only/product Needs. It now requests only products displayed at the current location, batching IDs at 100 to bound URL length and retaining row pagination. Empty and inactive-only lists perform no Need query. Tests verify that an existing Ordered Need remains visible even when stock is healthy; low stock without an active Need still links the exact product into Add Need.

## Changes made

- Parallelized independent Home and location/Add/Remove/Transfer data reads after authorization.
- Added request-scoped location-list deduplication using React `cache`, consistent with the existing profile/catalog pattern. This is not a cross-request data cache, and no separate timing gain is claimed for it.
- Scoped inventory-linked Need reads and eliminated the empty-list request.
- Added opt-in server timings for claims, profile, locations, balances, catalog, Needs, Tasks, Documents, staff list and route functions.
- Bounded server Supabase GET/HEAD reads at 15 seconds so a hung read can fail. Existing caller cancellation remains respected. This is a per-read deadline, not a guarantee that every route finishes within 15 seconds. Writes/RPC POSTs are not retried or aborted by this wrapper.
- Transient Auth fetch/5xx failures now throw `AUTH_LOAD_FAILED`, using the existing retry/error boundary rather than treating the user as signed out. Invalid sessions, password gates and account state checks remain enforced.

## The earlier PROFILE_LOAD_FAILED / staff 500

The old incident was not reproduced, and its historical root cause remains unknown. The existing profile lookup already uses React request-scoped `cache`; the workspace layout and page do not need a new persistent permission cache. `/staff` first checks the current profile and account-admin capability, then loads the staff list. A failed profile query deliberately fails closed.

No evidence established a broken profile UUID, grant or RLS policy. No such policy was changed. The new tests exercise a failed profile read followed by a successful fresh retry, transient auth errors, invalid sessions and forced-password gating.

The existing translated `src/app/error.tsx` provides a Retry action for server-rendering failures; it does not expose internal exception details. Server read cancellation now bounds hung GET/HEAD calls. Existing PWA document navigation also has a 10-second network deadline and a translated offline/retry page; RSC requests remain network-only. That existing PWA deadline was not changed. A slow full-page navigation may reach the offline fallback before the server read deadline, which should be checked during the next live measurement.

## Safe timing diagnostics for the later combined rollout

No environment value was changed in Vercel. `.env.example` documents the optional server-only flag `PERFORMANCE_LOGGING=0`.

For a controlled local investigation, set `PERFORMANCE_LOGGING=1` in the local process or ignored `.env.local`, then restart. For a later explicitly approved production rollout, the same server-only flag can temporarily enable Vercel logs. Set it back to `0` after collecting a short sample.

Example output shape: `{"event":"server_timing","operation":"profile.load","duration_ms":123,"outcome":"ok"}`.

Only static operation names, elapsed time and ok/error are emitted. No IDs, phone numbers, email, tokens, URLs, query parameters, results, error messages or passwords are logged. Redaction/opt-in behavior is tested. Route timings cover the async route function; they exclude subsequent rendering of asynchronous child components, proxy overhead and client hydration. Use browser network timings alongside these logs.

## Database and archive behavior

One new LOCAL, UNAPPLIED migration:
`supabase/migrations/20260915000100_archive_item.sql`

It adds `archive_inventory_item(uuid)`, a narrow OWNER-only RPC that updates only `products.active=false`. The existing audit trigger records the authenticated actor, server timestamp and before/after product values. A repeated archive is a no-op. There are no seeds, balance updates, hard deletes, index changes or changes to existing RLS policies/grants.

Owner flow: item detail → Archive item → confirm. The confirmation explicitly says the item is archived at all locations. Existing stock is preserved. Normal active inventory excludes the item; the existing Inactive filter and Edit item → Active restore it. Existing operational edit permissions are unchanged; the dedicated Archive action/RPC is Owner-only.

Local database tests verify identical balances, transaction records and linked Need records after archive; an immutable audit event; idempotence; restore using the same product ID; and rejection of direct Archive calls from MANAGER, CAPTAIN, CREW and anonymous users. Existing receipt, purchase, document and task references are not modified by this update-only RPC. Normal audit deletion and timestamp rewriting remain denied.

The migration must be reviewed/applied through the existing CLI workflow as part of the later combined rollout before using Archive against the hosted database. Do not apply it now solely to test this local UI.

## UI corrections

- Tasks retains `ClipboardCheck`; Documents now uses `FileText` from the existing lucide library.
- English logo: **BOAT · STOCK · CREW**. Spanish remains translated, with singular **BARCO · INVENTARIO · EQUIPO**.
- Archive confirmation and feedback are translated in English and Spanish. Mobile and desktop screenshots were visually reviewed.

## Deliberately unchanged / remaining concerns

- No permission weakening, auth UUID change, session clearing, service-role client use or cross-user cache.
- No stock/permission TTL cache. Existing inventory/catalog/profile caching remains request-scoped.
- Existing profile primary key, inventory location index and active-linked-Need indexes already support these paths. No authenticated production query plan or timing evidence justified another index.
- Full catalog, Tasks and Documents payloads can grow over time. No production row-volume evidence established these as the current main bottleneck; no pagination or summary rewrite was introduced that could silently omit existing results.
- Home now waits for the slowest parallel section, rather than their sum. Separate streaming/failure sections could be a later change if timings justify changing the loading UX.
- Proxy session verification/refresh was retained. A build region alone is not proof of a Vercel runtime region. Supabase's listed region is eu-central-1, but runtime placement and cross-region latency must be confirmed before changing deployment regions.
- No claim of real-device iPhone/Android verification. Browser checks use desktop Chromium and mobile Chromium emulation, plus isolated UI fixtures; they are not live authenticated production tests.

## Next manual performance sample (after the combined rollout)

1. Sign in normally, open Home, then Bodega, Cas Cat, Add and Transfer. Repeat each 5 times on Wi-Fi and mobile data; distinguish first/cold load from subsequent navigations.
2. Capture browser request duration/TTFB and safe server timings for the same requests. Do not share unsanitized HAR files containing cookies or personal data.
3. Confirm whether time is in claims/profile, balance/catalog reads, secondary Home sections, proxy/network latency or client rendering. Check actual runtime region against Supabase before moving it.
4. If PROFILE_LOAD_FAILED returns, retain the timestamp, route, status and sanitized timing events; check Supabase service status/query logs without assuming a permissions issue.
5. Test a temporary connection failure and Retry, including installed PWA reopening. Ensure recovery keeps the same session and stock stays current after mutations.
6. Archive and restore an agreed real item only during an approved live functional test. No invented production quantities are needed.

## Files changed

Performance/runtime:
- `src/app/(workspace)/page.tsx`
- `src/app/(workspace)/inventory/[locationId]/page.tsx`
- `src/app/(workspace)/staff/page.tsx`
- `src/components/low-need-suggestions.tsx`
- `src/lib/auth.ts`
- `src/lib/inventory.ts`
- `src/lib/performance.ts` (new)
- `src/lib/supabase/server.ts`
- `src/lib/supabase/read-fetch.ts` (new)
- `.env.example`

Archive and visual corrections:
- `src/components/archive-item.tsx` (new)
- `src/components/product-overview.tsx`
- `src/components/navigation.tsx`
- `src/lib/catalog-actions.ts`
- `src/lib/database.types.ts`
- `src/lib/i18n.ts`
- `supabase/migrations/20260915000100_archive_item.sql` (new)

Verification/documentation:
- `tests/archive-actions.test.ts` (new)
- `tests/performance.test.ts` (new)
- `tests/profile-retry.test.ts` (new)
- `tests/route-performance.test.ts` (new)
- `tests/low-need-query.test.ts` (new)
- `tests/quick-needs.test.ts`
- `tests/e2e/archive-item.spec.ts` (new)
- `tests/ui/catalog-actions.ts`
- `tests/ui/main.tsx`
- `docs/PERFORMANCE-REVIEW.md` (this report)

## Verification results

- ESLint: passed.
- Typecheck: passed.
- Unit/integration suite: **325 passed** across 32 test files.
- Browser suite: **145 passed, 3 skipped** (desktop-only document administration, receipt review and Owner overview skipped on mobile).
- Local production build: passed (compile 20.4 seconds; TypeScript 9.3 seconds in this run).
- No-AI release source/build guard: passed. No Smart Scan route or paid AI invocation.
- Agent-browser local fixture: loaded; no browser errors reported.
- Git whitespace check: passed. Generated QA tsconfig additions are removed before handoff.

No push or deployment. Hosted migration history and production remain unchanged.
