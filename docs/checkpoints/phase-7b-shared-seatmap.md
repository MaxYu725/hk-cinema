# Phase 7B Part 3 — Shared full-screen seat map

## Scope

Broadway, MCL and Emperor now open the same mobile-first, read-only full-screen seat-map interface. Provider clients retain only session discovery and official endpoint loading; all visible markup is produced by `seatmap-shared.js` from `SeatMapViewModel`.

## Shared interface

- One dialog lifecycle, close button, backdrop, focus trap, Escape handling and focus restoration.
- One header using cinema, date, time, house, format, language and subtitle context.
- One exact status summary and dynamic status/type legend.
- One loading, timeout, retry, empty-geometry and official-booking treatment.
- One 30-second bounded cache; superseded and closed requests are aborted.
- Seat maps remain read-only and never lock a seat or submit a booking.

## Provider geometry

| Provider | Layout | Preserved behavior |
|---|---|---|
| Broadway | `grid` | Global row/column alignment and explicit gaps |
| MCL | `area-grid` | Multiple positioned areas, labels, cell spans and legacy row fallback |
| Emperor | `positioned` | Official left/top coordinates, offsets, rotation, zones and prices |

Normal halls shrink only enough to fit the available mobile width. Wide and IMAX layouts retain a minimum readable seat size and use horizontal scrolling with fixed row labels. The renderer never converts Emperor `unavailable` into `sold`, nor invents seats when geometry is absent.

## Integration

Movie-detail cards expose their normalized `ShowtimeViewModel` to provider clients without serializing provider request internals into markup. Comparison cards continue to use their existing provider detection and booking URLs. The official booking action remains separate from the read-only seat-map trigger.
