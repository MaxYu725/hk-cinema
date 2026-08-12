# M7B checkpoint — CineArt active data-source discovery

Status: **complete**

This checkpoint records the source contract proven from the user-captured current CineArt HAR and then re-validated live through a Cloudflare Worker branch preview. It does not register CineArt in the production provider registry or expose CineArt in Metro/Data Health/home/comparison.

## Runtime checkpoint

- PR: #88 — `M7B: discover CineArt catalogue and show sources`
- PR final head: `de1a62d427bca83536d4645549a78cb00c0dedba`
- Squash-merged application/runtime SHA: `dafdab741a0864d4e036dc345b548d052cbe99d0`
- PR Run #507: regression tests + Chromium mobile smoke passed.
- CineArt Candidate Validation Run #4: passed against the final Cloudflare branch preview.
- Final-head Cloudflare preview deployment succeeded.
- Main Run #508: regression tests + Chromium mobile smoke + GitHub Pages deploy passed.

## Proven current sources

### 1. Home catalogue/showtime source

Current source:

`GET https://cinearthouse.com.hk/hk`

The response is the current Next.js application document and contains structured React Server Components / Flight data. M7B parses the structured Flight props rather than scraping rendered labels from the page.

The current home props expose at least:

- `movies`
- `shows`
- `showSites`
- `showDates`
- `houseList`

A show record includes stable source identifiers and operational facts such as:

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
- upstream misspelled field `avaliable`

The home payload is therefore sufficient to build the production CineArt catalogue and showtime snapshot without depending on obsolete 2025 `/seat/index/...` routes.

### 2. Show-detail source

Current source:

`GET https://cinearthouse.com.hk/hk/show/<showId>`

If the normal navigation document does not contain the detail props, M7B can issue a GET-only RSC fallback for the same route with the current Next.js navigation headers. No purchase, hold, reservation or booking POST is required to read the proven detail data.

The show-detail Flight data exposes:

- `showDetail.show`
- show/movie/site/house identifiers
- base price
- `ticketPrice`
- `ticketTypes`
- `seatStatus`
- `ticketClasses`
- `seatClasses`
- `show.plan.config`

`show.plan.config` can be a Flight text reference. M7B resolves the referenced length-prefixed Flight text record and obtains seat-plan geometry such as width, height, seat count and block definitions.

## Stable CineArt site identifiers

The current five active show sites are:

| site id | code | location |
| --- | --- | --- |
| 16 | `MB` | MegaBox |
| 17 | `MT` | Maritime Square / 青衣城 |
| 18 | `JP` | JP / 翡翠明珠 |
| 19 | `HW` | Hollywood / 荷里活 |
| 23 | `MO` | MOSTown / 新港城中心 |

Movie IDs and show/session IDs are also present directly in the current Flight source and are suitable provider source IDs.

## HAR evidence vs live evidence

The uploaded HAR captured a changing live schedule, not a static fixture:

- HAR home snapshot: 23 movies, 727 shows, 5 show sites, 25 houses.
- Live final-head M7B validation later returned: 22 movies, 659 shows, 5 show sites, 25 houses.
- Both covered the current 2026-08-12 to 2026-08-28 scheduling window at the time of validation.

The changing counts are expected and demonstrate that the parser reads the current upstream schedule rather than relying on hard-coded HAR values.

## Seat-state semantics

The current CineArt frontend/source establishes these seat states:

- `A` = available/selectable
- `H` = held
- `U` = sold/unavailable
- `L` = locked

The home field `avaliable` must **not** be normalized as strict selectable availability.

Live M7B sample show `80483` proved the distinction:

- home `seats = 381`
- home `sold = 50`
- home `avaliable = 331`
- detail `A = 327`
- detail `H = 3`
- detail `U = 50`
- detail `L = 1`

Therefore:

- `U 50 == sold 50`
- `A 327 + H 3 + L 1 == avaliable 331`

`avaliable` is a coarse remaining/not-sold figure. Strict selectable availability is the `A` count from show detail. Future M7C/M7D normalization must preserve held and locked states instead of reporting them as available seats.

## Live final-head sample

CineArt Candidate Validation Run #4 succeeded on the first attempt and returned:

- movies: 22
- shows: 659
- sites: 5
- houses: 25
- date range: 2026-08-12 through 2026-08-28
- sample show: `80483`
- sample movie id: `799`
- sample site id: `18`
- sample house id: `31`
- base price: HK$110
- seat count: 381
- ticket types: 9
- seat-plan blocks: 26
- seat-plan dimensions: 1270 × 670

The sample show ID matched between home and detail, the detailed seat-state count matched the home seat count, and the sold/U count matched exactly.

## Proven capability inputs

M7B has proven source inputs for:

- catalogue: **yes**
- showtimes: **yes**
- base showtime price: **yes**
- detailed ticket types/prices: **yes, via show detail**
- coarse seat summary: **yes, via home source**
- strict seat states: **yes, via show detail**
- read-only full seat-plan geometry: **yes, via show detail**

This does not mean every capability must be enabled immediately in production. M7C must register only the capabilities it actually wires through the normalized provider contract.

## Request ownership and cacheability

The M7B diagnostic discovery path is deliberately bounded:

1. one GET for `/hk` home Flight data;
2. one GET for `/hk/show/<showId>`;
3. only when the direct show document does not embed the required props, one GET RSC fallback.

So one diagnostic discovery run uses 2 normal upstream requests, or at most 3 with fallback.

This diagnostic pattern must **not** become the normal home-load fanout. Production M7C should:

- fetch the `/hk` source once for a CineArt catalogue/showtime snapshot;
- publish a synchronous cached snapshot to the shared home aggregator;
- fetch show detail lazily only when comparison enrichment, detailed ticket prices or seat information are requested;
- keep foreground work abortable;
- keep live cinema data outside the Service Worker shell cache;
- define an explicit short-lived application/Worker cache policy before production exposure rather than inheriting the diagnostic `no-store` behavior blindly.

## Production boundary after M7B

CineArt remains candidate-only after this checkpoint:

- no `app/provider-registry.js` registration yet;
- no Metro/Data Health/home/comparison exposure yet;
- no shared UI provider-name branches;
- no legacy `/seat/index/...` dependency;
- no purchase-side-effect request used by the discovery path.

Next bounded checkpoint: **M7C — normalized CineArt provider adapter + catalogue snapshot**.
