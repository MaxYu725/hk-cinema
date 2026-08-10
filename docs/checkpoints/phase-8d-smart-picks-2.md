# Phase 8D checkpoint — Smart Picks 2

## Goal

Replace the legacy recommendation mix with four simple, mobile-first recommendations that consume the already-filtered Phase 8C timeline without inventing missing data.

## Completed in this checkpoint

- recommendation panel now targets four categories:
  - lowest price
  - earliest upcoming showtime
  - roomiest reliable seat map
  - best balance
- recommendations only consider showtime cards that remain visible after the active Phase 8C filters
- on the current Hong Kong date, already-started sessions are excluded from Smart Picks
- lowest-price recommendation only uses rows with a reported price
- roomiest recommendation only uses trustworthy `available / total` seat data
- best-balance scoring prefers rows with complete price, seat and time data
- full best-balance weights are:
  - price 45%
  - available-seat ratio 35%
  - earlier time 20%
- if there are not at least two complete rows, best balance can degrade to:
  - price + time (70% / 30%)
  - seat availability + time (70% / 30%)
- if fewer than two rows can be compared on a reliable pair of dimensions, best balance is hidden instead of guessed
- recommendation categories with insufficient evidence are hidden rather than rendered as fake placeholders
- the panel reports partial price / seat coverage so data limitations remain visible
- the recommendation engine refreshes when seat summaries, filters, dates or the current Hong Kong minute change
- tapping a recommendation still scrolls to and highlights the underlying native showtime card

## Mobile behaviour

- four available recommendations render as a 2 × 2 grid on phones
- the former full-width balanced recommendation rule is overridden for Phase 8D
- one surviving recommendation falls back to a single-column card
- the panel remains collapsed by default through the Phase 8B recommendation toggle

## Compatibility boundary

- Phase 8C merged-variant loading and rich filters are unchanged
- Phase 7B seat-map and official-booking contracts are unchanged
- the legacy `provider-compare-recommendations-v3.js` remains in the tree for rollback and older regression fixtures but is no longer loaded by `index.html`

## Validation

- `provider-compare-recommendations-v4.js` is syntax checked by `npm test`
- deterministic tests cover:
  - 2 × 2 mobile wiring
  - exclusion of already-started sessions today
  - all four recommendation categories with complete data
  - best-balance fallback to price + time
  - hiding best balance when there is not enough reliable evidence
