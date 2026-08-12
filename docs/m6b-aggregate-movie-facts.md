# Phase M6B — Aggregate movie facts checkpoint

This checkpoint removes the comparison hero's dependency on rendered homepage metadata text while preserving the accepted Metro and Classic presentation.

## Changes

- `phase8a-movie-navigation.js` now attaches a structured `facts` object to every movie aggregate:
  - `classification`
  - `durationMinutes`
  - `releaseDate`
- Facts are resolved from the existing provider catalogue/view-model data already loaded by the app, using Broadway first and then other available provider records as fallbacks.
- Grouped variants prefer the primary comparison variant, then fall back to sibling variant sources only when a basic fact is unavailable.
- `phase8b-comparison-layout.js` now renders comparison hero chips directly from `aggregate.facts`.
- Phase 8B no longer locates a homepage card, reads `.movie-meta`, or depends on a literal ` · ` delimiter.
- Metro metadata decoration no longer inserts hidden `metro-meta-separator` nodes solely to keep that old parser working.
- Runtime query versions are bumped so installed/browser clients request the consolidated scripts without changing Service Worker activation policy.

## Boundaries

- no provider network request was added
- no provider/parser/showtime/filter/recommendation/seat behavior changed
- no Metro or Classic geometry/color/interaction redesign
- no Service Worker cache/activation policy change
- missing provider metadata remains missing rather than being guessed

## Remaining M6B item

- review sticky/filter skin branching and remove only ownership duplication that can be consolidated without changing the accepted mobile interaction contract
