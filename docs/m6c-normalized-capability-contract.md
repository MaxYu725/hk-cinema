# Phase M6C Checkpoint 2 — Normalized provider capability contract

Baseline: M6C Checkpoint 1 merged in PR #75 at application commit `ed1c1f8957b241759e33c964ee17b28e381fcc0b`.

## Objective

Define the shared data/capability semantics a future provider must satisfy before any real fourth cinema chain is integrated. This checkpoint is contract-only: it does not alter the current Broadway, MCL or Emperor requests, parsers, comparison rendering or seat-map implementation.

## Shared data surfaces

`app/provider-contract.js` declares seven normalized surfaces.

### Catalogue entry

Capability: `catalogue`

Required:
- `sourceId`
- `title`

Optional:
- status
- poster
- release date
- duration
- classification
- language/subtitle/format metadata
- booking URL

A provider must supply a stable provider-scoped source identity and a truthful title. Missing optional metadata remains missing.

### Movie aggregate

Capability: `catalogue`

Required:
- aggregate `key`
- display `title`
- contributing `providers`

Optional movie facts may include poster, release date, duration, classification, languages, subtitles and formats. The aggregation layer must not manufacture these values merely to fill the UI.

### Showtime

Capability: `showtimes`

Required:
- `sourceId`
- `cinema`
- `date`
- `time`

Optional:
- house
- start/end timestamps
- formats/languages/subtitles
- price
- seat summary
- booking URL

The four required fields are the minimum needed for a truthful comparison row. Optional price or seat data is independent from the existence of the showtime itself.

### Price

Capability: `prices`

All price fields are optional because providers expose different ticket categories. Normalized fields can include currency, display/adult/student/child/senior/face/lowest price, service fee, ticket types and update time.

A provider with `prices: false` is **unsupported**, not an error and not a zero-dollar price.

### Seat summary

Capability: `seatSummary`

Normalized optional fields include quality, total/available/held/sold/blocked/unavailable/unknown counts, accessible availability, occupied percentage and update time.

A provider with `seatSummary: false` must not be treated as sold out or unavailable. It simply has no seat-summary capability.

### Full seat map

Capability: `seatMap`

Normalized optional fields include request metadata, layout mode, rows, areas and seats. Provider-specific request construction remains inside the provider/seat adapter layer.

A provider can support showtimes and seat summary while deliberately declaring `seatMap: false`.

### Booking

Capability: `booking`

The shared value is a booking URL when available. `booking: false` means the provider has no supported booking action in HK Cinema. `booking: true` with a temporarily missing URL is an unknown/missing value, not the same as unsupported.

## Availability semantics

Optional capabilities have three explicit states:

- `available`: the provider declares the capability and supplied usable data.
- `unknown`: the capability is supported, but this particular item currently has no usable value; unknown provider/capability metadata also remains unknown.
- `unsupported`: the provider descriptor explicitly declares that capability as false.

These states prevent three unsafe assumptions:

1. unsupported price is not converted to `HK$0`;
2. unsupported seat data is not converted to sold out / no seats;
3. supported-but-missing data is not presented as permanently unsupported.

`optionalCapability()` returns both support state and availability state and forces the value to `null` for explicitly unsupported capabilities.

## Fourth-provider-shaped fixture

`tests/fixtures/provider-contract-minimal.json` describes a hypothetical provider that supports catalogue, showtimes and booking, while explicitly not supporting prices, seat summary or a full seat map.

Its catalogue and showtime records satisfy the minimum shared requirements. The fixture is not a real cinema integration and has no network endpoint or parser.

## Provider-name branching rule

Shared home/comparison/status presentation must use provider descriptors and capability metadata. It must not decide support with logic such as `provider === "mcl"` or `provider === "emperor"`.

Provider-specific branches remain valid where they are genuinely adapters for provider-specific network/request/seat-layout formats. M6C is separating provider adapter knowledge from shared UI capability decisions, not pretending every upstream API has the same shape.

## Non-goals

This checkpoint does not:

- add a real fourth provider;
- change current provider request fan-out;
- change movie matching;
- change the accepted Metro or Classic UI;
- refactor the current provider-specific seat-map adapters;
- migrate every existing comparison module to the new capability helper in one batch.

## Next checkpoint

M6C Checkpoint 3 should apply this contract to the remaining shared presentation/comparison paths that still assume named providers or assume price/seat capabilities are always present. Regression fixtures should prove that the hypothetical provider can appear without price/seat UI errors or provider-name branches.
