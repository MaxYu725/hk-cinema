# Phase 10B1 — Metro Comparison Panorama / Pivot Foundation

## Scope

Phase 10B1 starts the Metro conversion of the movie comparison surface without forking the established comparison engine.

## Acceptance

- Metro comparison opens as a full-screen black Panorama surface with safe-area-aware spacing.
- The existing movie identity remains at the top and is restyled as a Metro Panorama header.
- A Windows Phone-style Pivot exposes three destinations: `場次`, `推薦`, and `篩選`.
- `場次` is the default Pivot and retains the existing date rail, showtime ordering, price, seat and booking actions.
- `推薦` reuses the existing Smart Picks recommendation panel rather than creating a second recommendation engine.
- `篩選` reuses the existing rich-filter panel and filter state.
- Pivot buttons support touch/click plus Left/Right/Home/End keyboard navigation.
- The comparison close control becomes a Metro back-arrow while retaining the original close lifecycle.
- Classic remains the default route and does not create the Metro Pivot runtime.

## Safety boundary

No Broadway, MCL or Emperor provider parsing, movie matching, comparison fetching, freshness rules, ticket price logic, seat-map logic, booking URLs, recommendation scoring, rich-filter state, PWA lifecycle or Service Worker behavior is changed.

Phase 10B2 should polish the individual Pivot contents (showtime density, recommendations and rich filters) after this navigation foundation passes Node regression, Chromium mobile smoke and real-device validation.
