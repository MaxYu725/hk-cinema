# M10A — Golden Harvest → Bestar Successor Reconnaissance

Status: **complete — Bestar catalogue read source proven; showtime/price/seat capabilities remain unproven**

## Baseline

- `main@efccca1e13a688b6b0bb2d07eb1f99f2d75de3ae`
- Production browser providers remain Broadway, MCL, Emperor and CineArt.
- Production Worker provider manifest remains Broadway, MCL, Emperor and CineArt.

## Candidate correction

M10A started by treating Golden Harvest / 嘉禾 as the next provider candidate. Current evidence shows that this assumption is obsolete and must not become production architecture.

The relevant Hong Kong business transition is:

1. Golden Harvest ended its Hong Kong cinema operations in 2025 after the remaining venue leases ended.
2. the continuing cinema operation is now branded **星達院線 / Bestarfilm**;
3. Bestarfilm Group (HK) Company Limited publishes the current Bestarfilm mobile app;
4. the current Google Play developer support record points to `https://www.bestarfilm.hk` as its public website;
5. the current app describes live Hong Kong cinema/movie information, seat selection and online ticket purchase.

Accordingly, M10A is a **successor reconnaissance** checkpoint. The old Golden Harvest domain is retained only as historical transport evidence; the actual candidate for future integration is **Bestar**.

## Golden Harvest tombstone evidence

GitHub Actions reconnaissance on 2026-08-15 established a transport-level result before the successor pivot:

- `www.goldenharvest.com` → DNS `ENOTFOUND`;
- `goldenharvest.com` → DNS `ENOTFOUND`;
- Node DNS/fetch and curl independently produced the same DNS-level result;
- no HTTP response, script or API evidence was therefore available from the legacy domain.

This is not treated as a WAF/HTTP failure and is not bypassed with guessed IP addresses, archived pages or historical endpoints.

## Production boundary

M10A does **not register** Bestar or legacy Golden Harvest in `app/provider-registry.js` or `worker/src/provider-manifest.js`.

It also adds no:

- production Bestar API route;
- browser provider script;
- homepage / Data Health source;
- comparison adapter;
- detail / price / seat summary / seat-map UI;
- booking translation;
- PWA or Service Worker change;
- purchase, hold, reservation or other side-effect request.

The custom static reconnaissance transport is GET-only and uses no account state, cookies, bearer token, CSRF token or private credential supplied by HK Cinema. The passive browser reconnaissance does not issue custom API calls: it loads the public Bestar home page without clicks/forms/login and observes the page's own network requests, including its read-semantic POST `/sync` calls.

## Current Bestar source

The current official public origin used by this checkpoint is:

- `https://www.bestarfilm.hk`

The successful final reconnaissance run resolves the site normally and receives HTTP 200. The home page settles on:

- `/?wapid=XYHK_WEB_PROD_S_MPS`

The static page declares 18 JavaScript assets. The current app shell uses the `icirena-web` frontend family and names `api.icirena.ai` / `gray-api.icirena.ai` as API-family candidates. Because those bundles contain shared multi-tenant code for Bestar and other cinema products, route strings such as `/showtimes`, `/seat`, `/film` or `/cinema/list` are **not** capability proof by themselves.

## Static reconnaissance

`scripts/m10a-golden-harvest-reconnaissance.mjs` keeps its historical filename because this checkpoint began as Golden Harvest reconnaissance. Its runtime identity is:

- `providerCandidate: "bestar"`
- `predecessor: "golden-harvest-hong-kong"`
- `mode: "successor-reconnaissance-only"`

It probes only public discovery documents:

- `/`
- `/robots.txt`
- `/sitemap.xml`

For successful responses it:

1. records status, final URL, content type, elapsed time, bounded byte count and SHA-256;
2. records current Bestar DNS evidence separately from legacy Golden Harvest DNS evidence;
3. inventories HTTPS script assets declared by the current site;
4. downloads only Bestar-hosted scripts or the exact Bestar-declared vendor family `g.alicdn.com/icirena-fe/icirena-web/`;
5. downloads at most 16 scripts with per-file and aggregate payload limits;
6. records request-library hints and sanitized endpoint/path candidates;
7. stores the full structural report only as a short-lived Actions artifact rather than committing upstream bodies.

Final static evidence:

- 3/3 discovery documents reachable;
- 18 scripts declared;
- 14 bounded allowed scripts fetched;
- 33 sanitized route/host candidates found;
- shared bundle candidates include `https://api.icirena.ai/sync`, `/film`, `/film/detail`, `/cinema/list`, `/cinema/detail`, `/showtimes` and `/seat`;
- these shared route strings remain reconnaissance hints only.

Limits:

- request timeout: 12 seconds;
- document payload: maximum 2 MiB each;
- script payload: maximum 768 KiB each;
- aggregate script payload: maximum 6 MiB;
- fetched scripts: maximum 16;
- endpoint candidates: maximum 120.

## Passive browser network proof

`scripts/m10a-bestar-browser-reconnaissance.mjs` opens only the Bestar public home page on a 390×844 headless Chromium surface and waits six seconds. It performs no clicks, form entry, authentication, purchase flow or custom mutation request.

The final run observed:

- navigation HTTP 200 with `wapid=XYHK_WEB_PROD_S_MPS`;
- 44 evidence-host requests and 44 responses;
- 10 site-initiated XHR requests to `https://gopgrayesa-api.icirena.ai/sync`;
- the `/sync` calls are POST requests with query keys including `app_key`, `method`, `sign`, `sign_method`, `timestamp`, `format` and `simplify`;
- all observed `/sync` responses represented in the captured home-page flow returned HTTP 200 JSON;
- no browser page errors were observed.

The report deliberately stores only request method/path/query-key names, body key names, safe operation hints and response JSON structure. It stores no cookies, headers, signatures, complete request bodies or response values.

### Catalogue proof

One of the actual Bestar home-page `/sync` responses returned `result.bizValue` as an array of **19 film records**. The observed structural fields include:

- `filmUniqueId`
- `filmName`
- `filmEnName`
- `filmSubTitleName`
- `showStatus`
- `showDate`
- `duration`
- `filmLevels` / `filmLevelList`
- `filmLanguageName`
- `filmTypeName`
- `filmVersion` / `filmVersionGroup`
- `poster`
- `filmTrailer`
- `actors`
- `directors`
- `rating`
- `introduction`

The same live page subsequently fetched poster assets under `cdn.icirena.ai/lark/itemprod/flimPic/xyhk/...`, corroborating that the film-array response is driving current Bestar presentation rather than merely existing in an unused shared bundle.

**Conclusion: a current Bestar public film catalogue read source is proven.** The transport is signed and multiplexed through `/sync`, so M10B must preserve the upstream signing/operation semantics rather than pretending `/film` is a standalone REST endpoint.

## Capability findings

| Capability | M10A evidence | Decision |
| --- | --- | --- |
| Current Bestar public origin | DNS + HTTP 200 | proven |
| Film catalogue | live `/sync` film array, stable `filmUniqueId`, metadata/poster fields | proven for Worker-adapter research |
| Cinema list | bundle route hint; home flow also returns city/config/banner structures | not yet proven as a dedicated current contract |
| Showtimes | shared bundle route hint only | unproven |
| Film detail | shared bundle route hint only | unproven |
| Price | no current session/price response captured | unproven |
| Seat summary / seat map | shared bundle route hint / config only | unproven |
| Booking/deep link | no safe current contract captured | unproven |

At M10A all Bestar **production** capabilities remain false/unregistered. A reconnaissance proof only authorizes the next isolated adapter checkpoint; it does not expose Bestar in production UI.

## M10B decision

**M10B is permitted, but only as `Bestar Worker catalogue adapter`.**

M10B may:

- isolate the current Bestar `/sync` signing and request construction used by the public site;
- identify the exact film-catalogue operation from current frontend evidence;
- normalize the proven film records behind a candidate/read-only Worker boundary;
- add bounded diagnostics and contract tests.

M10B must **not** yet:

- register Bestar in the browser production Registry;
- add Bestar to homepage/Data Health/comparison;
- claim showtime, cinema, price, seat or booking capability from shared bundle route names;
- call purchase, hold or reservation operations;
- hard-code captured transient signatures or timestamps.

Showtime, price and seat work require their own current-source proof in later checkpoints.

## Final gate

M10A acceptance requires:

- static reconnaissance contract PASS;
- passive browser reconnaissance PASS;
- Bestar public transport PASS;
- main HK Cinema regression/mobile browser workflow PASS on the exact final head;
- branch remains behind `main` by 0 and contains no production `app/` or `worker/` runtime changes.
