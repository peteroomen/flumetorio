# Material identity and air

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — visual follow-up, second bundle

## Goal

The works should read as a *Victorian industrial* site rather than a brown monochrome, and the
valley should sit in air rather than float on a void.

## Context

Second bundle stacked on the ground/flora/light work (PR #8), from the same screenshot review of
PR #7. Items 4, 5, 6, 8 and 9 of that review; all render-only.

Item 10 (world-gen band wobble) stays out — it changes `bandHeight`, which drives terrain
generation, the ore cluster, river stepping and every placement rule, so it needs its own branch
with sim tests rather than riding along with render polish.

## Approach

**A material rule, not just recolouring (4).** The palette already declares `verd`, `copper` and
`brick` and uses none of them. Rather than tinting buildings arbitrarily, adopt a rule the whole
kit can follow, so future buildings inherit it:

| Material  | Means                                             |
| --------- | ------------------------------------------------- |
| brass     | power transmission — cogs, shafts, drums, lips     |
| verdigris | weathered copper on anything permanently wet       |
| brick     | anything that holds fire                           |
| slate     | roofs                                              |
| timber    | structure                                          |

So: the blacksmith becomes brick with a verdigris roof (the strongest hue break in the works, and
it earns `verd`); the furnace gets a brick base course under its iron stack; the waterwheel's
fittings go verdigris while its shaft stays brass; the flume head-gate's ironwork goes verdigris.

**Aerial perspective (6).** Screen-space, not per-tile: the camera is centred on the player, so
screen height *is* distance. One gradient above the world tinting toward haze costs a single
redraw on resize and fogs everything uniformly — buildings included — where a per-tile fog would
have to be threaded through every kit function.

**The void (6).** The map's edge currently ends in a hard diagonal against the backdrop, which
reads as a rendering artifact. Draw a skirt of flat band-height tiles beyond the bounds, fading
out — the valley then continues into haze instead of stopping.

**Ambient occlusion (9).** The terraces are the game's spine (GDD) but read as thin ribbons. Darken
a band on the ground along any tile edge whose neighbour *behind* is taller, so cliffs sit in a
pool of their own shade.

## Steps

- [ ] Palette: slate/verdigris ramps, `mix`, `HAZE`; desaturate the water ramp (5).
- [ ] Material identity across blacksmith, furnace, waterwheel, sawmill, incline, flume head (4).
- [ ] Terrace-base AO on tiles below a taller neighbour (9).
- [ ] Out-of-bounds terrain skirt, fading into the backdrop (6).
- [ ] Screen-space haze gradient over the world (6).
- [ ] Waterfall foam: a filled mass at the fall foot plus drifting specks downstream (8).

## Manual test steps

Happy path:

- [ ] Boot: the valley recedes into haze at the top of the screen and no longer ends on a hard
      diagonal edge against the void.
- [ ] The works read as several materials — a brick smithy under a verdigris roof, an iron furnace
      on a brick base — not one brown mass.
- [ ] Cliff bases sit in shade; the terraces read as real drops.
- [ ] The river is no longer the most saturated thing on screen; the furnace glow is.

Edge / failure cases:

- [ ] Press `G` (debug overlay) and pan to the top of the screen: the haze must not make the
      overlay labels unreadable — the debug overlay stays functional forever (CLAUDE.md).
- [ ] Walk to the map's edge: the skirt must not be clickable or placeable (it's decoration, and
      `pickTile` must still refuse out-of-bounds tiles).
- [ ] Stand at a waterfall: foam sits at the foot of the fall, not floating as a bare ring.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope for this session

Item 7 (status badges scaling with zoom — they still dominate at close zoom, but it's guidance UX
that was deliberately tuned in an earlier session), item 10 (world-gen band wobble — own branch),
item 11 (`RESOURCE_GLYPH` mixes an emoji with geometric glyphs — HUD, not renderer).

---

<!-- Fill in during/after -->

## What actually happened

All five landed. Two things fought back.

**The skirt banded, twice.** First attempt drew it unsorted and after the real terrain, with an
alpha fade — so skirt cliff faces painted over the tiles in front of them, and every shared diamond
edge compounded its alpha into visible seams. Fixed by sorting back-to-front like the real terrain,
drawing it *first* so real terrain always wins where the two meet, and fading by **colour** toward
`HAZE` at full opacity instead of by alpha. That killed the seams but left concentric rings: `out`
is a whole ring count, so a straight ramp steps in 7 visible bands. Jittering the ramp by the tile's
own patch noise (±1 ring) dithers the rings into a gradient. `M` went 7 → 10 to spread it further.

**One thing the plan missed.** With the lattice off the land, the *water* still carried its own —
the surface stroke at alpha 0.5 read as a tile grid on the river at close zoom, exactly the defect
item 1 removed. Dropped to 0.2: still a faint surface facet, no lattice.

Also removed `BUILDING_COLORS`, which PR #7 had stopped using. Leaving a flat colour-per-kind table
next to a material vocabulary would have been a second, silently-diverging source of truth for
exactly the thing this session was trying to make coherent.

**Verification.** Beyond `pnpm verify`, a throwaway Playwright script confirmed the two risks the
plan named: the debug overlay stays fully legible with buildings sitting in the deepest haze
(labels read `sawmill@10,10 i:log2 NOPWR` etc. at the top of the screen), and sweeping `pickTile`
across the whole viewport returned 798 tiles with **zero** out-of-bounds hits — the skirt is
decoration and can't be clicked or built on.

## Files created / modified

`src/render/palette.ts` (slate/verdigris ramps, `mix`, `HAZE`, desaturated water, foam; dropped
`BUILDING_COLORS`) · `src/render/scene.ts` (material identity across blacksmith/sawmill/furnace/
waterwheel/flume head, terrace-base AO, out-of-bounds skirt, haze layer, waterfall foam, water
lattice) · `CLAUDE.md` · this plan · refreshed `docs/work/assets/*.png`.

## Deferred to next session

Nothing from this slice. Still open from the review: item 7 (status badges dominate at close zoom —
they're now the loudest thing left in the frame), item 10 (world-gen band wobble, own branch), item
11 (`RESOURCE_GLYPH` emoji/glyph mismatch).

## Status

- [x] Complete
