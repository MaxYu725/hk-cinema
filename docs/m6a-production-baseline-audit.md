# Phase M6A — Production baseline audit

Baseline: `main` at `270aef2ea9a405b107e15bfb8d490e4af12024b5` after PR #65. Metro is the production default and Classic remains available through `?skin=classic`. This checkpoint is an audit/freeze only: it does not change provider, parser, showtime, seat, recommendation or visual behavior.

## Accepted production contract

- Default document skin is Metro; only the explicit `skin=classic` query selects Classic.
- Metro remains mobile/PWA-first and is the final presentation layer in the current cascade.
- Home, comparison, anchored 3x3 filters, Smart Picks, showtime cards and the shared seat-map view are accepted on real devices.
- PWA manifest prefers `fullscreen`, with `standalone` and `minimal-ui` as fallbacks; the runtime may request Fullscreen API after a trusted gesture when an installed app falls back from fullscreen.
- Service Worker updates remain controlled: install precaches the shell, but activation only calls `skipWaiting()` after the runtime sends `SKIP_WAITING` following user acceptance.
- Live cinema/provider/API traffic remains outside the same-origin static shell cache.
- Classic stays as a rollback/reference path during M6.

## Presentation/runtime inventory

### Shared/core UI

The production page still loads the original/shared styles and renderers first: base app, data health, shared seat map, multi-provider home/library, provider comparison, filters, recommendations, resilience and provider-specific detail/seat modules. These own data/rendering semantics and must remain skin-neutral where possible.

### Legacy phase decorators still active

The following decorators are still loaded in production before Metro:

- Phase 8A movie navigation/aggregation.
- Phase 8B comparison restructuring and movie-fact decoration.
- Phase 8D/8D1 recommendation/filter-scroll behavior.
- Phase 9B2/9B3 mobile/filter presentation helpers.
- Phase 9D0 home sticky-scroll helper.
- Phase 9C3 PWA presentation/runtime.
- Classic final polish.
- Phase 10R3A mobile shell/date-strip helper.

These are not classified as dead code in M6A. Several still provide behavior used by both skins.

### Metro layer

Metro is currently an additive late layer:

- `metro-theme.css`
- `metro-m2-home-polish.css`
- `metro-m3-comparison.css`
- `metro-m3-filter-matrix.css`
- `metro-m3-smart-picks.css`
- `metro-m4-seat-view.css`
- `metro-m4b-seat-scroll-fix.css`
- `metro-runtime.js`

`metro-runtime.js` owns Metro labels/theme color, homepage presentation synchronization, comparison shell placement, seat-map shell labelling and movie-card metadata decoration.

## Ownership/race audit

### A. Data Health home placement has two Metro owners — priority: high

`phase10r3a-mobile-shell-date-strip.js` moves `#dataHealth` into the home filter controls when Metro is active. `metro-runtime.js` also moves the same node into `.home-library-filter-options`.

Current behavior is stable because both converge on the same destination, but duplicate DOM ownership increases observer churn and makes future layout changes order-sensitive.

**M6B target:** one owner for Metro home Data Health placement; keep Classic placement in the legacy/Classic path.

### B. Classic final polish still creates shared controls used by Metro — priority: high

`classic-final-ui-polish.js` is not globally disabled in Metro. Only its Data Health auto-refresh wiring has a Metro guard. It still calculates tab counts and creates the comparison `.classic-final-sort` control, which Metro then styles.

This is a hidden cross-skin dependency: removing or fully guarding the Classic decorator would currently remove behavior from Metro.

**M6B target:** move genuinely shared behaviors (tab counts / comparison sort control) to a neutral owner, then let Classic and Metro style them independently.

### C. Comparison movie facts depend on a DOM text-format bridge — priority: high

Phase 8B reads homepage `.movie-meta.textContent` and splits on `" · "` to recover classification, duration and release date. Metro replaces that metadata with styled spans, but deliberately inserts hidden `.metro-meta-separator` nodes containing the same delimiter so Phase 8B can keep parsing it.

This is functional but brittle because a presentation transform is preserving a parser contract.

**M6B target:** expose movie facts from aggregate/view-model data or stable data attributes instead of parsing rendered text.

### D. Metro homepage sticky behavior compensates for legacy presentation state — priority: medium

Phase 9D0 remains active for mobile sticky behavior while `metro-runtime.js` contains compensating synchronization to keep Metro controls visible and clear legacy stuck presentation state.

**M6B target:** define a shared sticky state contract or make the legacy sticky decorator explicitly Classic-only once Metro has a dedicated owner.

### E. Filter compact logic mixes shared and Metro-specific interaction — priority: medium

`phase9b3-filter-compact.js` is a shared decorator, but now contains explicit Metro branches for anchored dropdown closing/outside-click behavior. The structure is stable and tested, but skin-specific interaction is mixed into a legacy phase module.

**M6B target:** retain one structural filter model while separating skin interaction/presentation policy where this can be done without changing UX.

### F. CSS cascade is long and order-sensitive — priority: medium

`index.html` loads the shared/provider/phase/Classic styles first and then the Metro styles as the final override layer. This preserved the redesign safely, but means accepted Metro behavior can depend on selector specificity and stylesheet order rather than explicit ownership.

**M6B target:** consolidate only proven duplicate presentation rules. Do not bulk-delete phase CSS; remove a layer only after its remaining shared/Classic responsibilities are identified and regression-covered.

## Provider-expansion blockers discovered during M6A

These are recorded for M6C, not changed in M6A:

1. `data-health.js` has a fixed `PROVIDERS` array for Broadway, MCL and Emperor.
2. Data Health copy/ARIA includes fixed three-provider wording such as `三院線資料最新` and `三個院線來源目前均未能更新`.
3. The base page loading copy and refresh accessibility text also refer to three providers.

Before a fourth provider is added, provider identity/status presentation should come from a registry/contract instead of duplicated fixed wording.

## Do-not-change boundary for M6B

The following remain frozen unless a regression is proven:

- Accepted Metro geometry, typography, colors and interaction flow.
- 3x3 anchored filter UX.
- Smart Picks calculation and target highlighting semantics.
- Showtime filtering/sorting/provider matching semantics.
- Seat parsing, seat totals, inventory states and booking URLs.
- Provider fetch/parser logic.
- Classic fallback behavior.
- Controlled Service Worker activation and live-data cache boundary.

## M6B execution order

1. Establish neutral ownership for tab counts and comparison sort control.
2. Remove duplicate Metro Data Health placement ownership.
3. Replace rendered-text movie-fact dependency with stable metadata input.
4. Review sticky/filter skin branching and reduce only safe ordering dependencies.
5. After each change: regression tests + mobile Chromium smoke + real-device checkpoint if visible DOM ownership changes.

No cleanup should be justified by file/phase age alone. A legacy layer is removable only when its remaining production responsibilities are explicitly transferred or proven unused.