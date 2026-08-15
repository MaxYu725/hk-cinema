# M9E2 — Comparison date-refresh frame-order lock

Baseline before this hotfix:

- `main@93080b3e9b1e522aa3214f15c2a40b7b9aca5f45`
- M9E1 had already removed the visible date-loading row, preserved the live comparison section during the request, and prevented raw Smart Picks from painting white.

## Real-device symptom still observed

On a fast mobile/PWA repaint, the final state was correct but one faint intermediate frame could still show the comparison filter/reset structure above the date rail. The screen therefore appeared to flash once even though before/after geometry tests reported <= 1px drift.

## Cause

The remaining issue is not provider/network data ownership. Phase 8B layout, rich-filter and recommendation decorators rebuild/reinsert structural nodes through MutationObserver / requestAnimationFrame scheduling. During one intermediate paint the DOM insertion order can differ from the final Metro order.

## M9E2 fix

The Metro comparison timeline section now has a CSS-level visual order contract:

1. date rail
2. filter / reset
3. recommendation toggle
4. Smart Picks panel
5. all-showtimes heading
6. filter result summary
7. timeline / empty state
8. explanatory note

The section is a column flex container and each structural child receives a fixed `order`. DOM decorators can therefore reinsert a node on a different animation frame without ever painting filter/reset above the date rail.

While `.m9b-date-loading` is active, structural wrapper animations/transitions are disabled. The active date acknowledgement and 2px progress rail remain available, but wrappers cannot replay entry motion and create a perceived panel flash.

No provider, Worker, Registry, comparison request, filtering calculation or recommendation calculation changes are included.

## Regression gate

`tests/e2e/m9e1-date-loading-stability.spec.mjs` now installs a requestAnimationFrame sampler before changing date. With Worker requests deliberately delayed, it records every painted in-flight frame and verifies:

- date/filter/reset remain present;
- filter is always below date;
- reset is never above its filter container;
- heading never paints before filter;
- structural filter animation is `none` while stale data is displayed;
- existing before/after geometry remains within 1 px.

`tests/m9e2-date-frame-order-lock.test.mjs` enforces the CSS order contract and fresh PWA stylesheet cache key.
