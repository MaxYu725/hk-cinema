# Phase 10A — Metro foundation checkpoint

## Boundary

Classic remains the production default during Phase 10A. Metro is activated explicitly with `?skin=metro`; no provider, catalogue, showtime, price, seat, booking or Service Worker lifecycle logic is changed.

## Metro foundation

- Windows Phone / Metro visual grammar: black canvas, white type, Windows blue accent, Segoe UI-first typography.
- Square panels and controls with zero decorative shadows.
- Large lightweight application title.
- Pivot-style `現正上映` / `即將上映` navigation.
- Flat data-health status surface.
- Search/library controls converted to Metro command surfaces.
- Poster-first square-corner movie tiles.
- Minimum dark comparison bridge so the existing comparison flow remains usable while its full Metro composition is deferred to Phase 10B.

## Acceptance

- `/?skin=metro` applies the Metro skin before the application CSS paints.
- `/` remains Classic.
- Existing movie navigation can open and close the provider comparison overlay in Metro preview.
- Mobile viewport must not gain horizontal document overflow.
- Existing Classic regression and PWA acceptance remain unchanged.

## Next

Phase 10B will redesign the comparison screen itself around Metro typography, panorama/pivot navigation and flatter showtime tiles. Metro should not become the production default until the main home and comparison surfaces both pass acceptance.
