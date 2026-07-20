# Economy restructure — chests, Company Wharf, build costs, inventory indicators

**Date:** 2026-07-20 · **Branch:** feature/economy-chests-wharf · **Roadmap item:** post-MVP — economy

## Goal

Untangle the muddled economy. Today the **stockpile** secretly does three jobs — local storage,
the global **wallet**, and **Company delivery** — so "stock logs" both banks them and reads as
"delivered to the Company", and a **flume into a stockpile silently drops on the ground** (chests
aren't real container targets). Split those three jobs into three clean things.

"Done" = one legible rule set: *goods flow into chests; chests feed adjacent machines; you ship
goods to the Wharf for tech; you build from what's on hand.* No global bank.

## The model (confirmed with owner)

1. **Stockpile = chest.** Holds real stacks (`store` buffer). **Auto-feeds adjacent machine
   inputs**, **auto-receives adjacent machine outputs**, accepts **flume tails**, and shows its
   contents (indicator). Hand deposit (Q) / withdraw (E). No wallet, no delivery.
2. **Company Wharf = the delivery-for-tech anchor.** One building; deliver goods here (hand, or an
   adjacent chest/machine auto-ships) → the Company takes them and grants **drawings** when a
   contract quota is met. The *only* "deliver to Company" surface. Sits at the low/coast end (the
   literal sea edge arrives with the flume/rivers slice; for now it's a placeable Depot).
3. **No global bank.** Resources are physical (barrow · ground · chests · machine buffers · wharf).
   HUD counters become a **derived "total owned"** (Σ chests + barrow), display-only.
4. **Build costs = option A (barrow + nearby chests).** To place a building its cost must be
   available in the player's **barrow + stockpiles within ~3 tiles**, and is consumed (barrow
   first, then nearest chests). Insufficient → "Need N planks nearby". Makes chests load-bearing.
5. **Stockpile inventory indicator** — render contents (resource pips + fill) so you can read a
   chest at a glance; the click-inspect panel already lists exact counts.

## Unified transfer rules (replaces the ad-hoc feeders)

- **Flume tail** → adjacent chest **or** machine input (logs). (Fixes the reported bug.)
- **Chest → adjacent machine input** — push what the machine accepts (log→saw/clamp/pitsaw,
  ore/charcoal→furnace, ore→incline).
- **Machine output → adjacent chest** (replaces `bankAllOutputs`).
- **Chest / incline / clamp → adjacent furnace** (existing furnace auto-feed, now chest-sourced).
- **Chest → adjacent Wharf** — auto-ship deliverable goods (so delivery can be automated).
- **Blacksmith ← adjacent chest** (iron) — the §PR-4 pull, now from a chest not the bank.

## Approach / key decisions

- **`Building.store: Buffers`** on stockpiles (cap `STOCKPILE_CAP`, multi-resource). Wharf gets
  `delivered: Buffers` (cumulative shipped). Remove `GameState.bank`.
- **Letters** (`sink: 'company'`) complete on **cumulative `wharf.delivered[res] ≥ want`**; the
  blacksmith letter unchanged (delivered at the blacksmith). So production splits between *shipping
  for tech* and *building* — a real choice.
- **Placement cost** helper `affordableAt(state, kind, tx, ty)` sums barrow + chests-in-radius; a
  matching `payCostAt` consumes them. `canAfford` (global bank) is retired.
- **Save:** bump `SAVE_VERSION` (schema changed: no bank, chest stores). Old saves are dropped
  cleanly on version mismatch (pre-release; no migration).
- **Depot/Wharf** unlocked from the start (needed for letter 1); free to place; single-instance
  guard (only one).
- Purity preserved: all transfer/cost logic pure + Vitest-covered.

## Steps

- [ ] types: `Building.store`, `wharf` kind + `delivered`, drop `bank`; letter sink stays 'company'.
- [ ] constants: `STOCKPILE_CAP`, `BUILD_SOURCE_RADIUS`, wharf caps.
- [ ] buildings: Wharf def; `affordableAt` / `payCostAt`; placement error copy; retire `canAfford`.
- [ ] machines/movers: unified transfer (`tickTransfers`) — chest↔machine, flume→chest, chest→wharf,
      blacksmith←chest; remove `bankAllOutputs`.
- [ ] store: deposit/withdraw to chest; place() pays via `payCostAt`; delivery accrues on wharf;
      remove bank; derived totals helper.
- [ ] progression: letters check `wharf.delivered`; copy updates (ship planks to the Wharf).
- [ ] render: chest inventory indicator; Wharf building; keep guidance working.
- [ ] hud: counters show derived totals; build-bar affordability uses `affordableAt` near the player.
- [ ] save: `SAVE_VERSION` bump.
- [ ] tests + verifier + screenshots.

## Manual test steps

- [ ] Build a chest; **flume into it** → logs land IN the chest (not on the ground). ✅ the reported bug.
- [ ] Chest beside a sawmill → it feeds the saw automatically; planks land in an output chest.
- [ ] Place a furnace with too few planks nearby → blocked with "need N planks nearby"; stage a
      plank chest → placement succeeds and consumes them.
- [ ] Ship planks to the **Wharf** (hand or chest-fed) → letter completes, drawing granted. Stocking
      in a chest does **not** complete the letter (no more conflation).
- [ ] Chest indicator readably shows contents/fullness; inspect panel lists exact counts.
- [ ] Reload → new schema loads (old save dropped cleanly).

## Out of scope (next slices)

- The literal **sea edge / coast** + sailing ships (flume/rivers → water-to-sea spine slice).
- The demand-pull **town** growth (the Wharf is the *far* sink; the blacksmith is the first *near*
  valve).
- Iso-dimetric renderer + visual-state language (separate locked slice).

## Build order note

Best rebased on **PR #4** (feeding cues + blacksmith-from-stockpile), which this supersedes in part
(blacksmith now pulls from a chest, not the bank). Merge #4 first, then this branches clean off main.

---
## What actually happened

Built the whole restructure. `bank` is gone. Stockpiles are chests (`Building.store`) that
auto-feed adjacent machines, catch machine output, accept flume tails, and show their contents.
A pre-placed **Company Wharf** (`shipped` counter, at the water's edge) is the sole deliver-for-tech
surface; hand-carry `Q` ships to it, and the Company letters check `wharf.shipped`. Build costs come
from the **barrow + chests within 3 tiles** (`affordableAt`/`payCostAt`); stockpile now costs 2
planks, blacksmith 4 — a real materials economy. `E` withdraws from a chest; the HUD counters are a
derived "owned" readout (barrow + chests). The reported **flume-into-chest** bug is fixed. One
unified `tickTransfers` replaced the ad-hoc feeders + `bankAllOutputs`. `SAVE_VERSION` → 2 (old saves
drop cleanly). Kept auto-ship-from-chest OUT (would strand build materials) — note for later with a
filter.

lint/type-check clean; **24 Vitest green** (chest collect/feed, flume→chest, build-cost-from-chest,
wharf delivery, owned totals, + updated existing). Browser verifier passes; demo shows chest
indicators, real build costs, derived counters.

## Files changed

sim: `types.ts` `constants.ts` `buildings.ts` `machines.ts` `movers.ts` `store.ts` `progression.ts`
`status.ts` `sim.test.ts` · render: `palette.ts` `scene.ts` · ui: `hud.ts` · `scripts/verify-scene.mjs`.

## Deferred

- Auto-ship chest→wharf **with a resource filter** (safe automation of delivery).
- The literal sea edge / sailing ships (water-to-sea spine slice) — wharf is a placeable-position
  anchor until then.

## Status
- [x] Complete
