# Phone authentication transition — 2026-09-14

Hosted phone authentication is enabled; public signup is disabled. Phone confirmations remain required. No SMS credentials were added or SMS sent. Configuration was applied through Supabase CLI with only three declared Auth properties; unrelated hosted settings were preserved.

Migrations 20260911000700_staff_auth.sql and 20260911000800_account_admin.sql are applied. The existing active Owner has been assigned ACCOUNT_ADMIN, preserving the Auth UUID. There is still only one Auth user. No staff accounts were invented.

This transition release deliberately retains the Email option until Linda has attached her phone on Users and successfully tested phone/password login. The normal default is Phone, with +501, +57 and +46. Do not remove Email before that confirmation.

On desktop: More → Users. On Linda's existing card choose Change login phone, enter country and national number, verify ownership, then save. This changes the same Auth UUID and preserves the password. Open a separate private browser window to test phone/password login while keeping the current signed-in session open. Never share passwords in chat.

After successful live phone login, remove the normal email selector and run the checks again. Staff can then be provisioned via Add user; temporary passwords are displayed once. Only ACCOUNT_ADMIN can administer credentials. Operational owners are not automatically account administrators.

Smart Scan and SMS recovery are excluded from this release. No OpenAI key or paid service is required. Live staff creation/reset and real-device lifecycle checks remain pending user participation; automated tests use isolated fixtures.
