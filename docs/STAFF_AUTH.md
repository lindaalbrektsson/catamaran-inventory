# Staff onboarding and account security

Phone/password login is the default; email/password remains available. There is no public signup flow. Staff use Belize +501, Colombia +57 or Sweden +46 without needing email.

## Manual configuration boundary — before deployment

Do not deploy this version before both database migrations and the server configuration are ready. Never put an admin key in a NEXT_PUBLIC variable, a browser bundle, an audit record, Git or chat.

1. In the correct Supabase project (`shxbhjpjbaknwukqqqoh`), open **Settings → API Keys** and create a new dedicated **secret key** for the server-side Auth administrator. Use a fresh key, not a key previously shared in chat. Revoke previously exposed secrets after checking other integrations that might use them.
2. In Vercel, open **catamaran-inventory → Settings → Environment Variables**. Add **SUPABASE_AUTH_ADMIN_KEY**, paste that new Supabase secret directly into its value, select **Production**, and mark it Sensitive. Do not send its value to Codex. This key belongs only in `src/lib/supabase/admin.ts` through the server environment. A later deployment picks it up. The two existing NEXT_PUBLIC Supabase variables stay unchanged.
3. In Supabase **Authentication → Sign In / Providers**, disable **Allow new users to sign up** and anonymous sign-ins. Keep email/password available and enable Phone authentication. Set the minimum password length to 12. Configure SMS directly in Supabase if using OTP verification; the app's admin flow requires the administrator to verify phone ownership before confirming the number. Local `supabase/config.toml` does not change hosted settings.
4. Review and apply in order `supabase/migrations/20260911000700_staff_auth.sql` and `supabase/migrations/20260911000800_account_admin.sql`. Announce each file before applying it. Check the linked project and `supabase db push --linked --dry-run` first. Run `supabase migration list --linked` afterward. Do not run seed data against production as part of onboarding.
5. Bootstrap only Linda's existing, verified Auth UUID as ACCOUNT_ADMIN. In Supabase Auth Users, identify Linda's existing account and copy its UUID. In SQL Editor, replace the placeholder below with that UUID, verify the query returns Linda's existing active OWNER profile, then run the transaction. Do not create a replacement user or infer permissions from a display name. David and Patricia remain OWNER without this capability; their operational access is unchanged.

```sql
select id, display_name, role, active, account_admin
from public.profiles where id = '<LINDA_EXISTING_AUTH_UUID>'::uuid;
```

```sql
begin;
select set_config('request.jwt.claim.sub', '<LINDA_EXISTING_AUTH_UUID>', true);
update public.profiles set account_admin = true
where id = '<LINDA_EXISTING_AUTH_UUID>'::uuid
  and role = 'OWNER' and active and not must_change_password
  and not credential_pending;
-- Must affect exactly one verified profile. Otherwise ROLLBACK and investigate.
select id, display_name, account_admin from public.profiles where account_admin;
commit;
```

The bootstrap is an explicitly authorized administrative assignment; the existing profile audit records before/after values and the designated user UUID. Routine capability changes go through `set_account_admin`, which authorizes the acting user and protects the last usable account administrator.

## Daily workflow

On desktop, Linda opens **More → Staff accounts → Add user**, fills name, role, phone country/number, language and active status, and confirms she verified the phone belongs to the staff member. The server creates a phone-only Auth user with a cryptographically random temporary password and completes the profile with `must_change_password=true`.

The password appears once in ephemeral page state. Copy it for manual delivery with the production link through WhatsApp. Done, leaving the page or hiding the tab clears that display. It cannot be recovered from the app; issue a fresh reset if it was lost. No WhatsApp messages are sent automatically. Never capture a screenshot or trace containing an actual temporary password.

Staff sign in using their number and temporary password. They see only **Create your new password / Crea tu nueva contraseña**, with password and confirmation fields. The workspace, operational RPCs and receipt storage remain blocked until a trusted Auth password update clears the gate. A rejected update does not unlock access.

For a reset, choose the existing user and **Reset password**. It generates a new random password, blocks access during the operation, restores the first-login gate and invalidates earlier application JWTs using a server timestamp cutoff. Auth password changes also revoke refresh sessions. A login attempted within the first second after reset may require retrying once.

For a lost SIM or changed phone, verify the person and the new number, then choose **Change login phone** on the existing user. The Admin API updates that same UUID. Roles, language, assignments, inventory, receipts, needs and audit history stay attached. Reset the password separately if recovery requires it. Phone audit values contain only the last four digits.

Only an active, fully onboarded OWNER with ACCOUNT_ADMIN can use account/profile administration. Other OWNERs retain desktop operations; MANAGER/CAPTAIN/CREW cannot administer accounts. Authorization is checked in server actions and database RPCs, not just navigation.

## Failure handling and operational limits

Auth Admin API and application SQL are separate transactions. A private operation record stores only UUIDs, kind, server time and completion state. Existing targets are blocked while credentials are being changed; new users start inactive. Concurrent attempts are rejected. No password is stored in this operation record.

If an operation fails or its response is lost, do not blindly create another account, clear a pending flag or repeatedly reset credentials. Stop and ask the authorized server administrator to inspect the matching `private.account_changes` operation and Supabase Auth outcome. Verify no earlier request is still running. The service-only `release_account_change` may then release the operation lock for a retry using the same request UUID; `finish_account_change` completes an already verified Auth change. These are recovery tools, not browser-callable shortcuts. If a completed password response was lost, use a new reset operation after resolving pending state. Pending access deliberately stays blocked until recovery finishes.

An administrator making direct dashboard identity changes bypasses the application's actor attribution workflow. Use the app for routine changes; investigate external changes through Supabase Auth admin logs. The application's create/reset/phone initiation and completion events carry the authenticated ACCOUNT_ADMIN actor and target UUID, and profile edits have before/after audit data.

## Verification and rollout

Local tests exercise phone/email credentials, password gates, server-only admin calls, denied roles, creation, resets, UUID-preserving phone updates, stale JWT denial, masked audit values and capability protection with isolated Auth/database fixtures. They do not send SMS or create production users.

After manual configuration, apply and verify the migrations, assign Linda's capability, deploy the tested commit, then verify with an explicitly approved real staff account. A successful local suite is not proof that hosted Phone Auth or admin configuration works. Staff enter their own new password privately; do not record browser traces or screenshots of real credential entry. Check production login, gated routes, first password change, operational access and masked audit events. Production resets and phone changes require a real authorized account-maintenance request.

References: [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Auth sessions](https://supabase.com/docs/guides/auth/sessions).
