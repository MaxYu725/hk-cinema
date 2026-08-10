# Phase 9B3 — Date rail + compact filter UX

## Scope

Polish the approved Classic comparison flow without changing filter semantics or provider/business logic.

## Problems addressed

1. Phase 9B2 Classic specificity made the selected date card white while its inherited active text remained white, hiding the selected date label.
2. The mobile date rail did not reliably pin to the true top edge of the comparison sheet on device; showtime cards could remain visible above it while scrolling.
3. The expanded Phase 8C filter panel exposed every chip at once, especially the long district list, making the panel unnecessarily tall.

## Changes

- explicitly restore selected date contrast as dark surface + white text
- independently mark the Hong Kong current date with a small `今日` badge
- move mobile comparison top spacing from the scrolling sheet to `#providerCompareContent` so sticky positioning uses the real scrollport top
- make the date rail an opaque, high-z-index sticky layer at `top: 0`
- add a Classic-only compact filter controller
- keep all existing Phase 8C filter buttons/select as the actual controls
- present filter categories as summary rows and allow only one category body to be expanded at a time
- keep the selected value visible in each collapsed row
- cap the long district body height and scroll it locally when necessary
- preserve existing active-filter chips, reset behavior and immediate filter application

## Intentionally unchanged

- provider catalogue/showtime loading
- Phase 8C filter matching, sorting and option semantics
- filter preference persistence
- Phase 8D Smart Picks scoring
- Phase 8D1 filter scroll-stability safety layer
- MCL price/seat enrichment
- seat maps and booking actions
- comparison information order

## Regression coverage

- selected date cannot regress to white-on-white
- `今日` is calculated in `Asia/Hong_Kong`
- sticky date rail uses true sheet top and opaque coverage
- compact filters reuse existing filter controls and keep a single-open group state
- Playwright verifies selected-date contrast, computed sticky state and compact-group behavior on the 390 × 844 mobile release viewport

## Metro boundary

The new CSS remains scoped to `html[data-skin="classic"]`. The compact controller only decorates shared functional controls; a later Metro skin can restyle or replace this presentation without forking Phase 8C filtering logic.
