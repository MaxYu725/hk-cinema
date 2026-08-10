# Phase 9B1 — Classic polish foundation / theme-ready presentation

Date: 2026-08-10

## Goal

Begin visual polish without changing the movie-first product flow, while creating a presentation boundary that can later support a Windows Phone / Metro skin over the same functional core.

## Changes

- Add `app/theme-foundation.css` as the final presentation stylesheet.
- Mark the current production presentation with `data-skin="classic"` on the root HTML element.
- Introduce three token layers:
  - skin tokens (`--skin-*`) for a concrete visual language
  - semantic presentation tokens (`--color-*`, `--radius-*`, shadows, motion, spacing)
  - legacy aliases (`--bg`, `--surface`, `--text`, etc.) so older CSS can migrate gradually without a risky rewrite
- Normalize key Classic surfaces through those tokens:
  - top navigation and tabs
  - status and home tool surfaces
  - movie cards
  - comparison sheet, movie detail surfaces and date controls
  - showtime cards and provider chips
  - Smart Picks cards
- Add reduced-motion presentation behavior.
- Replace preview-era initial shell copy with production-appropriate loading and footer text.

## Product behavior intentionally unchanged

- movie catalogue loading and grouping
- Broadway / MCL / Emperor provider logic
- comparison v4 data flow
- Rich Filters
- Smart Picks ranking
- MCL bulk/lazy price enrichment
- seat lazy loading and shared seat maps
- booking URLs/actions
- Phase 9A mobile browser release gate

## Metro boundary

The future Metro UI should not duplicate provider/business logic. It should override the skin token layer and, where necessary, add a dedicated presentation stylesheet while retaining the same DOM contracts and shared functional modules.

Phase 9B1 does not add a Metro switch or Metro-specific visuals. It only ensures the current Classic UI is no longer the only visual language hard-wired into the core foundation.

## Next visual batch

Phase 9B2 should focus on visible mobile polish of the Classic skin: home movie cards, comparison hero, date rail, filter/recommendation controls, and showtime density. Layout hierarchy and behavior should remain stable.
