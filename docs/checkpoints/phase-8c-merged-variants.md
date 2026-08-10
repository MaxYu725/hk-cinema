# Phase 8C checkpoint — merged variants and rich filters

## Goal

Turn the Phase 8A temporary version selector into real showtime facets. A movie now opens one comparison surface containing all known Broadway, MCL and Emperor release variants.

## Completed in this checkpoint

- comparison engine accepts multiple movie source IDs per provider when the active entry is a `MovieAggregate`
- source IDs are deduplicated before requests
- provider results merge available dates, selected-date sessions and all-session metadata
- a partial failure from one variant source does not discard successful sources from the same cinema chain
- aggregate mode no longer applies a single variant's bridge criteria to the whole movie
- variant tags supplement missing session language / presentation metadata through `versionName`
- top Phase 8A version rail is removed from the visible browsing flow
- all merged sessions remain in one timeline
- `制式` is renamed to `放映方式`
- filters remain collapsed by default and now include:
  - cinema chain
  - language
  - subtitle
  - screening format
  - territory region
  - district
  - cinema
  - time period, including `未來 2 小時` for today's Hong Kong date
  - dynamic maximum-price thresholds
  - reliable seat availability filters
  - time / price / seat sorting
- seat filters only use reliable `available / total` data; unknown seat information is not inferred
- Phase 8C filter preferences use a new v2 storage schema
- Phase 7B seat-map rendering and official booking actions are unchanged

## Mobile behaviour

- version rail no longer consumes vertical space
- filter chips remain horizontally scrollable when many conditions are active
- district / price / seat controls reuse the existing large tap targets
- the primary page order remains Phase 8B's `movie detail → date → filters → recommendations → all showtimes`

## Compatibility boundary

Legacy Phase 8A version-rail code remains in the source tree for rollback compatibility but is no longer visible. Full dead-code removal remains a later cleanup task.

## Not included

- multi-select cinema-chain filters (the current `全部 / Broadway / MCL / Emperor` selector remains single-choice)
- Smart Picks scoring redesign; recommendations continue to consume the already-filtered timeline
- full removal of legacy provider comparison files

## Validation

- `provider-compare-v4.js`, `provider-compare-insights-v4.js` and `provider-compare-preferences-v2.js` are syntax checked by `npm test`
- deterministic Phase 8C contract tests verify aggregate multi-source loading, version metadata enrichment, rich-filter dimensions and removal of the visible version rail
