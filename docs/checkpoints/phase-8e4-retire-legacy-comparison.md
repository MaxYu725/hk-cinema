# Phase 8E4 — Retire legacy comparison runtimes

Date: 2026-08-10

## Goal

Remove superseded comparison JavaScript that is no longer loaded by production while keeping the historical regression coverage attached to the current Phase 8 stack.

## Retired runtimes

- `app/provider-compare-v3.js`
- `app/provider-compare-insights-v3.js`
- `app/provider-compare-preferences.js`
- `app/provider-compare-recommendations-v3.js`

Production already uses:

- `provider-compare-v4.js`
- `provider-compare-insights-v4.js`
- `provider-compare-preferences-v2.js`
- `provider-compare-recommendations-v4.js`

## Regression migration

Phase 6L / 6M / 6N / 6O and Phase 7A tests now validate the equivalent behavior against the current comparison stack rather than loading superseded runtime copies.

The migration preserves checks for:

- native showtime cards and separated booking / seat-map actions
- stable mutation-observer behavior
- compact mobile comparison layout
- active filter visibility and recovery
- MCL language/date refinement fallback
- current Rich Filters and Smart Picks integration

## Intentionally retained

`provider-compare-main-cache-v3.js` and `provider-compare-resilience-v3.js` remain because they are still loaded by production. `provider-compare-v3.css` also remains production-loaded and is not part of this cleanup.

## Product impact

None expected. This checkpoint removes repository-only historical JavaScript and updates tests; it does not alter the production comparison data flow, filters, Smart Picks, MCL price enrichment, seat loading, seat maps, or booking actions.
