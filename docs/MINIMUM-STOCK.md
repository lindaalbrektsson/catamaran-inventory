# Mobile item settings

Owner and Manager can create items inline from Add: name, category, unit,
optional minimum, quantity. Location is retained when launched from a location.
Existing stock Add keeps its item/quantity flow and never changes thresholds.

Item detail → Edit item supports name, category, unit, optional minimum/target,
and active/inactive on mobile. Location is fixed to the detail being edited.
No explanatory metadata text, cost, notes, or extra creation screens are needed.

Unit changes remain blocked once transaction history exists or stock is nonzero.
This avoids reinterpreting historical quantities; zero-stock items without
transactions may change unit. Names and other settings retain the stable UUID.

Migration `20260912000100_mobile_item_settings.sql` introduces quick_add_item,
allows active Owner/Manager configure_item/configure_inventory, and provides
scoped item_change_history. Captain/Crew are unchanged. Broad audit access stays
Owner-only. Item history exposes only operational fields and server timestamps.

All stock goes through change_stock. Creation/configuration audits preserve the
actor, product ID, before/after values and server timestamp. Normal UI deactivates
items; audit update/delete/truncate protections remain intact.

Below-minimum items retain the manual linked Need action and active-Need duplicate
protection. Current 4 / target 12 suggests 8. No Need is created automatically.

Release is independent of the pending Smart Scan and Auth migrations.

CLI production deployments supply the public commit identifier with
`--env APP_RELEASE_VERSION=<git HEAD> --build-env APP_RELEASE_VERSION=<git HEAD>`.
This is not a secret. It keeps the update banner consistent when Vercel Git
metadata is empty. Git deployments continue using VERCEL_GIT_COMMIT_SHA.

Owner/Manager location lists include an Inactive view so deactivated items remain
reachable for history review and reactivation. Captain/Crew do not gain this view.
