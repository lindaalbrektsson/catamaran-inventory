# Four-field staff creation — local, not deployed

Add user shows only Display name, Username, Role, Temporary password. ACCOUNT_ADMIN authorization is unchanged: an Owner without this capability cannot create Auth users. Both OWNER and MANAGER can be selected as the new user's role.

New users default to active and inherit the creating admin's language. Existing profile administration can change these later. Username uniqueness, normalization, opaque internal email and forced first-password change are unchanged.

CREATE ignores obsolete submitted phone/country/verification values; phone parsing is restricted to the separate existing-account CONTACT action. No phone or phone_confirm is sent to Auth Admin. finish_username_creation receives p_contact:null; this is already permitted by the deployed RPC and does not require a phone value or uniqueness check. No additional migration is required for this change. The two pending migrations in this batch concern Documents and Push only.

Legacy phone identities and historical masked audits are untouched. Existing contact maintenance, resets and recovery are not removed. No production Auth calls or mutations were used to test creation; isolated Auth API mocks and PostgreSQL fixture tests cover provisioning, first-password gates, duplicate aliases and historical references.

Changed files for this request:
- src/components/account-form.tsx
- src/lib/account-actions.ts
- tests/account-actions.test.ts
- tests/e2e/staff-auth.spec.ts
- tests/staff-auth.test.ts
- docs/PHONE-FREE-ONBOARDING.md

Combined local verification: lint, typecheck and production build passed; 399 automated tests passed. Browser suite: 176 passing checks and two expected skips after correcting a test-only Role locator and rerunning all 22 staff-auth browser checks. No production user was created, reset or modified.
