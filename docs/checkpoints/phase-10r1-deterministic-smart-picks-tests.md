# Phase 10R1 — Deterministic Smart Picks tests

## Baseline

- Base commit: `5759e7603f1bf9f7bd82464b640cbd3d897cb1e1`
- Scope: test determinism only

## Change

`tests/phase8d-smart-picks.test.mjs` now defines one fixed clock (`2026-08-10T07:23:00Z`) and passes it to every Smart Picks recommendation build exercised by the test suite.

This removes dependence on the real current Hong Kong date/time while preserving the existing Smart Picks production implementation and recommendation rules.

## Explicitly unchanged

- `app/provider-compare-recommendations-v4.js`
- Smart Picks scoring, eligibility and fallback behavior
- UI / comparison layout
- provider data logic
- Service Worker / PWA update behavior

## Acceptance

Before merge, the PR must pass the repository regression suite and Chromium mobile smoke workflow. The branch must remain a direct descendant of the declared baseline.
