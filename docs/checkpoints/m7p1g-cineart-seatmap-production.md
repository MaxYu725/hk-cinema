# M7P1G checkpoint — CineArt read-only seat map

Status: **implementation in progress — final automated/live/merge/device gates pending**

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

No aisle or row geometry is inferred from seat labels.

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
- `app/cineart-seatmap.js` uses delegated click/keyboard handling only.
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

The shared browser seat-map cache remains 30 seconds.

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
9. exact-head diff review confirms no CineArt observer, browser upstream, PWA/SW or booking drift.

## Post-merge gate

After squash merge, merged-main regression, Chromium, mobile smoke and GitHub Pages deployment must pass.

Android installed-PWA acceptance is mandatory before any subsequent CineArt capability phase. It must verify repeated seat-map open/close, date switching, map responsiveness, plausible row/aisle geometry, wheelchair markers where present, read-only behavior, no booking action, and no recurrence of the historical PWA freeze.
