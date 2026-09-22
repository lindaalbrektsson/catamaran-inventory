# QA-ready release — 22 September 2026

Scope: Explicit Test Data plus account-specific Add User validation errors.
Baseline: main 91e1b8366af2357220a2bd811b7187d05a0cc3a9. Admin Setup complete /
Last login from 1c69aa0 and Spanish Por comprar remain unchanged.

Verification of this combined candidate:
- lint passed; typecheck passed; production build passed.
- 642 automated tests across 68 files passed.
- full configured browser suite: 354 passed, 2 skipped (desktop-only checks on
  the mobile project). These are automated browser checks, not physical devices.
- no obvious secret patterns in changed/new source; no configuration/env changes.

Production migration: only 20260922000300_explicit_test_data.sql was applied.
All 39 local/remote migration versions match; none pending or unexpected.
Before migration, 795 schema objects matched the 38-migration baseline; afterwards,
857 objects matched the complete 39-migration schema. Comparison normalizes CRLF
and PostgreSQL-version-specific NOT NULL catalog representation; nullable/default
column definitions are compared separately.

No account/Auth migration or destructive cleanup was executed. Six user/profile
accounts remain. test.manager has no profile or username reservation. Existing
records have zero true is_test flags. Cleanup queue is empty.

Concurrent real app use: David created an ordinary product/stock movement at
21:02 UTC before migration at 21:04 UTC. That record remains is_test=false.
Auth metadata also changed before migration while the existing session was used.
All 272 audit events present in the initial snapshot retain identical contents;
new app activity was preserved. No user/account/password/role write was performed
by this release task, and no business record was created/deleted for smoke QA.

Hosted staging was unavailable. The user explicitly approved Production rollout
with this limitation. Actual hosted Storage failure/retry, late upload races and
simultaneous dependency/deletion operations remain manual QA on disposable TEST
records. Do not describe local PGlite or browser fixture coverage as hosted proof.
Physical iPhone/Android capture, offline/interrupted actions and notifications also
remain manual QA. Existing records must never be reclassified for those tests.

Production smoke results and the exact deployment/commit are provided in the
release conversation after deployment. The committed source is the candidate
that passed the checks above; only release documentation was updated afterwards.
