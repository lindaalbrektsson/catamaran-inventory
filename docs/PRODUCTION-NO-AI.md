> Updated rollout status: see [Phone Auth transition](PHONE-AUTH-TRANSITION.md). The Auth configuration and migrations described below have now been applied; email remains temporarily available until Linda verifies phone login.

# Production release without Smart Scan

Production main contains the verified operational application. Smart Scan remains
committed on codex/smart-scan and codex/auth-recovery, and is deliberately absent
from the production source/build. Do not merge those branches wholesale.

Run `node scripts/verify-no-ai-release.mjs <build-directory>` before a production
release. It checks source and the generated route manifest without reading keys
or contacting AI providers. Do not add OPENAI_API_KEY, enable Smart Scan, apply its
migration, or make AI/OCR calls during this rollout.

## Auth boundary verified 2026-09-12

Hosted Auth reports phone authentication disabled, email enabled, public signup
enabled, and anonymous users disabled. Vercel project configuration has only the
public Supabase URL/key; the private Auth administrator key is not configured.
Current production login is email/password. Persistent SDK sessions are enabled.

The remaining Auth/account/SMS implementation is retained in development, but is
not production-ready until the operator completes the configuration described in
STAFF_AUTH.md and SMS-RECOVERY.md on that branch. Do not deploy its migrations or
account-administration UI prematurely. No staff accounts, resets, phone changes,
SMS messages or capability assignments were made in this verification.

Manual actions:
1. Supabase → Authentication → Sign In / Providers: disable Allow new users to
   sign up; leave anonymous sign-in disabled and email/password available.
2. Enable Phone and configure the phone provider privately if phone login/SMS
   recovery is required. Keep rate limits and password safeguards enabled.
3. For the implemented account-administration rollout, configure a fresh dedicated
   Supabase server secret privately in Vercel as SUPABASE_AUTH_ADMIN_KEY, Sensitive,
   Production. Never send its value in chat. This is not an OpenAI key.
4. Confirm configuration before migrations 20260911000700_staff_auth.sql and
   20260911000800_account_admin.sql and Linda's explicit ACCOUNT_ADMIN bootstrap.
   These older pending migrations require a newly reviewed ordered dry-run.

## Verification limits

Database integration tests use isolated fixture records and actors. Browser tests
use automation/emulation. Signed-in live checks are read-only using the existing
Owner session. There is only one real Auth user; no real Manager login or stock,
receipt, document or financial records are invented for QA. Physical iPhone and
Android lifecycle/camera behavior still requires the existing real-device checklist.
