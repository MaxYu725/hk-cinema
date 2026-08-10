# Phase 9B2 — Classic mobile visual polish

## Scope

Polish the existing mobile-first Classic presentation without changing the approved movie-first information architecture or any provider/business logic.

## Presentation changes

- Added `app/phase9b2-classic-mobile-polish.css` as an additive Classic-only layer after the shared theme foundation.
- Tightened home header, tabs, status card and section rhythm.
- Refined two-column movie cards, typography, metadata density and tap feedback.
- Reduced visual weight of the comparison hero while keeping the same content hierarchy.
- Refined the sticky date rail, collapsed filter/recommendation controls and active filter surfaces.
- Reduced Smart Picks card height while preserving the mobile 2 × 2 layout.
- Improved showtime-card density, numeric alignment, booking controls and seat-map affordances.
- Preserved narrow-phone fallbacks at 390px and 360px.

## Skin boundary

All Phase 9B2 selectors are scoped to `html[data-skin="classic"]`. No product runtime was forked and no Metro-specific rule was added. A future Metro skin can therefore supply a separate presentation layer over the same DOM, state and provider core.

## Release protection

- Static regression checks verify stylesheet ordering and Classic-only scope.
- The existing 390 × 844 Playwright release smoke now also verifies:
  - no horizontal overflow on the home viewport;
  - no horizontal overflow inside the comparison sheet;
  - usable tab height;
  - usable comparison close-button touch target.

## Intentionally unchanged

- Broadway / MCL / Emperor data loading
- movie aggregation / variant merge
- Rich Filters behavior and scroll stability
- Smart Picks scoring
- MCL bulk/lazy price enrichment
- seat loading and shared seat maps
- booking URLs/actions
- comparison information order

## Next

After visual acceptance, continue Phase 9B with any targeted polish found during device review, then move to Phase 9C PWA production finishing. Do not start the Metro skin until the Classic production release is stable.
