# Navigation / Back

The workspace layout supplies a single localized Back control on secondary routes,
including Inventory, Items, Tasks/Maintenance, Documents, Receipts, staff/settings,
Cashflow and nested Need/Add forms. Home, Add hub, Need list and More retain the
existing primary navigation. Page headers and desktop-only notices suppress their
own Back controls when the workspace already supplies one. Public Install and the
root error boundary also have an escape route.

The root client boundary tracks only observed same-origin browser history entries.
Back uses Next router.back() when a valid predecessor is present; otherwise it
replaces the current route with Home. Login, setup, pending-account, password-change,
Auth and API routes are not useful predecessors. The private history marker lives
in history.state alongside (without replacing) Next's router state. It survives
refresh, follows browser Back/Forward, and retains the predecessor when filters use
replaceState. No session/auth storage, database reads or server permissions change.

Browser coverage includes the shared workspace/page-header components in an isolated
fixture at mobile and desktop sizes: direct secondary routes, refresh, filtered-list
return, replace/forward, primary navigation, Spanish and error recovery. Public Install
also exercises the real production-build Next router. These are automated browser
checks, not physical-device or authenticated production verification.

The iPhone Safari Share-menu installation investigation remains paused. This change
does not alter installation handlers, manifest, service worker or deployment.
