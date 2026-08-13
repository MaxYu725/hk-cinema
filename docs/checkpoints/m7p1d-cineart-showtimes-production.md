# M7P1D checkpoint — CineArt showtimes production capability

Status: **COMPLETE — merged, deployed, automated gates PASS, Android installed-PWA gate PASS**

Baseline: `f4268b4161230320ba151a1184a2cf5536997038` (accepted M7P1C)

Merged production commit: `bc08f5744d752f13039614254db1f516dcd79a32`

M7P1D is the second staged browser-production CineArt capability. It enabled read-only showtimes only after the M7P1C Android installed-PWA gate passed.

## Browser Provider Registry at M7P1D

CineArt moved to:

- `catalogue: true`
- `showtimes: true`
- `prices: false`
- `seatSummary: false`
- `seatMap: false`
- `booking: false`

No other provider capability changed.

## Production Worker showtime route

M7P1D introduced:

`GET /api/cineart/movies/<movieSourceId>/shows`

Optional query:

`?date=YYYY-MM-DD`

The service reused the bounded M7P1B home Flight parser and its normalized `shows` collection. It did not request individual `/hk/show/<showId>` detail pages.

The public M7P1D showtime payload exposed scheduling metadata only and deliberately returned `price`, `seatSummary`, and `bookingUrl` as `null`. It did not expose `seatStates`, `seatPlan`, ticket types or show-detail geometry. Non-GET requests returned `405 METHOD_NOT_ALLOWED`.

The Worker showtime service used a separate 60-second fresh / 10-minute stale normalized-home cache. The route remained lazy and was requested only when shared comparison needed CineArt showtimes.

## Browser architecture

M7P1D removed the temporary M7P1C catalogue-only comparison guard. No CineArt-specific browser showtime lifecycle was introduced: `provider-compare-v4.js` continued to own the generic provider showtime transport.

The historical CineArt MutationObserver/IntersectionObserver enrichment path remained prohibited.

## Automated evidence

Final exact PR head `46eb186b1a1bd02c625fcf6027624ed42aa66f32` passed:

- exact-head review with no blocking findings;
- CineArt Candidate Validation #44 / run `31674156865`: PASS;
- Deploy HK Cinema #626 / run `31674156857`: Node regression PASS, Chromium install PASS, mobile browser smoke PASS;
- M7P1B discovery, M7P1C catalogue and M7P1D showtime live gates: PASS;
- explicit-date filtering and GET-only/405 method guard: PASS;
- global Worker `/health` retained `phase: "6G"`.

The final live gate also corrected an over-strict historical assumption: a random CineArt show may legitimately have no resolvable seat-plan geometry. `seatMapReadOnly` remains a known boolean capability, while per-show geometry is diagnostic rather than a universal requirement. M7P1D itself did not consume seat-map geometry.

After squash merge, merged-main Deploy HK Cinema #627 / run `31674350307` passed:

- Node regression PASS;
- Chromium install PASS;
- mobile browser smoke PASS;
- GitHub Pages upload/deploy PASS.

## Android installed-PWA acceptance

**PASS.** The user completed the required real-device acceptance test against deployed M7P1D and reported normal operation.

Accepted checks included:

- cold launch and reopen remained normal;
- CineArt showtime comparison opened normally;
- date switching remained responsive;
- repeated open/close cycles did not reproduce the previous freeze;
- scrolling/search/sort remained responsive after showtimes rendered;
- CineArt price, seat and booking affordances remained unavailable as intended for M7P1D.

This PASS is the release gate permitting M7P1E to begin.

## Explicit M7P1D boundaries

M7P1D did **not** add:

- detailed ticket prices;
- base-price presentation;
- coarse seat summary presentation;
- strict A/H/U/L seat enrichment;
- seat-map geometry or UI;
- booking URLs;
- purchase/hold/reservation calls;
- CineArt-specific DOM observers;
- PWA/Service Worker changes.

Next checkpoint: **M7P1E — CineArt price and seat-summary capability**.
