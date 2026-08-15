# M9F3 — Final Low-risk Polish

## Baseline

- `main@33ca5d161a1010e3868dd178020ba3f221d1d52b`
- follows M9F2 Loaded Surface Transitions

## Goal

Close the remaining low-risk Metro motion gaps without changing product ownership, request flow, PWA lifecycle, provider logic, seat geometry or navigation behavior.

## Scope

### Data Health close continuity

- `data-health.js` remains the only owner of the `<details>` open state, outside-click close, Escape close and persistence
- M9F3 observes user close intent in window capture before the existing document owner mutates `open`
- only the visible `.data-health-body` is copied as a short-lived visual after-image
- the real Data Health panel still closes synchronously
- exit duration is 140ms, transform + opacity only
- the after-image is `aria-hidden`, `inert`, non-interactive and stripped of ids/tab stops
- opening Data Health clears any stale M9F3 ghost

### Poster lazy-load fade

- existing home catalogue renderers remain the only owners of poster URLs, card markup and image errors
- M9F3 scopes discovery to direct `#movieGrid` child changes
- unloaded poster images start at opacity `.7`
- successful load resolves to opacity `1` over 160ms
- already-cached/complete images are stamped loaded immediately to avoid artificial flicker
- no blur-up, zoom, translation, stagger, placeholder rewrite or image decoding owner is introduced
- existing Metro grayscale hover transition remains preserved

### Reduced-motion / Android PWA final audit

- reduced motion suppresses the Data Health after-image completely
- reduced motion forces poster opacity to 1 with no transition
- M9F3 does not access `navigator.serviceWorker`, Cache Storage, registration update or fullscreen APIs
- production manifest remains `display: fullscreen` with `standalone` fallback
- full Playwright suite continues to run on the Pixel 7 mobile Chromium project
- existing `pwa-smoke.spec.mjs` remains part of the release gate and verifies Service Worker registration, same-origin shell caching and offline reopen

## Architecture boundaries

M9F3 is a Metro-only presentation companion.

It does not:

- call `fetch()`
- modify Provider / Worker / Registry code
- modify `data-health.js`, `app.js`, `home-library.js`, `pwa-runtime.js` or `sw.js`
- call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`
- delay Data Health close
- write live product content with `innerHTML`
- take scroll ownership
- animate individual cards as a list or stagger

The only clone is the compact Data Health body during a user close gesture; it is presentation-only and removed within a bounded timeout.

## Validation

Static regression verifies:

- M9F3 asset order after M9F2
- presentation-only ownership boundary
- no PWA lifecycle access
- Data Health passive exit contract
- poster opacity-only 160ms reveal
- direct movie-grid observer scope
- reduced-motion behavior

Mobile Playwright verifies:

- Data Health real panel closes synchronously while one passive 140ms ghost finishes
- synthetic unloaded poster transitions from `.7` to `1` without transform
- Pixel 7 user agent, fullscreen/standalone manifest contract and Metro black theme remain intact
- reduced-motion poster transition is zero and Data Health creates no ghost

## Acceptance

- Data Health no longer disappears as a hard cut on close
- newly loaded posters no longer pop from placeholder to full image abruptly
- no blur, zoom or stagger is added
- no Android PWA lifecycle or Service Worker behavior changes
- reduced-motion path stays effectively static
- full Node regression, Chromium/mobile smoke and CineArt candidate validation pass before squash merge
