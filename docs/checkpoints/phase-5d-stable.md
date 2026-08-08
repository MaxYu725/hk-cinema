# Phase 5D Stable Checkpoint

Date: 2026-08-08

Recovery branch: `checkpoint/phase-5d-stable`

## Verified stable scope

- Broadway + MCL matched movie comparison
- Common sale dates and merged cross-provider showtime timeline
- Adult ticket price comparison
- Broadway seat availability
- MCL lazy seat-summary loading with normalized totals
- Smart Picks: cheapest, loosest seats, balanced recommendation
- Provider filters: All / Broadway / MCL
- Region filters: All / Hong Kong Island / Kowloon / New Territories & Islands
- Cinema registry and cinema-specific filtering
- Time-period filters: All day / Morning / Afternoon / Evening
- Sorting: Time / Price / Seat availability ratio
- Recommendation jump-to-showtime highlighting
- Mobile cinema picker portal with scroll-vs-tap gesture handling
- Cinema show counts synchronized with selected time period

## Recovery

If later Phase 5E work causes a regression, compare or restore from:

`checkpoint/phase-5d-stable`

This branch intentionally preserves the last user-verified Phase 5D state.
