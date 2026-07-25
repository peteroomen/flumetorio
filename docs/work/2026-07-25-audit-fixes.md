# Audit fixes: crossed rails, stranded wagons, vanishing logs, drifting caps

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — correctness pass

## Goal

Four findings from an audit of the current build, three of them goods-losing or soon-to-lie bugs,
plus the one the owner spotted by eye: the rails aren't straight.

## The findings

**1. Rails cross at every tile centre (render).** `drawRail` takes the perpendicular from the
*signed* direction: `px = -d.dy * GAUGE * side`. On a straight east–west tile the two connected
directions are `(1,0)` and `(-1,0)`, so for one `side` index the offsets are `+g` and `−g` — the
same rail is drawn on opposite sides of the centre line in each half. Every tile draws an X. At 5×
zoom a straight run is a visible chain of crossings.

The perpendicular has to be defined against a consistent **traversal** through the tile, not against
each half's outward direction. Take the two connected dirs `d1`, `d2`; travel enters along `−d1` and
leaves along `d2`; offset each end by `perp(travel) * side`. On a straight run both perpendiculars
agree and the rail is one straight line. On a corner they differ correctly, and the inner and outer
rails pair up as they should — which the current per-direction version also gets wrong, crossing the
rails at every bend.

**2. Three docks on one run spawn two wagons and mis-pair (sim).** Probed: docks at x=5/9/13 on one
line give `WAGONS 2, MATES 1->2 2->3 3->2`. `recomputeRailRoutes` adds a claimed pair to `owned`,
but a later unowned dock can still trace *into* an already-owned dock, overwrite its `routeMateId`,
and mint a second wagon on shared track. Mine, from the rail slice.

**3. The flume destroys logs when there's no trestle run (sim).** Tip logs into a bare head-gate:
`ITEMS 0, GROUND []`. `tickFlume` treats `path.length < 2` as "arrived" and drops the item into
nothing. Goods vanishing with no feedback is the worst failure mode a builder game has. Reported in
the 2026-07-23 review and still live.

**4. `status.ts` hardcodes caps that already live in `constants.ts` (sim).** `outCapOf` returns
literal 8/4/12 and the furnace check is `>= 20`, against `CLAMP_OUT_CAP`, `PITSAW_OUT_CAP`,
`SAWMILL_OUT_CAP`, `FURNACE_IRON_CAP`. They agree today; the balance pass is next, and the moment a
cap is tuned the "output full" badge starts lying silently.

## Approach

Fix 1 in the renderer, 2–4 in the sim, each at its root:

- **Rails**: build each rail as a path through the tile from a traversal-consistent perpendicular,
  straight when the run is straight and a real quarter-arc (quadratic through the corner point)
  when it turns. Sampled in tile space and projected, since `project` is linear in `(wx, wy)` at
  fixed height.
- **Routes**: a dock whose traced mate is already owned yields — the route is already served. This
  keeps ownership a genuine one-wagon-per-route invariant instead of a first-come race.
- **Flume**: a dead-ended item drops to the ground at the head instead of evaporating.
- **Caps**: `status.ts` imports the constants. No literals.

## Steps

- [ ] `drawRail`: traversal-consistent perpendicular; straight runs straight, corners as arcs.
- [ ] `recomputeRailRoutes`: skip a trace whose mate is already owned.
- [ ] `tickFlume`: drop dead-ended items to the ground rather than deleting them.
- [ ] `status.ts`: import caps from `constants.ts`.
- [ ] Tests for 2, 3 and 4; a verifier check for 1.

## Manual test steps

Happy path:

- [ ] A long straight plateway at high zoom: two unbroken parallel rails, no crossings.
- [ ] A route with a right-angle bend: rails sweep through the corner without crossing.

Edge / failure cases:

- [ ] Three docks on one run: exactly one wagon, and every dock's `routeMateId` is reciprocal.
- [ ] Tip logs into a head-gate with no trestles: the logs land on the ground and can be picked
      back up — nothing is destroyed.
- [ ] Change `CLAMP_OUT_CAP` in constants: the clamp's "output full" badge follows it.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope

The rest of the audit: routeless docks still advertising as drop targets, the wagon's fixed
load-priority order, HUD per-frame DOM churn, badge scaling with zoom, `RESOURCE_GLYPH`, and the
world-gen band wobble (its own branch — it's sim, and it needs its own tests).

---

<!-- Fill in during/after -->

## What actually happened

All four fixed at the root. Two were caught by probing rather than reading, and the rail one was
caught by the owner's eye before any instrument existed for it — which is the lesson of the session.

**Rails.** The diagnosis held exactly: at 5× zoom a straight run was a visible chain of X's. Pulled
the geometry out into a pure `railPoints(cx, cy, dirs, side)` that takes its offset from the
traversal through the tile, so a straight run returns two collinear points and a bend returns a
quadratic through the corner where the two rail lines actually meet. Extracting it also made the
bug *testable*, which it hadn't been while it was inline in a draw call.

**Routes.** One line: a dock whose traced mate is already owned yields. The test asserts the
invariant that actually matters — not "dock 1 pairs with dock 2", but that **every pairing is
reciprocal** and there is exactly one wagon, which stays true whichever pair the trace happens to
claim first.

**Flume.** Dead-ended items now drop to the ground at the head-gate. Worth noting the fix is three
lines and the bug was reported two sessions ago; it survived because nothing ever exercised the
"head with no run" path.

**Caps.** `status.ts` imports from `constants.ts`. The test tweaks the *constant* and asserts the
badge follows, so the duplication cannot silently come back.

**Instrumentation.** Added `Scene.railPointsAt()` alongside the existing `flumeDeckAt()`, and a
verifier check that reads every rail point on a straight run and asserts none of them crosses the
track's centre line: `offsets 0.140..0.140`. A visual bug the owner could see and the test suite
could not is exactly the gap ADR 002 exists to close.

## Files created / modified

sim: `rail.ts` (ownership yield) · `movers.ts` (drop dead-ended flume items) · `status.ts` (caps
from constants) · `sim.test.ts` (+3) · render: `scene.ts` (`railPoints`, `RAIL_GAUGE`,
`railPointsAt` instrument hook) · `scripts/verify-scene.mjs` (+1 check) · `CLAUDE.md` · this plan.

## Deferred to next session

The rest of the audit, unchanged: routeless docks still advertise as drop targets; the wagon loads
in fixed `ALL_RESOURCES` order so a pile of logs starves everything behind it; HUD per-frame DOM
churn (bank chips, letter and info-panel `innerHTML`); status badges scale with zoom;
`RESOURCE_GLYPH` mixes an emoji with geometric glyphs; world-gen band wobble (own branch — it's sim
and needs its own tests). Rail pricing (14 iron for a short route, against a 10-iron unlock) is a
balance-pass question, not a bug.

## Status

- [x] Complete
