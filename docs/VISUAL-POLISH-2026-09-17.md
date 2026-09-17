> Historical implementation/measurement record. Current release readiness is documented in RELEASE-CANDIDATE-2026-09-17.md. This file does not authorize deployment.

# Catamaran Belize visual polish — local review

Not deployed. No production database or configuration changes. This pass builds on the existing uncommitted Complete Mobile UX Pass; it does not replace it.

## Visual changes and before/after

- Categories: previously text-only with names/active editor; now optional curated icon/accent, bilingual live preview, native icon selector and labeled radio swatches. Existing Owner-only administration remains unchanged.
- Items and Bodega/Cas Cat lists: small category marks support scanning while names remain primary. Category filter options remain native text options for accessibility. No extra category fetch.
- Inventory quantities: low red, running-low amber, healthy normal, unconfigured muted. Existing text status chips and tabular numerals remain. Applied to list, detail and Owner overview.
- Location cards: blue Cas Cat boat marker, warm Bodega warehouse marker, subtle card depth; primary actions retain the brand green. Matching restrained header/transfer cues use location type, not category names or user identity.
- Home: low-contrast CSS sea-lines beside the Home heading, soft Need/receipt/Task/Document icon containers. No new statistics or reads.
- Streamed content: row-shaped CSS skeletons for inventory, secondary Need content, Home Tasks and Documents. Existing Suspense and parallel loading remain intact; no delay added.
- Empty states: shared compact icon/title/optional hint treatment for Inventory, Need, Tasks, Maintenance, Documents and Receipts. No extra CTA where page actions already exist.
- Interactions: 120ms border/background/shadow feedback on selected controls and interactive inventory/location/Items cards. Existing global reduced-motion rules disable animations/transitions.
- Documents remains Documents; Frequently used stays automatic and user-scoped. No Favorites controls added.

## Category schema and fallback

Pending, unapplied migration: `supabase/migrations/20260917000100_category_visual_metadata.sql`.
Adds nullable `icon_key` and `accent_key` with CHECK whitelists. No backfill, category recreation, rename, active-state update or RLS change. Existing category audit trigger records metadata changes. Apply before deploying the new category editor, after separate approval.

Icons: Package, Wrench, Waves, GlassWater, LifeBuoy, SprayCan, UtensilsCrossed, Cog, Hammer, Box, ShoppingBasket, Droplets. Explicit static imports and key mapping; no arbitrary component lookup or remote icon downloads.

Accents: neutral, teal, blue, sand, amber, coral, slate, green. Null/missing/unknown metadata displays Package/neutral. Colors are decorative and do not override semantic status tones.

## Accessibility

Palette foreground/soft-background contrast: neutral 5.62, teal 5.88, blue 5.96, sand 5.19, amber 6.12, coral 5.42, slate 5.94, green 6.16 (ratios to 1).
Bodega uses #865b25 on #f6ecd9 (5.07:1); Cas Cat #1f6f8c on #e4f1f5 (4.90:1).
Low quantity on white 8.31:1; warning 6.63:1; muted 5.16:1.
Icons are decorative/aria-hidden with visible text preserved. Swatches have text and native radio selection. Skeleton announces translated loading once, hiding decorative bars. Focus indicators and touch targets remain. Existing light theme explicitly declares light color-scheme; no dark theme is introduced. Reduced-motion/dark-preference viewport checks exercise fallback rendering.

## Performance and network

No new runtime network/API requests for decoration, no new dependencies, remote assets or hydration boundary. Existing client lists reuse category data; the existing category upsert now carries two optional keys. Skeletons render server-side; preview state lives in the already-client category editor.
Aggregate .next/static/chunks JavaScript: previous local artifact 1,660,162 raw / 488,737 gzip bytes; final build 1,724,658 raw / 511,339 gzip bytes (48 files both). Delta +64,496 raw / +22,602 gzip across the complete build, not per page. This is an artifact comparison, not a controlled route-specific network benchmark. Icons and translations have a nonzero bundle cost; no zero-byte claim. Location streaming regression tests remain part of the automated suite.

## Verification

- Lint: passed.
- Typecheck: passed.
- Production build: passed.
- Automated SQL/unit/action tests: 515 passed across 55 files. Category creation/edit, nullable legacy values, whitelist rejection, audit and Manager denial included.
- Full Chromium mobile/desktop suite: 270 passed, 2 intentional skips, 4 trace-file cleanup errors caused by concurrently running WebKit with the same output directory. All four affected viewport checks passed when rerun with an isolated output directory: 274 unique passing checks in total. No unresolved test failures. An earlier run also exposed an overly strict new dropdown test selector, corrected before the final run.
- Focused WebKit emulation: 5 passed, including category preview/save controls in EN/ES, 320/360/390/430px, reduced-motion and dark OS preference.
- Broader viewport checks cover 320, 360, 375, 390, 412, 430, 768 and 1440px in EN/ES.
- Browser preview: page renders, no browser errors reported. Measured additional network requests after changing category name/icon/accent: 0.
- git diff --check: passed (line-ending normalization notices only).

Logs: artifacts/visual-polish-{lint,typecheck,build,tests,browser-final,browser-recheck,webkit}.log.
Build warning: existing PWA build script emits Node MODULE_TYPELESS_PACKAGE_JSON; no package module-mode change made in this visual-only pass. Browser tools emit NO_COLOR/FORCE_COLOR notices; no application failure.

Browser fixtures isolate business writes; no QA records were added to production. Emulation is not physical-device testing.

## Screenshots

Local fixture screenshots: `artifacts/visual-polish-category.png`, `artifacts/visual-polish-locations.png`, `artifacts/visual-polish-inventory.png`. These show isolated fixture content, not new production records. The category fixture shares the inventory harness heading.

## Files in this pass

New: category-visuals.ts, category-mark.tsx, list-skeleton.tsx, category metadata migration, category-visuals.test.ts, visual-polish.spec.ts, this report.
Updated: globals.css, database.types.ts, catalog-actions.ts, i18n.ts, category-editor.tsx, empty-state.tsx, inventory-list.tsx, global-items.tsx, location-cards.tsx, page-header.tsx, quick-move.tsx, transfer-form.tsx, product-overview.tsx, owner-inventory.tsx, document-list.tsx, task-list.tsx, maintenance.tsx, Home/location/Need pages, expense empty states; documents database tests and UI fixtures.

## Release blockers outside this visual pass

The preceding independent review identified authenticated media-finalization validation bypasses and terminal push failures/abandoned claims. This task did not change those mechanisms or claim to resolve them. Resolve/review them before production approval. Migration remains unapplied. Physical phone rendering/camera/push/session checks remain manual. No deployment or push performed.
