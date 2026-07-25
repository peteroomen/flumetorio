# Ground texture, flora scatter, and a committed light direction

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — visual follow-up to the dimetric pass (PR #7)

## Goal

The world should read as *terrain* rather than as *tiles with objects placed on them*: no visible
tile lattice on open ground, a forest that looks grown rather than stamped, and one consistent sun
so every object is anchored to the ground by a shadow that agrees with its own shading.

## Context

Follow-up to PR #7 (`feat: true-dimetric visual pass`), which is still open. This branch is based on
**PR #7's head**, not `main` — items 1–3 all live in the renderer that #7 rewrote, so basing on
`main` would conflict irreconcilably. Until #7 merges this branch contains its commit too.

Three findings from a screenshot review of #7, which are one problem from three sides:

1. **Graph-paper grid.** Every land tile draws a full diamond outline, and each top face is a flat
   fill plus two 2px specks. On the works floor — roughly half the screen — the lattice is the only
   thing to look at.
2. **Wallpaper forest.** Trees always draw at exactly `tx+0.5, ty+0.5`. Scale jitters; position
   never does. The result is a perfect lattice of near-identical icons.
3. **Contradictory light.** `kit.box()` shades the `+x` wall darkest (sun from screen upper-left),
   but tree shadows are centred ellipses (sun directly overhead), and buildings, the waterwheel and
   the line shaft cast nothing at all — so they read as pasted on.

## Approach

**Sun contract.** Derive it from what the kit already does rather than inventing one: `box()` fills
the `+x` wall at 0.55 and the `+y` wall at 0.75, so the light is opposite `+x` with a smaller `-y`
component. Shadows therefore sweep along world `+x` (with a little `+y`), lengthening with object
height. One exported `SUN` constant; every shadow in the renderer derives from it. Documented in
`palette.ts` so it can't drift.

**Shadow shapes.** A box's cast shadow is the Minkowski sum of its footprint with the light vector —
for a positive `(dx, dy)` sweep that's a hexagon, drawn as one polygon so overlapping alpha can't
double-darken. Trees, ore, the player and loose items get a cheaper offset ellipse.

**Ground.** Replace the per-tile stroke with two-octave value noise (deterministic hash, no
`Math.random`, since the terrain layer is cached and must not shimmer on rebuild) applied as a ±10%
multiplier on the top-face colour, at a wavelength of several tiles. Then authored clutter keyed off
the same hash: pebbles and scree on rock/earth, tufts on grass, puddles, and cart ruts that run
edge-to-edge along a row so consecutive tiles form a continuous track.

Removing the grid costs build-mode legibility, so the ghost pass draws a faint lattice within a few
tiles of the hover tile — grid as *information*, only when placing.

**Flora.** One shared `floraOffset(tx, ty)` so a tree and the stump it leaves occupy the same spot.
Three canopy silhouettes and a four-entry green ramp, all hash-selected.

## Steps

- [ ] `palette.ts`: `hash01`, `patchNoise`, `SUN` + shadow length constant.
- [ ] `kit.ts`: `castShadow` (footprint sweep hexagon), `blobShadow` (offset ellipse).
- [ ] Terrain: patch-noise value variation; drop the per-tile stroke.
- [ ] Terrain: ground clutter — pebbles, scree, tufts, puddles, cart ruts.
- [ ] Build-mode grid in the ghost pass, local to the hover tile.
- [ ] Flora: shared jitter for tree/stump/ore; three canopy variants; green ramp.
- [ ] Shadows: buildings (per-kind height), trees, stumps, ore, player, ground items.
- [ ] Line shaft: trestle posts down to the terrain, with their own shadows.
- [ ] Re-run the verifier; eyeball fresh screenshots and tune shadow length by eye.

## Manual test steps

Happy path:

- [ ] Boot: the works floor has no visible tile lattice; ground reads as patchy trodden earth with
      scattered scree and cart ruts, not a uniform slab.
- [ ] The top terrace reads as a wood — trees off-centre, varied silhouette and green, no lattice.
- [ ] Every tree, building, the player and the waterwheel cast a shadow to the screen lower-right,
      in the same direction as the shaded `+x` walls.

Edge / failure cases:

- [ ] Press `1` (build mode): the faint placement grid appears near the cursor and disappears on
      `Esc` — placement is still legible without the permanent grid.
- [ ] Fell a tree: the stump appears at the *same* off-centre spot the trunk occupied (the jitter is
      shared, not re-rolled per draw).
- [ ] Restart with `N` twice: identical ground clutter and identical tree placement both times
      (hash-derived, so the cached terrain layer can't shimmer on rebuild).
- [ ] A building on the height-2 terrace casts its shadow onto its own terrace, not through the
      cliff below it.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope for this session

Items 4–11 from the review: material identity per building family (4), water desaturation (5),
atmospheric depth and the sky wedge (6), badge scaling (7), waterfall foam (8), terrace AO (9),
world-gen band wobble (10), resource glyph consistency (11). Item 10 is world-gen, not render, and
wants its own branch.

---

<!-- Fill in during/after -->

## What actually happened

All three landed, plus one finding the plan didn't anticipate.

**The checkerboard under the wood.** Removing the tile stroke exposed a second lattice the outline
had been masking: `terrainColor` returned a single flat `COLORS.grass` for `forest`, while plain
grass followed the height ramp (`grassT` at height 2). With 42% of the top terrace wooded, every
forest tile two-toned against its neighbours — a checkerboard that was arguably worse than the grid.
Folding `forest` into the `grass` branch (so it shares the *height* band, with the canopy carrying
the green, which is what the original comment claimed it did) fixed it.

**Two rounds of tuning by eye**, which is why the screenshots were re-taken three times:

- Puddles at `roll > 0.9` and 0.62 brightness read as holes punched in the works floor. Rarer
  (`> 0.965`), lighter (0.8), smaller — damp patches now.
- Every pebble had a lit cap, which turned the floor into rivets. Flattened, and the highlight is
  now conditional.
- Grass tufts were a symmetric two-stroke 'V' that read as a printed checkmark. One leaning blade.
- Cart ruts ran unbroken across the full map width like scratches; they now need a per-tile roll as
  well as the per-row one, so they run *with gaps*.
- `blobShadow` originally displaced the whole ellipse along the sun vector, which detached each
  shadow from its trunk — a field of dark ovals lying near, but not under, the trees. Centring on
  *half* the sweep and stretching the ellipse by the other half anchors it at the base.
  `SHADOW_PER_LEVEL` came down 0.34 → 0.22 in the same pass.

**Verification.** Beyond `pnpm verify`, a throwaway Playwright script checked the three edge cases:
re-initialising the same seed produces a byte-identical terrain crop (SHA-1 match — the hash-derived
clutter really is stable across cached rebuilds); a felled tree's stump lands on the trunk's stand;
and build mode toggles the local grid on and back off with `Esc`.

## Files created / modified

`src/render/palette.ts` (hash01, patchNoise, SUN/SHADOW constants, forest ramp fix) ·
`src/render/kit.ts` (castShadow, blobShadow, shaftPoint) · `src/render/scene.ts` (terrain
patch-variation + clutter, no per-tile stroke, build-mode grid, flora jitter/variants, shadows on
every caster, line-shaft posts) · `CLAUDE.md` · this plan · refreshed `docs/work/assets/*.png`.

## Deferred to next session

Nothing from this slice. Items 4–11 of the review remain open and are listed in the CLAUDE.md
Current State — the most valuable next ones are per-building material identity (4) and the world-gen
band wobble (10), which is the last big source of "this world was sliced, not shaped".

## Status

- [x] Complete
