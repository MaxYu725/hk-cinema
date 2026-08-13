# M8A2 — Broadway Fixed Seat Size

## Baseline

- Start: `main@3608ecc90addd2fe59505ed49401277a2569e0eb`
- Prerequisite: **M8A1 MCL Android installed-PWA acceptance PASS** (`mcl座位正常`).
- Scope: Broadway seat-map presentation only.

## Goal

Carry the accepted M8A1 viewing policy to Broadway without changing Broadway seat data or geometry semantics:

- keep Broadway grid seats at a fixed **20 px** viewing size;
- do not shrink seats merely because a hall is wider;
- allow wide / IMAX-style halls to grow horizontally and use the existing horizontal scroller;
- retain the existing post-render horizontal centering so wide halls open near the middle;
- preserve Broadway row labels, gaps, seat ordering and the existing Metro sticky row-label gutter.

## Implementation boundary

`app/seatmap-shared.js` owns the change:

- add `BROADWAY_GRID_SEAT_SIZE = 20`;
- apply it only when `model.provider.id === "broadway"` inside `gridMetrics()`;
- keep the generic grid fallback responsive for future providers;
- leave `MCL_AREA_GRID_SEAT_SIZE = 20` unchanged;
- leave `positionedMetrics()` unchanged for Emperor and CineArt.

No changes to:

- Broadway Worker/parser or seat-state normalization;
- MCL area geometry;
- Emperor/CineArt positioned geometry;
- price, booking or showtime logic;
- Service Worker/PWA lifecycle;
- seat-map CSS ownership.

## Regression contract

Deterministic tests must prove:

1. 14-column Broadway hall = 20 px seats and fits without horizontal scrolling on a 390 px viewport;
2. 32-column Broadway hall = 20 px seats and requires horizontal scrolling;
3. a non-Broadway future `grid` provider still uses the generic responsive sizing path;
4. shared horizontal centering remains active;
5. the shared runtime asset remains versioned without historical tests pinning the exact cache token.

## Release gates

Before merge:

- Node regression PASS;
- Chromium install PASS;
- mobile browser smoke PASS;
- exact-head PR review with no blocking findings;
- diff audit confirms no unintended provider/Worker/PWA changes.

After squash merge:

- merged-main Node regression PASS;
- merged-main Chromium/mobile smoke PASS;
- Pages deployment PASS.

## Manual gate

After deployment, Android installed-PWA verification is mandatory before starting the next seat-map provider round. Verify one ordinary Broadway hall and one wide hall if available:

- seats remain readable and visually consistent in size;
- wide halls scroll horizontally rather than shrinking;
- opening position is centered sensibly;
- row labels and seat gaps remain aligned;
- closing/reopening the seat map remains responsive.

Do not begin the Emperor seat-map display round until this gate passes.
