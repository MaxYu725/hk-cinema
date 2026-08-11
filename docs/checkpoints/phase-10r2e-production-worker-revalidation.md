# Phase 10R2E — Production Worker Deployment & Live Re-validation

## Baseline

- Base commit: `433673058dde717a5c8eb821d7a6ac59d4c9b627`
- Base phase: completed Phase 10R2D
- Scope: production deployment proof and live diagnostic re-validation only
- Product UI / PWA / Smart Picks / provider parsing: unchanged

## Production deployment path confirmed

The repository is connected directly to Cloudflare Workers Builds. The Phase 10R2D `main` commit has a successful GitHub check run:

- Check: `Workers Builds: hk-cinema-api`
- Git commit: `433673058dde717a5c8eb821d7a6ac59d4c9b627`
- Cloudflare production Version ID: `e9618e91-ba19-406e-82d2-e8219ff4b3eb`
- Check conclusion: success

This resolves the earlier deployment uncertainty. The normal GitHub Pages workflow still deploys only `app/`, but Cloudflare Workers Builds independently deploys the Worker from the connected repository.

No GitHub Actions Cloudflare secrets or duplicate `wrangler deploy` workflow are needed.

## 10R2E validation harness

Phase 10R2E extends the existing diagnostic Live Provider Validation workflow without turning live provider health into a merge gate.

The added re-validation step:

1. Reads the existing structured live-validation report.
2. Reuses the representative MCL `movieSetId` selected by that report.
3. Makes one focused request to the production `/api/mcl/ticketing` endpoint.
4. Records:
   - HTTP status
   - latency
   - cache policy
   - request ID / Server-Timing when present
   - stable public error code
   - diagnostic category
   - cause code
   - upstream status
   - Worker-recorded elapsed time
   - whether the 10R2D diagnostics contract is present
   - whether timeout specifically matches HTTP 504 + `MCL_UPSTREAM_TIMEOUT`
5. Writes the evidence back into the same `live-validation.json` artifact.

The workflow does not deploy the Worker, does not require Cloudflare credentials, and intentionally remains diagnostic-only.

## Production live re-validation

Live Provider Validation run:

- Run ID: `31471451942`
- Job: `production-live-validation`
- GitHub runner region: `eastus`
- Expected production commit: `433673058dde717a5c8eb821d7a6ac59d4c9b627`
- Conclusion: success
- Artifact ID: `9093503446`
- Artifact SHA-256: `72042617e173169c7750cb56c3a2886dc43bf16deee59ba47e4f39b3197721b1`

### Representative provider result

The existing full validation completed successfully and reported:

- Broadway: healthy
- MCL: partial
- Emperor: healthy
- Worker `/health`: HTTP 200
- provider probe route: HTTP 200

This matches the earlier 10R2C provider-level result and does not justify a parser rewrite.

### MCL 10R2D diagnostic contract — confirmed in production

Representative MCL movie:

- `movieSetId`: `14780`

Production ticketing response from the East US runner:

- HTTP status: `504`
- request latency: about `10068 ms`
- 10R2D diagnostics contract present: `yes`
- category: `timeout`
- cause code: `MCL_UPSTREAM_TIMEOUT`
- timeout 504 contract: `matches`

This is the required evidence that the Phase 10R2D timeout/error-classification code is running in the production Worker. Before 10R2D, the equivalent non-Hong-Kong failure was returned as generic HTTP 502 / ambiguous `upstream_error`.

## Interpretation

The MCL result remains a network/path-sensitive non-Hong-Kong runner result, not evidence that the normal Hong Kong user path is broken. The user previously established that MCL is fast and normal over a Hong Kong network and that apparent failures were strongly associated with VPN/non-Hong-Kong routing.

Phase 10R2E therefore makes no changes to:

- MCL WebAPI endpoint selection
- request retry count
- request timeout values
- parsing / normalization
- metadata enrichment
- pricing
- seat maps
- Broadway or Emperor logic
- frontend provider aggregation
- comparison UI
- Smart Picks
- Service Worker / PWA lifecycle

## Cloudflare PR preview

The 10R2E PR branch also received a successful Cloudflare Workers Builds preview:

- Preview Version ID: `1d91a41d-31ed-4a6e-98ef-35eea8239bd1`

This preview is not used as proof of production deployment. Production proof remains the successful Cloudflare build attached to the Phase 10R2D `main` commit plus the live request to the production Worker.

## Outcome

Phase 10R2E closes the deployment-observability gap left after 10R2D:

- production deployment path identified
- 10R2D exact `main` commit deployment proven
- production Worker live-tested from an independent runner
- MCL timeout now truthfully classified as HTTP 504 / `timeout` / `MCL_UPSTREAM_TIMEOUT`
- Broadway and Emperor remain healthy
- no provider parser rewrite or product change required

The next phase can leave provider reliability stabilization and return to product work, unless new Hong Kong-network evidence shows a genuine provider regression.
