> Historical implementation/measurement record. Current release readiness is documented in RELEASE-CANDIDATE-2026-09-17.md. This file does not authorize deployment.

# Location navigation investigation — 17 September 2026

Status: local only, branch `codex/location-navigation-investigation`, based on production `be3eac063584179db2c179701b79407b1e8099dd`. No deployment, migration, production configuration change, account change or business-data write.

## Finding and confidence

The dominant measured phase is the location RSC response completing after its initial headers. In the instrumented production Link samples this took 618–1,214 ms, compared with 188–336 ms to initial headers, 10–43 ms from actual click to navigation request, and 0–16 ms for the additional JavaScript chunk. This is server/data/stream completion waiting, not a demonstrated JavaScript download bottleneck. The earlier Codex click-to-snapshot ~3 s figures included substantial automation overhead and are not browser navigation timings.

The location render has a verified blocking dependency chain: validated profile -> four parallel data reads -> linked Needs lookup. Before this change the complete inventory and secondary Need component were inside the same route loading boundary as the header/actions. The safe, demonstrated local fix separates these boundaries. This does not establish that the entire production delay is solved: per-query timing inside the deployed Virginia function was not enabled/deployed, and real phone measurements remain necessary.

## Production browser waterfall

Authenticated Chromium at 390 x 844, existing real session, no writes. Actual click event measured with performance.mark; Playwright request timing and Resource Timing recorded without request headers, credentials, payloads, filter values or product content. The dedicated diagnostic browser avoids the Codex UI click/snapshot overhead. Small samples; not p95. Resource Timing response completion is used because the service-worker-mediated request lifecycle did not reliably populate Playwright requestfinished timing.

| Location / worker | Click -> request | RSC TTFB | RSC total response | After headers | Response complete -> search visible | Search visible from command |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Bodega / enabled | 43 ms | 305 ms | 1,141 ms | 836 ms | ~248 ms | 1,460 ms |
| Cas Cat / enabled | 10 ms | 336 ms | 972 ms | 636 ms | ~384 ms | 1,392 ms |
| Bodega / bypassed locally | 18 ms | 193 ms | 1,407 ms | 1,214 ms | ~487 ms | 1,942 ms |
| Cas Cat / bypassed locally | 10 ms | 188 ms | 806 ms | 618 ms | ~39 ms | 882 ms |

Each measured Link transition fired one non-prefetch location Flight request, one route JS chunk, a manifest request and one public icon/other request. Bodega also had eight small prefetch requests; Cas Cat had four. No redirect, browser Auth refresh request, version-check request or post-navigation client inventory data fetch appeared in these transition windows. Server-side session validation still occurs.

Full Home setup plus navigation includes many more speculative requests: approximately 43–52 total requests in the recorded Home setup windows. They include shared navigation, both location routes and their add/remove/transfer variants, Needs, receipt capture and task links. Repeated normalized route paths have different router/prefetch states; they are not duplicate full inventory fetches. Static-label server logs show many proxy calls but only one profile read per actual rendered route. The sanitized request-by-request records are in ignored `artifacts/location-production-detailed.json` and `artifacts/location-local-before.json`.

The location links use default Next Link prefetch, not prefetch=false. Prefetch IS observed. For this dynamic cookie-dependent route it fetches the shared loading/layout payload, not fresh inventory data. The main Flight data request still starts on navigation. No full-data prefetch or cross-request stock cache was introduced.

## Navigation mechanisms

| Production, worker enabled | Next Link | router.push | ordinary anchor | direct load |
| --- | ---: | ---: | ---: | ---: |
| Bodega | 1,460 ms | 823 ms | 1,712 ms | 910 ms |
| Cas Cat | 1,392 ms | 1,361 ms | 1,532 ms | 1,101 ms |

| Local production build, real authenticated DB reads | Next Link | router.push | ordinary anchor | direct load |
| --- | ---: | ---: | ---: | ---: |
| Bodega | 376 ms | 344 ms | 308 ms | 294 ms |
| Cas Cat | 365 ms | 334 ms | 324 ms | 252 ms |

These are individual observations, not randomized controlled comparisons. Router push uses the installed Next runtime's public router instance only in the diagnostic browser. The anchor was replaced in that browser's DOM only. Production source behavior was not changed. There is no consistent evidence that replacing Link with an anchor solves the issue; anchors were slower in both production samples.

## Server timings and round trips

Opt-in `PERFORMANCE_LOGGING=1` local production build, normal user JWT / original RLS, real Supabase. Static operation names and duration only. Local machine is in Europe; these are NOT Virginia function timings.

| Phase | Median observed |
| --- | ---: |
| Proxy getClaims | 4 ms |
| Page getClaims | 4 ms |
| Profile fetch headers / decoded profile | 47 / 48 ms |
| Location fetch / wrapper | 46 / 48 ms |
| Products fetch | 50 ms |
| Categories fetch | 50 ms |
| Balances fetch / wrapper | 52 / 55 ms |
| Catalog wrapper (parallel products/categories) | 68 ms |
| Page function before nested Need render | 115 ms |
| Nested linked-Needs lookup | 49 ms |

`route.location` measures the page function, not React's complete nested streamed render. Browser Flight completion includes that remaining render and transport. Fetch-level diagnostics measure response headers; wrapper timings include decoding and local mapping. No invented exact production server-render number is reported.

At current sizes: six database calls for the normal location screen (one profile, one location, one products, one categories, one balances, one linked Needs). Dependency depth is three, not six: profile; four concurrent reads; Needs. There is no separate low-stock SQL query: low-stock calculation is in memory. Locale is a request-cached cookie read with zero DB calls. Role is part of the profile. Layout/page share request-cached profile resolution; across route transitions a fresh profile remains necessary for account state/permissions. Proxy and page both validate JWT claims; warm verification is local and does not call getUser. Key fetch/expired-token refresh may add network work, but none was observed in these browser transition windows.

Counts grow with existing 500-row pagination and 100-product Need URL batches; no N+1 per item exists. No focused RPC was added: the current evidence supports removing rendering dependencies first, not a database API/schema expansion.

## Database / RLS

Read-only transactions using the existing authenticated OWNER UUID and current claim time; no Auth user mutation. EXPLAIN ANALYZE returned:

| Equivalent application SELECT | Execution |
| --- | ---: |
| Profile | 0.221 ms |
| Active location | 1.636 ms |
| Products | 1.201 ms |
| Categories | 1.035 ms |
| Location balances | 8.531 ms (first measured sample) |
| Open linked Needs | 4.481 ms |

The balances plan uses `inventory_location_idx` (bitmap index/heap scan); no history aggregation/join is involved. Small catalogue scans are not evidence of a missing-index bottleneck. The Need EXPLAIN uses a subquery to obtain the same location product IDs instead of logging the production PostgREST IN values, so its 4.481 ms includes that extra read and is not an exact wire-query timing. Plans are retained in ignored `artifacts/location-plan-*.json` / `location-explain.json`.

A transaction-local function-statistics check proved **nine calls to can_access_location and nine current_role calls for nine balance rows**. Combined helper time was approximately 3 ms. current_role is STABLE SECURITY DEFINER but is not an InitPlan cached once per statement in this policy. auth.uid is inlined in the SQL helper and was not separately countable in function statistics; it is evaluated within those repeated helper invocations. Therefore, per-row RLS work exists, but is not the current dominant latency. No policy/function/index migration is justified by these samples, and none was made.

## Regions

Supabase project `shxbhjpjbaknwukqqqoh`: `eu-central-1` (Frankfurt). Vercel deployment: `iad1` (Northern Virginia); measured responses identify `arn1::iad1` (edge -> function). This is a real region mismatch. Local Europe -> Supabase reads measured around 40–60 ms; these do not measure Virginia -> Supabase RTT. The precise production inter-region contribution cannot be isolated without server diagnostics in that region or a controlled region comparison.

Proposed next configuration experiment, before any production move: compare the same authenticated workload on a Frankfurt (`fra1`) function build against `iad1`, keeping the database, code and freshness unchanged. No Vercel region setting was modified and no preview was deployed in this task. The evidence makes this a priority experiment, not a proven quantified saving.

## JavaScript, PWA and secondary work

One additional route chunk was 25,226 decoded bytes; fetch duration 0–16 ms in the production samples. The route build groups QuickAdd, QuickMove and InventoryList into shared chunks, but only the selected branch renders/hydrates its controls; unopened Add/Remove/Transfer forms are not mounted on the list view. No history query is made by this location list. No evidence supports a bundle split as the main fix here.

Service worker handles Flight as network-only, never stock-cache-first. Both enabled and diagnostic-bypassed runs remained variable; bypass was slower for Bodega and faster for Cas Cat. This does not establish a consistent worker penalty. These are Chromium mobile viewport / service-worker comparisons, **not physical installed Android/iOS PWA tests**. No production PWA behavior was disabled. Permission/subscription setup is absent from normal location navigation. Version checks did not fire in the measured Link transitions.

## Local implementation and before/after

- Start inventory in parallel with the authorized location lookup.
- Return the real location header and Add/Remove/Transfer actions after location/profile validation.
- Stream the fresh inventory list behind its own translated Loading state.
- Put secondary linked-Need suggestions behind another Suspense boundary so they cannot block the inventory search/list.
- Observe an early rejected inventory promise, then propagate the original rejection to the existing route error boundary when consumed.
- Add opt-in static-label DB/proxy diagnostics; no IDs, query values, records or secrets logged.
- No auth shortcut, stale inventory cache, data mutation, RLS change or schema change.

Normal real-data local production build, three observations per location (median):

| Location | Header/actions before -> after | Inventory search before -> after |
| --- | ---: | ---: |
| Bodega | 442 -> 394 ms | 447 -> 397 ms |
| Cas Cat | 411 -> 365 ms | 416 -> 372 ms |

First after-build Bodega sample was 909 ms; it is included in the three-sample median. Samples are small and machine/server warmth varied. This is modest local evidence, not a claim of a production speedup.

150 ms / 1.31 Mbps down / 0.52 Mbps up CDP profile, service-worker bypass for consistent request throttling: Bodega search 410 -> 463 ms; Cas Cat 364 -> 433 ms. **No overall constrained-network improvement established.** Server processing and injected network latency overlap; this tiny-payload test is not a worst-case media test.

Controlled **additional 1,000 ms balance-read delay**, injected by an ignored local Node fetch shim only (not shipped): baseline header/actions 1,562 / 1,444 ms for Bodega / Cas Cat. Warm changed-build header/actions 380–426 / 374–383 ms; inventory remained loading until approximately 1,190–1,252 ms. This verifies usable real navigation controls no longer wait for unavailable inventory. It does not pretend stock data is ready. No production delay injection occurred.

## Verification and remaining limits

Lint, typecheck and production build passed. Full automated suite: 483 passed across 49 files; an additional diagnostics privacy test was then added and checked with the targeted performance suite (19 passed). Full browser suite: 214 passed, 2 intentional skips. Added regression coverage checks that stalled inventory does not block the location shell and that inventory errors still propagate.

No migration required. No deploy/push performed. Production remains `be3eac0`.

Still needed before asserting the real-device problem is resolved: controlled `iad1` vs `fra1` server timing, physical iPhone/Android Link navigation with the user's slow connection, and post-deployment measurements if this change is later approved for release. The measured dominant browser phase is identified; its complete production per-query allocation is not. No unsupported promise of sub-second production performance is made.
