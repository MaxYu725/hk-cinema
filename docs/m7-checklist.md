# Phase M7 — CineArt fourth-provider integration

Status: **IN PROGRESS**

Phase M7 starts from the completed M6 provider-expansion contract. Do not reopen the Metro redesign while onboarding the fourth provider.

## Baseline

- Repository: `MaxYu725/hk-cinema`
- M6 final handoff: `docs/m6-handoff.md`
- M6 authoritative application/runtime SHA: `26b8384466eb107322e1b714aedb093c94973c9f`
- M6 final docs merge: `b72c9017e9f35de9d80f3528117c4d8648a801b0`
- Production UI: Metro
- Classic fallback: `?skin=classic`

## Selected candidate

**CineArt / 影藝戲院** is the first real fourth-provider candidate.

Why it is being tested first:

- still an active Hong Kong circuit with multiple locations;
- current official site is reachable at `https://cinearthouse.com.hk/hk`;
- current official mobile app remains maintained in 2026;
- historical official ticketing pages expose movie, language/subtitle, showtime and price data;
- existing site generations expose movie/detail and seat/ticketing route families, making a full contract path plausible.

CineArt is **not yet registered in production**. The current site has moved from older `/zh|en/.../index/...` routes to newer `/hk/...` routes, so M7 must identify the active data source before production adoption.

## M7A — live provider probe

- [ ] Add CineArt to the Worker provider-probe allow-list only.
- [ ] Probe the current official `/hk` site with a bounded body read and timeout.
- [ ] Verify brand/site-shell evidence and current cinema-directory markers.
- [ ] Keep probe `no-store` and outside Service Worker caching.
- [ ] Add regression tests for healthy/invalid/oversized CineArt probe responses.
- [ ] Deploy branch preview and run live `/api/providers/probe/cineart`.
- [ ] Record whether Cloudflare Worker egress can reach the current CineArt origin.

Exit condition: a live Worker probe confirms the current CineArt origin is reachable and structurally identifiable. This does **not** yet mean catalogue/showtime integration is complete.

## M7B — active data-source discovery

- [ ] Identify the current official catalogue/showtime data source used by the `/hk` web/app generation.
- [ ] Prefer structured JSON/API/bootstrap data over scraping rendered HTML.
- [ ] Confirm stable source IDs for movies and sessions.
- [ ] Confirm cinema identifiers for the active CineArt locations.
- [ ] Determine whether price is available at showtime level.
- [ ] Determine whether seat summary/full seat map can be read without a purchase-side effect.
- [ ] Record upstream request count and cacheability.

Exit condition: catalogue + showtime inputs can be normalized without depending on obsolete 2025 routes.

## M7C — provider adapter + catalogue

- [ ] Register `cineart` in `provider-registry.js` with only proven capabilities.
- [ ] Add provider-specific adapter/network/parser code.
- [ ] Normalize catalogue entries through the M6 contract.
- [ ] Publish a synchronous cached catalogue snapshot for shared home aggregation.
- [ ] Add provider-specific loading/error/stale state reporting.
- [ ] Keep existing Broadway/MCL/Emperor behavior unchanged.

## M7D — comparison / booking / optional enrichment

- [ ] Add CineArt showtimes to the shared comparison path.
- [ ] Preserve `Promise.allSettled` failure isolation and request cancellation.
- [ ] Add price only if upstream data proves it supported.
- [ ] Add seat summary/full seat map only if upstream data proves it supported and read-only.
- [ ] Preserve provider-neutral Metro presentation.

## M7E — release gate

- [ ] Regression suite passes.
- [ ] Chromium mobile smoke passes.
- [ ] Cloudflare Worker final-head deployment succeeds.
- [ ] Main Pages deployment succeeds after merge.
- [ ] Real-device check confirms CineArt catalogue/comparison and any enabled optional capability.
- [ ] Final M7 handoff records current provider contract and known limitations.

## Fixed rules

1. Do not add provider-name branches to shared presentation merely to support CineArt.
2. Provider-specific networking/parsing/seat geometry stays provider-specific.
3. `unsupported`, `unknown`, and `available` price/seat states remain distinct.
4. Live cinema data stays outside the Service Worker shell cache.
5. Do not use old `/seat/index/...` pages as a production dependency unless the current site still demonstrably uses them.
6. Do not mark a capability true before the live source is proven.
7. Use bounded request concurrency and abortable foreground work.
8. Stop after each bounded checkpoint and record PR/SHA/CI before proceeding.
