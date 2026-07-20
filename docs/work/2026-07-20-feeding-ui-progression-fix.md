# Feeding UI + iron→blacksmith progression fix

**Date:** 2026-07-20 · **Branch:** fix/feeding-ui-progression · **Roadmap item:** post-MVP — clarity

## Goal

Unblock the playtest soft-lock at iron, and add Factorio-style "what does this machine need"
feeding cues — off owner playtest notes ("got stuck at iron", "need more UI around feeding / a
flashing fuel icon").

## What happened

- **Soft-lock fixed.** Iron auto-banked (furnace beside a stockpile) never reached the blacksmith,
  whose letter only counted hand-delivered iron → you could hold 10 iron and never win. Now the
  **blacksmith draws banked iron from an adjacent stockpile** (`tickFeeders`), so
  furnace→stockpile→blacksmith automates *and* hand-carry still works. Letter 4 copy rewritten to
  say build the blacksmith (press 0) and supply it (carry, or stockpile-beside).
- **Feeding cues.** `buildingStatus` now distinguishes **`needsFuel`** (a cold/cooling furnace,
  `want: charcoal`) from **`needsInput`** (`want: log`/`ore`), and carries the wanted resource.
  Render: attention badges **flash** (pulse), a **flame fuel-icon** for `needsFuel`, and a small
  **want-glyph** pip (the resource the machine is waiting for) beside the badge. Furnace status/info
  now names the source: "Cold — needs charcoal (from a clamp) to relight".
- **Delivery marker.** While the blacksmith is the active goal, a pulsing **iron marker** floats
  over it so you know where iron goes.

lint/type-check clean; **19 Vitest green** (+2: needsFuel/want, blacksmith-pull). Verifier passes;
demo screenshot shows the new copy, cues, and marker.

## Deferred (roadmapped, owner-approved)

- **Iso-dimetric renderer + visual-state language** (art direction now locked — Settlers II/III,
  component kit, machines animate their state, dial text down). The bigger of the two.
- **Flume expansion** (branching/gating/rivers) — the fun core, its own slice.

## Files

sim: `status.ts` `movers.ts` `progression.ts` `sim.test.ts` · render: `scene.ts` ·
`scripts/verify-scene.mjs` · `docs/ROADMAP.md` · this log.

## Status
- [x] Complete
