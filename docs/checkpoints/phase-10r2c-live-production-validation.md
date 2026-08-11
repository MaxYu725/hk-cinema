# Phase 10R2C — Live Production Validation

## Baseline

- Base commit: `acfb6d9de67ec33e61d098ee08872bf60c73fbd8`
- Scope: production/live-data validation harness and evidence collection
- Product UI / PWA / Smart Picks: unchanged

## Validation method

Phase 10R2C adds a separate diagnostic GitHub Actions workflow rather than making live cinema networks part of the normal regression gate.

The workflow calls the deployed production Worker and representative provider paths, writes `live-validation.json`, and uploads the report as a short-lived artifact.

Two production runs were observed from different GitHub-hosted US runner regions:

- Run `31467673672` — West US
- Run `31467921483` — East US 2

Both completed successfully as diagnostic workflows and produced the same provider-level result.

## Production Worker deployment state

The deployed Worker is confirmed to be **10R2B or later**:

- `/health` returned HTTP 200 and `cache-control: no-store`.
- `/api/providers/probe` returned HTTP 200.
- The probe payload contained Broadway, MCL and Emperor provider results.

This resolves the initial concern that the Worker might still be on a pre-10R2B build. The repository's Pages workflow only deploys `app/`, so the mechanism that updates the production Worker remains separate from the GitHub Pages workflow and is not changed in 10R2C.

## Representative live results

### Broadway — healthy

First structured report:

- production catalogue: HTTP 200, 59 movies
- representative movie: `broadway:767` / `《夜王》（導演版）》`
- shows: HTTP 200, 3 available dates, representative date contained 1 session
- representative session exposed price and seat-summary evidence
- official booking URL host was valid
- seat map: HTTP 200 with data

No Broadway reliability patch is justified by this validation.

### Emperor — healthy

First structured report:

- production catalogue: HTTP 200, 28 movies
- representative movie: `emperor:c4ab6a3e2341`
- shows: HTTP 200, 1 available date, 2 sessions
- representative session exposed price and seat-summary evidence
- official booking URL host was valid
- seat map: HTTP 200 with geometry version `6e1-bounds-v2`

No Emperor reliability patch is justified by this validation.

### MCL — partial from non-Hong-Kong runner

First structured report:

- browser-direct catalogue `MCLWebAPI2/GetNCF.aspx?l=1`: HTTP 200
- 52 now-showing catalogue entries were visible
- CORS response allowed `*`
- representative MovieSet ID: `14780` / `功夫女足`
- production Worker ticketing call: HTTP 502 after about 10 seconds
- no session was therefore available to continue the seat-map validation in that run
- 10R2B MCL provider probe also reached its 4.5-second deadline and returned unhealthy

The same provider-level `partial` result reproduced from a second US-hosted runner region.

This is **not treated as proof of an MCL parser regression**. MCL has previously been observed to work quickly on a Hong Kong network while VPN/non-Hong-Kong paths can fail. The browser-direct MCL catalogue was healthy in the same validation run, further supporting a network/path-sensitive interpretation rather than a catalogue outage.

The 10R2B probe currently reports the 4.5-second MCL failure as `upstream_error` rather than `timeout`; this is a diagnostic-classification follow-up, not a reason to rewrite MCL ticketing.

## Changes in 10R2C

- Add `.github/workflows/live-provider-validation.yml`.
- Add `scripts/live-production-validation.mjs`.
- Add deterministic contract coverage proving the live workflow remains separate from normal Pages CI.
- Keep the diagnostic workflow non-blocking with respect to external provider health.

## Explicitly unchanged

- Broadway parser/show/seat logic
- MCL catalogue/ticketing/price/seat logic
- Emperor catalogue/show/seat logic
- movie aggregation and comparison
- Smart Picks
- homepage/comparison UI
- Service Worker / PWA update lifecycle

## Acceptance

- normal Node regression passes
- Chromium mobile smoke passes
- live validation workflow completes and uploads a structured report
- production Worker is confirmed to expose the 10R2B probe route
- Broadway and Emperor representative flows validate end-to-end
- MCL non-Hong-Kong partial result is recorded without overfitting production logic to a likely network-sensitive failure

## Recommended next checkpoint

Phase 10R2D should make provider failure diagnostics more truthful, starting with timeout classification and MCL error observability, while preserving the current successful Hong Kong user path and avoiding retries or fallback complexity that is only motivated by VPN/non-Hong-Kong failures.
