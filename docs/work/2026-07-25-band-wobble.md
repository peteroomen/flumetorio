# The terraces get a coastline

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — world-gen

## Goal

The valley should look *shaped* rather than *sliced*. Terrace edges should wander — bays, spurs,
a headland — instead of running as three perfectly straight diagonals across the whole map.

## The problem

`bandHeight(ty)` keys height purely off the row, so every terrace boundary is a single straight
line in tile space and therefore a perfectly straight diagonal on screen. This is the last big
source of the "this world was cut with a ruler" read, and it's the one thing no amount of render
work can fix — it's generation, not drawing. It's been on the deferred list since the first visual
review.

## Approach

Give each boundary a per-column offset, exactly the trick `riverColAt` already uses for the river's
meander: two sine terms at different frequencies, deterministic in `tx`, no RNG needed (and so no
seed plumbing, matching the existing river).

```
bandHeight(tx, ty):
  topEdge = BAND_TOP_MAX_Y + wobble(tx, saltA)
  midEdge = BAND_MID_MAX_Y + wobble(tx, saltB)
```

**The invariant that matters:** `topEdge < midEdge` must hold for every column, or a terrace
inverts or vanishes and the whole elevation spine breaks. The base rows are 11 apart and the wobble
is bounded at ±3, so the worst case is a 5-row mid terrace — comfortable. That bound gets a test
rather than a comment.

**Signature change.** `bandHeight` becomes `(tx, ty)`. It has five call sites, three of them the
out-of-bounds fallbacks in `heightAt` and the renderer's skirt — all of which *must* move together,
or the map edge and the skirt stop agreeing with the terrain and a seam appears.

**Two knock-on fixes in generation**, both consequences of the boundary no longer being a row:

- Trees were planted by scanning rows `1..BAND_TOP_MAX_Y`. With a wobbled edge, some top-terrace
  tiles now sit below that row and would be bald, while some rows within it are no longer top
  terrace. Plant by *height* instead of by row — the honest condition.
- The ore cluster gates on `bandHeight(ty) !== HEIGHT_MID`; it needs the new signature, and its
  centre row may now be a different band in some columns, so it seeds from a tile that is actually
  on the mid terrace.

## Steps

- [ ] `world.ts`: `bandHeight(tx, ty)` with a bounded two-octave wobble per boundary.
- [ ] `world.ts`: plant trees by height, not by row; seed ore from a genuine mid-terrace tile.
- [ ] `world.ts`: `heightAt` out-of-bounds fallback takes `tx`.
- [ ] `scene.ts`: the three fallback/skirt call sites.
- [ ] Tests: determinism, band ordering per column, the `topEdge < midEdge` invariant across every
      column, boundaries actually varying, and the world still producing trees + ore.

## Manual test steps

Happy path:

- [ ] Boot: terrace edges wander across the map — no straight diagonal runs the full width.
- [ ] The skirt beyond the map edge still lines up with the terrain it continues.

Edge / failure cases:

- [ ] Every column still has all three terraces, in order, with a mid band at least a few rows deep.
- [ ] The river still steps down the terraces and reaches the bottom.
- [ ] Trees still cover the forest terrace, including where its edge bulges south.
- [ ] The MVP is still completable (the existing completability test must stay green).
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope

Terrain features beyond the band edges (plateaus, ravines, varied terrace counts). Rail pricing.

---

<!-- Fill in during/after -->

## What actually happened

Landed as designed. The interesting part was what it broke: **two tests and one verifier check that
had hard-coded terrace boundaries as fixed rows** — which is precisely the assumption this change
exists to remove.

- The rail gradient test asserted `heightAt(8, 21) !== heightAt(8, 22)` because "row 21 is height 1
  and row 22 is height 0". At column 8 the boundary now wanders elsewhere and both rows are mid
  terrace. Rewritten to *search* for a genuine dry terrace step and use that. Strictly better: it
  now tests the rule rather than the map.
- The flume verifier ran its test flume from row 8 to row 25 and expected a 2-level span; at column
  8 that range now spans one terrace. Moved to rows 3–27, which cover all three bands in every
  column since the wobble is bounded at ±3.

Both were latent brittleness that a straight-line world had been hiding. Worth noting the invariant
test (`topEdge < midEdge`, every column, ±8 columns beyond the map so the out-of-bounds fallback is
covered too) caught nothing — because the ±3 bound against an 11-row gap was chosen to make it
impossible. That's the point of writing it down as a test rather than a comment.

The two generation knock-ons both landed as predicted: trees plant by height rather than row (a
wandering edge would otherwise leave bald patches on the south side of every bulge), and the ore
cluster seeds from a probe outward to a tile that really is mid terrace in its column.

## Files created / modified

`src/lib/sim/world.ts` (`bandHeight(tx, ty)`, `BAND_WOBBLE`, `bandEdgeShift`, trees by height, ore
seed probe, `heightAt` fallback) · `src/render/scene.ts` (three fallback/skirt call sites) ·
`src/lib/sim/sim.test.ts` (+2, and the rail step test de-hard-coded) · `scripts/verify-scene.mjs`
(flume fixture spans the terraces) · `CLAUDE.md` · this plan.

## Deferred to next session

Richer world-gen — plateaus, ravines, varied terrace counts, seed-varied band layout — is a much
bigger design question and wants the balance pass first. Rail pricing is still open.

## Status

- [x] Complete
