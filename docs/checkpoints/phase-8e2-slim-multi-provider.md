# Phase 8E2 — Slim multi-provider aggregation runtime

## Goal

Retire the provider-first homepage runtime that was superseded by Phase 8A while preserving the catalogue matching and variant metadata required by the Phase 8C aggregate comparison flow.

## Kept

- Broadway / MCL / Emperor catalogue coalescing
- exact-title provider match records
- `HKCinemaProviderMatches`
- `HKCinemaMovieGroups`
- normalized variant grouping and source IDs
- MCL generic bridge / session criteria support
- provider-only catalogue cards for movies missing from Broadway
- merged language / format / release-date metadata
- grouped movie count and `hkcinema:provider-matches` lifecycle event

## Removed

- homepage provider filter state, localStorage and UI
- provider badges and comparison buttons on homepage cards
- provider-specific MCL / Emperor homepage open handlers
- legacy `VERSIONS` overlay and its provider / compare actions
- document click / keyboard handlers owned by those retired paths
- obsolete provider-filter, provider-badge and version-overlay CSS
- Phase 8A CSS rules whose only purpose was hiding those retired controls

## Product contract

The homepage remains movie-first. Provider identity and movie variants are data used by the comparison page, not homepage navigation choices.

Provider-only catalogue cards use the same generic movie-card interaction contract and are handed to `HKCinemaMovieAggregates`, which opens the common comparison page for both single-provider and multi-provider movies.

## Scope boundary

No change to:

- Phase 8C filter matching / merged showtime loading
- Phase 8D Smart Picks
- Phase 8D1 scroll-position hotfix
- Phase 7B shared movie detail / seat maps
- official booking actions
- worker provider parsers

## Validation

`npm test` syntax-checks `multi-provider.js` and the Phase 8E2 regression suite verifies that aggregate registries / variant bridging remain while the obsolete homepage provider-first UI and event handlers no longer exist.
