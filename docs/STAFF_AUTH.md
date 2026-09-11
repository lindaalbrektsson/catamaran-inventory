# Staff authentication and manual administrator boundary

The application uses only the public Supabase URL/publishable key with authenticated sessions. No Auth-admin credential or browser-side account-creation endpoint is configured. There is no public registration page or signup call. Owners can manage existing profile names, roles, preferred language and active status in desktop **More → Staff accounts**. Auth identity creation and phone recovery require an authorized Supabase administrator. Do not collect temporary passwords in a form that cannot securely provision the account.

## Hosted settings (manual)

In Supabase **Authentication → Sign In / Providers**, turn **Allow new users to sign up OFF**. Keep anonymous sign-ins OFF. Keep email password login enabled. Enable the Phone provider and configure the SMS provider directly in Supabase when phone verification is needed. Local `supabase/config.toml` already disables signup; applying migrations does not change hosted Auth settings. Do not disable verification to work around an unconfigured SMS provider.

## Provision a staff account

Apply the reviewed migration and deploy the matching app before following these provisioning steps. Do not create staff accounts during the settings-only setup step.

1. An existing OWNER authorizes the staff member and intended role. Names never determine permissions.
2. An authorized Supabase administrator uses Auth Users / the trusted server-side Auth Admin API to create the account using phone in E.164 format, a unique temporary password and optional email. Phone-only accounts are supported by the Admin API. Countries: Belize +501, Colombia +57, Sweden +46. If the dashboard offers only email creation, stop and use an approved secure Auth Admin mechanism; never invent an email or write directly to Auth tables. This repository intentionally contains no administrative key or account-creation API.
3. Verify phone ownership through the configured verification process; do not mark a number confirmed without verified ownership. Enter the temporary password only in the secure administrative tool; never save it in profile metadata, comments, screenshots, chat or audit. Deliver it privately to the staff member.
4. New profiles default to inactive CREW and `must_change_password=true`. In the app, an OWNER finds the exact newly created UUID under Staff accounts and sets name, role, English/Spanish preference and active status. If an administrator sets/resets the temporary password after account creation, set the profile flag back to true in the trusted administrator workflow before activating the account. Do not change existing account flags indiscriminately.
5. Staff signs in with Phone + password or Email + password. The only workspace entry is the new-password screen until Auth successfully changes the password. Use at least 12 characters. A trusted trigger clears the profile flag only after the Auth password hash changes. No client RPC or user metadata can clear it. RLS/RPC permissions remain blocked while pending, even if the staff member bypasses the UI.

## Phone change and recovery

Verify the requester's identity outside the app. Locate the existing Auth UUID, then use the trusted Auth admin update operation for that UUID to update the phone, with verification where required. Do not create a replacement user or copy history. Phone/email uniqueness remains managed by Supabase Auth. Role, language, permissions, assignments, inventory, receipts and audit references retain the same UUID.

The Auth update trigger records only masked old/new numbers in the public audit, never full phone numbers or hashes. Dashboard/admin changes may have no end-user JWT actor; consult Supabase Auth administrator logs for administrator attribution rather than inventing an actor. The target UUID remains recorded. A password reset by an administrator must re-enable the first-login flag before reactivating access.

## Migration / deployment boundary

Review `supabase/migrations/20260911000400_staff_auth.sql`, then apply through the linked Supabase CLI only after confirming the project and dry-run list. The migration preserves existing users' password-gate state as false and defaults new accounts to true. It adds no users and changes no existing role or identity. It restricts `private.current_role`, audits masked phone changes and provides the OWNER-only `manage_staff` RPC with last-owner protection. Do not deploy application code that expects this column before applying the migration.

No actual staff identities, password resets or phone changes should be executed as QA data in production. Use isolated tests; live phone login/first-password setup require a real approved staff account and manual Auth configuration. Supabase may enforce recent-login/reauthentication and password policies; the screen returns an error rather than opening the workspace when the change fails.

References: [Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Auth settings](https://supabase.com/docs/guides/auth/general-configuration), [Password authentication](https://supabase.com/docs/guides/auth/passwords).
