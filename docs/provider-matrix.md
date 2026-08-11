# Provider Matrix

Version: 10R2A

This matrix documents the production data paths and reliability expectations. It is a contract/reference document; it does not treat a provider as healthy merely because a route exists.

| Provider | Catalogue | Upcoming | Shows / times | Price | Seats | Official booking hand-off | Live cache boundary |
|---|---|---|---|---|---|---|---|
| Broadway | Supported | Supported | Supported | Supported where exposed by show data | Supported | Supported | catalogue 300s; upcoming 1800s; shows 60s; seats 30s |
| MCL | Aggregated movie catalogue in app | Aggregated upcoming catalogue in app | Supported through ticketing path | Supported; incomplete metadata is not cached | Supported | Supported | ticketing 60s only when metadata is complete, otherwise `no-store`; seats 30s |
| Emperor | Supported | Supported | Supported | Supported where exposed by show data | Supported | Supported | catalogue 300s; upcoming 1800s; shows 60s; seats 30s |

## Production Worker route chain

The deployed Worker entrypoint is intentionally layered:

1. `worker/src/index-emperor-seat.js` — Emperor seat-map routes + telemetry.
2. `worker/src/index-emperor.js` — Emperor catalogue/detail/show routes.
3. `worker/src/index.js` — Broadway routes, MCL ticketing/seat routes, and base `/health`.

`worker/wrangler.jsonc` must continue to point to `src/index-emperor-seat.js`; changing the entrypoint to either lower layer would silently remove provider capabilities.

## Reliability rules

- `/health` is a service/capability declaration, not an upstream end-to-end provider probe.
- Invalid dates and provider identifiers must be rejected before upstream requests.
- Live show/seat data must keep short cache lifetimes.
- Incomplete MCL ticketing metadata must remain `no-store` rather than being promoted to apparently fresh data.
- Health endpoints must remain `no-store`.
- Worker responses should retain request tracing headers (`x-request-id`, `server-timing`) for production diagnosis.
- CI must validate deterministic route/cache contracts without requiring external cinema networks to be reachable.

## Audit boundary

A provider should only be called *live healthy* after a real request returns structurally valid catalogue/show/seat data. Network or DNS failure from a non-Hong-Kong CI/assistant runtime is not, by itself, evidence of a provider regression.
