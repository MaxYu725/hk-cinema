# M10T1C — CineArt inline seat-plan compatibility

## Trigger

Android/PWA acceptance found a CineArt MegaBox session where the comparison card had inventory data but opening the read-only seat map failed with:

`CINEART_SEATMAP_PLAN_MISSING` / `CineArt show did not provide a resolvable seat plan`.

Reported live session:

- date: 2026-08-16
- time: 14:45
- cinema: CineArt MegaBox
- show id: 81647
- movie id: 799
- cinema id: 16
- house id: 43

## Root cause

The official plan was present. CineArt currently exposes the same parametric seat geometry through at least two transport shapes:

1. existing Next Flight `$hex` text reference;
2. a JSON object serialized directly into `show.plan.config`.

The reported MegaBox show used shape 2. Its plan config was a 641-character inline JSON object with the same geometry keys already consumed by the production parser (`width`, `height`, `w`, `h`, `blocks`, `comps`, etc.). The old resolver accepted only shape 1 and therefore returned `null` before the existing geometry/correlation checks ran.

## Change

`resolveCineArtFlightTextReference` now additionally accepts a complete inline JSON object string. It still fails closed for malformed JSON, arrays and unrelated strings. Existing `$hex` reference decoding is unchanged.

No seat geometry is guessed. `cineart-seatmap.js` continues to require the generated seat IDs to correlate 100% with the official A/H/U/L seat-status keys before publishing a map.

A deterministic M10T1C regression test locks both transport shapes plus the full inline-plan seat-map path.

## Live preview proof

A temporary bounded diagnostic was run against the branch preview Worker and then removed from permanent CI.

For show `81647` the preview Worker returned HTTP 200 and rebuilt exactly 86/86 official seats:

- canvas: 600 × 500
- seat geometry: 36 × 33
- blocks: 1
- components: 2
- available: 56
- sold: 30
- held: 0
- blocked: 0
- geometry source: `official-parametric-blocks`

This demonstrated that the failure was parser compatibility, not missing upstream geometry.

## Coarse availability wording

CineArt home catalogue inventory remains deliberately non-selectable evidence. `notSold` means the upstream count is not recorded as sold; it is not proof that every seat can currently be selected because exact hold/block state requires the per-show A/H/U/L detail request.

The comparison copy changes from:

`未售（非可選數）`

to:

`未售（未核實可選）`

The data contract is unchanged:

- `seatAvailable` remains `null` for `coarse-not-sold`;
- coarse rows keep the unknown seat class;
- only `strict-seat-state` rows may display the green `可選` count.

## Boundaries preserved

- GET-only CineArt integration
- no seat hold/reservation/payment
- no browser fetch to CineArt
- no partial or guessed seat maps
- no shared seat-map lifecycle ownership change
- no request concurrency/timeout/cache-TTL change
- no PWA/Service Worker lifecycle change
- Broadway/MCL/Emperor unchanged
