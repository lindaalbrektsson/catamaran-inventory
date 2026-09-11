# Real-device acceptance checklist

**Not yet executed on real devices.** Complete once on an iPhone and once on an
Android phone. Record model, OS version, browser version, app commit, date, tester,
and Pass / Fail / Blocked for each row. Repeat on an iPad when available; passing
one iPhone does not certify every iPhone or iPad model.

Use https://catamaran-inventory.vercel.app. Use genuine approved stock actions and
receipts, or an isolated test environment. Never invent production quantities or
financial records. Do not share or record passwords, OTPs or temporary passwords.

## Install and open

| Device | Exact steps | Expected result |
| --- | --- | --- |
| iPhone | Open in Safari → More / How to Install. Use Safari Share → Add to Home Screen → Add. Launch its icon. | Clear iOS instructions, no dead native Install button. App opens standalone, without a browser address bar. |
| Android | Open in Chrome → use Install app when available; otherwise Chrome menu → Install app / Add to Home screen. Launch its icon. | Installation prompt works when supported; otherwise visible guidance. App opens standalone. |
| Both | Also open the site in the normal browser. Rotate portrait/landscape. | Both contexts remain usable. Installing may require one separate sign-in; it must not require a new login on every reopen. |

## Repeat these flows on each phone, in browser and installed app

| Flow | Exact steps | Expected result |
| --- | --- | --- |
| Phone login | Select country (+501/+57/+46), enter your registered number and password, Sign in. | Home opens for an active staff account. No signup action. **Blocked until account-auth rollout is configured.** |
| Temporary password | Use a specifically provisioned/reset test account. Try opening Home before changing its password. Enter a new password twice, then save. | Only password-change screen is accessible first; invalid/mismatched passwords do not unlock it. Successful change opens Home. |
| Persistence | Sign in, close the app completely, reopen; repeat after at least 65 minutes and next day. | Still signed in unless the session was legitimately revoked or site data was cleared. |
| Offline resume | Background app, enable airplane mode, reopen, then restore connectivity and retry. | Honest offline/error feedback; reconnect succeeds without an unnecessary logout. No stock actions are silently queued. |
| Logout | More → Sign out. Close and reopen. | Login required. On a separate browser profile, clearing site data also requires login. |
| Forgot password | Tap Forgot password, enter your registered number, request SMS, enter code, then new password and confirmation. Try an incorrect code first. | Incorrect code fails; valid code proceeds; app opens only after successful save. Lost SIM instructions point to Linda. **Blocked until SMS provider and feature flag are configured.** |
| Add stock | Home → Bodega → Add → type an existing item → choose it → enter an approved quantity → Save. Repeat from Cas Cat. | Correct location preselected; clear quantity and one save; stock and history reflect exactly one action. |
| New item | Add → type a genuinely new approved item → Create → category → quantity → Save. | No separate product/configuration screens; spelling stays under user control; no clipped suggestions. |
| Remove | Home → location → Remove → select item → approved quantity → Save. Attempt a quantity above available stock without confirming any valid action. | Correct deduction and history; excessive removal rejected clearly. |
| Transfer | Home → Bodega → Transfer → item → approved quantity → Save; test reverse when operationally appropriate. | Source decreases, destination increases, both histories agree; no duplicate save. |
| Correction | Open the saved movement/history and use the available Undo/correct flow for an authorized correction. | Compensating action recorded; original history retained. |
| Store receipt camera | Home → Receipts → Add receipt → Store receipt → Take photo. Allow camera permission, photograph an approved receipt, select payment method, upload. | Camera opens on hardware; readable preview; exactly one private receipt saved with correct payment method. |
| Fuel receipt/gallery | Add receipt → Fuel receipt → Choose image; choose a real image, select payment method, upload. | Gallery opens; correct preview and saved file. Test a large photo and cancel/reselect. Unsupported HEIC/other formats must show a clear error; use JPEG/PNG/WebP if needed. |
| Camera denied/cancelled | Deny camera access or cancel the picker, then choose an existing image. | App remains usable; no blank/dead form or accidental upload. |
| Need to Purchase | Home → Add need → search/select existing item (or use an approved unmatched need) → Belize/USA → Save. | Linked item retained; Pending shown; existing active linked need prevents duplication. List and optional photo/link work. |
| Tasks | Home → Tasks → Add task → title, assignee, due date, optional reminder/subtasks → Save. Change status and complete a subtask. | Correct assignee/date/status; in-app due indicators; completion/audit preserved. No promised external notification. |
| Documents | Home Favorites → open a permitted document → back → See all → filter. Download a permitted PDF/image. | File opens/readable, back works, download works; inaccessible files remain denied. If no real document is uploaded, mark Blocked rather than inventing one. |
| Keyboard | Focus names, quantities, phone, password, comments and task dates. Type, scroll to Save, dismiss keyboard, rotate. | No unintended input zoom; focused field, suggestions and Save remain reachable; bottom navigation does not block them. |
| Notch/chrome/scroll | Scroll each long form to top/bottom with browser controls expanded and collapsed; repeat in standalone and landscape. | No clipped controls, content under notch/home indicator, unwanted horizontal scrolling, or trapped scrolling. |
| Disclosures/lists | Expand optional details and open long Add suggestions; use largest normal text size. | Contents can scroll/wrap; no oversized overlay that prevents dismissal or Save. |
| App update | Leave an unsaved form open while a new version becomes available. Observe update notice; finish or deliberately discard input before tapping Update. Reopen app. | No forced reload erases input; explicit update loads current commit; authenticated pages and private files are not served from stale offline cache. |

For a failure, record the row, device/OS/browser, portrait/landscape, browser vs
installed mode, and exact reproduction steps. A screenshot may show layout, but
must not contain credentials or private receipt/document content.
