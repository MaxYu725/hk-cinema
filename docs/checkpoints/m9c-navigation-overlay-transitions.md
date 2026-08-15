# M9C — Navigation & Overlay Transitions

## Baseline

- pre-M9C production: `main@3907f522d04aabe107d6707220fe458e21d5bb60`
- M9A owns the shared 120–240 ms Metro motion vocabulary.
- M9B owns passive loading/waiting presentation only.
- comparison, filters, Smart Picks and shared seat map retain their existing lifecycle/request owners.

## Goal

Make Metro/PWA navigation feel less abrupt without delaying close/back controls, introducing route ownership, or adding expensive animation.

## Delivered

### Comparison and seat-map navigation

- full-screen comparison and seat-map overlays receive a short opacity entry layered with the existing M9A sheet entry.
- source movie cards receive only a brief navigation acknowledgement.
- comparison and seat-map close actions create a passive 160 ms exit after-image.
- the real overlay is still hidden/aborted by the existing owner immediately; the after-image has `pointer-events:none` and never owns focus or lifecycle.
- `Escape` uses the same non-blocking exit treatment.
- a hidden-attribute observer provides the same exit feedback for programmatic closes while a small dedupe window prevents duplicate ghosts.

### Filter transitions

- top-level filter controls animate only on a real closed → open transition, avoiding repeated panel animation after every filter selection/rerender.
- compact 3x3 filter groups use the same short entry treatment.
- closing filter surfaces use a short passive visual snapshot; the original filter owner still hides the real controls synchronously.
- filter chevrons rotate through the M9A fast motion token.

### Smart Picks

- recommendation panel open/close receives the same short passive transition treatment.
- Smart Pick target arrival keeps the existing border marker and adds one 240 ms transform/opacity arrival pulse.
- no change to recommendation scoring, scrolling, target resolution or the existing 1.8 s marker lifetime.

### Date active state

- active comparison dates receive `aria-current="date"` from the M9C presentation companion.
- the selected tile retains the existing Metro red state and gains a short two-pixel active indicator transition.

## Performance / accessibility boundaries

- M9C starts no `fetch()` requests.
- no Provider / Worker / registry changes.
- no replacement or monkey-patching of comparison, filter, Smart Pick or seat-map owners.
- no `preventDefault`, `stopPropagation` or `stopImmediatePropagation` in the M9C runtime.
- exit after-images are passive and automatically removed after animation/failsafe cleanup.
- keyframes animate transform/opacity only.
- no per-seat animation.
- `prefers-reduced-motion: reduce` disables M9C animation and avoids creating exit ghosts.

## Regression gate

`tests/m9c-navigation-transitions.test.mjs` verifies:

- asset load order after M9B / Metro owners;
- presentation-only ownership boundaries;
- window-capture close observation without control interception;
- passive exit surfaces;
- filter / Smart Picks / date / source navigation coverage;
- compositor-safe keyframes and reduced-motion handling.

## Deferred

M9D remains responsible for broader micro-interactions such as refined card/button feedback and the first-use horizontal seat-map scroll hint. M9E remains responsible for final repeated-tap, slow-network, reduced-motion and Android PWA performance auditing.
