# Provider matrix

Status: current production contract at cleanup checkpoint C5.

This matrix describes real production data paths and reliability expectations. A declared capability means that HK Cinema has an implementation for it; it does not guarantee that every upstream movie or showtime supplies the optional value.

## Capability and transport matrix

| Provider | Catalogue / upcoming | Showtimes | Price | Seat summary / map | Official booking | Primary transport |
|---|---|---|---|---|---|---|
| Broadway | Supported | Supported | Supported where supplied | Supported | Supported | Cloudflare Worker parsing official Broadway pages |
| MCL | Supported | Supported | Supported; incomplete metadata is not cached as complete | Supported | Supported | Official MCL WebAPI2 browser-direct, bounded Worker fallback |
| Emperor | Supported | Supported | Supported where supplied | Supported | Supported | Cloudflare Worker using official Emperor API |
| CineArt | Supported, including festival grouping | Supported | Supported where supplied by strict show detail | Supported, read-only official geometry | Supported where an exact official route exists | Cloudflare Worker parsing official CineArt Next/Flight data |

The provider-neutral runtime registry is `app/provider-registry.js`. The Worker provider declaration is `worker/src/provider-manifest.js`. Both currently register `broadway`, `mcl`, `emperor` and `cineart`.

## Production routes

### Service and diagnostics

| Route | Meaning | Cache |
|---|---|---|
| `GET /health` | Service, schema, deployment and declared provider capability information; does not contact upstreams | `no-store` |
| `GET /api/providers/probe` | Independently probes all registered providers | `no-store` |
| `GET /api/providers/probe/{provider}` | Probes one registered provider | `no-store` |

### Broadway

| Route | Data | Cache |
|---|---|---:|
| `GET /api/broadway/movies` | Current catalogue | `no-store`; provider adapter owns fallback |
| `GET /api/broadway/upcoming` | Upcoming catalogue | `no-store`; provider adapter owns fallback |
| `GET /api/broadway/movies/{movieId}/shows?date=YYYY-MM-DD` | Dates and sessions | `no-store`; comparison service owns 60-second cache |
| `GET /api/broadway/shows/{showId}/seats` | Seat map and summary | `no-store`; seat-map service owns 30-second cache |

### MCL

The normal Hong Kong-network path reads official MCL WebAPI2 in the browser. The Worker routes below provide bounded fallback ticketing and seat-map services.

| Route | Data | Cache |
|---|---|---:|
| `GET /api/mcl/ticketing?movieSetId={id}&date=YYYY-MM-DD` | Ticketing sessions | `no-store`; comparison service caches complete metadata only |
| `GET /api/mcl/shows/{sessionId}/seats?cinemaCode={code}` | Seat map | `no-store`; seat-map/enrichment service owns short cache |

A fast HTTP 200 response with an incompatible MCL payload is the known VPN/proxy failure mode. It must fail with the explicit VPN/proxy message instead of entering a long fallback chain or presenting stale partial sessions.

### Emperor

| Route | Data | Cache |
|---|---|---:|
| `GET /api/emperor/movies` | Current catalogue | `no-store`; provider adapter owns fallback |
| `GET /api/emperor/upcoming` | Upcoming catalogue | `no-store`; provider adapter owns fallback |
| `GET /api/emperor/movies/{filmUniqueId}/shows?date=YYYY-MM-DD` | Dates and sessions | `no-store`; comparison service owns 60-second cache |
| `GET /api/emperor/shows/{scheduleId}/seats?...` | Seat map | `no-store`; seat-map service owns 30-second cache |

### CineArt

| Route | Data | Response cache contract |
|---|---|---|
| `GET /api/cineart/catalogue` | Current, upcoming and festival catalogue | Worker-managed fresh/stale Cache API; outer response `no-store` |
| `GET /api/cineart/movies/{movieSourceId}/shows?date=YYYY-MM-DD` | Dates, sessions, strict detail price/seat data | Worker-managed fresh/stale Cache API; outer response `no-store` |
| `GET /api/cineart/shows/{showId}/seats?movieSourceId={id}` | Read-only official seat geometry | Worker-managed short Cache API; outer response `no-store` |
| `GET /api/providers/cineart/discovery` | Passive discovery evidence | `no-store` |

## Health contract

`GET /health` exposes:

- `ok`, `service` and `schemaVersion: 2`;
- `providers`, generated from the Worker provider manifest;
- `freshness`, describing declared fallback boundaries;
- `cacheOwners`, declaring the service owner for each resource class;
- `deployment.versionId`, `deployment.versionTag` and `deployment.createdAt` when Cloudflare version metadata is available;
- `time`, generated for the current request;
- temporary legacy `phase: "6G"` for existing validation scripts.

The legacy phase is deprecated. New code must use `schemaVersion` and provider/capability fields rather than ordering releases by historical phase labels.

## Probe result contract

Provider probes run independently and are never called by normal homepage/comparison loading. Each result exposes:

- `healthy` / `status`;
- `latencyMs`;
- `checkedAt`;
- best-effort `lastSuccessAt`;
- a categorized failure with code and optional upstream HTTP status;
- provider-specific structural evidence when healthy.

`lastSuccessAt` is kept only in the current Worker isolate. It is useful for immediate diagnosis but is not durable monitoring history.

## Reliability rules

1. Validate provider IDs, movie/show IDs, cinema codes and dates before upstream requests.
2. One provider failure must not convert the whole probe or comparison into a transport failure.
3. Do not promote incomplete MCL metadata to an apparently fresh cache entry.
4. Live showtime and seat data must keep short lifetimes.
5. Do not infer a price, seat count, format, language or booking route without reliable provider evidence.
6. Retain `x-request-id` and `server-timing` on Worker responses.
7. CI contract tests must not require external cinema networks; live probes are separate candidate/production evidence.
8. Network or DNS failure from a non-Hong-Kong environment is not by itself evidence of an MCL parser regression.

## Current cleanup boundary

Checkpoint C5 keeps the C3 catalogue and C4 comparison boundaries, then adds one Worker client and one Worker route table. Public Worker responses are `no-store`; catalogue, comparison, enrichment, seat-map and shell caches have explicit independent owners. C5 does not change provider parsers, MCL browser-first transport or VPN fast failure, official booking logic, comparison selectors or seat-map geometry. C6 asset bundling remains a separate checkpoint.
