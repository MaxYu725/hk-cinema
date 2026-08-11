# Phase 10B2 — Metro Pivot Content Polish

## Real-device findings

Phase 10B1 real-device acceptance confirmed that the comparison Panorama and Pivot navigation worked, but exposed two presentation defects in the inherited comparison content:

- Smart Picks could inherit a Classic light recommendation surface, producing white-on-white content and abnormally tall recommendation cards.
- Rich Filters still looked like stacked Classic controls and left a large amount of unused horizontal space on a mobile viewport; the cinema control also retained a native/light appearance.

## Acceptance

### Recommendation Pivot

- The existing Smart Picks engine remains authoritative.
- Recommendation cards render as compact dark Metro tiles rather than Classic cards.
- Recommendation tiles explicitly reset inherited minimum height, flexible body growth, radius, shadow and light backgrounds.
- Primary recommendation text is high-contrast white; secondary copy remains muted.
- The balanced recommendation retains a restrained Metro accent treatment.
- Recommendation tiles do not stretch vertically simply to match a neighbouring tile.

### Filter Pivot

- Entering `篩選` expands the existing rich-filter surface through its original toggle/state rather than creating a second filter engine.
- Phase 9B3 compact filter groups are reused as the Metro mobile navigation model.
- Compact rows now fill the available width instead of shrinking around their labels.
- Filter rows, including `戲院`, use a consistent dark Metro surface with flat corners.
- Labels are muted while selected/current values remain high-contrast.
- Opening a compact row reveals the original filter buttons/select; active options keep the Metro accent state.
- The cinema selector uses the same dark Metro treatment when expanded.

## Regression acceptance

- Node regression covers Metro-only scoping, Smart Pick no-stretch/dark-surface rules, filter command styling and automatic rich-filter expansion.
- Chromium mobile smoke validates the visible compact filter UI, full-width summary geometry, expanded active-option state, cinema selector styling and live Smart Pick styling when recommendation data is available.
- Classic remains the default surface and is outside the 10B2 presentation overrides.

## Safety boundary

No Broadway, MCL or Emperor provider parsing, movie matching, freshness rules, ticket-price logic, seat-map logic, booking URLs, recommendation scoring, rich-filter semantics, comparison fetching, PWA lifecycle or Service Worker behavior is changed.

Phase 10B2 stops at this checkpoint for real-device acceptance before any further Metro comparison work.
