# Phase 8A — Movie-first navigation

## Goal

Move HK Cinema from provider-first browsing to movie-first browsing without changing the Phase 7B provider adapters, shared movie-detail contract, or shared seat-map contract.

## Home

- A visible movie is one browsing entry regardless of how many cinema chains or release variants provide it.
- Home cards keep movie identity and library actions; provider badges and the old version summary are no longer part of the home-card surface.
- The old home provider filter is disabled so a previously saved provider choice cannot silently hide movies after provider badges are removed.
- Clicking or keyboard-activating any visible movie card opens the common comparison surface directly.

## MovieAggregate model

`window.HKCinemaMovieAggregates` exposes the Phase 8A aggregate layer.

Each aggregate keeps:

- one stable movie identity and display title;
- poster and secondary title when available;
- all provider source IDs grouped by `broadway`, `mcl`, and `emperor`;
- all known release variants;
- one primary comparison match used by the current Phase 7 comparison renderer.

The aggregate layer wraps the existing `HKCinemaProviderMatches` registry instead of changing provider parsers. Existing match IDs remain valid. Aggregate card identities are invalidated and rebuilt when provider catalogues or match groups change, so an early Broadway-only card cannot remain stale after MCL or Emperor data arrives.

## Versions

The separate home `VERSIONS` sheet is bypassed. A grouped movie opens the comparison surface immediately. Until Phase 8C moves version selection into the richer filter panel, known variants are exposed as a compact in-page version rail below the comparison hero so no variant becomes unreachable.

## Single-provider movies

The common comparison surface now accepts a movie with one active provider. This removes the remaining provider-specific navigation exception while preserving the same date, filtering, recommendation, seat-map, and official-booking pipeline.

## Out of scope

Phase 8A does not redesign the comparison-page section order, add rich filters, merge all variant sessions into one timeline, or alter seat-map rendering. Those changes belong to Phase 8B–8D.
