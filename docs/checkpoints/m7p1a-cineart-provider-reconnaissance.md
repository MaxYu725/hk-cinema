# M7P1A checkpoint — CineArt provider reconnaissance

Status: **complete — reconnaissance only**

This checkpoint re-evaluates CineArt as a new provider candidate after M7R1–M7R7 provider-expansion hardening. It deliberately does **not** restore the old M7 CineArt implementation and does **not** register CineArt in the production browser Provider Registry or Worker provider manifest.

## Baseline and scope

- Baseline `main`: `3e7c18383875908721b7a0212815137d8ae81590`
- Production providers remain: Broadway, MCL, Emperor.
- No PWA / Service Worker behavior is changed.
- No production Worker route is added.
- No CineArt catalogue, comparison, Data Health, detail, price, seat or booking UI is exposed.
- Historical M7A–M7D code is research evidence only; no historical commit/file is restored wholesale.

## Current shared extension points verified

M7R7 leaves the new provider boundary in the intended owners:

- `app/provider-registry.js` — provider identity and declared capabilities.
- `app/provider-contract.js` — generic catalogue/showtime/price/seat/booking contracts.
- `app/provider-shared-core.js` — Registry-driven enumeration and neutral `hkcinema:provider-catalogue` snapshots.
- `app/provider-compare-v4.js` — optional `HKCinemaProviders[provider].comparison` adapter with `fetchShows`, `normalizeSession`, `metadataComplete`, and `canReuse` hooks.
- `app/provider-compare-main-cache-v3.js` — optional `HKCinemaProviders[provider].comparisonCache` override; otherwise Worker show routes use generic per-provider buckets.
- `app/view-models.js` — optional `HKCinemaProviders[provider].seatMapRequest` and `HKCinemaProviders[provider].viewModels.seatMap` hooks; no future provider needs a new shared provider-name branch.
- `worker/src/provider-manifest.js` — Worker provider universe; CineArt is intentionally absent at M7P1A.
- `worker/src/provider-probe.js` — default probes are manifest-owned; a production CineArt probe must be added only with the M7P1B Worker adapter/manifest checkpoint.

## Historical references used as evidence

The following merged/closed work was inspected but must not be restored directly:

- PR #87 / M7A — candidate-only CineArt origin probe.
- PR #88 / M7B — current Next.js Flight source discovery and GET-only show-detail discovery.
- PR #89 / M7C — first normalized catalogue adapter and old production registration.
- PR #90 / M7D — showtime normalization plus lazy price/seat enrichment.
- PR #95 / M7R — full rollback to the pre-CineArt stable tree after real-device freeze.

The key lesson is to reuse **provider-specific source knowledge and parsers**, not the old browser lifecycle/UI wiring.

## Upstream source contract

### 1. Home catalogue / cinema list / showtime snapshot

Proven source:

`GET https://cinearthouse.com.hk/hk`

The response is a Next.js application document containing React Server Components / Flight records. The previously live-validated structured props contain at least:

- `movies`
- `shows`
- `showSites`
- `showDates`
- `houseList`

Useful show fields include:

- show/session `id`
- `movie.id`
- `site.id`
- `house.id`
- `date`
- `time`
- base `price`
- `seats`
- `seatsHold`
- `sold`
- upstream misspelling `avaliable`

The current public site was re-checked during M7P1A and still presents the same five-cinema footprint previously discovered: MegaBox, Maritime Square / 青衣城, JP / 翡翠明珠, Hollywood / 荷里活, and MOSTown / 新港城中心.

Previously observed stable site IDs/codes, to be treated as fixtures rather than hard-coded universe rules:

| Site ID | Code | Location |
| --- | --- | --- |
| 16 | `MB` | MegaBox |
| 17 | `MT` | Maritime Square / 青衣城 |
| 18 | `JP` | JP / 翡翠明珠 |
| 19 | `HW` | Hollywood / 荷里活 |
| 23 | `MO` | MOSTown / 新港城中心 |

### 2. Show detail / ticket prices / seat state / seat geometry

Proven read-only source:

`GET https://cinearthouse.com.hk/hk/show/<showId>`

If the normal navigation response does not contain the required Flight props, the old discovery path successfully used a GET-only RSC fallback to the same route with:

- `RSC: 1`
- `Next-Url: /hk/movie/<movieId>`
- `Next-Router-State-Tree: <encoded Next.js router state>`
- `Accept: */*`

The detail Flight props exposed:

- `showDetail.show`
- show/movie/site/house identifiers
- base price
- `ticketPrice`
- `ticketTypes`
- `seatStatus`
- `ticketClasses`
- `seatClasses`
- `show.plan.config`

`show.plan.config` can be a Flight text reference. The old Flight decoder resolved the referenced length-prefixed text record and recovered read-only seat-plan geometry including dimensions, seat count and block definitions.

### 3. Request headers / cookies / tokens

The prior live-proven read path required only bounded GET requests with normal browser-like headers:

- `Accept: text/html,application/xhtml+xml,*/*;q=0.8`
- `Accept-Language: zh-HK,zh-TW;q=0.9,en;q=0.8`
- a neutral Worker `User-Agent`
- `redirect: follow`
- `cache: no-store` for discovery/network acquisition

No cookie, bearer token, CSRF token, login state, purchase POST, hold POST or reservation POST was required for the proven catalogue/show/detail read path.

This is historical evidence, not a permanent assumption. M7P1B must re-prove Worker egress and header requirements against the live origin before any production registration.

## Seat-state semantics

The detailed source previously established:

- `A` = available/selectable
- `H` = held
- `U` = sold/unavailable
- `L` = locked/blocked

The home field `avaliable` is **not** strict selectable availability. A previously validated sample showed:

- home: `seats = 381`, `sold = 50`, `avaliable = 331`
- detail: `A = 327`, `H = 3`, `U = 50`, `L = 1`

Therefore `A + H + L = avaliable`; the home value is a coarse remaining/not-sold figure. A fresh CineArt adapter must preserve this distinction and must never map `avaliable` to `seatSummary.available`.

## CineArt Capability Matrix

| Capability / source | M7P1A evidence | Production decision after M7P1A |
| --- | --- | --- |
| Catalogue | **Yes** — `movies` in `/hk` Flight props | Candidate for M7P1B normalization; not registered yet |
| Movie detail | **Partial / sufficient metadata** — rich movie objects exist; show detail is proven, but a dedicated movie-detail contract is not separately required/proven | Use home movie metadata first; re-check dedicated detail only if needed |
| Cinema list | **Yes** — `showSites` | Re-normalize in Worker adapter |
| Showtimes | **Yes** — `shows` | Keep disabled until M7P1D production capability step |
| Base price | **Yes** — show `price` | Treat as coarse/base price |
| Detailed ticket prices | **Yes** — `ticketPrice.ticketTypes` via show detail | Lazy enrichment only; enable later in M7P1E |
| Seat summary, coarse | **Yes** — `seats`, `sold`, `avaliable` | Preserve as coarse; never claim strict availability |
| Seat summary, strict | **Yes** — detailed `A/H/U/L` | Lazy detail; enable later in M7P1E |
| Full seat-map source | **Yes, read-only source proven** — `seatStatus` + `show.plan.config` | Production `seatMap` remains false until M7P1F |
| Booking URL | **Not proven** | Keep `booking:false` until a stable read-only booking translation is proven |
| Purchase / hold ticketing | **Not in scope / not proven** | Do not call side-effect endpoints |
| Language metadata | **Yes** — movie dialect/localized fields | Re-normalize in Worker adapter |
| Subtitle metadata | **Yes** — movie subtitle/localized fields | Re-normalize in Worker adapter |
| Format metadata | **Unproven / incomplete** — old production normalizer emitted `[]` | Re-probe current Flight before declaring support |

## Safe reuse vs rewrite decision

### Safe to reuse as provider-specific logic, after fixture/live re-validation

- Next.js Flight chunk decoding and balanced-object extraction from old `cineart-flight.js`.
- Flight text-reference resolver for `show.plan.config`.
- Bounded response reading, timeout and maximum-payload guards.
- Localized-value helpers for CineArt source fields.
- Catalogue normalization concepts: source IDs, release date, duration, titles, poster/media-base handling, language/subtitle/director/cast extraction.
- Showtime normalization concepts: show/movie/site/house IDs, Hong Kong date/time, base price, and metadata extraction.
- Strict `A/H/U/L` seat-state semantics.
- Short-lived Worker cache policy concepts: catalogue/showtime snapshot caches and very short detail cache with no stale seat-detail fallback.

These are upstream-schema adapters and remain valid provider-specific ownership.

### Must be rewritten or deliberately not restored

- Old production `provider-registry.js` CineArt entry: capabilities must be reintroduced stage-by-stage under M7P1C–F.
- Old `cineart-status.js`: it owned CineArt-specific catalogue/Data Health events that predate the current neutral Shared Core catalogue bus.
- Old `multi-provider-registry-extension.js`: current M7R2+ home aggregation is Registry/Shared-Core driven and must own new provider catalogue participation.
- Old `cineart-compare-enrichment.js`: **do not restore**. It derived identity from rendered DOM, installed Mutation/Intersection observers, maintained an independent queue/lifecycle, and mutated comparison cards after rendering. New integration must use the provider comparison/price/seat adapter boundaries rather than a parallel UI observer lifecycle.
- Any old shared provider-name branch or fixed-four UI logic.
- Old PWA/Service Worker changes from M7F–M7H; CineArt provider work must not alter PWA shell ownership.
- Old direct production registration and simultaneous capability enablement.

## M7P1B entry contract

The next checkpoint may implement **Worker adapter only** and may reuse the source parser ideas above, but it must satisfy all of the following before M7P1C:

1. Re-prove Cloudflare Worker egress to the live CineArt origin.
2. Capture current fixtures for `/hk` and one GET-only show detail/RSC fallback.
3. Validate payload bounds and timeout behavior.
4. Confirm current field semantics for catalogue, cinemas, shows, language/subtitle, base price, detailed prices and `A/H/U/L` seats.
5. Explicitly determine whether usable format metadata now exists.
6. Keep purchase/hold/reservation side effects out of the adapter.
7. Add candidate/debug/probe routes and tests only; do not register CineArt in the browser Provider Registry or expose it on the homepage.
8. Do not add CineArt to the production Worker manifest until the M7P1B adapter/probe is complete and its manifest registration is part of that bounded Worker checkpoint.

## M7P1A production boundary

At the end of this checkpoint:

- `app/provider-registry.js` still contains only Broadway, MCL and Emperor.
- `worker/src/provider-manifest.js` still contains only Broadway, MCL and Emperor.
- CineArt is not visible on the homepage, Data Health, comparison, detail or seat-map UI.
- No production API route or Worker provider probe for CineArt has been added.
- The next permitted change is **M7P1B — CineArt Worker adapter only**.
