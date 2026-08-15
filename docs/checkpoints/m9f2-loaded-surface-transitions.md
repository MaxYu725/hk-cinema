# M9F2 — Loaded Surface Transitions

## Baseline

- `main@4b850a181881fcb258007d304a6401b876e247bc`
- follows M9F1 Home Content Continuity

## Goal

Finish the remaining abrupt loaded-surface swaps in Metro without taking data, request, overlay, selection, or PWA lifecycle ownership away from existing runtimes.

## Scope

### Seatmap Skeleton → real seat map

- `HKCinemaSeatMapShared` remains the only request/render/abort/cache owner
- M9B keeps ownership of the loading skeleton
- M9F2 observes the newly rendered `.shared-seatmap-content`
- the real map receives one 180ms opacity + 6px vertical reveal
- no seat-level animation, no geometry mutation, no horizontal-scroll ownership
- cached and network-loaded maps use the same presentation path

### PWA Notice

- `pwa-runtime.js` remains the only owner of notice kind, copy, update action, online/offline state and `hidden`
- visible notices receive an 180ms entry
- when the owner hides a previously visible notice, M9F2 creates a 160ms non-interactive visual after-image only
- the real notice is already hidden before the after-image exists
- no update/reload semantics are changed

### Cinema Portal

- `provider-compare-cinema-menu.js` remains the only owner of portal creation, selection and synchronous removal
- opening `#providerCompareCinemaPortal` receives an 180ms opacity/transform entry
- closing keeps the real portal removal synchronous and uses a 160ms passive after-image
- a new portal open clears stale portal ghosts before entering
- same-task close → reopen does not leave an old portal after-image over the new portal

## Architecture boundaries

M9F2 is a Metro-only presentation companion.

It does not:

- call `fetch()`
- replace Provider, Worker, Registry, SeatMapShared, PWA or cinema-menu owners
- call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`
- write live seat-map / PWA / portal content with `innerHTML`
- assign seat-map `scrollLeft`
- delay owner close/hide/remove operations
- animate individual seats or cinema options

The only clones are short-lived passive exit after-images for the compact PWA notice and cinema portal. They have no id, no role, no pointer events and no tabbable controls.

## Motion policy

- entry: 180ms
- exit after-image: 160ms
- easing: `cubic-bezier(0, 0, .2, 1)`
- animated properties: transform + opacity only
- reduced motion disables WAAPI entry/exit motion and suppresses exit after-images entirely

## Validation

Static regression verifies:

- M9F2 asset order
- passive ownership boundaries
- seat-map loaded reveal
- PWA hidden-state observation
- cinema-portal stale-ghost clearing
- compositor-only/reduced-motion policy

Mobile Playwright verifies:

- slow seat-map skeleton → real map
- PWA notice owner hide → passive exit after-image
- deterministic cinema portal open/remove path
- reduced-motion mode creates no M9F2 exit after-images

## Acceptance

- loaded seat map no longer appears as a hard skeleton cut
- PWA notices arrive and leave without changing PWA state ownership
- cinema selector no longer pops in/out abruptly
- close/hide/remove state remains synchronous
- no interaction blocking
- no seat geometry or provider behavior changes
- full Node regression, Chromium/mobile smoke and CineArt candidate gate pass before squash merge
