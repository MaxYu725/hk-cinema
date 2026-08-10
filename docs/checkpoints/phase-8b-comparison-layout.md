# Phase 8B — Comparison View layout

## Goal

Reorder the common movie comparison surface around the mobile browsing path established in Phase 8A, without changing provider parsers, showtime normalization, filters, recommendation algorithms, or shared seat-map rendering.

## Final Phase 8B order

The active comparison view now follows this hierarchy:

1. movie-first hero and compact unified facts;
2. collapsible movie basic information;
3. temporary Phase 8A version rail when multiple known release variants exist;
4. date rail;
5. collapsible showtime filters;
6. collapsible recommendations;
7. all-showtimes heading, current filter result, and timeline.

The Phase 8A version rail remains intentionally reachable in this checkpoint. Phase 8C will remove it only after language, subtitle, and screening-format filters can cover all known variants from one merged showtime set.

## Movie-first hero

Provider matching diagnostics are no longer the primary visual identity. The hero uses `MOVIE`, the aggregate title/poster, the secondary title when available, and basic facts already present on the aggregated home card: classification, duration, and release date. Missing facts are omitted rather than guessed.

The `電影資料` disclosure is collapsed by default and repeats these normalized basic facts in a compact definition list. It is deliberately small in Phase 8B; richer merged detail fields can be added without changing the section hierarchy.

## Filters

The existing filter engine remains unchanged and remains collapsed by default. The Phase 6 summary insight grid is removed from the main hierarchy because lowest price, earliest time, price spread, and seat availability duplicate information better expressed by recommendations and the showtime list.

The date-rail filter shortcut is hidden because the full filter section now follows the date rail directly.

## Recommendations

The existing recommendation engine is unchanged. Phase 8B adds a separate compact toggle which is collapsed by default and exposes a short live summary. Expanding it reveals the existing recommendation cards. Phase 8D will revise recommendation types and mobile card composition.

## Showtime list

The existing `跨院線時間線` heading is relabelled `全部場次`. The timeline, filter result, seat-map launch behaviour, official booking actions, and sorting semantics remain unchanged.

## Mobile behaviour

On narrow screens the hero is denser, movie facts use compact chips, filter and recommendation controls remain one-tap disclosures, and recommendation cards wrap to two columns instead of requiring a wide horizontal rail.

## Out of scope

Phase 8B does not:

- merge all release variants into one showtime set;
- remove the temporary version rail;
- add multi-select providers, district, price, or seat-quality filters;
- rename the current format filter to the final `放映方式` taxonomy;
- change recommendation scoring or add the final four Smart Picks;
- change seat-map adapters or geometry.
