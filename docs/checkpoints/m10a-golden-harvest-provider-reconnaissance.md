# M10A — Golden Harvest Provider Reconnaissance

Status: **reconnaissance only — current-source evidence pending Actions run**

## Baseline

- `main@efccca1e13a688b6b0bb2d07eb1f99f2d75de3ae`
- Production browser providers remain Broadway, MCL, Emperor and CineArt.
- Production Worker provider manifest remains Broadway, MCL, Emperor and CineArt.

## Objective

Evaluate Golden Harvest / 嘉禾 as the next provider candidate after the provider-expansion hardening and CineArt clean re-entry. This checkpoint deliberately separates **source reconnaissance** from any production integration.

M10A must answer whether the current public Golden Harvest site exposes a stable, bounded, read-only source that is suitable for a provider-specific Worker adapter. Visible HTML alone is not treated as proof of catalogue/showtime/price/seat capability.

## Production boundary

M10A does **not register** Golden Harvest in `app/provider-registry.js` or `worker/src/provider-manifest.js`.

It also adds no:

- production Golden Harvest API route;
- browser provider script;
- homepage / Data Health source;
- comparison adapter;
- detail / price / seat summary / seat-map UI;
- booking translation;
- PWA or Service Worker change;
- purchase, hold, reservation or other side-effect request.

The reconnaissance transport is GET-only and uses no account state, cookies, bearer token, CSRF token or private credential supplied by HK Cinema.

## Current public-site evidence before Actions reconnaissance

The official site currently exposes public film pages under `https://www.goldenharvest.com`, including film-list and film-detail routes. The current film-list surface shows a client-side loading state, so M10A does not assume that server-rendered HTML is the underlying data source.

The initial static web inspection did not establish a trustworthy catalogue/showtime API path. Therefore the repository now performs the source inspection from GitHub Actions runner networking rather than guessing route names or adding HTML scraping to production.

## Reconnaissance tool

`scripts/m10a-golden-harvest-reconnaissance.mjs` probes only representative public pages:

- `/`
- `/film/list?category=now`
- `/film/list?category=coming`
- `/cinema/index`

For successful page responses it:

1. records status, final URL, content type, elapsed time, bounded byte count and SHA-256;
2. extracts same-Golden-Harvest-domain script assets;
3. downloads at most 16 scripts with per-file and aggregate payload limits;
4. records request-library hints such as `fetch`, Axios, jQuery AJAX/GET and XHR usage;
5. extracts only sanitized endpoint/path candidates related to film, cinema, showtime, session, ticket, seat or API concepts;
6. writes a compact JSON evidence report without storing raw upstream HTML or JavaScript bodies.

Limits:

- request timeout: 12 seconds;
- page payload: maximum 2 MiB each;
- script payload: maximum 768 KiB each;
- aggregate script payload: maximum 6 MiB;
- scripts: maximum 16;
- endpoint candidates: maximum 120.

A blocked/unreachable origin is valid reconnaissance evidence. It must not be converted into a guessed production adapter merely to make the provider appear supported.

## Questions M10A must resolve

1. Can GitHub/Worker-like outbound networking reach the current official site reliably?
2. Which current public endpoint or embedded data source actually supplies film catalogue data?
3. Is cinema/showtime data exposed through the same source or another stable read-only endpoint?
4. Are stable movie, cinema, house and session identifiers present?
5. Is current price data available without authenticated or side-effect requests?
6. Is any seat-summary or seat-map evidence available through a read-only path?
7. Is a booking/deep-link URL directly represented, or would translation require guessing?
8. Are cookies/tokens required for the read path?
9. What are the realistic timeout/payload/cache boundaries?

## Capability policy

At M10A all Golden Harvest production capabilities remain **false / unregistered**.

A capability can advance only when current-source evidence proves it. Missing evidence remains unsupported rather than being inferred from UI text, film titles, route names or historical knowledge.

## Next permitted checkpoint

**M10B — Golden Harvest Worker adapter only**, and only if M10A proves a current public read path worth normalizing.

M10B may contain provider-specific parser/transport code and candidate diagnostics, but it must still keep Golden Harvest out of the browser production Registry until its Worker adapter and live validation are complete.

If M10A finds the source blocked, unstable, authenticated-only or unsuitable for bounded read-only access, M10B must not be started. The checkpoint should instead record the blocker and possible future alternatives.
