# Phase 10A2 — Home Metro Polish checkpoint

## Scope

This checkpoint refines only the Metro preview home surface. Classic remains the production default and the shared cinema data/navigation core is unchanged.

## Metro home acceptance

- `?skin=metro` keeps the black Windows Phone canvas, Segoe-first typography, blue accent, zero decorative radii and zero shadows.
- The large `HK Cinema` title remains the primary app identity while data health is reduced to a compact status command.
- `現正上映` / `即將上映` remain Pivot-style navigation with lighter counts.
- Search becomes a typography-first underline command instead of a boxed form control.
- The native movie sort select is hidden only in Metro and is driven by a Metro text command that cycles through the existing sort states.
- `全部` / `收藏` / `最近查看` are flat secondary commands instead of pills.
- Movie cards become square poster-first Live Tiles with the Chinese movie title overlaid inside the artwork.
- English title, runtime metadata and provider badges are removed from the Metro home tile surface only; the underlying data remains available to search, comparison and detail flows.
- Favorite controls remain functional as flat tile glyphs.
- Mobile remains a two-column tile grid without horizontal overflow.

## Safety boundary

No Broadway, MCL or Emperor provider parsing, movie matching, showtime, price, seat, booking, data-health freshness, Service Worker cache/update, or comparison behavior is modified.

Phase 10B will redesign the comparison surface itself after this checkpoint is green.