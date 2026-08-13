# M7P1G checkpoint — CineArt read-only seat map

Status: **implementation and pre-final automated/live gates complete — final documentation-only exact-head rerun / merge / Android PWA gate pending**

Baseline: `c15a374730aa1c3477096e14313a1418a3fb210f` (accepted M7P1F)

M7P1F Android installed-PWA acceptance: **PASS**.

The user completed the deployed M7P1F real-device acceptance gate and reported normal operation. This PASS is the release gate permitting M7P1G to begin.

## Scope

M7P1G enables the first production CineArt seat-map capability while remaining completely read-only.

Production route:

`GET /api/cineart/shows/<showId>/seats?movieSourceId=<movieId>`

The Worker obtains the existing CineArt `/hk/show/<showId>` document (with the already validated GET-only RSC fallback when needed), resolves `show.plan.config`, and combines official plan geometry with A/H/U/L seat states.

## Reconnaissance evidence

Before changing production runtime, the draft PR used a branch-preview-only shape probe. Multiple current CineArt halls confirmed that the official plan is parametric rather than a flat seat list:

- canvas width/height;
- seat cell width/height and horizontal/vertical gaps;
- block centre `x/y`;
- block rows/columns;
- row/column starting values and direction;
- explicit `removed {r,c}` non-seat cells;
- per-seat overrides;
- `type: "wh"` wheelchair markers.

A 146-seat current Maritime Square hall independently correlated all 146 `seatStatus` keys with the official block structure. Removed cells explained the missing A1/A2/A18/A19 and H10/H13 gaps, and explicit H11/H12/H14/H15 overrides were wheelchair positions.

No aisle or row geometry is inferred from seat labels. The temporary reconnaissance probe was removed before production validation.

## Geometry safety boundary

The production parser generates seats only from official blocks and only when the generated seat id exists in `seatStatus`.

The complete generated set must match **100%** of the official `seatStatus` keys. If it does not, the route fails with a geometry mismatch instead of exposing a partial or guessed map.

State mapping remains:

- `A` → available/selectable;
- `H` → held;
- `U` → sold;
- `L` → blocked.

`type: "wh"` maps to wheelchair.

## Ownership

- Worker owns CineArt upstream transport and geometry normalization.
- Browser uses only the HK Cinema Worker.
- Shared `HKCinemaSeatMapShared` remains the seat-map overlay/render/cache owner.
- CineArt comparison cards render their authoritative show id directly into the seat-status trigger.
- `app/cineart-seatmap.js` uses delegated click/auxclick/keyboard handling only.
- No CineArt MutationObserver or IntersectionObserver lifecycle is introduced.

## Explicit boundaries

M7P1G does **not** add:

- seat selection;
- hold/reservation/purchase calls;
- CineArt booking URLs or booking capability;
- browser requests to `cinearthouse.com.hk`;
- raw upstream `seatStatus` or `plan` objects in the public response;
- guessed geometry when official plan/status evidence is incomplete;
- PWA or Service Worker changes.

CineArt Registry target:

- catalogue: true
- showtimes: true
- prices: true
- seatSummary: true
- seatMap: true
- booking: false

Worker service descriptor target:

`catalogue-showtimes-detailed-price-strict-seats-seatmap-production-readonly`

Global Worker `/health` remains `phase: "6G"`.

## Cache

Seat-map projections use a 15-second edge cache and no stale fallback. Volatile seat state must not be served from a long stale window.

The cache key includes both `showId` and `movieSourceId`. An exact-head review found that a show-only key could let a cached valid show bypass a later mismatched movie correlation. The blocker was fixed before merge, and deterministic regression now verifies that `9001/799` can hit cache while `9001/123` performs a new read and is rejected with `CINEART_SEATMAP_MOVIE_MISMATCH`.

The shared browser seat-map cache remains 30 seconds.

## Pre-final automated/live evidence

Code head `14b21db7e87eb989d1fc7abb7e70afe0b9abd19b` includes the cache-correlation fix and deterministic lock, and passed the full pre-final gate set:

- Deploy HK Cinema #664 / run `31681437388`: Node regression PASS, Chromium install PASS, mobile browser smoke PASS;
- CineArt Candidate Validation #86 / run `31681437408`: M7P1B discovery, M7P1C catalogue, M7P1D showtimes, M7P1E coarse price/seat, M7P1F strict detail, and M7P1G production seat map all PASS;
- Worker health remained `phase: "6G"` with CineArt service `catalogue-showtimes-detailed-price-strict-seats-seatmap-production-readonly`;
- the previously validated live production sample retained exact official-geometry behavior: 170 normalized unique seats, 154 available, 16 sold, 0 held, 0 blocked, 0 unknown, 4 wheelchair positions and 11 rows on an 860×650 official canvas;
- first seat-map request is network and the repeated exact show/movie request is `fresh-edge`;
- every normalized position is finite and inside the official canvas;
- public seat-map payload exposes no raw `seatStatus`, raw `plan`, `seatStates`, or ticket types;
- booking remains null/read-only and seat-map POST returns 405.

Earlier code head `e103233403331b89134c5a7db22bc2869e718c62` had already passed Node regression 324/324, Chromium, mobile smoke and a successful M7P1B–G Candidate rerun. The first Candidate attempt on that unchanged head saw a one-off upstream non-2xx at the historical M7P1D showtime GET; the immediate unchanged rerun passed all stages, so no production/validation change was made for the transient.

## Diff audit

Production diff was reduced before the final reruns:

- `app/index.html` keeps accepted formatting and changes only required M7P1G script/cachebuster lines;
- `app/provider-compare-v4.js` was restored to the accepted baseline and carries only authoritative CineArt show-id/seat-map-trigger additions plus version bump;
- `app/providers/cineart.js` preserves accepted catalogue/strict-detail code and adds only seat-map request/view-model extensions and authoritative session identifiers;
- no PWA or Service Worker file changed;
- no temporary reconnaissance probe remains;
- no CineArt browser upstream URL, MutationObserver or IntersectionObserver was introduced;
- booking capability remains false.

This checkpoint update intentionally creates one final documentation-only PR head. Both automated suites must pass again on that exact head before ready-for-review, exact-head review and squash merge.

## Required pre-merge gates

The exact PR head must pass:

1. full Node regression suite;
2. Chromium install;
3. mobile browser smoke;
4. M7P1B–M7P1F live revalidation;
5. M7P1G live seat-map validation;
6. live seat-map total/unique ids/finite positions are internally consistent;
7. public payload contains normalized seats but no raw `seatStatus` or raw `plan`;
8. booking remains null and POST returns 405;
9. exact-head diff review confirms no CineArt observer, browser upstream, PWA/SW or booking drift;
10. exact-head review confirms cache hits cannot bypass show/movie correlation.

## Post-merge gate

After squash merge, merged-main regression, Chromium, mobile smoke and GitHub Pages deployment must pass.

Android installed-PWA acceptance is mandatory before any subsequent CineArt capability phase. It must verify repeated seat-map open/close, date switching, map responsiveness, plausible row/aisle geometry, wheelchair markers where present, read-only behavior, no booking action, and no recurrence of the historical PWA freeze.
