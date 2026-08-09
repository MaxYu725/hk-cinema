# Phase 7B — Shared movie detail interface

Part 2 replaces the Broadway, MCL and Emperor detail markup with one mobile-first renderer while leaving provider fetch, timeout and cache behavior in their existing loaders.

## Shared interface

- One dialog shell, Hero and provider-labelled official booking action.
- One optional facts grid in the order: release date, duration, classification, category, language, subtitles and format.
- Optional directors, cast, description and trailer sections; missing facts are hidden rather than shown as placeholders.
- One date selector, cinema grouping and showtime card structure.
- Showtime cards are non-link `<article>` elements with separate read-only seat-map and official booking controls.
- One loading, stale-data, error, retry and empty-state treatment.

## Data precision

The renderer only accepts `MovieDetailViewModel` and `ShowtimeViewModel` output. It preserves the seat-summary quality defined in Part 1:

- `exact` and `provider-summary` may display supplied counts.
- `estimated` displays an approximate percentage.
- `unknown` never invents a count.
- Emperor provider summaries retain the label “未售”; they are not renamed “已售” or guaranteed “可選”.

## Compatibility boundary

The three seat-map renderers remain separate until Part 3. Shared showtime cards preserve their provider classes and booking context so Broadway grid, MCL area-grid and Emperor positioned seat-map triggers continue to work without returning to linked whole-card navigation.
