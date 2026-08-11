# Phase 10A3 — Metro Home Real-device Polish checkpoint

## Scope

This checkpoint addresses the three Metro home issues found in real-device screenshots without changing Classic or any cinema data/comparison core.

## Acceptance

- The data-health flyout remains a compact Metro status surface instead of covering most of the first viewport.
- The flyout shows the three providers, status lights and short freshness text while hiding verbose provider detail copy.
- Square Live Tiles preserve complete vertical poster artwork with `object-fit: contain` instead of cropping the poster to fill the square.
- The overlaid Chinese title remains inside the Live Tile and the two-column mobile grid remains unchanged.
- After the home tools latch during scrolling, search and sort collapse to a compact command bar around 34px control height.
- The sticky sort command removes its small `排序` eyebrow while latched and keeps the active sort value visible.
- Classic remains the default route; Metro remains opt-in via `?skin=metro`.

## Safety boundary

No Broadway, MCL or Emperor provider parsing, movie matching, showtime, price, seat, booking, data-health freshness calculations, Service Worker behavior or comparison behavior is modified.

Phase 10B starts only after this checkpoint passes Node regression, Chromium mobile smoke and main Pages deployment.
