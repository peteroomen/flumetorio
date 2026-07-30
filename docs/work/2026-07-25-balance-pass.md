# Balance pass: let the machines pace the arc

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — balance/feel pass

## Goal

Make the 40-minute arc paced by **production** rather than by legwork, and make the numbers in
`constants.ts` mean what they say.

## Method

`scripts/model-economy.ts` drives the real machine ticks headlessly and reports measured rates,
chain ratios, coast-to-cold timing, ore-field sustain, and what each letter costs in machine-minutes.
Nothing is re-derived by hand, so it can be rerun after any constant moves:

```
pnpm exec tsx scripts/model-economy.ts
```

## What the model found (before)

| | measured |
| --- | --- |
| Sawmill | 79.6 plank/min |
| Pit saw | 18.6 plank/min (4.3× — the one ratio that was right) |
| Clamp | 29.6 charcoal/min |
| Furnace | 23 iron/min, 48.4 ore/min, **39.6 charcoal/min** |

1. **Nothing was paced by machines.** Every letter was under a minute of machine time — 8 planks =
   6s of a sawmill; the 10-iron win = 26s of a furnace. Every building cost ≤0.1 min of production.
   The 40 minutes came entirely from walking, chopping and mining: the labour the game exists to
   relieve.
2. **The furnace threw away ~85% of its charcoal.** Auto-stoke fired every 1.6s and burned a *whole*
   charcoal (+34 heat) to recover the ~5.1 lost since the last check, capped at 100. 39.6/min burned
   against 5.7/min that the heat economy implies.
3. **Ore was the binding constraint and permanently manual** — 43% of the player's time, forever,
   per furnace, with the field sustaining only 1.1 furnaces.
4. **`FURNACE_ORE_CAP` was dead.** `inputCap` returned `FURNACE_ORE_PER_CYCLE * 6`, so tuning the
   declared bunker size did nothing — the same drift class as the caps `status.ts` used to re-type.

## Decisions (owner)

- **Machines pace the arc.** Slow cycles, raise requirements, let the factory be the bottleneck.
- **Charcoal: fix the waste, keep a deliberate drain.** Stoke only when there's room for a whole
  charcoal, then set the heat economy so one clamp feeds one furnace with headroom.
- **Ore becomes logistics.** Richer faces, slower regrow, bigger barrow — a mining trip yields a
  batch and the interesting problem is moving it.

## After

| | measured | note |
| --- | --- | --- |
| Sawmill | 20.0 plank/min | exactly 4× the pit saw |
| Pit saw | 5.0 plank/min | the bootstrap tier |
| Clamp | 8.0 charcoal/min | |
| Furnace | 5.0 iron/min, 10 ore/min, **5.6 charcoal/min** | 0.7 clamps per furnace |
| Ore field | 64.8 ore/min ceiling | sustains 6.5 furnaces; player mines **7%** of the time |
| Coast to cold | unchanged: 18.7s to stop smelting, 31.2s to cold | this pressure was already right |

Letters now read as machine time: 8 planks = 1.6 min of pit saw · 40 = 2 min of sawmill · 80 = 4 min
· 25 iron = 5 min of furnace uptime, before any starvation. Buildings cost 0.5–2.0 machine-minutes,
so what to build is a real decision.

**One interaction worth remembering:** letters check the *current bank*, and the bank is also the
build currency — so buying a sawmill sets you back on the plank letter. Requirements are sized with
that in mind rather than assuming banked planks are free.

**Rail sequencing** resolves itself: the unlock letter now asks 25 iron against a ~14-iron starter
route, where it used to ask 10.

## Steps

- [x] `scripts/model-economy.ts` (committed separately — it's a tool, not a tuning change).
- [x] Cycle times, yields, caps and letter requirements retuned.
- [x] Furnace stoke fixed to only burn when a full charcoal fits.
- [x] `inputCap` reads `FURNACE_ORE_CAP`.
- [x] Ore: `ORE_NODE_CAPACITY` (new), richer faces, slower regrow, bigger barrow.
- [x] Tests rescaled; four **balance-ratio guard tests** added.

## Manual test steps

- [ ] A fresh run: letter 1 lands around 3–4 minutes with only a pit saw.
- [ ] A powered sawmill visibly outruns a yard of pit saws.
- [ ] One clamp keeps one furnace lit indefinitely; starving it still goes cold in ~31s.
- [ ] A mining trip fills the barrow in two swings; the bottleneck feels like hauling, not swinging.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## What actually happened

The tuning landed on design targets almost exactly (sawmill/pit-saw 4.0×, clamp-per-furnace 0.70,
charcoal 5.6/min against a predicted 5.65).

Two things went sideways and are worth recording:

- **The model harness lied about charcoal** — it reported 10.4/min after the stoke fix when
  first-principles said 5.65. A focused probe confirmed the *sim* was right and the *harness* was
  wrong: it counted refill amounts rather than measuring consumption by diff. Fixed, and the lesson
  is that a measurement tool needs checking against arithmetic before its numbers are trusted.
- **Four tests failed**, all of them calibrated to the old rates (5s of driving no longer completes
  a 6s sawmill cycle). Rescaled rather than weakened.

The four new ratio tests lock the *design*, not the constants: sawmill ≈4× pit saw, one clamp feeds
one furnace with headroom, the furnace's burn stays within 15% of the no-waste ideal, and the ore
field sustains more than one furnace. Any of those breaking means a tuning change moved the design,
which is exactly when someone should be told.

## Files created / modified

`src/lib/sim/constants.ts` (cycles, yields, caps, `ORE_NODE_CAPACITY`) · `machines.ts` (stoke fix,
`FURNACE_ORE_CAP`) · `world.ts` (ore node capacity) · `buildings.ts` (costs) · `progression.ts`
(letter requirements) · `sim.test.ts` (rescaled + 4 ratio guards) · `scripts/model-economy.ts`
(harness accounting fix) · `CLAUDE.md` · this plan.

## Deferred to next session

Live play is the real test — these are modelled numbers, not felt ones, and the GDD's fun-gate asks
for a structured playtest of minutes 20–40 with a written verdict. Also unmodelled: walking and
hauling time, which is now the *other* half of the pacing and can only be judged in play.

## Status

- [x] Complete
