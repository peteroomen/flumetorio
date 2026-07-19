# MVP vertical slice — playable build

**Date:** 2026-07-19 · **Branch:** feature/mvp-vertical-slice · **Roadmap item:** M0–M5 (compressed)

## Goal

Build the whole MVP (GDD §13) as stacked slices, genuinely runnable, for a hands-on playtest.

## What actually happened

A playable end-to-end vertical slice, built in three stacked commits:

1. **Scaffold + pure sim** — Vite + TS(strict) + PixiJS + Zustand + Vitest. Engine-agnostic sim in
   `src/lib/sim`: deterministic terraced world gen, batch machines (power-gated sawmill, charcoal
   clamp, blast furnace with heat/going-cold/relight), movers (flume transport, gravity incline,
   auto-feeders), company-letter progression, localStorage save.
2. **Renderer + UI + loop** — PixiJS 2:1 dimetric scene (terraces, cliffs, buildings, movers,
   player), camera follow, tile picking, debug overlay; DOM HUD (bank, letter, build bar, toast);
   WASD/E/Q/C input + placement ghost; fixed-timestep loop + autosave; Playwright verifier.
3. **Completability fix + test** — a full-line integration test caught a real bug (see below);
   added map tooling and demo-scene screenshots.

**The core loop that works today:** fell trees (E) → hand-saw planks (C) or feed a powered sawmill
→ deliver planks to the Company (drop at a stockpile) → unlock the flume, then the
clamp/incline/furnace → flume logs downhill to a charcoal clamp, mine ore onto a gravity incline,
both auto-feed a blast furnace that must be kept stoked (goes cold + costly relight if starved) →
iron → carry it to the blacksmith → the forge lights (win). Autosave + reload works.

**Bug the tests caught:** buffer caps were computed on the *total* across all resources, so a
furnace filled with ore could never accept charcoal and never lit — the game was unwinnable. Caps
are now per-resource. The completability test (builds the real furnace line on seed 1 and asserts
iron smelts) now guards this.

## Verification

- `pnpm lint` clean · `pnpm type-check` clean · `pnpm test` = **14 green** (world determinism,
  power gating, furnace going-cold, flume, incline+feeders, banking, progression, player verbs,
  full-line completability, save round-trip).
- `pnpm build` clean; `node scripts/verify-scene.mjs` = all checks pass in a real browser (boot
  w/o errors, loop ticks, player moves, riverbank placement, in-browser furnace smelt) + captures
  screenshots to `docs/work/assets/`.

## Deliberate simplifications (vs the full GDD)

- **Vanilla-TS UI, no React; Tailwind deferred** (ADR 003) — fewer moving parts for the slice.
- Power = a waterwheel **radius** (implicit line shaft), not placed shaft segments.
- Flume head is fed by **adjacency to water** (no separate feeder-channel dig step).
- Player walks freely across terraces (only *cargo* is grain-bound); trees/ore harvested by a
  timed action; one carried resource type at a time (barrow).
- Company "delivery" = threshold on banked goods (non-consuming) for the plank letters; the
  blacksmith consumes delivered iron. No barrels, rail, ships, steam, town growth, auto-build —
  all remain post-MVP per GDD §13.
- Seed fixed to **1** for a predictable, tuned first valley.

## Files created / modified

Full `src/` (sim + render + ui + main), `scripts/verify-scene.mjs`, `scripts/dump-map.ts`,
config (vite/tsconfig/eslint/package), `index.html`, `docs/decisions/003-*`, this log.

## Deferred / next

- Balance/feel pass after live play (walk distances, chop/saw times, furnace heat curve, letter
  thresholds — all constants in `src/lib/sim/constants.ts`).
- Sound, juice, nicer building sprites, a proper tutorial nudge for the first flume.
- Then post-MVP arcs (demand-pull town, steam, rail, aqueducts) per the roadmap.

## Status

- [x] Complete — playable vertical slice, verified.
