# Performance and low-bandwidth audit — 16 September 2026

The combined release `15134f2f2868a52c70fc300471393cc79b71ad8b` was already deployed when this follow-up was requested. This audit and its fixes are LOCAL on `codex/release-performance`. No production deployment, migration, secret change or business-data mutation was performed.

## Measurements and their limits

Production measurements below used the existing authenticated Codex browser on this computer. They measure automation command start to the expected page content becoming visible; they include browser-control overhead. Single samples are observations, not p95, real-phone timings, or proof of a speedup. Direct page loads and client-link transitions are listed separately because they are not equivalent.

| Flow | Observed production time |
| --- | ---: |
| Existing-session `/login` redirect to Home | 2,267 ms |
| Home direct load | 888 ms |
| Home → Bodega link | 2,743 ms |
| Bodega direct load | 1,296 ms |
| Home → Cas Cat link | 2,760 ms |
| Cas Cat direct load | 865 ms |
| Tasks direct load | 742 ms |
| Tasks → Maintenance link | 1,152 ms |
| Maintenance direct load | 675 ms |
| Maintenance → Today link | 389 ms |
| Today direct load | 977 ms |
| Build today's plan link | 712 ms |
| Planner direct load | 1,120 ms |
| Existing task direct load | 1,631 ms |
| Documents list | 897 ms |
| My tasks / reminders list | 994 ms |

Fresh username/password submission was not timed: the user had already signed in, and credentials were not requested or extracted. Production update/attachment writes were not benchmarked because that would create operational records. The isolated update form used a deliberate 1,000 ms mocked server delay: pending feedback 107–153 ms, saved feedback 1,511–1,593 ms. Those figures measure UI feedback, not Supabase writes or real uploads.

The retained 100 ms independent-read benchmark remains comparable with `PERFORMANCE-REVIEW.md`: prior optimized Home 167–173 ms, location 109–116 ms, Add 110–118 ms, Transfer 105–106 ms. Representative current run: 173 / 107 / 110 / 107 ms. Concurrency remains 5 / 2 / 2 / 3. No scheduling regression established; small wall-clock differences are noise. A new test confirms Home returns its location actions while Tasks/Documents never resolve (120 ms in the same controlled harness).

## Constrained connection

Chromium CDP profile: 150 ms latency, 160 KiB/s down (~1.31 Mbps), 64 KiB/s up (~0.52 Mbps). Emulation, not a physical device. No CPU throttling.

Public production login, 390px viewport, fresh browser context:
- Unthrottled cold: 3,807 ms; later warm loads 499 / 421 ms.
- Constrained cold: 2,668 ms; later cached loads 342 / 300 ms.
- Initial decoded JS observed: 828,240 bytes. This is uncompressed JS across requested chunks, not transfer size.

The first unthrottled request had a 2,964 ms TTFB, compared with 77 ms in the later constrained cold sample. Different cache/server warmth and the tiny sample prevent a causal before/after comparison. Cached repetitions are not slow-network benchmarks. Authenticated production navigation under CDP throttling was not available through the signed-in browser control surface.

Component tests apply the constrained profile after loading the unbundled Vite fixture, then deliberately delay history responses by 700 ms and return a first-request 503. The form remains editable, Loading appears, Retry recovers, Older updates loads a bounded next page, and a failed audio request does not freeze the form. Error feedback measured 1,020–1,033 ms. No history request occurs before opening Updates; no image/audio request occurs before opening/playing media.

An initial attempt throttling the entire development fixture took 86 seconds and timed out on desktop at 90 seconds. That exposed the large unbundled test harness, not a production asset measurement. The test now isolates delayed-data behavior; production cold assets are measured separately above. This distinction is intentional, not a claim that the fixture became a faster production app.

## Findings and local fixes

- **Private file links:** ordinary anchors or disabled Next prefetch prevent attachment routes from being speculatively fetched.
- **Audio:** native players used `preload="metadata"`, which can fetch private audio from every visible update. Changed to `none`; duration comes from verified stored metadata. No recording/decoding library was added.
- **Update history:** initial Maintenance rendering issued one `task_updates` query per occurrence and collected every update. History now opens on demand, 20 rows at a time, through an authenticated private/no-store GET route. A timestamp/UUID cursor keeps paging stable. RLS still decides visibility. Client requests have a 20-second deadline and explicit retry; existing server GET reads have a 15-second deadline.
- **Maintenance:** detail queries are scoped to the chosen task instead of loading the full catalogue. Lists/planner fetch open occurrences only. Detail keeps active work visible and pages completed occurrences in batches of 20. Prior history is not removed. Creating Maintenance now calculates Belize date locally on the server instead of reading four database sources for a date.
- **Home:** Tasks/Documents start in parallel but stream independently; a stalled/failed secondary section no longer holds location actions behind it. Each has loading/error/retry feedback. Locations and Needs count still share the primary parallel read group.
- **Uploads:** photo and voice uploads run concurrently. A bounded, memory-only cache coalesces duplicate sends and avoids resending bytes Storage already accepted when final verification must be retried. Every attempt still performs server validation/finalization. No overwrite, automatic retry loop or weakening of access checks.
- **PWA:** startup/registration/pageshow visibility events could duplicate version requests. Coalesced checks within 30 seconds; normal five-minute checks and hourly worker checks remain. No refresh, permission or subscription check blocks navigation.
- **Hung RPC reads:** added the same 15-second deadline to eight explicitly allowlisted SELECT-only RPCs (people/history/reminder status), which use POST transport. Mutation POSTs are unchanged and never automatically retried.
- **Diagnostics:** retained safe opt-in timings and added `maintenance.catalog` / `updates.page`; static operation names and duration only, no identities/secrets/results.

## Query/media/security review

Profile and locale reads already use React request-scoped caching. Independent Maintenance sources remain parallel. Assignees are resolved from batched people RPC results, not one request per displayed name. New update-history queries use the existing `(task_id, occurrence_id, created_at, id)` index. No migration is required for these changes.

Documents lists use metadata/link text, not image/PDF blobs. Previews open through authenticated file routes. Native audio and MediaRecorder avoid heavyweight browser media packages. ffprobe and Web Push private material remain server-side. Normal navigation does not mount subscription checks; notification permission still requires a user gesture.

Size limits are checked before client hashing/upload: photos/PDF 20 MB, voice 5 MB; recording and server validation enforce 3 minutes. Selected-file/recording feedback is local; forms show a pending state and preserve input on errors. Hashing is asynchronous. Upload success is not inferred solely from client completion: server byte/hash/type validation remains.

Remaining scale/bandwidth considerations:
- Documents and Tasks catalogue lists still collect all permitted metadata. They do not download blobs, but very large catalogues merit server pagination later.
- Legacy text/photo Maintenance updates are batched for the displayed occurrence page; audit RPC histories retain their existing limits. No per-occurrence initial voice-history query remains.
- The authenticated audio proxy currently downloads the stored object before slicing a Range response. Audio is capped at 5 MB, but repeated seeking can repeat server-to-Storage traffic; upstream Range streaming remains a follow-up bandwidth improvement.
- Uploads are not resumable/chunked and show pending feedback rather than byte-percentage progress. At the 20 MB limit a slow uplink can take minutes. An ambiguous lost Storage response can still require a safe retry; the cache only skips confirmed successful uploads, in the same tab. Closing/reloading may require choosing the file again.
- Browser/network failures cannot guarantee a wall-clock deadline for every whole page; reads are bounded individually. No production-scale query-plan or physical-phone CPU measurements were collected.

## Verification

Final verification: lint passed; typecheck passed; production build passed; **481 unit/integration tests passed across 49 files**. Full browser suite: **214 passed, 2 intentional skips**. After the final media-link changes, all **26 relevant Documents/voice/low-bandwidth browser checks passed again**. Whitespace check passed. No migration, push or deployment in this follow-up.

Non-blocking tooling warnings: module-type autodetection in the PWA build script, Playwright color-environment warning and Windows line-ending normalization. One build initially hit a Windows/OneDrive generated-output EPERM; moving only the verified local `.next` output to an ignored artifact folder allowed a clean rebuild. The final build passed.

All generated client chunks combined: 48 chunks in both builds; gzip sum 486,668 → 488,737 bytes (+2,069 bytes, +0.43%). Raw sum 1,653,765 → 1,660,162 bytes. This compares the deployed-release local build with the optimized local build, not a single-route download. No new dependency was added; no ffprobe or private push/admin configuration code was found in client chunks. This small increase supports deferred/paginated reads and safer retry behavior; no oversized media-library addition was found. No older optimized-baseline bundle artifact was available.

## Physical-device follow-up

On one iPhone Home Screen PWA and one installed Android PWA, measure five cold/warm runs on Wi-Fi and mobile data for login/Home, both locations, Maintenance tabs/planner, task/reminder detail and Documents. Note time to usable controls separately from secondary content. Use approved real content for photo/PDF/voice saves; interrupt connectivity, retry, verify one record and preserved input, then play/reopen media. Check keyboard/scroll responsiveness, background/resume and update behavior. Real microphone, background push, actual upload completion and constrained authenticated navigation remain unverified by this audit.
