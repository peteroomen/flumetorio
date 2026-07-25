# The first rails — a horse-drawn plateway

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP arc — rail (parking lot: "Horse tramways")

## Goal

The smallest shippable slice from `docs/design/rail-pitch.md`: **straight track, real curves, two
loading docks, one horse-drawn wagon shuttling a lot between them, level ground only, with the
gradient refused for a visible reason.**

Done = you finish the MVP arc, receive tramroad drawings, lay a level route between two docks, and
watch a wagon carry a lot across the works while you do something else — and the moment you try to
lay track up a terrace, the game tells you exactly why it won't.

## Why now / scope check

The MVP shipped (M5 complete), so the GDD §13 wall no longer binds — rail is on the roadmap's
post-MVP parking lot ("Horse tramways · narrow-gauge steam · mainline rail"). Owner asked for it
directly.

**Desire chain (GDD §11), stated before it lands:**

- *Relief* — flat haulage across the works stops being barrow work, and a route is visible.
- *Relief* — a wagon moves a whole lot, so batch semantics finally get a mover on the flat.
- **HUNGER** — a loaded wagon cannot climb. The valley's grain becomes a bottleneck you can watch a
  queue form against, which points at rope-worked inclines and then at steam. Rail *indicts* the
  valley rather than solving it.

Guardrails honoured: no free belt (rail costs iron, is bound by gradient, one wagon per route), no
electricity, no enemies, the terrain keeps its grain, batch not flow.

## Approach

Mirror the flume, which is the established pattern for a routed mover.

- **`railDock`** is the flume-head analogue: the terminus you load and collect at. **`rail`** is the
  trestle analogue: a piece that extends a route from an existing piece or dock.
- Routes are recomputed on placement (`recomputeRailRoutes`), walking connected rail tiles from a
  dock to the far dock, exactly as `recomputeFlumePaths` walks a flume run.
- **One wagon per route**, owned by the dock with the lower id, so a two-dock route can't sprout two
  wagons that pass through each other.
- Wagon shuttles: dwell to unload into the near dock's `output`, dwell to load from its `input`,
  reverse. `input` = waiting to leave, `output` = arrived here — symmetric at both ends, so the
  player's mental model is the same whichever end they stand at.
- **Gradient is law, enforced at placement**, where the reason can be *read*: a rail piece may not
  join an existing piece or dock at a different height. That's the rule that creates the HUNGER, so
  it must never fail silently.

Iron is the cost, which is thematically right (iron edge-rails) and ties the arc back to the
furnace the MVP just taught you to run.

## Steps

- [ ] `types.ts`: `rail` / `railDock` kinds, `Wagon` on `Building`.
- [ ] `constants.ts`: speed, wagon capacity, dwell, dock cap.
- [ ] `buildings.ts`: defs, costs, hotkeys (`r`, `t` — 0–9 are taken), placement + gradient rule.
- [ ] `rail.ts` (new, pure): `recomputeRailRoutes`, `tickRail`.
- [ ] `store.ts`: wire recompute on place, tick in `simStep`, dock deposit + collect.
- [ ] `status.ts`: dock status, drop-target, prompts.
- [ ] `progression.ts`: the blacksmith letter grants the tramroad — the post-MVP arc opens as the
      reward for finishing the MVP one.
- [ ] Render: ballast bed, sleepers, iron rails with a sun-side highlight, real quarter-curves,
      dock, wagon with the lot visible in the bed, horse.
- [ ] Tests: gradient refusal, a lot carried end to end, one wagon per route, route determinism.

## Manual test steps

Happy path:

- [ ] Win the MVP (or force-unlock): tramroad drawings arrive with the blacksmith letter.
- [ ] Lay a dock, a run of level rail, and a second dock. A wagon appears and begins shuttling.
- [ ] Drop ore at dock A (Q); it rides to dock B; collect it there (E).
- [ ] At 1× zoom the route reads as a ribbon across the works, not as ground noise.

Edge / failure cases:

- [ ] Try to lay rail onto a tile one level up: refused, with the gradient reason shown — not a
      silent no-op.
- [ ] A route with only one dock: no wagon, and the dock says it's waiting for a second terminus.
- [ ] Delete-free check: place a third dock on the same run; still exactly one wagon.
- [ ] Save, reload: the route and the wagon's cargo survive.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope for this session

Points/branching, passing places, scheduling, multiple wagons, steam, rail up an incline (that's the
HUNGER this creates, and the next arc's job). Also still open from the visual review: badge scaling,
`RESOURCE_GLYPH`, world-gen band wobble.

---

<!-- Fill in during/after -->

## What actually happened

Shipped as planned. The flume really was the right pattern to mirror — `recomputeRailRoutes` is
`recomputeFlumePaths` with an equality test instead of a `<=` test on height, and that single
character difference *is* the design: water flows downhill, a loaded wagon does neither.

**Route ownership** turned out to be the one piece with no flume precedent. A flume head owns its
run because runs are directional; a plateway is symmetric, so both docks would have claimed the
same route and spawned a wagon each. Ownership goes to the lower-id dock, and the far dock is
explicitly cleared, so re-running the recompute is idempotent — which matters because it runs on
every placement and on load.

**Two render fixes found by looking**, not by testing:

- The wagon was drawn as a screen-aligned rectangle and sat visibly *off the rails* on any run not
  heading screen-right. Rebuilt in world space from `kit.box()`, sized long-axis-along-travel. It
  now picks up the same face shading as every building for free.
- The rails' highlight was a parallel 1px `ironL` line, which at gauge width read as a pale blue
  tube rather than iron. Dropped to a hairline of `iron` over `ironXD`.

The **ballast bed** did its job: at 1× the route reads as a continuous ribbon with a legible corner
across the works floor, rather than dissolving into the ground clutter the earlier bundles added.

## Files created / modified

sim: `types.ts` (`rail`/`railDock` kinds, `Wagon`) · `constants.ts` · `buildings.ts` (defs, costs,
`r`/`t` hotkeys, the level-only placement rule) · `rail.ts` (new) · `store.ts` (recompute on place
and load, tick, dock deposit/collect) · `machines.ts` (a dock beside a stockpile banks) ·
`status.ts` · `progression.ts` (the blacksmith letter grants the tramroad) · `sim.test.ts` (+7) ·
render: `scene.ts` (track, dock, wagon, horse, conns) · `main.ts` (instrument bridge) ·
`scripts/verify-scene.mjs` (+2 checks) · this plan.

## Deferred to next session

Points/branching, passing places, more than one wagon per route, and rail up a gradient — that last
one is the HUNGER this slice deliberately creates, and it's the next arc's job (rope-worked
inclines, then steam). Still open from the visual review: badge scaling with zoom, `RESOURCE_GLYPH`,
world-gen band wobble.

## Status

- [x] Complete
