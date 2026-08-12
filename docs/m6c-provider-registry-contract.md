# Phase M6C Checkpoint 1 — Provider registry contract

Baseline: M6B completed at application checkpoint `554cab11c0f307b116abd7f2c135fdc26248b34f`; durable tracker refresh `06e2389f315b54a81ef06f00d8e52eb2068aa2a9`.

## Objective

Introduce one registry-driven provider identity/capability contract before adding another cinema chain. This checkpoint must remove fixed three-provider assumptions from Data Health/status presentation without changing current Broadway, MCL or Emperor data behavior.

## Provider descriptor

Each provider is described by:

- `id`: stable machine identity used by current provider/data modules.
- `displayName`: normal UI name.
- `healthLabel`: label used by Data Health; may differ from the general display name later.
- `capabilities`: normalized boolean capability map.

Current capability keys are:

- `catalogue`
- `showtimes`
- `prices`
- `seatSummary`
- `seatMap`
- `booking`

The registry is presentation/data-contract metadata only. It does not fetch provider data and it does not replace the existing provider implementations.

## Current providers

Broadway, MCL and Emperor are registered with their existing identities. This preserves every current `HKCinemaDataHealth.report(providerId, ...)` call and avoids a parser/provider migration inside this checkpoint.

## Data Health contract

`data-health.js` now obtains its provider list from `HKCinemaProviderRegistry.providers` rather than defining a private Broadway/MCL/Emperor array.

Consequences:

- initial health records are generated from registry entries;
- summary totals are based on registry length;
- health lights and labels enumerate registry entries;
- an all-provider failure message uses the actual provider count;
- refresh/status accessibility copy is provider-count-neutral;
- the base loading copy no longer names exactly three providers.

## Fourth-provider fixture

`tests/fixtures/provider-fourth.json` is a contract fixture only; it does not integrate a real cinema chain.

It intentionally represents a provider with catalogue/showtimes/booking capability but without prices or seat capability. This establishes that provider identity and optional capability flags can exist independently before M6C later defines UI degradation semantics for unsupported features.

## Non-goals

This checkpoint does not:

- add a real fourth provider;
- change Broadway, MCL or Emperor requests/parsers;
- change movie matching or aggregation logic;
- change showtime/price/seat rendering;
- change the existing cinema venue registry;
- make comparison/home modules capability-driven yet;
- define final unsupported-capability UI behavior.

Those remain later M6C checkpoints.

## Next M6C work

After this checkpoint is stable:

1. document the normalized catalogue/movie/showtime/price/seat/booking data contracts used by shared UI;
2. replace remaining provider-name assumptions in comparison/status presentation where they block a fourth provider;
3. make unsupported optional capabilities degrade cleanly without provider-name branches;
4. extend fixtures/tests before integrating any real new cinema chain.
