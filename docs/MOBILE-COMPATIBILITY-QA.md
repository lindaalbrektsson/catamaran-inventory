# Mobile compatibility review

Release checks: lint, typecheck and production build passed; 247 unit/integration
tests passed; 107 normal browser checks passed (3 desktop-only mobile skips);
61 compatibility checks passed (1 documented WebKit offline-emulation skip).
The broader local branch including pending account features separately passed
299 tests, 119 normal browser checks and 73 compatibility checks.

## Evidence and scope

This is automated browser emulation and source/visual review, **not real-device
certification**. No physical iPhone, iPad or Android device has been tested by the
agent. Browser engine coverage is Chromium and Playwright WebKit on Windows;
WebKit is useful Safari-engine coverage but is not iOS Safari itself.

The dedicated suite covers widths 320, 360, 375, 390, 412, 430, 768, 1024 and
1440px. It reviews Spanish operational screens (longer labels), horizontal
overflow, clipped button text, bottom-navigation clearance, 320px login,
landscape 844×390, a reduced 320×360 viewport, 16px input fonts, long item names,
and file-picker opening/preview. A reduced viewport approximates available space;
it does not reproduce a real OS keyboard or browser toolbar.

Additional engine checks exercise Add, Need linking/duplicates, Tasks, receipt
preview/error/retry, public-route protection, PWA metadata/offline behavior,
and session recovery after closing and reopening a persistent browser profile.
Recovery and staff-auth tests exercise the pending local implementation with
isolated transports; they do not send SMS or update live credentials.

## Findings

- Fixed long unbroken item names causing horizontal scrolling in Add suggestions
  at 320px. Operational page content now permits wrapping within long words.
- Corrected the Documents search label in English and Spanish. Increased inverse
  branding/login-panel text opacity: the checked solid-background contrast rises
  from 4.04:1 / 4.38:1 to 5.14:1.
- Standard location, stock, Need, Tasks and Documents layouts fit the requested
  sizes. Desktop Owner document administration remains intentionally unavailable
  on mobile; the mobile boundary gives a return action.
- The app uses inline forms/disclosures and scrollable suggestions rather than
  full-screen operational modals. Long content must remain scrollable.
- Safe-area CSS covers top/left/right, navigation bottom padding, and workspace
  bottom clearance. Actual notch/home-indicator/browser-chrome interaction is
  pending hardware verification.
- Camera controls invoke an actual browser file chooser and declare rear-camera
  capture. Real camera permission/UI, lens choice, image orientation and iOS
  HEIC handling are still hardware checks. Supported upload types remain
  JPEG/PNG/WebP; unsupported files receive validation feedback.
- Primary controls use 44–48px minimum heights; navigation targets are larger.
  Input text stays at least 16px to avoid common iOS focus zoom. Physical keyboard
  occlusion, largest OS text settings and contrast perception need manual review.
- Calculated theme contrast: white on primary 6.42:1, muted text on background
  4.84:1, foreground on white 12.91:1, primary on secondary 5.54:1. These checked
  pairs exceed 4.5:1; this is not a full accessibility certification of every state.
- Existing update behavior requires an explicit reload and preserves an unsaved
  form until the user chooses to update. Private/authenticated content is not
  placed in the public service-worker offline cache.
- Windows WebKit's `context.setOffline` navigation produced an internal engine
  error. That simulated-navigation case is explicitly skipped in WebKit. A separate
  test runs the actual production worker against a local server that drops network
  connections: the translated offline page and recovery pass in both engines.
  This is browser automation, not a real-device airplane-mode test.

## Reproduce

Build with a unique QA output name (PowerShell):

```powershell
$env:NEXT_QA_BUILD='1'
$env:NEXT_QA_RUN='mobile-review'
npm run build
npm run lint
npm run typecheck
npm test
npm run test:e2e
npx playwright install webkit
npx playwright test --config=playwright.compat.config.ts
```

Use the same NEXT_QA_RUN for build and browser server. The normal browser suite
excludes the compatibility matrix to avoid duplicating it. The matrix uses both
engines; no real account/session secrets are written to traces.

The production release excludes pending account-security/SMS features until their
manual configuration and migrations are ready. For that release's compatibility
run set `COMPAT_RELEASE=1`; this explicitly omits pending recovery/password form
views. Do not interpret an omitted flow as a live pass. Phone/SMS/first-password
production verification remains blocked by that separate rollout.

Complete [the real-device checklist](REAL-DEVICE-CHECKLIST.md) on one iPhone and
one Android, then iPad if available. Record model/OS/browser, app commit and
individual outcomes. A pass on those devices is not a guarantee for every model.
