# Phase M6B — Shared UI ownership checkpoint

This checkpoint reduces two production ownership ambiguities identified by the M6A audit without changing the accepted Metro or Classic presentation.

## Changes

- `shared-final-controls.js` now owns the tab-count badges and comparison heading sort control for both skins.
- Existing DOM classes/data hooks are retained so current Classic and Metro CSS render exactly as before.
- `classic-final-ui-polish.js` is reduced to its actual Classic-only behavior: opening Classic Data Health triggers refresh; Metro keeps the existing guard.
- `phase10r3a-mobile-shell-date-strip.js` now exits early for Metro homepage Data Health placement.
- `metro-runtime.js` remains the sole Metro owner that moves home Data Health into the four-control row.

## Boundaries

- no CSS geometry, colors, typography or interaction redesign
- no provider/parser/showtime/recommendation/seat changes
- no Service Worker activation/cache policy change
- no removal of Classic fallback

## Remaining M6B items

- replace Phase 8B movie-fact parsing from rendered `.movie-meta` text with stable aggregate/view-model metadata
- review sticky/filter skin branching only after the shared-control ownership checkpoint is stable
