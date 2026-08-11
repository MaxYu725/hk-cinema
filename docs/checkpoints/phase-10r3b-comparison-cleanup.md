# Phase 10R3B — Comparison cleanup

Base: `6cbeb041955a0944b59858b2372f857c63f840a4`

## Scope

Comparison page only. The Phase 10R3A home layout is intentionally unchanged.

## Changes

- Move the comparison provider-health disclosure from above `#providerCompareContent` into the comparison content, immediately before the first comparison section once the movie hero is available. This keeps the poster/movie identity at the top while retaining expandable provider diagnostics.
- Keep the mobile date rail sticky but remove its grey backing/shadow/pseudo-layer so the rail visually belongs to the white comparison surface.
- Remove the grey wrapper around the compact filter bar while preserving the actual filter/reset controls.
- Reset the Smart Picks mobile grid away from the legacy horizontal `grid-auto-flow: column` contract to a normal two-column row flow, preventing overlapping/oversized recommendation cards.
- For today's Hong Kong date, recommendation candidates must start strictly after the current Hong Kong minute. A session at exactly the current minute is no longer eligible for cheapest/earliest/roomiest/balanced picks.

## Product boundaries

No home-page behavior changes.
No Worker, provider parser, ticketing, seat-map, price-fetching, booking, service-worker update semantics, or PWA caching changes.

## Validation

- `tests/phase8d-smart-picks.test.mjs` includes a same-minute exclusion case.
- `tests/phase10r3b-comparison-cleanup.test.mjs` locks the comparison placement, surface cleanup, mobile recommendation grid, and strict future-time contract.
- Full repository regression and Chromium mobile smoke must pass before merge.
