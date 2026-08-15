# M9F1 — Home Content Continuity

## Baseline

- `main@71648ba90db2d201fcae74b115bd4bfd22705da8`
- follows M9E3 comparison result-curtain hardening

## Goal

Smooth the remaining hard content switches on the Metro home screen without taking render, navigation, provider, or data ownership away from the existing runtimes.

## Scope

### Pivot: 現正在映 ↔ 即將上映

- existing `app.js` remains the synchronous tab/render owner
- after the owner has completed the switch, the stable result surface receives a 180ms compositor-only reveal
- `now -> coming`: result moves left from `translateX(8px)` to zero
- `coming -> now`: result moves right from `translateX(-8px)` to zero
- no delayed `setTab()`, no cloned movie grid, no transition curtain

### Library view / sort continuity

- `全部 / 收藏 / 最近查看` changes receive a 180ms opacity + 4px vertical refinement
- home sort changes receive the same refinement
- removing a favourite while already in the favourite view receives the same acknowledgement
- `home-library.js` remains the only owner of visibility, order, counts and persistence

### Search behavior

- normal search keystrokes remain immediate and animation-free
- a short result transition is used only when search crosses the boundary between visible results and `#homeLibraryEmpty`
- this avoids repeated motion during typing and IME composition

### Search / sort focus polish

- Metro search and sort containers now transition only `border-color` and `background-color`
- no geometry, size or sticky-position animation is introduced

## Architecture boundaries

M9F1 is a Metro-only presentation companion.

It does not:

- call `fetch()`
- replace or modify Provider / Worker / Registry owners
- modify `app.js` or `home-library.js`
- call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`
- clone the movie grid or movie cards
- write home DOM content
- force layout reads
- animate individual movie cards as a list/stagger

The companion listens in capture only to observe user intent, then schedules presentation after the existing owner has handled the event.

## Motion policy

- duration: 180ms
- easing: `cubic-bezier(0, 0, .2, 1)`
- WAAPI frames use only `opacity` and `transform`
- `prefers-reduced-motion: reduce` disables result-surface motion and focus transitions

## Acceptance

- Pivot changes no longer feel like an abrupt grid replacement
- home filter/sort changes have visible but restrained continuity
- search remains fully responsive while typing
- Empty State transitions only on result-boundary changes
- no input/control blocking
- no comparison, seat-map or PWA update behavior changes
- full Node regression, Chromium/mobile smoke and CineArt candidate gate pass before squash merge
