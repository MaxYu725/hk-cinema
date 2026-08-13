# M8A3 — Emperor Seat-map Presentation

## Baseline and prerequisite

- Branch baseline: `main@95579a83c0cd1cf47bfaec4c88f60df717fa13a1`.
- The two maintenance commits immediately before this baseline only removed accidental temporary files; production content remains the accepted M8A2H1 runtime.
- **M8A2 Broadway Android installed-PWA acceptance: PASS.** The user verified that the Broadway `SCREEN` now moves horizontally with the seat grid and replied `正常`.

## Goal

Improve Emperor's own `positioned` seat-map presentation without flattening its official geometry into the MCL or Broadway layout.

Accepted presentation policy for this checkpoint:

- keep Emperor's existing official positioned coordinates and shared responsive scale;
- keep the visible seat square at a fixed **20 px** size;
- hide the old viewport-fixed Emperor `SCREEN` marker;
- draw the Emperor screen marker inside the first positioned canvas so it moves horizontally with the seat layout;
- reserve 52 px above the first positioned canvas for the screen marker;
- keep wide layouts on the existing horizontal scrolling and centering path;
- keep row-label alignment shifted with the first canvas screen reserve.

## Ownership

M8A3 is CSS-only:

- `app/emperor-seatmap-view.css` owns the Emperor-specific seat-map presentation;
- the already-loaded `app/emperor-detail.css` imports that provider stylesheet;
- `app/seatmap-shared.js`, `app/emperor-seatmap.js`, Worker routes and provider data adapters remain unchanged.

This intentionally avoids adding another observer, request owner or post-render DOM lifecycle.

## Boundaries

No changes to:

- Emperor seat-map fetching, identifiers, status mapping or official coordinates;
- Broadway fixed-grid presentation;
- MCL area-grid presentation;
- CineArt positioned orientation or read-only seat-map behavior;
- price, showtime or booking logic;
- Service Worker/PWA lifecycle;
- global Worker `/health phase:"6G"` contract.

## Automated regression contract

Tests require:

1. the Emperor provider stylesheet loads the M8A3 presentation;
2. Emperor positioned seat visuals are fixed at 20 px;
3. the old outer Emperor screen is hidden;
4. the replacement `SCREEN` marker is owned by the first positioned canvas and therefore shares horizontal movement with the seats;
5. first-section row labels retain the same 52 px vertical screen reserve;
6. the M8A3 stylesheet does not target MCL, Broadway or CineArt;
7. shared positioned geometry logic remains unchanged.

## Release gates

Before merge:

- Node regression PASS;
- Chromium install PASS;
- mobile browser smoke PASS;
- CineArt live revalidation PASS;
- exact-head diff audit and review with no blocking findings.

After squash merge:

- merged-main Node regression PASS;
- merged-main Chromium/mobile smoke PASS;
- Pages deployment PASS.

## Manual gate

Android installed-PWA verification is mandatory before starting the CineArt presentation round. Check at least one Emperor seat map and, if available, a wider hall:

- seat squares remain visually consistent at 20 px;
- the visible `SCREEN` line/text moves horizontally together with the positioned seat map;
- row labels remain vertically aligned with their rows;
- horizontal scrolling and initial centering remain usable;
- repeated close/reopen remains responsive;
- Broadway and MCL remain unchanged.
