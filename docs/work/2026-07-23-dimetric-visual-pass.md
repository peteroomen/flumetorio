# True-dimetric visual pass — port Plate III into the renderer

**Date:** 2026-07-23 · **Branch:** claude/visual-design-pass-review-lnysno (session-designated) ·
**Roadmap item:** post-MVP — the deferred "building glow-up" fast-follow

## Goal

The game renders buildings the way the locked art-direction artifact ("Plate III · Rev C — iso ·
a modular kit · the projection question") prescribes: **pitch B, true dimetric** — massing as
shaded iso boxes with detail mounted on the two visible faces — composed from the reusable
component kit (chimney + smoke, face-mounted cogs/wheels, lit windows, trestles, drive shafts),
on chunky block earth beside clean three-tone water. Kill the "dead-on front sprite floating on
a diamond" shortcut the plate explicitly calls out as what feels off.

## Approach

- The tile contract (ADR 002) is untouched — `iso.ts` stays as-is; only drawing changes.
- New `src/render/kit.ts`: the plate's component kit re-authored at game scale (tile 64×32,
  height step 22). The face-mounted trick: map face-plane (u,v) coords into screen space via the
  wall-face basis vectors (the plate's canvas `transform(±HW/L, HH/L, 0, -1)`), drawing circles
  as mapped N-gons since Pixi Graphics has no path transform.
- `palette.ts` adopts the plate's hex ramps verbatim (earth/grass/rock/water₀₁₂/iron/brass/
  copper/verdigris/stone/brick/wood/ember + steam/soot particle tints, sky gradient stops).
- Terrain: cliff faces become block-earth strata (top-color lip over earth tones, right face
  darker than left), water recessed below its banks with clean tones + animated flow glints,
  sky gradient behind the world.
- Every building redrawn in the kit language, including the deferred ones (flume as a real
  directional trough on trestle legs, head-gate with sluice, incline as rails + shuttling cart,
  clamp mound with vent glow, mill houses with roofs/windows/chimneys/cogs, stacked riveted
  furnace with heat-driven tap glow).
- Draw-order correctness: buildings, trees, ground items, flume items and the **player** join
  one back-to-front sorted dynamic pass (player can finally walk behind a building). Terrain
  stays cached for perf.
- Render-side fixes that ride along: player facing nub projected properly into iso, flume item
  height interpolated along the run (no popping at segment boundaries), badge heights per
  building so tall stacks don't wear their badge through the roof, furnace glow tightened.
- Sim, store, HUD, input: no behavioural changes. Sim bugs found while reading go in the review
  writeup, not this PR (one slice = one concern).

## Steps

- [x] Plan file
- [ ] `render/kit.ts` — shade/box/roof/chimney/smoke/faceCog/faceWheel/faceWindow/trestle helpers
- [ ] `palette.ts` — plate ramps
- [ ] Terrain: block-earth cliffs, recessed water + glints, sky gradient
- [ ] Buildings ×10 redrawn dimetric; trees/ore/player upgraded
- [ ] Unified dynamic draw order incl. player
- [ ] Guidance layer re-anchored (badge heights, shaft sag)
- [ ] Verifier passes + fresh screenshots; lint/type-check/test clean

## Manual test steps

- [ ] Boot fresh: valley reads as chunky block-earth terraces, water clearly recessed and clean,
      sky gradient behind; trees are shaded pines, not flat triangles.
- [ ] Demo scene (verify script): every building reads as a dimetric volume — sawmill/blacksmith
      have roofs, windows, chimneys with smoke; furnace is a stacked riveted tower whose tap
      glows with real heat; waterwheel turns on a wall face over the water; flume is a trough
      with flowing water riding trestles; incline shows rails + a moving cart.
- [ ] Walk the player north behind a furnace/sawmill: the building correctly occludes the player.
- [ ] Edge: furnace cold → tap dark, no smoke, cold badge above the crown (not inside it);
      sawmill unpowered → no cog spin, no smoke, no-power badge.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `node scripts/verify-scene.mjs` passes.

## Out of scope for this session

- Sim/gameplay changes of any kind (bugs found are reported in the session review instead).
- True low-res pixel-buffer upscale + integer zoom (still the separate deferred fast-follow).
- Sound/juice; town/steam/rail arcs.

---

<!-- Fill in during/after -->

## What actually happened

Ported Plate III's pitch B (true dimetric) into the live renderer, all in the render layer — the
sim is untouched.

- **`render/kit.ts` (new):** shaded iso `box`, hip `roof`, slim `chimney` + smoke plume,
  `faceCog` / `faceWheel` / `faceWindow` mounted on wall faces via explicit face-basis mapping
  (circles as mapped N-gons — Pixi Graphics has no path transform), sagging `shaft`,
  `trestleBent`, `plankStack`, `barrel`.
- **`palette.ts`:** the plate's ramps verbatim (earth/grass/rock/water₀₁₂/iron/brass/copper/
  verdigris/stone/brick/wood/ember/steam/soot); `shade()` replaces `darken()`.
- **Terrain:** block-earth cliff faces per-terrain ramp with strata lines at level boundaries;
  water recessed 0.35 below its banks with inner bank walls, waterfall faces + animated foam
  where the river steps down a terrace, flow glints on the surface; sky-gradient backdrop.
- **Buildings, all ten, re-authored dimetric:** stockpile platform w/ posts + plank stack +
  barrel; pit saw (pit, trestles, log, stroking blade, sawdust); waterwheel (vertical face-wheel
  over the water side w/ posts + splash); sawmill (stone plinth, wood body, shingle roof, lit
  window when working, brick chimney, face cog, log pile / plank stack from real buffers);
  charcoal clamp (turf mound, pulsing ember vents + smoke when working); gravity incline (rails
  + sleepers down the actual drop direction, winding drum, shuttling cart w/ ore, buffer heaps);
  blast furnace (three stacked tapering iron boxes, riveted brass hoops, tap-hole arch whose
  ember + glow track real `heat`, relight flicker, smoke scaling with heat, face cog); blacksmith
  (stone body, brick roof, window lit by `delivered`, anvil); flume as a **directional trough**
  (per-tile connectivity derived from head paths, halves toward each connection so corners work,
  water flowing the right way, trestle legs); head-gate (posts, crossbeam, raised gate board,
  brass gate screw, churn).
- **Draw order:** trees, stumps, ores, buildings, ground items, flume items, and the player all
  join one back-to-front pass — the player can finally walk *behind* a building. Terrain stays
  cached.
- **Ride-along render fixes:** player facing projected into iso screen space (was world-space
  atan2 — the nub lied); flume items interpolate height along the run and ride *on* the trough;
  per-kind badge anchor heights (`BADGE_Z`) so tall stacks don't wear badges through the roof;
  furnace glow tightened from a giant alpha blob to heat-scaled layers; the placement ghost now
  draws the real building silhouette at 60% alpha; the action prompt counter-scales with zoom;
  player pushes a visible barrow when laden.

`pnpm lint` / `type-check` / 19 Vitest green; `verify-scene.mjs` ALL CHECKS PASSED; screenshots
in `docs/work/assets/` refreshed.

## Files created / modified

`src/render/kit.ts` (new) · `src/render/palette.ts` · `src/render/scene.ts` · this plan ·
`docs/work/assets/*` (regenerated) · `CLAUDE.md` (current state)

## Deferred to next session

- True low-res pixel-upscale + integer zoom (unchanged fast-follow).
- Sim bugs found while reading (flume-without-trestles destroys logs; status caps duplicated
  from constants; HUD DOM churn per frame) — reported in session review, deliberately not fixed
  here.
- Waterwheel wheel faces the drawn-side wall even when its water is behind the tile (rare,
  cosmetic); ambient sound/juice.

## Status

- [x] Complete
