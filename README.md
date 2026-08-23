# HK Cinema

HK Cinema 是一個以香港院線為核心的電影、場次、票價及座位比較 PWA。

- Production app: <https://maxyu725.github.io/hk-cinema/>
- Production Worker: <https://hk-cinema-api.max-yu-jp.workers.dev>
- Worker health: <https://hk-cinema-api.max-yu-jp.workers.dev/health>

## Supported providers

| Provider | Catalogue | Showtimes | Price | Seat summary | Seat map | Booking |
|---|---:|---:|---:|---:|---:|---:|
| Broadway | Yes | Yes | Yes | Yes | Yes | Yes |
| MCL | Yes | Yes | Yes | Yes | Yes | Yes |
| Emperor Cinemas | Yes | Yes | Yes | Yes | Yes | Yes |
| CineArt | Yes | Yes | Yes | Yes | Yes | Yes |

Capability support does not mean that every upstream record contains every optional value. Missing live data remains `unknown`; the application does not invent prices or seat counts.

## Architecture

The application has two deployment surfaces:

1. `app/` — static HTML, CSS and JavaScript deployed to GitHub Pages.
2. `worker/` — Cloudflare Worker adapters for provider pages and APIs that should not be fetched directly by the browser.

Broadway, Emperor and CineArt use Worker-backed provider routes. MCL catalogue and its primary showtime path use the official MCL browser API directly; the Worker path remains a bounded fallback. This is intentional: MCL is fast and reliable on a normal Hong Kong connection, while VPN or proxy routing can return an incompatible payload. Do not add longer retry chains for that known VPN/proxy case.

Current runtime ownership and the staged cleanup target are documented in [docs/architecture.md](docs/architecture.md). Provider routes, cache boundaries and health semantics are documented in [docs/provider-matrix.md](docs/provider-matrix.md).

## Data contracts

The current provider-neutral contracts live in:

- `app/provider-registry.js` — registered providers and declared capabilities.
- `app/provider-contract.js` — `available`, `unknown` and `unsupported` semantics.
- `app/provider-shared-core.js` — shared catalogue and capability helpers.
- `app/view-models.js` — movie, showtime and seat-map presentation models.
- `worker/src/provider-manifest.js` — Worker provider identity and service declarations.

Provider-specific parsers must preserve official source IDs and normalize into these contracts without fabricating missing values.

## Development

Requirements:

- Node.js 22
- npm

Run the regression suite:

```bash
npm install --no-audit --no-fund
npm test
```

Run the mobile Chromium smoke suite:

```bash
npm run test:e2e
```

The Playwright configuration starts a local static server for `app/` at `http://127.0.0.1:4173`.

## Deployment

- Changes under `app/` are tested and deployed through `.github/workflows/pages.yml` after merge to `main`.
- The Worker is deployed separately by the Cloudflare Git integration using `worker/wrangler.jsonc` and `worker/src/index-emperor-seat.js`.
- Pull requests are checkpoints. Keep each cleanup PR independently reviewable and do not combine unrelated provider, UI and Worker refactors.

## Authoritative documentation

- [Current architecture](docs/architecture.md)
- [Provider matrix](docs/provider-matrix.md)
- [View-model contracts](docs/view-model-contracts.md)
- [M6 provider-scalability handoff](docs/m6-handoff.md)
- `docs/checkpoints/` — historical implementation evidence; not the current architecture source of truth
