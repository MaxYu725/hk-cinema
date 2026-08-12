# Phase M6B — seat-map style layer fold

Checkpoint 4 reduces one proven Metro CSS ordering dependency without changing the accepted seat-map UI.

## Consolidation

- `metro-m4b-seat-scroll-fix.css` contained one Broadway-only row-label guard.
- It was loaded immediately after `metro-m4-seat-view.css`, so its responsibility belongs to the same Metro seat-map presentation surface.
- The M4B rule is copied unchanged into the end of `metro-m4-seat-view.css`.
- The separate M4B stylesheet and its production `<link>` are retired.
- The consolidated seat-map asset is versioned as `metro-m4-seat-view.css?v=m6b-4`.

## Preserved contract

The Broadway wide-map guard keeps the same selector and values: only scrollable Broadway maps receive the opaque 34px row-label gutter, `z-index: 8`, matching `#060606` background and 8px trailing cover.

No provider requests, parsers, showtime normalization, filter engine, recommendations, prices, seat inventory, seat-map rendering data, booking URLs or Metro runtime behavior changed. Classic fallback and Service Worker activation/cache policy are unchanged.

## Scope discipline

This is intentionally a narrow cascade reduction. Other legacy and Metro styles remain loaded until their production responsibilities are separately identified and regression-covered; no stylesheet is removed merely because of its phase name or age.
