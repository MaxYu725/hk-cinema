# Phase M6 — final handoff

Status: **COMPLETE**

Phase M6 is closed after automated release-gate validation and an explicit physical-device sign-off on 2026-08-12.

## Production baseline

- Repository: `MaxYu725/hk-cinema`
- Production site: `https://maxyu725.github.io/hk-cinema/`
- Worker API: `https://hk-cinema-api.max-yu-jp.workers.dev`
- Production skin: **Metro**
- Explicit fallback: `?skin=classic`
- Authoritative application/runtime SHA: `26b8384466eb107322e1b714aedb093c94973c9f`
- PR #84 is the final M6 application checkpoint.
- PR #84 final branch Run #499 passed regression tests + Chromium mobile smoke.
- PR #84 Cloudflare preview succeeded on final head `c25e3e9efe65d6b3b170d4c70f74e106e3ca3966`.
- Main Run #500 passed regression tests + Chromium mobile smoke + GitHub Pages deploy.
- The final handoff/tracker changes after that checkpoint are documentation-only and do not replace the authoritative application SHA above.

## Expansion-gate result

The final gate is accepted.

Automated coverage verifies:

- Metro is the default skin.
- Classic resolves explicitly through `?skin=classic`.
- Mobile home and now/coming interaction.
- Movie-first comparison open/close lifecycle.
- Metro compact filter matrix behavior and viewport containment.
- Classic mobile home/comparison/date/filter layout.
- Shared Metro seat-map open/close lifecycle, grid rendering, seat-state rendering, viewport containment and scroll-lock restoration.

The gate exposed one concrete accessibility issue: the Metro seat-map close target was 38×38 CSS px. PR #84 enlarged it to 44×44, preserved its edge spacing, cache-busted the owning stylesheet and regression-locked the size. The automated review finding was addressed and resolved.

Physical-device sign-off then confirmed normal operation for:

- Metro home.
- Metro comparison.
- Metro filters.
- Metro seat-map.
- Classic fallback.

## Provider-integration contract

A future provider must integrate through the shared contract rather than adding provider-name branches to shared presentation code.

Primary contract owners:

- `app/provider-registry.js` — provider identity and declared capabilities.
- `app/provider-contract.js` — normalized catalogue, aggregate, showtime, price, seat-summary, seat-map and booking data surfaces.
- `app/provider-shared-core.js` — shared registry/capability consumption.

### Required onboarding rules

1. Register provider identity and capability metadata first.
2. Keep provider-specific network endpoints, authentication, parsing and seat geometry inside provider-specific adapters.
3. Normalize shared data before it reaches shared home/comparison presentation.
4. Do not add provider-name conditionals merely to make shared home/comparison/health UI work.
5. Catalogue/showtime/booking are the practical minimum shared surfaces for a useful provider.
6. Price and seat capabilities are optional. `unsupported`, `unknown` and `available` must remain distinct.
7. Unsupported price must never become HK$0.
8. Unsupported or missing seat data must never become “sold out”.
9. A generic provider used by synchronous home-card decoration must expose an already-published synchronous `catalogue` or cached snapshot such as `getCachedCatalogue()`. Do not hide asynchronous network work behind synchronous decoration.
10. Preserve existing movie aggregate shape: `id`, structured `title`, and provider-keyed `sources`.

## Request ownership and reliability baseline

### Home

The normal three-provider cold/online success path is currently bounded at five provider catalogue requests:

- Broadway: 2 (`movies` + `upcoming`).
- MCL: 1 normal success-path catalogue request; a failure-only retry can occur.
- Emperor: 2 (`movies` + `upcoming`).

MCL and Emperor status owners retain re-entry guards. Shared home aggregation can remain usable when one provider fails.

### Comparison

- Provider/source work is failure-isolated with `Promise.allSettled`.
- Foreground comparison owns request tokens and `AbortController` cancellation for movie/date/close supersession.
- Stale responses are ignored.
- Filters are presentation-only and do not start provider requests.
- Adjacent-date prefetch owns a separate abortable lifecycle.

### Showtime caches

- Broadway/Emperor main showtime cache: 60 seconds.
- Only application-success Worker snapshots (`ok:true` with object `data`) remain cacheable.
- HTTP 200 application errors, invalid payloads and missing data are evicted so retries can reach the Worker again.
- Successful initial Broadway/Emperor responses can alias to their validated resolved-date key.
- MCL main comparison cache: 90 seconds.
- MCL initial→resolved-date alias occurs only when metadata is complete; incomplete results remain eligible for the intended explicit-date retry.

### MCL comparison concurrency

Current bounded ownership:

- selected-session `GetSessionInfo`: max 8 concurrent.
- MovieSet bulk sidecar: one per uncached comparison cycle, with real abort/timeout plumbing.
- lazy price enrichment: max 4 concurrent, per-session dedupe/cache, lifecycle cancellation.
- lazy seat-summary enrichment: max 2 concurrent, per-session dedupe/cache, lifecycle cancellation.
- old comparison eager per-session `GetPrice` fan-out is retired.
- ownership order: `WebAPI2 → hybrid → comparison bulk → main cache`.

MCL detail/no-signal consumers deliberately bypass the comparison bulk/suppression policy and retain their legacy WebAPI2 price fallback.

### Duplicate requests

No generic global in-flight coalescer is installed. M6D did not identify a normal same-key concurrent-demand path that justified subscriber-aware coalescing, while current foreground/detail/prefetch consumers own independent abort signals. If a future provider introduces a concrete duplicate path, add narrow owner-local or subscriber-aware coalescing rather than a global first-caller-signal cache.

## PWA/cache boundary

The Service Worker remains a static-shell owner only.

- Live cinema/API/Worker/MCL data stays outside the Service Worker cache.
- Navigation remains network-first with shell fallback.
- Static same-origin shell assets use controlled caching.
- Update activation remains explicit; do not restore automatic `skipWaiting()` during install.

## Known limitations

- Provider upstream schemas and failure modes remain different by design; provider-specific adapters are still necessary.
- Live price/seat coverage depends on what each provider exposes and may legitimately be `unknown` or `unsupported`.
- MCL uses browser/direct upstream paths in parts of the stack and is sensitive to network routing/environment. VPN routing can make MCL appear slow or unavailable even when Hong Kong network access is normal; do not redesign the parser solely around VPN-induced failures.
- The deterministic CI seat-map gate validates the real shared seat-map runtime/DOM/CSS lifecycle without depending on a live session existing at test time. Live provider seat payloads remain covered by provider-specific parsing/regression tests and real-device usage.
- The architecture is ready for provider expansion, but no real fourth provider is integrated by M6.

## Handoff for the next provider phase

When a real fourth provider is selected:

1. Start from `provider-registry.js` and declare capabilities.
2. Implement provider-specific catalogue/showtime networking and parsing without altering the shared Metro UI.
3. Publish a synchronous catalogue snapshot for shared movie aggregation after the provider catalogue has loaded.
4. Normalize data through the shared contract.
5. Add price/seat support only if the upstream genuinely provides it.
6. Add provider-specific failure-isolation and bounded concurrency tests before enabling production traffic.
7. Run regression + Chromium mobile smoke, then perform a focused real-device provider validation.

Do not reopen the Metro redesign merely to onboard a provider. Shared presentation should remain provider-neutral unless a genuinely new product capability requires a deliberate design decision.

## Recovery references

- Durable M6 tracker: `docs/m6-checklist.md`
- M6A baseline audit: `docs/m6a-production-baseline-audit.md`
- M6B architecture: `docs/m6b-architecture-map.md`
- M6C registry contract: `docs/m6c-provider-registry-contract.md`
- M6C normalized contract: `docs/m6c-normalized-capability-contract.md`
- M6C shared adoption: `docs/m6c-shared-provider-adoption.md`
- M6D failure isolation: `docs/checkpoints/m6d-failure-isolation-audit.md`
- M6D home fan-out: `docs/checkpoints/m6d-home-request-fanout.md`
- M6D comparison fan-out: `docs/checkpoints/m6d-comparison-request-fanout.md`
- M6D MCL concurrency: `docs/checkpoints/m6d-mcl-request-concurrency.md`
- M6D final network audit: `docs/checkpoints/m6d-final-network-audit.md`
- Expansion-gate automation: `docs/checkpoints/m6-expansion-gate-automation.md`

Phase M6 ends here. The next development phase may select and integrate a real additional cinema provider using the contract above.