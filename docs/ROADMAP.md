# Flumeworks — Roadmap

The GDD (`docs/design/GDD.md`) describes the game; this describes **how we build it**. Scoped hard
to the MVP first — the MVP exists to answer one question:

> **Is the batch-cadence sustain loop (minutes 20–40: keep one furnace fed off a flume, an
> incline, and a charcoal clamp) fun?**

Everything not needed to answer that question is deferred. See GDD §13 for the full in/out list.

## Build principles

- **One slice = one plan file = one branch = one PR.** Small, reviewable, verified.
- **Fun-gate over feature-gate:** milestones end with a playable check, not just green tests.
- **Sim purity:** the simulation core is engine-agnostic TypeScript with zero renderer/DOM
  imports, fully exercisable under Vitest. This is also our engine-portability insurance
  (ADR 001).
- **Instrument-verified graphics:** every visual milestone lands with debug-overlay screenshot
  verification (ADR 002) — AI-checkable by reading annotations, not judging pixels.
- **Programmer art until the contract freezes.** Flat colored diamonds are fine; the tile
  contract (grid, anchors, autotile rules) is what M0 locks, not the artwork.

---

## M0 — Foundation & iso spike

Prove the render + verify pipeline before any game exists.

- Scaffold: Vite + TypeScript (strict) + PixiJS + Zustand + Tailwind + Vitest + Playwright (ADR 001).
- Iso terrace renderer spike: 2:1 dimetric grid, 3 integer height levels, cliff edges, camera
  pan/zoom (ADR 002). Programmer-art tiles.
- **Tile contract doc**: grid size, sprite anchor/origin convention, height offsets, draw order.
- Debug overlay: grid coords, height numbers, entity labels rendered as text.
- Screenshot harness: Playwright script drives a fixed-seed scene → captures annotated
  screenshots to `docs/work/assets/`.
- Pure sim skeleton: fixed-timestep loop, seeded RNG, save/load stub, first Vitest suite.

**Exit:** a terraced valley renders; a Playwright run proves it with annotated captures; the sim
ticks deterministically in tests.

## M1 — The manual valley

The player's body, and the scheduled resentments (GDD §12, beats 0:00–4:00).

- Hand-authored (or minimally generated) 3-terrace valley map with river-in-steps, forest, ore
  outcrop, works site.
- Player avatar: move, fell trees, pick up / barrow-carry (weight-slowed), dump to stockpiles.
- Pit saw (manual craft interaction) → planks. Handcraft queue (Factorio-style).
- Chutes/hoppers (last-metre gravity).
- Stockpiles + carried-goods UI.

**Exit:** the 0:00–4:00 beats play as scripted; carrying is measurably the worst chore
(deliberately). Playtest note filed.

## M2 — First automation: the wheel

GDD §12 beats 4:00–8:00.

- Waterwheel: river-adjacent placement rule.
- Line shaft: shaft-reach radius, visualized; machines must connect within reach.
- Sawmill: hopper in (log charges), planks out; cycle timing; running/starved states visible.
- Sound pass #1: the saw tempo.

**Exit:** logs in hopper → planks out with the player elsewhere; starvation is visible at a
glance; "you now do nothing but carry" is the felt state.

## M3 — The flume

The centrepiece. GDD §12 beats 8:00–13:00.

- Flume pieces: trestle segments, head-gate, feeder channel (must connect river → head; dry
  flumes don't run).
- Downhill-grade validation across terrace levels; terrain-grain routing constraints.
- Log-riding: logs travel the flume, splash into the mill pond, feed the sawmill hopper.
- The first-log moment: sound + splash polish budget spent HERE.
- Second-flume tension: at least one forest area that *cannot* reach the first flume head.

**Exit:** chop on the top terrace, planks appear at the bottom, hands never touch a log. The
splash feels like Factorio's first inserter. Screenshot + capture verified.

## M4 — Ore, incline, charcoal, fire

GDD §12 beats 13:00–20:00.

- Charcoal clamp: wood → charcoal cycles.
- Self-acting gravity incline: build across a cliff edge; loaded-down/empties-up balance rule;
  ore carts.
- Batch furnace: charge model (ore + charcoal), heat cycle, bunker draw-down, **going-cold
  penalty** (expensive relight), glow/state legibility.
- Iron out; Company delivery target.

**Exit:** the furnace can be lit, fed, starved, and killed; each state is readable without UI
popups first.

## M5 — The loop, the letters, the cottage — MVP complete

GDD §12 beats 20:00–40:00 + framing.

- Company letters: concession intro, 4–5 deliver-X-for-drawings unlocks pacing M1→M4 content.
- Cadence instrumentation v1: burn rate vs delivery rhythm per consumer; starvation forecast.
- Forestry replant cycle (wood must be farmable).
- Closing beat — **the first town valve** (GDD §8/§10): the delivery target *is* the blacksmith's
  demand ("The blacksmith has opened. It wants iron."); supplying it lights the forge and spawns
  the cottage. One establishment, demand + visible yield, **no town internals** — plants the
  demand-pull spine as the hook to post-MVP.
- Balance pass on the 40-minute arc; full playthrough recorded.
- **The fun gate:** structured playtest of minutes 20–40. Written verdict in `docs/work/`.

**Exit:** a stranger can play 40 minutes unprompted. We answer the MVP question honestly.

---

## Post-MVP checkpoints & parking lot

**Engine checkpoint (immediately after M5):** re-evaluate web vs Godot with real data — perf
headroom, port-cost estimate against the pure sim, distribution goals (Steam). ADR required
either way (ADR 001 commits us to this checkpoint).

**Parking lot** (each future slice must name its desire chain, GDD §11):

- **Iso-dimetric renderer + visual-state language (art direction LOCKED 2026-07-20).** Rebuild
  buildings in true 2:1 dimetric (Settlers II/III north-star; see the published art-direction plate),
  composing from a reusable component kit (chimney / cog / drive-shaft / rope-bucket hoist / braced
  trestle / lit window) rendered onto the iso face planes; chunky block earth; clean water. **Bake
  in machine-state animation** — furnace glows+smokes *while smelting*, saw blade cuts, waterwheel/
  shaft spin only when powered+working, clamp smokes, incline cart runs — so state reads from the
  machine, not a caption. **Dial the floating text right down** (keep at most a first-run nudge).
- **Flume expansion (the fun core — owner: "immense fun", build on it).** Junctions / splitters
  (branching), sluice-gate control (gating), drawing water/logs directly from **rivers**, longer
  runs on the braced-trestle kit. Its own juicy slice once the visual work settles.
- **The demand-pull town (the primary post-MVP arc, GDD §8/§10)** — multi-establishment growth,
  concurrent demands as branching, the symbiotic tool-feedback loop (needs the progression model),
  town-as-blueprint-source. This is the spine everything else hangs demands off.
- Water as a scarce resource → reservoirs, leats, **aqueducts** (the marquee build), pumps — the
  chains that converge on steam (GDD §11)
- Rope haulage + steam debut (the first uphill-load wall) → coal, mines, pumping engines
- Horse tramways · narrow-gauge steam · mainline rail (yards, signals, gradients)
- Barrels/cooperage → tally-shed sorting → empties-return loop (the flagship chain)
- River log-drives + jams · canals + locks · harbors + sailing ships + regions
- Aerial ropeways · hydraulic mains · pneumatic tubes (item movement)
- Automated crafting (workshops/manufactories) · **town auto-build/haul service** (the "bots"
  analogue — a supplied Works office, not a drone swarm)
- Weather, trade winds · art pass against the frozen tile contract · **name the game** (retire
  `flumetorio`)
