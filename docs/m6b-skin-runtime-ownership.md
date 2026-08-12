# Phase M6B — skin runtime ownership checkpoint

This checkpoint removes two remaining presentation/runtime ownership overlaps without changing the accepted Metro UI.

## Sticky ownership

- `phase9d0-home-sticky-scroll.js` is now explicitly Classic-only.
- The Classic sticky runtime owns both `is-stuck` and `is-stuck-latched` state.
- Sticky collapse selectors in `home-library.css` and `phase9d0-home-sticky-scroll.css` are scoped to `html[data-skin="classic"]`.
- Metro no longer removes Classic sticky classes or forces `display: grid` from JavaScript.
- Metro no longer needs a scroll listener purely to counter the Classic sticky implementation.

The underlying home catalogue/search/sort behavior is unchanged.

## Filter interaction ownership

- `phase9b3-filter-compact.js` remains the shared compact-group decorator and no longer checks the active skin.
- It exposes `closeActiveGroup()` as a neutral control surface.
- Metro-only behavior—closing a floating filter after an option/change/outside tap—now lives in `metro-runtime.js`.
- The shared provider filter engine still processes filter selections; Metro only controls the presentation lifecycle of the floating menu.

## Boundaries

No provider requests, parsers, showtime normalization, recommendations, prices, seat loading or seat-map logic changed. Classic remains available through `?skin=classic`. Service Worker activation/cache policy remains unchanged.
