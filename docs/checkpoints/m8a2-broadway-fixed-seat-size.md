# M8A2 — Broadway Fixed Seat Size

## Baseline

- Start: `main@3608ecc90addd2fe59505ed49401277a2569e0eb`
- Prerequisite: **M8A1 MCL Android installed-PWA acceptance PASS** (`mcl座位正常`).
- Scope: Broadway seat-map presentation only.

## Goal

Carry the accepted M8A1 viewing policy to Broadway without changing Broadway seat data or geometry semantics:

- keep Broadway grid seats at a fixed **20 px** viewing size;
- do not shrink seats merely because a hall is wider;
- allow any Broadway hall that no longer fits at 20 px to grow horizontally and use the existing horizontal scroller;
- retain the existing post-render horizontal centering so scrollable halls open near the middle;
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

1. 12-column Broadway hall = 20 px seats and fits without horizontal scrolling on a 390 px viewport;
2. 14-column and 32-column Broadway halls remain 20 px and scroll when the full grid no longer fits;
3. a non-Broadway future `grid` provider still uses the generic responsive sizing path;
4. shared horizontal centering remains active;
5. the shared runtime asset remains versioned without historical tests pinning the exact cache token.

The initial M8A2 CI correctly exposed that the old 14-column/no-scroll assertion was incompatible with fixed 20 px seats once Broadway's existing row-label gutter and gaps are counted. The runtime policy was kept; the regression contract was corrected rather than shrinking seats to satisfy the historical assumption.

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

After deployment, Android installed-PWA verification is mandatory before starting the next seat-map provider round. Verify one narrower Broadway hall and one wider hall if available:

- seats remain readable and visually consistent in size;
- halls that exceed the viewport scroll horizontally rather than shrinking;
- opening position is centered sensibly when scrolling is required;
- row labels and seat gaps remain aligned;
- closing/reopening the seat map remains responsive.

Do not begin the Emperor seat-map display round until this gate passes.
