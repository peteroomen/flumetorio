# The flume descends on trestles

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — visual follow-up (flume)

## Goal

A flume should stride away from its head-gate on a **steady grade**, carried across the terraces on
trestlework that grows taller as the ground falls away — not lie on the dirt and drop a whole
terrace in one tile wherever the terrain does.

## The bug

`drawFlume` samples `heightAt(tiles, b.tx, b.ty)` per tile and draws the trough at that height plus
a fixed 0.28 lift. The trough therefore *is* the terrain, offset upward. At a terrace edge it falls
22px in a single tile, which reads as a broken chute rather than a flume, and the trestles never
grow past their fixed 0.28 stub — so nothing is holding anything up.

## Approach

Give the flume its own **deck profile**, computed per head-run, and draw everything (trough, water,
rails, trestles, riding logs, head-gate) against that instead of against terrain.

For a run with terrain heights `th[0..n]`, the deck is:

```
grade   = (th[0] - th[n]) / n
deck[i] = max(th[i], th[0] - grade * i) + LIFT
```

A straight line from head to tail, **clamped up wherever terrain would poke through it**. Both terms
are non-increasing (the sim only ever extends a run downhill or level), so their max is too — the
flume can never run uphill, and it can never sink into a hillside. Where the ground drops away, the
line wins and the flume flies; where the ground stays high, terrain wins and the flume rests on it.

The degenerate case is honest: if the terrain stays high until the very last tile, the profile
collapses back to terrain and the flume does drop steeply, because there is nowhere else for it to
go. That's a real constraint, not a rendering failure.

Trestles then get their true job: leg height becomes `deck − terrain` at each support, so they grow
under the flying spans, and a mid-tile bent appears when the deck is high enough to need one.

**Render-only.** The sim's path, speed and placement rules are untouched — this changes where the
trough is *drawn*, not how the flume works.

## Steps

- [ ] Compute a per-tile deck elevation alongside the existing flume connectivity map.
- [ ] Trough halves slope from tile centre to the mid-edge elevation shared with the neighbour.
- [ ] Water surface, side rails and flow glints follow the slope.
- [ ] Trestles sized to `deck − terrain`; add a mid-tile bent on tall spans.
- [ ] Logs in transit ride the deck, not the ground.
- [ ] Head-gate posts stand on terrain and carry the deck.

## Manual test steps

Happy path:

- [ ] Build a head-gate on the top terrace and run a flume down across a terrace edge: the trough
      descends at a steady grade and is carried over the drop on visibly taller trestles.
- [ ] A log tipped in rides *in the trough* the whole way, never dipping to the ground at the cliff.

Edge / failure cases:

- [ ] A flume run entirely on level ground: deck stays level, trestles stay short — no drift.
- [ ] A single disconnected trestle with no route: still draws, resting just above its own tile.
- [ ] The head-gate's posts still reach the ground and its board still meets the trough.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope

Flume gameplay (paths, speed, placement rules) — untouched. Junctions/splitters remain a later
parking-lot slice. Still open from the visual review: badge scaling, `RESOURCE_GLYPH`, world-gen
band wobble.

---

<!-- Fill in during/after -->

## What actually happened

Shipped, with the profile improved once after measuring it.

The planned head-to-tail straight line worked, but instrumenting it showed a **0.65-level step still
left at the second terrace edge** — because the mid terrace holds high until row 21, the straight
line has already fallen below it by then, so the deck rested on terrain and then had to plunge to
catch its own line. The average grade was the wrong thing to key off.

Replaced with the **gentlest grade that still lands**:

```
grade = max over i of (th[i] - th[n]) / (n - i)
```

Descend no faster than that per tile, never below terrain. Taking the worst *suffix* grade rather
than the head-to-tail average makes the run leave the head already shallow enough to clear the
final cliff, so no single step has to make up the difference. Worst step went **0.65 → 0.25** on the
same test run, and the deck still lands exactly on the tail (span 2.00 levels).

Everything that had been drawn against terrain now hangs off the deck: trough halves slope from the
tile centre to the mid-edge elevation shared with the neighbour (so consecutive pieces meet exactly),
water and side-rails and flow glints follow the slope, trestle legs are sized `deck − terrain` so
they actually grow under a flying span, tall spans gain a mid-tile bent, logs in transit ride the
deck, and the head-gate's posts stand on the ground while carrying whatever height the deck has
reached.

**Verification is instrumented, not eyeballed** (ADR 002): new `Scene.flumeDeckAt()` exposes the
profile, and three verifier checks read it as numbers — the deck never runs uphill, it descends its
whole run, and its worst single step is strictly smaller than the ground's drop. That last one is
the regression guard: it fails the moment the flume starts falling off cliffs again.

## Files created / modified

`src/render/scene.ts` (`computeFlumeDeck`, `FLUME_DECK_LIFT`, `drawFlume` rebuilt against the deck,
flume items, `flumeDeckAt` instrument hook) · `scripts/verify-scene.mjs` (+3 checks) · `CLAUDE.md` ·
this plan.

## Deferred to next session

Nothing from this slice. Flume junctions/splitters remain a parking-lot item. Still open from the
visual review: badge scaling with zoom, `RESOURCE_GLYPH`, world-gen band wobble.

## Status

- [x] Complete
