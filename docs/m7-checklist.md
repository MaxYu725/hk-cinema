# Phase M7 — CineArt fourth-provider integration

Status: **IN PROGRESS — M7A complete**

Phase M7 starts from the completed M6 provider-expansion contract. Do not reopen the Metro redesign while onboarding the fourth provider.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Tracking issue: #86
- Selected candidate: **CineArt / 影藝戲院**
- M7A: **complete**
- Authoritative M7 application/runtime SHA: `220ee09891cf2a14afdd5dcd13f230b2d61a6f4b`
- M7A PR: #87 — `M7A: add CineArt live provider probe`
- PR final head: `1a0ef741da720577948c9bfc551cb9ad8a6e2309`
- PR Run #505: regression tests + Chromium mobile smoke passed.
- CineArt Candidate Validation Run #3: passed against the Cloudflare branch preview.
- Final-head Cloudflare preview deployment succeeded.
- Main Run #506: regression tests + Chromium mobile smoke + GitHub Pages deploy passed.
- Next bounded work: **M7B — active CineArt catalogue/showtime data-source discovery**.

## Baseline

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

CineArt is **not yet registered in the production provider registry**. M7A only proves the current official origin is reachable and structurally identifiable from the Worker. The current site has moved from older `/zh|en/.../index/...` routes to newer `/hk/...` routes, so M7B must identify the active data source before catalogue/showtime adoption.

## M7A — live provider probe

Status: **complete**

- [x] Add CineArt to a candidate-only Worker provider-probe allow-list.
- [x] Keep production `probeAll()` limited to Broadway/MCL/Emperor.
- [x] Probe the current official `/hk` site with a 4.5-second timeout and bounded streaming body scan.
- [x] Stop reading once brand + at least three current cinema markers are found; hard-cap the scan at 4 MiB.
- [x] Verify current brand/site-shell evidence and cinema-directory markers.
- [x] Keep probe `no-store` and outside Service Worker caching.
- [x] Add regression tests for healthy/invalid/oversized CineArt probe responses.
- [x] Add a persistent CineArt candidate-validation workflow for Cloudflare branch previews.
- [x] Deploy final branch preview and run live `/api/providers/probe/cineart`.
- [x] Confirm Cloudflare Worker egress can reach the current CineArt origin.

Live final-head evidence:

- endpoint: branch-preview `/api/providers/probe/cineart`;
- result: `healthy: true` on the first validation attempt;
- latency: approximately 1.32 seconds;
- evidence source: `cinearthouse-hk` / `site-shell-cinema-directory`;
- detected cinemas: `maritime-square`, `jp`, `megabox`, `hollywood`, `mostown`;
- cinema count: 5;
- current site generation also exposed Next.js evidence.

Initial M7A live validation correctly failed before merge because the current homepage advertises a body larger than the first 1 MiB cap. The probe was corrected to bounded streaming evidence detection rather than removing the safety bound or buffering the entire page. The next live validation passed.

M7A exit condition: **met**. A real Cloudflare Worker preview can reach and identify the current CineArt official origin. This does **not** mean CineArt catalogue/showtimes are integrated yet.

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

- [ ] Regression suite passes after production CineArt integration.
- [ ] Chromium mobile smoke passes after production CineArt integration.
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
