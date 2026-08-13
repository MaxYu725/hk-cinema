# M7P1B checkpoint — CineArt Worker adapter only

Status: **implementation complete — live branch-preview gate required before merge**

Baseline: `e821036a07b4e290249f8b47465d850e1eff3cee` (M7P1A)

M7P1B reintroduces CineArt only on the Cloudflare Worker side. The browser application remains on the three production providers Broadway, MCL and Emperor. No CineArt script, catalogue snapshot, comparison adapter, Data Health loader, detail owner, seat-map owner or PWA/Service Worker code is added to `app/`.

## Ownership

The integration is registered in the existing M7R7 owners rather than patched after load:

- `worker/src/provider-manifest.js` adds the Worker-side `cineart` entry.
- `worker/src/provider-probe.js` adds a manifest-compatible `probeCineArt` builder.
- `worker/src/index-emperor-seat.js`, the current Wrangler entry router, owns the read-only candidate discovery route.
- `worker/src/providers/cineart-flight.js` owns CineArt Next.js Flight decoding.
- `worker/src/providers/cineart.js` owns CineArt upstream fetch, normalization, probe and read-only discovery.

`app/provider-registry.js` remains unchanged and does not contain CineArt.

## Worker manifest state

CineArt is registered as:

`candidate-catalogue-shows-readonly`

This makes Worker `/health` and provider probe enumeration truthful about the candidate Worker adapter, while browser production remains three-provider until M7P1C.

The existing `/health` contract remains:

`phase: "6G"`

M7P1B does not change that phase value.

## Current upstream adapter

### Home source

Read-only source:

`GET https://cinearthouse.com.hk/hk`

The bounded Worker reader accepts at most 4 MiB and applies a 4.5 second request timeout. It parses Next.js Flight props containing:

- `movies`
- `shows`
- `showSites`
- `houseList`
- `showDates` when present

The home normalizer produces an internal Worker snapshot containing:

- normalized catalogue (`now`, `coming`, `festival`)
- cinema identities
- normalized show sessions
- language/subtitle metadata
- explicit format metadata only when the upstream explicitly exposes a format/version field
- base price
- coarse seat information

No browser route consumes this snapshot in M7P1B.

### Coarse seat semantics

The upstream misspelled `avaliable` field remains deliberately named `notSold` in the Worker adapter.

It is never normalized to `seatSummary.available`.

For home/session data:

- `total` = upstream `seats`
- `sold` = upstream `sold`
- `notSold` = upstream `avaliable`
- `upstreamSeatsHold` = upstream `seatsHold`
- strict `available` = `null`
- strict `held` = `null`

This prevents held/locked seats from being falsely reported as selectable before show detail is read.

## GET-only show detail

Primary read-only source:

`GET https://cinearthouse.com.hk/hk/show/<showId>`

If the document does not contain show props, the adapter uses a GET-only RSC fallback for the same show route with:

- `RSC: 1`
- `Next-Url: /hk/movie/<movieId>`
- `Next-Router-State-Tree: <encoded state>`
- `Accept: */*`

No purchase, hold, reservation or booking POST is implemented.

The detail normalizer recognizes:

- active online ticket types and prices
- `A` available
- `H` held
- `U` sold/unavailable
- `L` locked/blocked
- length-prefixed Flight text references for `show.plan.config`
- read-only seat-plan dimensions/block count

The raw geometry is not exposed as a production seat-map contract in M7P1B. `seatMap` remains a future browser capability for M7P1F.

## Candidate diagnostic routes

### Provider probe

`GET /api/providers/probe/cineart`

The probe performs a bounded, early-stopping read of the public CineArt shell and requires brand, Next.js and cinema-directory evidence.

### Worker discovery

`GET /api/providers/cineart/discovery`

This route is `no-store`, read-only and candidate diagnostic only. It reads one current home snapshot and one sample show detail, with an RSC GET fallback only if needed. It returns summaries/capability evidence rather than the complete live schedule or seat geometry.

Non-GET requests return `405 METHOD_NOT_ALLOWED`.

There is deliberately no M7P1B production route such as:

- `/api/cineart/catalogue`
- `/api/cineart/movies/<id>/shows`
- `/api/cineart/shows/<id>/seats`

Those are introduced only in the later capability-specific checkpoints if the preceding gate remains stable.

## Fixtures and deterministic regression

M7P1B stores minimized structural fixtures rather than a full captured live schedule:

- `tests/fixtures/cineart-home-flight.html`
- `tests/fixtures/cineart-show-flight.html`

They preserve the current source shapes needed to test:

- Flight decoding
- catalogue/cinema/show identity
- Hong Kong date/time normalization
- language/subtitle extraction
- base price
- coarse `avaliable` semantics
- ticket-type prices
- strict `A/H/U/L` seat semantics
- Flight text-reference seat-plan resolution
- direct document and RSC fallback paths

The fixtures are intentionally minimal and do not hard-code live catalogue counts or treat the five current cinema IDs as the provider universe.

## M7P1B capability evidence model

The live discovery gate must report:

| Capability | Required for M7P1B live gate |
| --- | --- |
| catalogue | yes |
| cinemaList | yes |
| showtimes | yes |
| basePrice | yes |
| detailedPrices | yes |
| coarseSeatSummary | yes |
| strictSeatSummary | yes |
| seatMapReadOnly source | yes |
| languageMetadata | yes |
| subtitleMetadata | yes |
| formatMetadata | observed, but not required |
| booking | must remain false |

`formatMetadata` is intentionally not required because M7P1A found the old adapter had no reliable explicit format field. M7P1B records whether explicit format/version evidence is present on the current live source without inventing it from movie categories.

## Live branch-preview gate

`.github/workflows/cineart-candidate-validation.yml` validates the Cloudflare branch preview rather than the existing production Worker.

It requires:

1. `/health` still reports `phase: "6G"` and contains the CineArt Worker manifest entry;
2. `/api/providers/probe/cineart` is healthy with current CineArt shell evidence;
3. `/api/providers/cineart/discovery` parses current catalogue/show data;
4. a current sample show correlates home and detail identifiers;
5. total/sold/not-sold seat semantics correlate between home and strict detail states;
6. ticket prices, strict seats and read-only seat-plan geometry are available from the GET-only detail path;
7. booking remains false.

The normal PR gate must separately pass Node regression, Chromium installation and mobile browser smoke.

## Production boundary after M7P1B

Even after this Worker checkpoint passes:

- browser `app/provider-registry.js` remains Broadway/MCL/Emperor only;
- CineArt does not appear on the homepage;
- CineArt is not part of search/sort/count aggregation;
- CineArt is not part of comparison;
- CineArt prices/seats are not rendered;
- CineArt seat-map is not exposed;
- no PWA or Service Worker behavior changes.

Next checkpoint after a successful M7P1B merge: **M7P1C — CineArt catalogue-only browser production registration**.
