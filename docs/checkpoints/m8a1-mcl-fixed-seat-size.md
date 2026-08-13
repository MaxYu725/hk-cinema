# M8A1 checkpoint — MCL fixed seat size

Status: **implementation staged — automated and Android PWA gates pending**

Baseline: `70754d1520d79126658466d0e92e5057daf7956c` (M7P1H CineArt production-complete checkpoint)

## Goal

Use the current MCL seat-map presentation as the reference viewing experience without forcing Broadway, Emperor or CineArt into MCL's provider-specific geometry.

The accepted MCL characteristics to preserve are:

- dense seat presentation;
- the screen remains the central visual reference;
- wide halls remain horizontally scrollable and open centered;
- official MCL area positions and gaps remain intact.

The defect addressed in M8A1 is only that MCL `area-grid` seat size currently changes with the hall column count.

## Change

- MCL `area-grid` uses a fixed 20 px cell size.
- A compact MCL hall and a wide/IMAX MCL hall therefore use the same seat cell size.
- Wide halls expand the canvas and use the existing horizontal scrolling path instead of shrinking seats further.
- Existing `centerAfterRender()` behavior remains unchanged, so a wide hall still opens at its horizontal midpoint.
- Existing screen rendering and MCL area ratios remain unchanged.

## Explicit boundaries

- Broadway `gridMetrics()` is unchanged.
- Emperor/CineArt `positionedMetrics()` is unchanged.
- no provider parser, Worker API, seat state, price, booking or geometry contract changes;
- no seat-map CSS redesign in this checkpoint;
- no PWA/Service Worker behavior change;
- no observer lifecycle is introduced.

## Required gates

Before merge:

1. full Node regression PASS;
2. Chromium install PASS;
3. mobile browser smoke PASS;
4. diff audit confirming only MCL `area-grid` sizing behavior changed;
5. exact-head PR review.

After squash merge:

1. merged-main Node regression PASS;
2. Chromium install PASS;
3. mobile browser smoke PASS;
4. Pages deployment PASS;
5. Android installed-PWA manual verification.

The Android gate should compare at least one ordinary MCL hall and one wide/large MCL hall. Seat squares should remain visually the same size; the wide hall should scroll horizontally and open centered with the screen remaining a clear reference. Do not start Broadway/Emperor/CineArt display changes until this gate passes.