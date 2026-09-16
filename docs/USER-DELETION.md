# Safe staff deletion (not deployed)

Production schema inspected read-only on 2026-09-16. `profiles_id_fkey` uses NO ACTION from profiles to auth.users, so deleting an Auth user with a profile is blocked. `account_changes_target_id_fkey` then blocks deleting an app-created profile first. Other restrictive profile FKs protect transactions, receipts, tasks, documents, purchases, Needs and audit history.

Pending migration: `20260916000300_safe_user_deletion.sql`. No existing business FK or RLS policy is weakened. Its before-delete Auth trigger removes unused profile/setup records in the same transaction as the Auth deletion. Direct Dashboard deletion of a historical user remains rejected deliberately; use the application to deactivate while preserving the UUID, Auth account and all history. Selected document access and Storage ownership are also treated conservatively as history.

The app checks ACCOUNT_ADMIN both server-side and in its authenticated preparation RPC, prevents self/admin deletion, invalidates operational access before calling the server-only Admin Auth delete API, and preserves all audit events. A failed Auth deletion leaves the account blocked and supports retry. No production user was deleted for testing.

Partial creation: Auth/profile insert triggers are transactional. If Auth creation succeeds but finalization fails, the server releases the operation lock after the request settles. The form retains its request ID and displays retry instructions. Re-entering the temporary password retries the linked UUID. A full page reload loses the in-memory request ID; the incomplete account stays blocked and can be removed with Delete user before creating it again. No current or temporary password is stored in application tables or audit events.

User creation and reset now require manually entered temporary passwords only. No generator or generation options remain. The previously verified Supabase minimum is 6 characters without character-class requirements. First-login password replacement and session/security gates are unchanged.
