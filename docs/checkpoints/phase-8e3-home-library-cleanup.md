# Phase 8E3 — Home library cleanup

## Goal

Remove the homepage filter plumbing left behind after Phase 8E2 retired the provider-first filter container, while keeping the useful movie-first homepage tools: search, favorites, recent activity and simple movie sorting.

## Removed from `home-library.js`

- dependency on `#homeProviderFilters`
- language / format facet controls and state
- hidden homepage region preference state and compare-page restoration
- `HKCinemaHomeProviderFilters` integration
- `providerVisible` filtering
- filter collapse localStorage / toggle handling
- provider-count sort option
- provider identity from homepage search values
- obsolete filter reset / horizontal-scroll handling
- copy referring to choosing another cinema chain or opening a version selector

## Home library contract

The homepage now exposes only:

- movie search
- original / release-date / title ordering
- all / favorites / recent views
- local favorite storage
- local recent-view storage
- sticky mobile search / sort controls

Variant title, language and format metadata may still enrich movie search, but provider identity is no longer a homepage search or sorting affordance.

`HKCinemaHomeLibraryCore` is reduced to search normalization, search matching and movie-first ordering helpers.

## Comparison runtime audit

Production `app/index.html` uses the current comparison generations:

- `provider-compare-v4.js`
- `provider-compare-insights-v4.js`
- `provider-compare-preferences-v2.js`
- `provider-compare-recommendations-v4.js`

Older comparison files such as `provider-compare-v3.js`, `provider-compare-insights-v3.js` and `provider-compare-preferences.js` are not loaded by production, but some historical Phase regression tests still read or execute older generations. Phase 8E3 therefore does not delete those files. Removing them should be a separate test-migration batch rather than mixed into the homepage cleanup.

## Validation

- production cache-busts `home-library-core.js` and `home-library.js` to `8e3`
- `npm test` syntax-checks both home-library files
- regression tests verify retired provider / facet / region plumbing cannot return
- regression tests verify legacy comparison generations are not production script entries

## Scope boundary

No changes to Phase 8C merged showtime filtering, Phase 8D Smart Picks, Phase 8D1 scroll restoration, Phase 7B detail / seat maps, booking actions or provider parsers.
