# M6D Checkpoint 1 — Provider failure isolation audit

Date: 2026-08-11

## Scope

This checkpoint is deliberately limited to expansion-readiness behaviour for:

- provider catalogue failure isolation;
- partial / stale / empty-state semantics;
- partial showtime failure isolation;
- price / seat enrichment failure containment.

It does not add a fourth production provider and does not start the later M6D request fan-out / cancellation / duplicate-request audit.

## Audit result

### Home catalogue aggregation

The provider-specific loaders were already mostly isolated:

- Broadway loads `now` and `coming` with `Promise.allSettled` and can retain per-section cache;
- Emperor loads `now` and `coming` with `Promise.allSettled`, records `meta.partial`, and can fall back per section;
- MCL owns one catalogue request and falls back to its last successful cache when available;
- the shared data-health surface records provider status independently.

One cross-provider defect remained in the home aggregation path. `multi-provider.js` treated `movieCount === "—"` as a global loading gate. Broadway uses that count for both loading and a no-usable-data error, so a Broadway failure on the active tab could prevent already-successful MCL / Emperor catalogues from producing provider-only cards. A successful Broadway empty response could also leave its Broadway-specific empty-state beside cards supplied by another provider.

Checkpoint 1 fixes this by:

1. marking the Broadway home grid explicitly as `loading`, `error`, `empty`, or `ready`;
2. waiting only while Broadway is genuinely `loading`;
3. allowing a usable MCL / Emperor catalogue to continue home aggregation when Broadway is `error` or `empty`;
4. replacing the Broadway-only empty/error copy with an aggregate empty state when alternate provider catalogues are usable but contain no movies;
5. removing the base empty-state when alternate provider movies are rendered.

The failure of one home catalogue provider therefore no longer blocks usable catalogue data from another provider.

### Stale and last-success semantics

Current stale behaviour remains valid for this checkpoint:

- provider catalogue caches have a 24-hour usability ceiling;
- data health classifies data older than 15 minutes as aging and older than 2 hours as stale;
- MCL and Emperor cached catalogue metadata preserve the previous successful `updatedAt` / cache timestamp;
- Broadway retains the successful section timestamp when a cached section is used;
- comparison state records per-provider `freshness.updatedAt`, and the resilience panel displays its age and stale classification.

No new timestamp model is introduced in this checkpoint.

### Showtime isolation

The active comparison path already satisfies the partial-failure requirement:

- provider loads use `Promise.allSettled`;
- aggregate movies with multiple source variants also load those sources with `Promise.allSettled`;
- if at least one source for a provider succeeds, its sessions remain usable and `_partialError` records failed variants;
- a failed provider does not clear successful data from other providers;
- the resilience surface distinguishes provider error, stale data, and a successful no-date / empty result.

### Price and seat capabilities

Price and seat summary loading remain optional enrichment:

- a price enrichment failure changes the price field to `—` and marks `data-price-error`;
- a seat enrichment failure changes only the seat field to `座位暫不可用` and marks `data-seat-error`;
- neither path removes or invalidates the parent showtime card;
- providers that declare price / seat as unsupported still retain valid showtime and booking data through the shared capability contract.

## Regression guard

`tests/m6d-failure-isolation.test.mjs` protects the checkpoint contract by checking:

- the explicit Broadway home state markers and alternate-provider fallback path;
- provider/source `Promise.allSettled` isolation in comparison loading;
- stale / empty distinction and last-success age rendering;
- price / seat error handling without showtime-card removal;
- production cache-bust wiring for the changed home scripts.

## Checkpoint boundary

After CI and mobile/Chromium smoke validation, the next M6D checkpoint may review request fan-out, cancellation, retry ownership, and duplicate requests. Those topics are intentionally not changed here.
