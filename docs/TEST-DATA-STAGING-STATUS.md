# Test data staging verification — blocked, 22 September 2026

Production project: shxbhjpjbaknwukqqqoh. The accessible Supabase project list
contains only this production project; preview branch list was empty.
Docker is not available locally for a full local Supabase stack.

Attempted an isolated micro preview branch named test-data-verification in
Frankfurt, without --with-data and without a Git branch integration.
Supabase rejected creation with HTTP 402, entitlement_required: branching
requires Pro or above. No branch was created. No migration was applied.
No production users, passwords, roles, business data or configuration changed.

Required next step: provide an isolated Supabase staging project (empty, no
production data/users/media), or enable branching through the account billing UI.
Do not send secrets in chat. A project reference is sufficient to identify it.
No paid plan change was made by the agent.

Pending real-service checks: migration application, all supported module creation/
deletion, real RLS roles, mixed dependency blocking, stock actions/merge guards,
current/replaced/unfinished Storage files, failures and lease recovery, concurrent
references/uploads/deletion, scheduler/push regression and Admin activity checks.
None of these is claimed verified against a hosted staging service.

Previous local baseline: lint/typecheck/build passed, 635 automated tests across
68 files and 114 browser checks passed. These do not substitute for hosted tests.
Physical iPhone/Android upload, notification and confirmation QA remains pending.

At that earlier stage, Production rollout was paused pending staging. The user has since explicitly approved the documented Production verification alternative.
The Test data branch is codex/explicit-test-data, based on main commit
1c69aa072a0a06adf897ec3cc2102b2b27221199. The subsequent combined release explicitly includes the separately approved account-error mapping changes.

Historical status superseded: the user subsequently authorized careful Production
rollout without staging. See QA-READY-RELEASE.md for that release's verification.
