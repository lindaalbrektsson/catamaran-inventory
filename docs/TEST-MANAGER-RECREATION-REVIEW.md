# test.manager recreation investigation — 22 September 2026

Read-only production queries found no profile with username test.manager, no
username reservation, no Auth user for the former UUID
32a47dc1-ff66-48e0-9d39-cf5be120556f, and no account-change operation targeting
that UUID. No Auth metadata/operation mapping for that username was found.
Nine historical profile audit entries mentioning test.manager remain untouched.
Four unfinished CREATE operations have null target and no username reservation;
these cannot be attributed to test.manager from their current state. They do not
reserve this username. They were not modified or deleted.

The current SQL format rule and application schema both allow test.manager.
The reservation/profile uniqueness checks find no current username conflict.
A fresh request has no existing-request conflict to replay.

Confirmed error-display defect: accountChange returns shared INVALID_INPUT for
form schema, empty name, unsupported role, invalid username/contact or target.
AccountForm renders the shared dictionary key, whose EN/ES text is specific to
inventory quantity/reason. Those form-validation returns happen BEFORE the
username RPC and Supabase Auth creation. Database errors from the begin RPC are
mapped to accountChangeFailed, not this inventory message.

The original failing submission was not captured. Its rejected field and any
underlying SQLSTATE cannot honestly be reported as observed. Username-only failure
was not reproduced: a normal mocked creation with exactly test.manager succeeds.
The user reports using a fresh form and typing the username manually. No production
creation was attempted, because it would change account state.

Local fix: a restricted account-error type and field-specific EN/ES messages for
name, username, role, language, form identity and optional contact. A backend
USERNAME_UNAVAILABLE now maps to a specific reserved/assigned-username message.
No credential, role, first-login, UUID, Auth or reservation behavior changed.
No production cleanup or schema migration is proposed on current evidence.

Focused tests: 40 passed across account actions and Admin activity. Includes exact
test.manager success, invalid-field errors before any RPC, reserved-username
mapping, unknown backend validation mapping, existing permission/reset/retry flow.
The test containing an invisible character demonstrates validation only; there
is no evidence that the user entered such a character.

Before deployment: browser checks of field-specific EN/ES errors and fresh/retry
forms, full regression/build, preservation of Setup complete / Last login, then
a user-driven fresh Add User attempt if approved. Capture only the resulting
error category; never passwords or complete request bodies.
