# Pixel-steampunk visual pass + pit saw + in-game guidance

**Date:** 2026-07-20 · **Branch:** feature/visual-guidance-pass · **Roadmap item:** post-MVP — legibility/feel

## Goal

The game should **look like the Plate II pixel-steampunk direction** and **explain itself as you
play** — plus the **pit saw** as the free/manual production tier. Two problems at once: it's visually
generic, and it's silent about power, inputs, and where to deliver (real playtest confusion: "how do
I use the sawmill?", "where do I deliver?", the silently-dead unpowered sawmill).

"Done" = a stranger boots it, immediately understands what to do and why a machine isn't running,
and it reads as a Victorian works, not colored blocks.

## Scope decision — ship as 3 stacked PRs (recommended)

This is too big for one PR. Proposed stack (each its own branch off the previous, each independently
verifiable). We can also collapse to fewer if preferred:

- **A — Pixel render foundation + palette + terrain** (the look, no new mechanics)
- **B — Building glow-up + pit saw** (sprites toward the plate; the free-tier saw)
- **C — In-game guidance layer** (power viz, status badges, action prompts, delivery hints, info panel)

C is the highest *playtest* value; A/B are the highest *identity* value. If we want the fastest win,
do **C first**. Recommendation below assumes A→B→C, but flag your preference.

---

## A — Pixel render foundation

**Approach.** Keep the geometric iso + tile contract (ADR 002) exactly — only the *draw* changes.
Adopt a pixel look via **nearest-neighbour textures**: author each sprite/tile at 1× pixel scale
into a small canvas → Pixi `Texture` with `scaleMode: 'nearest'`; the world container scales by
**integer** zoom steps so pixels stay crisp. This preserves camera pan/zoom and geometric picking
(no low-res full-frame buffer, which would fight the moving camera). Decision to confirm at impl:
nearest-textures (recommended) vs a low-res RenderTexture upscale.

**Steps**
- [ ] Extend `palette.ts` with the brass/iron/copper/verdigris/soot/ember ramp (locked; from the plate).
- [ ] Pixel helpers in `render/` (draw-to-offscreen-canvas → nearest Texture; a tiny sprite DSL).
- [ ] Terrain repaint: terrace tops with dither texture, shaded cliff faces, water with flow glints.
- [ ] Integer-zoom camera; nearest filtering global.

## B — Building glow-up + pit saw

**Visual (toward Plate II, in iso):**
- [ ] Waterwheel → a **vertical turning wheel** dipping into the race + mill-house body.
- [ ] Furnace → **tapered riveted stack**, brass hoop-bands, tap-hole glow **driven by `heat`** (dim/blue when cold), steam at crown.
- [ ] Flume → **sloped trough** with flowing water + trestle; head-gate sluice; a log rides it.
- [ ] Sawmill (brass gear), charcoal clamp (smoking mound + vent), blacksmith (lit window), stockpile, player.

**Pit saw (sim + render) — the free manual tier (GDD §5 power rule):**
- [ ] New building `pitsaw`: unpowered, **slow**, `log → plank` (mirrors the clamp's cycle model).
      Cheap/free, **unlocked from the start**.
- [ ] **Remove the hand-saw** (`C` / the `'saw'` action / on-head plank-craft) — the pit saw replaces
      it. One coherent model: logs are physical, they go into a machine. Update `store.ts`,
      `types.ts` (`actionKind`), input handler, HUD hint.
- [ ] Progression: `pitsaw` in initial `unlocked`; letter 1 ("deliver 8 planks") now routes through it.
- [ ] Balance so one powered **sawmill** clearly beats a yard of pit saws (speed + footprint).
- [ ] Tests: pit saw cycle, hand-saw removal, letter-1 still completable via pit saw.

## C — In-game guidance / visual communication (the playability ask)

The game must *say why*. Every "it just sits there" moment gets an on-screen answer.

- [ ] **Power / driveshaft viz** — draw the line-shaft from a waterwheel to each powered machine in
      reach (spinning belt; goes slack when the wheel's starved). The "is it connected?" fix.
- [ ] **Machine status badges** — a small iso icon above each building: `running` / `needs input` /
      `no power` / `output full` / `cold` (furnace). Read *why* at a glance. (Pixel icon set.)
- [ ] **Contextual action prompts** — a floating hint by the player for the current best verb:
      "E — fell", "E — mine", "Q — tip logs into flume", "Q — deliver iron". Kills "how do I use X".
- [ ] **Delivery affordances** — while carrying, softly highlight valid drop targets (stockpile /
      flume head / incline / furnace / blacksmith); make "drop planks at a stockpile = deliver to the
      Company" obvious.
- [ ] **Selected-building info panel** — click a building → DOM panel: name, one-line what-it-does,
      inputs/outputs w/ counts, status, power. (Answers most "how does this work" questions.)
- [ ] **First-run nudge** — letter 1 copy + a gentle pointer to the forest and back for the first loop.

## Approach notes / risks

- **Tile contract stays** (ADR 002). Picking is geometric; only rendering + camera-zoom-stepping change.
- **The plate is a 2.5D elevation; the game is iso.** Sprites must be re-authored *in iso* — expect the
  first in-game pass to be ~80% of the plate's polish, refined later. That's fine.
- Sim purity preserved: all new visuals read state, never mutate it. Pit saw is pure sim + tested.
- No SAVE_VERSION concern: `pitsaw` is an additive building kind; removing the `'saw'` action doesn't
  touch saved state (saved games have no in-flight saw action of consequence).

## Manual test steps

- [ ] Boot: reads as a pixel-steampunk works (terraces, brass/soot palette, crisp pixels at zoom).
- [ ] Build a **pit saw**, feed logs (Q), collect planks (E) / auto-bank with adjacent stockpile;
      deliver 8 → letter 1 completes. Hand-saw `C` no longer exists.
- [ ] Place a sawmill **out of** waterwheel reach → shows a **no-power** badge + no shaft; move a
      waterwheel into range → shaft connects, badge clears, it runs.
- [ ] Walk to a tree → "E — fell" prompt; carry logs near a flume head → "Q — tip logs" prompt +
      the flume head highlighted as a valid target.
- [ ] Click the furnace → info panel shows ore/charcoal/iron counts, heat, and `cold`/`running`.
- [ ] Edge case: starve the furnace → badge flips to `cold`; starve a sawmill of logs → `needs input`.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `verify-scene.mjs` passes + fresh screenshots.

## Out of scope (deferred)

- Full plate parity (every flourish), sound/juice, animation polish beyond ambient.
- Barrels/cooperage, rail, steam engine, the demand-pull town, aqueducts (later roadmap arcs).
- Tutorial/quest system beyond the first-run nudge.

---

<!-- filled in during/after -->
## What actually happened

Shipped all three parts on one branch (owner chose the combined PR), in four commits:

1. **Pit saw + hand-saw removal** — new `pitsaw` (free, unpowered, slow, log→plank; ~4x slower than
   a sawmill), unlocked from start; deleted the on-head hand-saw `'saw'` action so there's one
   "logs go into a machine" model. Hotkeys renumbered (blacksmith→0). Letter 1 copy updated.
2. **Guidance layer** — new pure `status.ts` (`buildingStatus`, `promptFor`, `isDropTargetKind`)
   driving a render pass: brass driveshaft (waterwheel→powered sawmill), per-machine status badges
   (no-power / needs-input / output-full / cold), a floating action prompt above the player, green
   delivery chevrons on valid targets while carrying, a selection ring, and a click-to-inspect DOM
   info panel (label, blurb, status, I/O, furnace heat).
3. **Visual pass** — Plate II soot/brass/iron/copper palette; `antialias:false` for hard edges;
   terrace dither; furnace re-drawn as a tapered riveted stack with brass hoop-bands + tap-hole glow
   driven by real `heat` (dark + blue cold-marker when out); waterwheel as a turning vertical wheel.

lint/type-check clean; **17 Vitest green** (+3 pit saw / status / prompt cases); `verify-scene.mjs`
passes and the demo screenshot shows the whole guidance layer + restyle live.

## Deferred to next session

- **True low-res pixel-upscale** (the literal Plate II crispness) — deferred to avoid the
  picking/text coordinate rabbit hole mid-PR. Do as a focused follow-up: render the world to a
  low-res buffer / nearest textures + integer zoom, keep HUD/overlay at native res.
- Flume re-draw as a sloped flowing trough (still the old diamond); sawmill mill-house, clamp mound,
  blacksmith lit-window, stockpile, player — the rest of the building glow-up.
- Bigger/clearer status badges at default zoom; sound/juice.

## Files created / modified

sim: `types.ts` `constants.ts` `buildings.ts` `machines.ts` `movers.ts` `progression.ts` `store.ts`
`status.ts`(new) `sim.test.ts` · render: `palette.ts` `scene.ts` · ui: `view.ts` `input.ts` `hud.ts`
`style.css` · `scripts/verify-scene.mjs` · this plan.

## Status
- [x] Complete (parts A/B/C landed; pixel-upscale + remaining building art deferred)
