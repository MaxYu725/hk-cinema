# M9E1 — Date Loading Stability Hotfix

Baseline: `main@0915b336e97ef5352d31957014862958a82bb6e3` (M9E)

## User-visible defects

Real-device Metro/PWA testing exposed three related date-refresh defects in the comparison sheet:

1. Smart Picks could flash a white Classic-style surface for a single frame.
2. During a date request, the filter/reset block could temporarily move above the date rail and then jump back.
3. The visible `正在更新所選日期場次` notice inserted a new row and caused repeated vertical movement while the request was active.

## Root causes

### Decorated timeline cloning

M9B captured a date-change snapshot using `section.cloneNode(true)` and later replaced the owner's loading section with that clone. The comparison timeline is not raw provider HTML: Phase 8B, filters and Smart Picks all decorate/reorder it after render. Re-inserting a cloned decorated tree caused those decorators to run again against a second tree and could expose intermediate ordering before their next animation-frame pass.

### Visible loading row

M9B inserted `.m9b-local-loading-bar` directly after the date rail with a real minimum height, padding and margin. That necessarily changed the timeline geometry while loading.

### Smart Picks Classic fallback

The base recommendation stylesheet is intentionally light/Classic. Metro's final override is scoped through the Phase 8B panel class. A newly recreated Smart Picks panel can exist for a fraction of a frame before Phase 8B adds that class, exposing the light base surface.

## Fix

### Preserve the live timeline node

On a date click, M9B now stores the actual existing timeline section reference instead of cloning it. The provider comparison owner still performs its normal synchronous `render()` and request lifecycle. M9B then restores that same detached section with `queueMicrotask()` after the owner's click handler has run but before the browser's next paint.

This preserves:

- the exact date/filter/reset/Smart Picks/showtime DOM order;
- the exact Metro decorator classes;
- expanded/collapsed UI state already present on the nodes;
- existing delegated event semantics;
- provider/request ownership in `provider-compare-v4.js`.

`cloneNode()` is no longer used by M9B's date-loading path.

### Non-layout loading feedback

The visible notice row is removed. During date loading:

- the preserved section receives `aria-busy="true"`;
- a 1x1 clipped live region remains for assistive technology;
- a 2px pseudo-element progress rail provides visual feedback;
- the old timeline is only opacity-muted and its show cards remain non-interactive.

No loading element adds height, margin or padding to the comparison flow.

### Defensive Metro Smart Picks baseline

`metro-m3-smart-picks.css` now directly covers `.provider-compare-recommendations.phase8d-smart-picks` before the Phase 8B panel class exists. The transient panel and cards therefore use Metro black/tile surfaces, square corners and the 2-column grid immediately, never the old white Classic surface.

## Regression coverage

Updated `tests/m9b-loading-states.test.mjs` enforces:

- live-node preservation;
- no `cloneNode()` in the M9B date path;
- same-event-loop microtask restoration;
- visually hidden loading status;
- defensive dark Smart Picks fallback.

New `tests/e2e/m9e1-date-loading-stability.spec.mjs` verifies on the mobile Chromium viewport:

- an actual comparison exposes multiple dates;
- a raw undecorated Smart Picks panel is black/square immediately;
- date rail precedes filter controls before and during loading;
- date/filter/reset relative geometry does not move by more than 1px after selecting another date;
- the accessibility loading status occupies only 1x1px;
- the refreshed timeline settles normally with no browser errors.

## Ownership boundary

This hotfix does not modify providers, Worker routes, Registry, comparison request ownership, filters, recommendation calculations or seat maps. It only changes M9B presentation preservation and Metro fallback styling.
