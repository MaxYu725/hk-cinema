# Phase 9D1 — Branding & home copy polish

Status: complete pending PR/CI.

Scope:
- restyle HK Cinema PWA, maskable, Apple touch and SVG favicon assets to the shared blue-background / white-pictogram app-family direction
- keep the icon glyph presentation-neutral so Classic and future Metro skins can share it
- replace the duplicated visual section category label with the generic Classic label `全部電影`; the active tab remains the source of `現正上映` / `即將上映` context
- rotate the PWA shell cache so refreshed icon assets are fetched promptly
- preserve the Phase 9D0 sticky-scroll hotfix unchanged

Safety boundary: no provider, catalogue, comparison, filter, Smart Picks, seat, booking or live-data caching behavior changes.
