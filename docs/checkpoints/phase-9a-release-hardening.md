# Phase 9A — Release hardening

Date: 2026-08-10

## Goal

Add a small browser-level release acceptance baseline before visual polish, without changing the current movie-first product flow or provider data behavior.

## Browser smoke coverage

A Playwright Chromium smoke flow now runs at a 390 × 844 mobile viewport against the locally served production app and checks:

- topbar and current/upcoming tabs render
- the movie grid becomes usable with live catalogue data
- a movie card is upgraded to the Phase 8A direct comparison path
- tapping a movie opens the unified comparison overlay
- the comparison sheet/content and close action remain usable
- closing comparison restores the home browsing surface
- current/upcoming tabs remain interactive
- uncaught browser page errors fail the smoke test

The smoke flow is intentionally small. Detailed provider, metadata, filter, Smart Picks, MCL enrichment, seat and shared seat-map behavior remains covered by the existing deterministic regression suite.

## CI

The Pages workflow now:

1. uses Node 22
2. installs the test dependency
3. runs the existing regression suite
4. installs Chromium for Playwright
5. runs the mobile browser smoke
6. deploys only after the full test job succeeds

## Product impact

None intended. Phase 9A does not change production HTML, CSS or application runtime.

## Theme / skin boundary for the final Metro UI challenge

The final Windows Phone / Metro UI direction should reuse the same application and data core rather than fork provider logic.

Planned rule for Phase 9B and later:

- keep movie aggregation, comparison, filters, Smart Picks, seat maps and booking actions shared
- progressively separate visual tokens / presentation CSS from semantic DOM and data behavior
- treat the current design and Metro UI as skins over the same functional contract
- avoid introducing skin-specific provider or business logic

This allows the current interface to remain the stable baseline while a future Metro skin can be developed and compared independently.
