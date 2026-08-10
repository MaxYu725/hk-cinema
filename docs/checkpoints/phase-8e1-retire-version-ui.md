# Phase 8E1 — Retire temporary version selector

## Goal

Remove the temporary top-level version selector introduced during Phase 8A now that Phase 8C merges all known movie variants into one comparison timeline and exposes variant differences through language, subtitle and screening-format filters.

## Changes

- `phase8a-movie-navigation.js` keeps only movie aggregation and movie-card → comparison navigation.
- The hidden `phase8a-version-rail` is no longer generated.
- Per-variant comparison buttons are no longer registered by the Phase 8A navigation layer.
- Version-rail CSS and the Phase 8C CSS rule that only existed to hide that rail are removed.
- Phase 8A/8B/8C regression tests now describe the current movie-first architecture rather than the temporary migration state.
- Production continues to load only `provider-compare-v4`, `provider-compare-insights-v4`, `provider-compare-preferences-v2` and `provider-compare-recommendations-v4` for the current comparison flow.

## Preserved contracts

- `HKCinemaMovieAggregates` still exposes all provider source IDs and variant metadata.
- Phase 8C still merges all source IDs before filtering.
- Home cards still enter one comparison page directly.
- Rich filters, Smart Picks, Phase 7B seat maps and official booking actions are unchanged.

## Deferred cleanup

The older `multi-provider.js` still contains provider-first/home-filter and legacy movie-group overlay code that Phase 8A currently supersedes. Retiring those internals is intentionally deferred to the next Phase 8E cleanup batch so this checkpoint stays low risk.
