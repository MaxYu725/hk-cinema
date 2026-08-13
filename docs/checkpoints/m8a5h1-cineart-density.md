# M8A5H1 — CineArt Geometry Density Fix

## Baseline and reason

- Baseline: `main@c75586cd25ca0ce45f34dd84b404b8dedc16c9d6` (M8A4).
- M8A4 successfully fixed CineArt screen direction/synchronization, but manual Android installed-PWA review found the seat layout still visibly too loose: **「沒有變化，同樣鬆散」**.
- Root cause: M8A4 fixed visible seat boxes at 20 px, while CineArt remains a `positioned` layout whose spacing is driven by official X/Y geometry pitch. CSS seat-size changes therefore did not materially reduce the gaps.

## Fix

CineArt's browser provider adapter applies a display-only geometry density factor of **0.72** when constructing its `SeatMapViewModel`:

- official Worker coordinates remain unchanged;
- browser display X/Y offsets from each section origin are multiplied by `0.72`;
- browser display section width/height are reduced by the same factor;
- a source pitch of 40 display units therefore becomes 28.8 units;
- seat IDs, status, type, selectable semantics and row ordering are unchanged.

This is a presentation transform only. It does not rewrite upstream/Worker geometry.

## Preserved M8A4 behavior

- CineArt A/front rows remain on the lower/screen side;
- `銀幕` remains below the seats;
- `銀幕` remains in the same horizontally scrolling visual canvas;
- visible CineArt seat boxes remain 20 px;
- CineArt booking remains disabled.

## Explicit boundaries

No changes to:

- `worker/src/providers/cineart-seatmap.js` or other Worker routes;
- `app/seatmap-shared.js` shared positioned renderer;
- CineArt network/launcher ownership;
- Broadway, MCL or Emperor presentation;
- Service Worker/PWA lifecycle;
- global `/health phase:"6G"` contract.

## Regression contract

Deterministic browser-adapter test must prove:

1. a 160×120 source section becomes 115.2×86.4 display geometry;
2. a 40-unit horizontal or vertical source pitch becomes 28.8 display units;
3. status/type/counts remain unchanged;
4. booking remains null;
5. the density constant exists only in the CineArt browser adapter, not the Worker or shared renderer.

## Release gates

Before merge: Node regression, Chromium install, mobile browser smoke, CineArt Candidate Validation, exact-head diff audit/review.

After squash merge: merged-main Node/Chromium/mobile smoke and Pages deploy.

## Manual Android gate

Re-test the same or comparable CineArt hall used to report the issue (for example the 80-seat 青衣城 layout):

- seat gaps must be visibly tighter than the M8A4 screenshot;
- aisles/blocks must remain recognizable rather than collapsing together;
- `銀幕` remains below and scrolls with the plan;
- row labels stay aligned;
- CineArt still has no booking button;
- MCL/Broadway/Emperor remain unchanged.

M8A5H1 is not complete until this manual gate passes.
