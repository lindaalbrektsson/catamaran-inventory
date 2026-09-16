# Staff password flow — physical-device acceptance

Run on one Android phone (Chrome and installed PWA), one iPhone (Safari and Add to Home Screen), and a desktop browser. Automated Chromium/browser-profile checks are not physical-device verification. Use an actual staff account chosen by the administrator. Never put passwords in test reports, screenshots, traces or chat.

1. ACCOUNT_ADMIN opens More → Users → Add user. Enter name, role, country, phone, language and active status. Enter a temporary password (at least 6 characters; no character-class requirements). Save. Expect a phone-only user and one-time temporary password display. Record only its UUID.
2. Staff enters phone + temporary password. Expect only Create your new password and confirmation. Direct inventory/receipt links must not unlock the workspace before completion.
3. Staff chooses their private password. Expect Home; no administrator can retrieve this password.
4. Close and reopen the installed app. Expect Home without login. Repeat in normal mobile/desktop browser. Repeat after a reload and after the app has been backgrounded long enough to refresh its session.
5. When a real app update is available, use Update now with no unsaved form. Expect the new version and the same signed-in session. Ignoring the banner must not reload an unfinished form.
6. Log out. Reopen. Expect login. Sign in with phone + private password. Expect Home without another first-login gate.
7. ACCOUNT_ADMIN resets this SAME user to a new manually entered temporary password. Expect a one-time display; no old/current-password lookup exists. Existing application tokens are invalidated by the server cutoff.
8. Staff signs in with the new temporary password. Expect the first-login password screen again. Set a new private password and repeat close/reopen.
9. Confirm the UUID, roles, language, assigned Tasks, Documents access, Needs, inventory and receipt history remain attached. Do not invent stock or financial records for testing.
10. Administrator reviews audit: creation, reset, password-gate transitions and activation changes have actor/server timestamps. Passwords, hashes, OTPs and secrets must be absent.
11. Sign in as a normal OWNER or MANAGER. Users and credential administration must be unavailable; direct actions must be rejected.

Record device/OS/browser versions, pass/fail and non-secret error text. Physical-device and genuine staff reset checks remain pending until performed.
