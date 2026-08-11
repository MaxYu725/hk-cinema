# Provider Matrix

Version: 10R2B

This matrix documents the production data paths and reliability expectations. It is a contract/reference document; it does not treat a provider as healthy merely because a route exists.

| Provider | Catalogue | Upcoming | Shows / times | Price | Seats | Official booking hand-off | Live cache boundary | Probe evidence |
|---|---|---|---|---|---|---|---|---|
| Broadway | Supported | Supported | Supported | Supported where exposed by show data | Supported | Supported | catalogue 300s; upcoming 1800s; shows 60s; seats 30s | ticketing catalogue page with expected Next/movie structure |
| MCL | Aggregated movie catalogue in app | Aggregated upcoming catalogue in app | Supported through ticketing path | Supported; incomplete metadata is not cached | Supported | Supported | ticketing 60s only when metadata is complete, otherwise `no-store`; seats 30s | `MCLWebAPI2/GetCinemaDetails.aspx` returns a non-empty JSON directory |
| Emperor | Supported | Supported | Supported | Supported where exposed by show data | Supported | Supported | catalogue 300s; upcoming 1800s; shows 60s; seats 30s | existing Emperor showing-catalogue probe |

## Production Worker route chain

The deployed Worker entrypoint is intentionally layered:

1. `worker/src/index-emperor-seat.js` — provider probe routes, Emperor seat-map routes, and telemetry.
2. `worker/src/index-emperor.js` — Emperor catalogue/detail/show routes.
3. `worker/src/index.js` — Broadway routes, MCL ticketing/seat routes, and base `/health`.

`worker/wrangler.jsonc` must continue to point to `src/index-emperor-seat.js`; changing the entrypoint to either lower layer would silently remove provider capabilities.

## Health and probe endpoints

- `/health` remains a service/capability declaration. It does not contact all upstream providers.
- `/api/providers/probe` runs Broadway, MCL, and Emperor probes independently and in parallel.
- `/api/providers/probe/{provider}` probes one of `broadway`, `mcl`, or `emperor`.
- Probe responses are always `no-store`.
- A reachable probe endpoint can return HTTP 200 while one or more providers are `unhealthy`; provider health is represented in the response body so one upstream cannot turn the entire probe service into a transport failure.
- Probe execution is bounded to a 4.5-second orchestration deadline per provider. Broadway and MCL fetches are actively aborted at the deadline; Emperor is isolated by the same orchestration deadline while preserving its existing production probe/parser implementation.

## Probe result contract

Each provider result exposes:

- `healthy` / `status`
- `latencyMs`
- `checkedAt`
- `lastSuccessAt`
- `failure.category`, `failure.code`, and optional status when unhealthy
- provider-specific structural `evidence` when healthy

Failure categories are stable diagnostic classes such as `timeout`, `blocked`, `rate_limited`, `http_error`, `invalid_payload`, `empty_payload`, `network_error`, and `upstream_error`.

`lastSuccessAt` is best-effort per Worker isolate. It is useful for short-lived diagnosis but is not durable monitoring history; durable historical health would require external storage and is outside 10R2B.

## Reliability rules

- Invalid dates and provider identifiers must be rejected before upstream requests.
- Live show/seat data must keep short cache lifetimes.
- Incomplete MCL ticketing metadata must remain `no-store` rather than being promoted to apparently fresh data.
- Health and probe endpoints must remain `no-store`.
- Worker responses should retain request tracing headers (`x-request-id`, `server-timing`) for production diagnosis.
- Normal homepage/comparison loading must not call or depend on the provider probe routes.
- CI must validate deterministic route/probe/cache contracts without requiring external cinema networks to be reachable.

## Audit boundary

A provider should only be called *live healthy* after a real probe returns structurally valid provider evidence. Network or DNS failure from a non-Hong-Kong CI/assistant runtime is not, by itself, evidence of a provider regression.
