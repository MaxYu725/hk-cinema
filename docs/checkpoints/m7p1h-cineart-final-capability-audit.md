# M7P1H checkpoint — CineArt final capability audit

Status: **current-source audit complete — exact-head final gate pending**

Baseline: `f0cd43f6e7a96b3a0c195d983ccf55ecf4a0f702` (accepted M7P1G + screen-orientation hotfix)

M7P1G Android installed-PWA acceptance: **PASS**.

The deployed M7P1G seat-map capability and the follow-up CineArt screen-orientation hotfix passed real-device acceptance. The user also identified broader seat-map presentation improvements, but explicitly deferred that UI work until CineArt provider completion. That future work remains a separate display-only phase and is not mixed into this capability audit.

## Objective

Close the remaining CineArt capability uncertainty without guessing.

Accepted production Registry state remains:

- catalogue: true
- showtimes: true
- prices: true
- seatSummary: true
- seatMap: true
- booking: false

M7P1H audited the **current** CineArt Next.js source for two previously unproven areas:

1. whether a stable official booking/deep-link contract can be proven for an authoritative show id;
2. whether format metadata has a stable structured source rather than title-string inference.

## Current-source evidence

CineArt Candidate Validation #90 / run `31684703344` completed successfully on the reconnaissance head.

The full M7P1B–M7P1G live chain passed before the new audit step:

- Worker health remained `phase:"6G"`;
- CineArt service remained `catalogue-showtimes-detailed-price-strict-seats-seatmap-production-readonly`;
- 20 source movies / 520 normalized current shows / 5 cinemas were observed;
- the discovery sample `80847` / movie `799` correlated home and show-detail data;
- strict seat total 103 = 80 available + 23 sold, with 0 held / 0 blocked / 0 unknown;
- official seat geometry remained resolved and read-only;
- discovery still reported `formatMetadata:false` and `booking:false`.

The new M7P1H direct-current-source audit used show `80847`, movie `799`, site `17`, house `47` through the current document transport and found:

- `structuredFormatEvidence: []`;
- only a title/text hint `2D` for the sampled movie;
- no booking/reservation/purchase/checkout key path;
- no booking/seat/checkout/purchase route shape;
- no route evidence in the sampled home/show objects;
- `structuredFormatProven:false`;
- `bookingContractProven:false`.

The show detail does expose extensive ticket-pricing and seat-related fields, but none proves a public booking/deep-link contract. Those internal data fields are not treated as permission to synthesize a purchase route.

## Final capability conclusion

### Structured format metadata

**Not proven.**

The current normalized source still has no reliable `formats`, `format` or `version` value for the sampled current show/movie. Tokens such as `2D`, `IMAX with Laser` or `Atmos` may appear in titles or presentation text, but M7P1H deliberately does not infer a structured show format from those strings.

### Booking / deep link

**Not proven.**

Historical indexed legacy routes such as `/en/seat/index/<id>` remain research evidence only. The current `/hk` Next.js home/show data did not prove that route, a current replacement route, or an authoritative mapping from the current show id to a public booking target.

Therefore:

- CineArt `booking` remains false;
- `bookingUrl` remains null;
- no seat/booking URL is synthesized from the show id;
- no reservation/hold/purchase call is added.

## Production-complete definition

CineArt is considered **production-complete for all currently reliable/proven capabilities** with the following explicit support matrix:

- catalogue: supported / production
- showtimes: supported / production
- prices: supported / production
- strict seat summary: supported / production
- read-only seat map: supported / production
- booking: unsupported/unproven and intentionally disabled
- structured format metadata: unsupported/unproven and intentionally not guessed

A future upstream change may justify a new capability phase, but M7P1H does not keep CineArt development open merely to force unsupported features on.

## Safety boundary

- no Provider Registry change is required;
- no production Worker route/manifest change is required;
- no browser/runtime/UI change is required;
- no title-derived format guessing is added;
- no booking URL is synthesized;
- no seat selection, hold, reservation or purchase calls are added;
- no CineArt POST is introduced;
- no direct browser request to `cinearthouse.com.hk` is introduced;
- no MutationObserver/IntersectionObserver lifecycle is introduced;
- no PWA/Service Worker file changes;
- global Worker `/health` remains `phase:"6G"`.

## Deferred next UI work

The user identified seat-map presentation improvements during M7P1G acceptance. That work begins only after this CineArt final-capability checkpoint is merged. It should be scoped as a shared seat-map **display-mode redesign**, preserving provider parsers, official geometry/state semantics and read-only data contracts unless separately justified.

## Required final gates

The exact final PR head must pass:

1. full Node regression suite;
2. Chromium install;
3. mobile browser smoke;
4. M7P1B–M7P1G live revalidation;
5. M7P1H current-source audit;
6. diff review confirming no production Registry/Worker/UI/PWA drift;
7. exact-head review.

After squash merge, merged-main Node regression, Chromium, mobile smoke and GitHub Pages deployment must pass. Because M7P1H changes no production app/runtime behavior, it does not require a new Android installed-PWA gate beyond the already accepted M7P1G gate.
