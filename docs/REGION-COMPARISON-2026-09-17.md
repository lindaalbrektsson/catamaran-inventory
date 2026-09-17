> Historical implementation/measurement record. Current release readiness is documented in RELEASE-CANDIDATE-2026-09-17.md. This file does not authorize deployment.

# Vercel region comparison — 17 September 2026

Production was not changed. No migrations, business writes, account changes or cleanup were performed. Application source was not modified for this experiment.

## Method

Two protected previews used identical uploaded source files, the current local streaming fix and other existing local UX changes. Base commit: be3eac063584179db2c179701b79407b1e8099dd; these previews also include uncommitted changes and should not be described as that commit alone.

- iad1: https://catamaran-inventory-3vqzn07ct-lindaalbrektssons-projects.vercel.app
- fra1: https://catamaran-inventory-q977tqnjc-lindaalbrektssons-projects.vercel.app
- Vercel deployment metadata verifies the respective function regions. All uploaded source hashes match; generated deployment outputs differ.
- Same Frankfurt Supabase project shxbhjpjbaknwukqqqoh, same existing authenticated Linda session, publishable client, JWT/profile checks and RLS. No privileged database client.
- Preview-only performance logging, no AI/admin/push-dispatch credentials supplied. Production variables and scheduler unchanged.
- Twelve alternating rounds, both locations per region: 48 samples. Fresh Home navigation before each location click. Existing prefetch behavior retained; timing selects the actual non-prefetch location RSC response. Service-worker bypass applied equally.
- Every sample returned HTTP 200, MISS and private/no-store. Server logs confirm 12 fresh reads of each measured table per location/region.
- Desktop Chromium, 390×844 viewport, Stockholm ingress (arn1). Not real-phone or Belize-network testing.
- Initial harness samples were discarded after a Playwright response-finished wait problem. Final run uses completed browser resource timing entries.

## Results

Milliseconds: **median (minimum–maximum)**; 12 samples per cell. RSC metrics start at request initiation. UI metrics start at the actual click; usable means the location heading/actions or inventory search/list is visible after client navigation.

| Location | Metric | iad1 | fra1 |
|---|---|---:|---:|
| Bodega | RSC TTFB | 285 (267–513) | 127 (97–162) |
| Bodega | RSC total | 936 (706–1302) | 215 (167–250) |
| Bodega | After headers | 583 (368–964) | 77 (64–120) |
| Bodega | Header/actions usable | 836 (823–1381) | 335 (316–840) |
| Bodega | Inventory usable | 924 (832–1389) | 339 (319–843) |
| Cas Cat | RSC TTFB | 445 (267–1415) | 121 (100–182) |
| Cas Cat | RSC total | 998 (673–1415) | 204 (162–247) |
| Cas Cat | After headers | 604 (1–772) | 82 (60–123) |
| Cas Cat | Header/actions usable | 837 (820–1870) | 830 (340–840) |
| Cas Cat | Inventory usable | 1080 (830–1873) | 835 (344–846) |

The median RSC improvement is about 721 ms (77%) for Bodega and 794 ms (80%) for Cas Cat. Inventory-ready improves about 585 ms (63%) and 245 ms (23%), respectively.

True cold starts were not controlled: Home/authentication and diagnostic requests can warm an instance. These are repeated fresh-data navigations with potentially warm functions/assets, not guaranteed cold-start measurements. All 12 samples are included; ranges expose variability.

The result also holds after excluding the first sample:

| Location/region | First RSC total | Subsequent 11 median (range) |
|---|---:|---:|
| Bodega / iad1 | 1302 | 930 (706–1231) |
| Bodega / fra1 | 240 | 213 (167–250) |
| Cas Cat / iad1 | 879 | 1061 (673–1415) |
| Cas Cat / fra1 | 247 | 202 (162–246) |

## Individual server-to-Supabase reads

Milliseconds, median (range), 12 reads per cell. These measure the HTTP/database service round trip, not pure wire RTT. Logs yielded 24 distinct location requests and 336 static timing entries per region; all extracted outcomes were OK.

| Location | Read | iad1 | fra1 |
|---|---|---:|---:|
| Bodega | Profiles | 139 (110–320) | 20 (15–39) |
| Bodega | Locations | 129 (114–335) | 23 (15–36) |
| Bodega | Products | 136 (112–365) | 24 (17–37) |
| Bodega | Categories | 123 (110–194) | 25 (15–54) |
| Bodega | Balances | 162 (121–330) | 25 (18–40) |
| Bodega | Purchase needs | 146 (112–338) | 20 (18–37) |
| Cas Cat | Profiles | 132 (108–315) | 19 (16–34) |
| Cas Cat | Locations | 132 (119–326) | 27 (15–49) |
| Cas Cat | Products | 126 (111–395) | 22 (19–42) |
| Cas Cat | Categories | 135 (115–353) | 23 (16–55) |
| Cas Cat | Balances | 169 (113–327) | 25 (17–34) |
| Cas Cat | Purchase needs | 129 (112–338) | 20 (16–34) |

Estimated avoided inter-region overhead: roughly 100–145 ms per read, about 110 ms for most catalog/profile reads. Parallel reads overlap; do not sum all read durations. This is an estimate from application measurements, not a network ping.

Frankfurt materially improves both server workloads. Some UI samples still cluster around 0.83 seconds despite an approximately 0.2-second RSC response. Browser/router/render scheduling remains a separate bottleneck; its exact cause was not established here. Region placement alone does not guarantee sub-300ms interactive pages.

## Operational implications

| Area | Implication of a future fra1 release |
|---|---|
| Scheduler | Supabase pg_cron remains unchanged, calling the same production dispatch URL once per minute. No migration, Vault change or schedule change needed. |
| Push | Dispatch moves with the function. Bearer authentication, VAPID keys, subscriptions, deduplication and timeouts stay intact. Provider network latency may differ. No preview dispatch was triggered. |
| Uploads | Direct browser-to-Supabase document/receipt/task/maintenance uploads retain their path. Reservation/finalization, validation and server-mediated upload/download routes move to Frankfurt. Limits, private storage and RLS remain unchanged. |
| Auth | Same Supabase identity, JWT/JWKS checks, session refresh and production origin. A region change alone does not invalidate cookies or change UUIDs. This tested an existing session, not new login/password entry. |
| Environment | Existing production variable values remain valid. No key regeneration or new region-specific secret is required. Diagnostic logging need not be enabled in production. |
| Other routes | Global region applies to SSR, server actions, API handlers, file routes, Excel and dispatch unless overridden. No preferredRegion override was found. Static assets stay on the CDN. |
| Tradeoffs | Belize/US users are farther from Frankfurt compute, which can hurt routes with little database work and server-mediated uploads. Regional pricing/capacity can differ; check the account rate card. Single-region availability remains a tradeoff. |

## Exact configuration and recommendation

Add this property to the existing vercel.json, then redeploy:

```json
"regions": ["fra1"]
```

No database migration is required. Do not add iad1 alongside fra1 for this goal: nearest-region execution could retain cross-Atlantic database reads. File configuration overrides the project region default. Reference: [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region).

This experiment used deployment-only --regions flags. The working-tree vercel.json and production settings remain unchanged.

Recommend releasing the reviewed streaming fix and fra1 together as a small performance release, with separately reviewable changes. This experiment validates that combination. Streaming exposes authorized controls before secondary reads; Frankfurt shortens the underlying reads. Neither requires relaxed RLS or stale data. Do not bundle unrelated unfinished UX merely because it was identical in both previews.

Belize real-device navigation, uploads, session refresh and notifications still need verification after a separately authorized release. Cold-start and failover behavior were not established.

## Production and evidence

Production still points to dpl_DcWGx9YYwpPwC4asq8tUZ4Tu3L8p, https://catamaran-inventory-aetwuelv7-lindaalbrektssons-projects.vercel.app, in iad1. No production deployment occurred.

Ignored measurement artifacts: region-benchmark-results.json, region-iad1-server-timings.json, region-fra1-server-timings.json, deployment evidence and source manifests. Both preview builds passed compilation/type checking. Existing full application tests were not rerun for this configuration-only experiment.

Preview protection stayed enabled. The authorized Vercel CLI created an automation bypass credential for testing; its value and browser session cookies were not exposed in this report.
