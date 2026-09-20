# Staff provisioning fix — 2026-09-17

Migration: `20260917000500_auth_creation_metadata.sql`.

Root cause: Supabase Admin Auth inserts auth.users, then updates raw_app_meta_data in the same transaction. The deferred INSERT trigger read NEW (the original insert snapshot), missing account_operation. Auth creation succeeded but the operation target remained NULL; finalization failed with INVALID_ACCOUNT_OPERATION. Retrying attempted to create the same opaque email and received HTTP 422 email_exists.

Fix: the existing deferred private.link_created_account trigger function reads the final stored auth.users row by NEW.id. Existing authorization, account-operation validation, first-login gate and server-only finalizers remain unchanged. No frontend deployment is required.

Regression: OWNER and MANAGER phone-free creation tests now reproduce the actual INSERT-then-metadata-UPDATE ordering, verify credential_pending, retry with the same UUID, finish setup and retain must_change_password. Both failed before the migration and pass after it.

Verification: 550 tests in 59 files passed; focused staff suite 36 passed after adding retry assertions. Hosted transaction probe tested both roles, pending gate, same-UUID retry, finalization and RPC grants, then rolled back all probe writes. Migration history matches all 35 local migrations.

The explicitly requested unused Auth user 8deef040-c87c-4288-becb-543d3a6ab2e7 and its profile were removed using Admin Auth after verifying no business history. The latest stale test.owner reservation was released with an audit event; its failed-operation history remains. No real new user was created. Linda, test.manager and QA business records remain unchanged. A real Add User UI retry by the owner remains the final end-to-end confirmation.
