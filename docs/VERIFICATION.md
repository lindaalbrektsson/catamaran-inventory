# Local verification — 2026-09-09

Story: an authorized staff member chooses a location and product, records a stock addition/removal, and sees the new balance plus an immutable movement attributed to their account.

| Boundary                        | Result       | Evidence                                                                                                                          |
| ------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Local project and Git           | Pass         | Next.js and Git use the opened folder; initial commit `deca987` on `main`.                                                        |
| Missing Supabase setup          | Pass         | Protected inventory route redirects to translated setup page. No sample stock is displayed.                                       |
| UI interaction                  | Pass locally | Isolated component tests exercise product search, category/low-stock filters, Spanish form errors and retry-ID/input persistence. |
| Schema, grants and RLS          | Pass locally | Actual SQL migration executed in PGlite with authenticated/anonymous roles and owner/manager/captain/crew/inactive profiles.      |
| Atomic stock changes            | Pass locally | Add/remove, decimal quantities, negative-stock rejection, before/after history, audit attribution and retry protection.           |
| Immutability and escalation     | Pass locally | Direct balance edits, history deletion and self-promotion are rejected.                                                           |
| Translation coverage            | Pass         | Matching dictionaries, domain-label coverage and source scan for literal JSX/accessible-label text.                               |
| Mobile/desktop                  | Pass locally | 390px phone and 1440px desktop checks; no horizontal overflow, 44px controls, screenshots visually reviewed.                      |
| PWA                             | Pass locally | Manifest is served and both PNG icon sizes exist.                                                                                 |
| Hosted Auth and PostgREST       | Pending      | No Supabase project has been provisioned.                                                                                         |
| Independent-session concurrency | Pending      | Requires hosted/local full PostgreSQL connections; PGlite serializes statements.                                                  |
| Vercel deployment               | Pending      | Configuration exists; no project was deployed.                                                                                    |

Commands: `npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`.

Browser outputs and traces are local ignored artifacts. Tests under `tests/ui` use fixture inventory solely for component verification. Production data access never imports those files. Future-module tests (purchases, transfers, counts, reimbursements) will be added with the corresponding implementation.

## Live acceptance checklist after Supabase setup

1. Sign in as an active owner; check an inactive user sees the activation page.
2. Add 24 units to a zero balance, remove 3, and confirm 21 remains after reload.
3. Confirm both movements and their audit events identify the signed-in user.
4. Reject a removal of 22 without changing the 21-unit balance or adding history.
5. Retry the same request UUID and payload; confirm only one movement exists.
6. Submit competing removals from separate sessions; confirm the balance never becomes negative.
7. Sign in as a captain/crew member and confirm only their assigned location is accessible, including direct URLs and RPC calls.
8. Verify owners/managers can see the applicable movement actors, and that language persists after signing out/in on another browser.
9. Change a minimum threshold through the owner RPC, then confirm the low-stock alert appears and resolves after replenishment.
10. Verify session refresh, sign-out, mobile Safari/Chrome forms and Vercel preview/production environment isolation.
