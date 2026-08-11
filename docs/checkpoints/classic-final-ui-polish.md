# Classic final UI polish — freeze checkpoint

Status: final Classic presentation pass before the Windows Phone / Metro Skin phase.

## Homepage

- Hide the redundant `HONG KONG CINEMA` / `HK Cinema` brand block while preserving the DOM anchor for compatibility.
- Center the data-health control at the top and flatten its visual treatment.
- Keep provider health lights data-driven so additional providers can extend the row without fixed three-light positioning.
- Hide the visible refresh button; opening the data-health dropdown triggers the existing shared refresh endpoint for Broadway, MCL and Emperor.
- Hide the redundant `MOVIES / 全部電影` section heading while retaining its DOM anchor for the home-library module.
- Surface combined movie counts directly beside `現正上映` and `即將上映`.

## Comparison

- Hide the expandable movie-details card because the hero already exposes the same basic facts.
- Hide the explanatory MCL lazy-seat banner while keeping lazy seat loading, cancellation and cache behaviour unchanged.
- Hide duplicated active-filter chips; selected values remain visible inside the compact filter controls.
- Present the final filter matrix as three columns by three rows:
  - 院線 / 語言 / 字幕
  - 放映方式 / 地區 / 分區
  - 戲院 / 時段 / 座位
- Remove price and sort from the compact filter matrix.
- Move sort beside `全部場次`, retaining time / price / seat sorting through the existing filter state API.

## PWA presentation

- Prefer `fullscreen` through `display_override` where the installed browser supports it, with `standalone` retained as the fallback.
- Apply the existing safe-area contract to fullscreen mode as well.
- No Service Worker activation, cache boundary, cinema-data freshness, provider, price, seat, seat-map or booking behaviour is changed.

## Freeze boundary

After this checkpoint is green in PR CI and deployed successfully from `main`, the Classic presentation is frozen except for release-blocking defects or provider/data breakage. New visual-system work belongs to the Windows Phone / Metro Skin phase.
