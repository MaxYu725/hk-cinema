# Phase M6B — final presentation/runtime architecture map

Baseline reviewed: application checkpoint `4736d445e1ea7f7f236ab11ddb9c69c2f2b19366` after PR #73.

M6B started from the M6A audit because the accepted Metro release had several hidden cross-skin owners and late patch layers. Checkpoints 1–5 removed the proven ownership/cascade risks without changing provider, showtime, price, seat, recommendation or accepted visual semantics.

## Final ownership map

### Shared/core behavior

These remain deliberately skin-neutral and are not candidates for Metro-only consolidation:

- `phase8a-movie-navigation.js` — movie aggregation/navigation and structured aggregate facts.
- `phase8b-comparison-layout.js` — shared comparison structure; consumes aggregate facts rather than rendered homepage metadata.
- `phase9b3-filter-compact.js` — shared compact filter structure/state API only.
- `shared-final-controls.js` — shared homepage tab counts and comparison sort control.
- provider comparison, recommendation, price and seat modules — data/interaction semantics.
- shared seat-map renderer/normalizer — provider-neutral seat rendering/data contract.

### Classic-only final behavior

- `classic-final-ui-polish.js` — Classic Data Health expand-to-refresh behavior. It explicitly exits that path for Metro and no longer creates shared tab/sort controls.
- `phase9d0-home-sticky-scroll.js` — Classic buffered sticky/latch behavior. Non-Classic skins receive only a no-op compatibility API.
- `phase10r3a-mobile-shell-date-strip.css` — final Classic shell/date/filter presentation.
- `phase10r3a-mobile-shell-date-strip.js` — Classic Data Health placement plus shared selected-date centering; both Data Health placement functions explicitly return for Metro.

The Phase 10 runtime is intentionally retained because `centerSelectedDate()` is shared behavior while the placement helpers are Classic-scoped. Moving it only to reduce phase-file count would not improve ownership.

### Metro global/home layer

`metro-theme.css?v=m6b-5`

Owns:

- Metro tokens, black fullscreen/mobile shell and global square styling.
- homepage pivot, search/sort, filter/status controls and movie cards.
- PWA notice presentation.
- the accepted M2 real-device homepage polish, now consolidated at the end of the same owning stylesheet.

The former `metro-m2-home-polish.css` layer was removed in Checkpoint 5.

### Metro comparison shell layer

`metro-m3-comparison.css?v=m3-1`

Owns the general comparison surface:

- fullscreen comparison sheet/navigation.
- movie hero/date rail/general comparison hierarchy.
- resilience/status positioning presentation.
- showtime-card base Metro styling.

It does not own shared filter state, recommendation calculation, provider matching or seat data.

### Metro filter presentation layer

`metro-m3-filter-matrix.css?v=m3-filter-3`

Owns the accepted 3x3 anchored filter presentation:

- matrix ordering/geometry.
- tile summaries.
- floating option-body positioning.
- Metro dropdown visual states.

The actual compact structure/state API remains in `phase9b3-filter-compact.js`; Metro close/outside-tap interaction policy remains in `metro-runtime.js`. This separation is intentional and no longer mixes skin policy into the neutral decorator.

### Metro Smart Picks/showtime compatibility layer

`metro-m3-smart-picks.css?v=m3-picks-2`

Owns:

- Smart Picks 2x2 presentation.
- recommendation-card presentation and jump highlight.
- the final showtime-heading layout needed to coexist with the shared sort control/provider count.

This file touches the comparison surface, but it is not a redundant copy of `metro-m3-comparison.css`: its selectors are tied to the recommendation/Smart Pick feature and the corresponding showtime-jump compatibility. M6B therefore keeps it as a distinct feature boundary.

### Metro seat-map layer

`metro-m4-seat-view.css?v=m6b-4`

Owns:

- fullscreen Metro seat-map shell.
- summary/legend/screen/seat-state presentation.
- provider booking-button presentation.
- horizontal wide-map behavior.
- Broadway-only row-label scroll guard.

The former `metro-m4b-seat-scroll-fix.css` patch layer was folded here in Checkpoint 4. Seat parsing, totals and provider-specific seat data remain outside this stylesheet.

### Metro runtime

`metro-runtime.js?v=m6b-3`

Owns Metro-only DOM/presentation synchronization:

- theme/labels and pivot/sort wording.
- Metro home Data Health placement.
- Metro comparison navigation placement.
- seat-map Metro label.
- movie-metadata span decoration.
- Metro filter dropdown close/outside-tap interaction policy.

It performs no provider/API fetches. It no longer compensates for Classic sticky state, and shared comparison facts no longer depend on its rendered metadata output.

## M6A risk closure

| M6A risk | M6B result |
| --- | --- |
| Duplicate Metro Data Health placement | Closed: Metro runtime is sole Metro home-placement owner; Phase 10 guards Metro. |
| Classic runtime creates shared tab/sort controls | Closed: moved to `shared-final-controls.js`. |
| Phase 8B parses Metro-rendered `.movie-meta` text | Closed: structured aggregate facts feed Phase 8B. |
| Metro compensates for legacy sticky state | Closed: sticky latch is Classic-only; no Metro compensation remains. |
| Shared compact filter module contains Metro interaction branches | Closed: structure stays neutral; Metro interaction policy moved to `metro-runtime.js`. |
| Long late CSS patch cascade | Reduced: M2 and M4B patch layers retired. Remaining Metro styles now have distinct feature ownership. |

## Why M6B stops consolidating here

The remaining Metro files are no longer small patches whose only purpose is overriding another Metro file. They correspond to stable product surfaces: global/home, comparison shell, filter matrix, Smart Picks/showtime compatibility and seat map. Combining them further would mainly reduce file count while increasing blast radius and making feature ownership less explicit.

Likewise, the remaining Phase 8/9/10 and Classic files still carry either shared behavior or Classic fallback responsibilities. Their age/name is not evidence of dead code.

Therefore M6B's completion decision is:

- do not perform further presentation-file folding without a newly proven duplicate owner or regression;
- preserve the accepted Metro geometry/interaction contract;
- keep Classic fallback intact;
- proceed to M6C provider onboarding contracts.

## M6B regression invariants

Before entering M6C, automated tests must continue to prove:

1. Metro remains the default and Classic remains explicit fallback.
2. Metro CSS order ends with the five distinct owners listed above, with no M2/M4B patch links.
3. shared tab/sort controls have a neutral owner.
4. Classic Data Health/sticky behavior cannot run as Metro presentation ownership.
5. shared compact filter structure contains no skin branching; Metro owns dropdown-close policy.
6. Phase 8B consumes structured aggregate facts and does not parse `.movie-meta`.
7. Metro runtime performs no provider/API fetching.
8. Broadway seat-row guard remains inside the seat-map owner and does not affect MCL/Emperor.
9. controlled Service Worker activation/cache boundaries remain unchanged.

M6C may change provider identity/capability contracts, but should not reopen this presentation ownership split unless those contracts expose a concrete regression.