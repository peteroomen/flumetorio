# Flumeworks (working title) — Game Design Document

Status: living document. Scope-of-truth for *what the game is*. How we build it lives in
`docs/ROADMAP.md`.

---

## 1. Pitch

**Factorio's brain, Railroad Tycoon's heart, Frostpunk's soul (minus the cold).**

An automation-first game — belts-and-machines DNA, growing factory, throughput puzzles — wearing a
Victorian / soft-steampunk skin. You hold a Company concession over a terraced valley. Logs ride
water flumes downhill, ore carts ride self-acting gravity inclines, a waterwheel spins your first
line shaft, and the blast furnace eats in charges and **must never go cold**. Later: narrow-gauge
trams, mainline rail, canals with locks, sailing ships to new regions, aerial ropeways, hydraulic
mains, pneumatic tubes.

**The market gap:** the automation genre clusters into sci-fi (Factorio, Satisfactory, DSP,
Techtonica), abstract (shapez), and cozy-fantasy (Factory Town). The adjacent games with the right
*theme* are the wrong *genre* (Anno 1800, Frostpunk, Sweet Transit, Voxel Tycoon — city/transport
builders), and vice versa. Nobody has shipped batch-era logistics as the automation core loop.

---

## 2. Setting & tone

- **Register:** Victorian industrial, soft-steampunk. Soot, drizzle, gaslight, smog — Frostpunk's
  palette and gravity without the frost or the survival misery.
- **Frame:** the distant **Company**. You are a concession-holder; the Company writes letters,
  sends drawings (blueprints), and raises its asks. Corporate-period voice: charters, tallies,
  ledgers, "works", "undertakings".
- **Loneliness:** no NPCs, no dialogue, no portraits. The world is quiet the way Factorio is quiet.
  But life is *implied*: company towns accrete near your works (§10) — lit windows, chimney smoke,
  nobody to talk to.
- **Not historical:** steampunk licence is deliberate. When pure period logistics gets too austere,
  we cheat *in fiction* — pneumatic tubes, difference-engine control, hydraulic mains — always
  late-game, always earned, never bulk-scale.

---

## 3. Design pillars

1. **Batch-native automation.** Machines eat *charges*, not streams (real Victorian industry was
   batch: furnaces tap, coke ovens cycle). Transport delivers *rakes and hold-fulls*, not item
   streams. The core puzzle is **cadence** — sizing buffers and matching delivery rhythm to burn
   rate — i.e. timetabling, promoted from Factorio's late-game to the core loop.
2. **The terrain has a grain.** Height is discrete (integer terrace levels); water flows downhill;
   gravity is free energy in one direction only. Movers can't be spammed — every level-crossing
   (flume, incline, lock) is a deliberate piece of infrastructure. The map wants to flow toward
   the sea.
3. **Every mover is earned.** There is no free go-anywhere belt. Continuous flow exists only in
   thematically-earned forms (chutes, flumes, ropeways, late-game tubes), each with a real
   constraint. Everything else is batch.
4. **Every relief creates the next hunger.** No unlock is pure quality-of-life: each one either
   adds a mouth to feed (coal, water, barrels) or makes a new inefficiency visible (sorting,
   empties-return, cadence mismatch). See §11 — desire chains are designed, not emergent luck.
5. **Legibility / watchability.** Batch systems risk feeling like waiting; the antidote is that
   everything *shows*. Wagons tip, hoppers pour, flumes splash, shunters sort rakes. Watching the
   machine run is a first-class reward.
6. **Pressure without enemies.** No combat, ever. The antagonist is entropy and gradient: furnaces
   going cold, mines flooding, cadence starving. (Owner and most logistics-brains turn Factorio's
   biters off; we design for that player.)

---

## 4. The mover hierarchy

The "belt tier list". Ordered roughly by unlock; MVP-scope movers marked ★.

| Mover | Mode | Constraint / cost | Notes |
| --- | --- | --- | --- |
| ★ Chutes & hoppers | continuous | downhill only, last-metre | gravity is free; verticality is a resource |
| ★ Hand barrow | batch | the player's own body | the first twenty minutes; the baseline resentment |
| ★ **Flume** | continuous | downhill grade + **water fed at the head** | the setting's belt; carries floaters (logs; barreled goods later). The MVP centrepiece |
| River (log drive) | continuous | route is wherever the river goes; extract only at booms; jams | the *free, uncontrolled* tier below flumes. Post-MVP so it doesn't upstage them |
| ★ **Self-acting gravity incline** | batch | needs grain cooperation + loaded-down ≥ empties-up balance | free forever where geometry allows (Denniston-style) |
| Horse tramway | batch | cheap, slow, no fuel chain | the pre-steam workhorse |
| Rope haulage | batch | stationary engine: **eats coal + water**, any grade | the first uphill-load solution; steam's debut |
| Narrow-gauge steam tram | batch | small carts, short haul | "smaller rails with little carts" |
| Mainline rail | batch | big rakes, long haul; water towers + coaling stages en route | the backbone; yards, signals, gradients at scale |
| Aerial ropeway | quasi-continuous | powered, straight-line pylons, low throughput, any terrain incl. uphill | the closest thing to a true belt; earned mid-late |
| Canal + **locks** | batch | slow, colossal capacity; locks are engineered chokepoints | bulk inland tier |
| Sailing ship | batch | inter-region; harbors; wind/weather later | the outer scaling ring (§9) |
| Pneumatic tube | continuous | small high-value goods only, late-game, steampunk licence | the "logistics bots" analogue |

**Drive-type ladder for tramways** (each rung removes a constraint, adds an obligation):
player-push → horse → self-acting gravity incline → rope haulage (coal+water) → locomotive.

---

## 5. Power

No electricity — ever, ideally. The ladder:

1. **Waterwheel + line shaft** ★ — one wheel turns one shaft; machines must sit within
   **shaft reach** of it (the power-radius rule, taught physically). Placement is river-bound:
   power geography is map geography.
2. **Beam engine + line shaft** — steam frees you from the river; costs coal + water forever.
   Historical anchor kept intact: *the first steam engine exists to pump water out of your
   flooding mine* (Newcomen). Tech-tree poetry, and it makes coal demand arrive with a story.
3. **Hydraulic mains** — citywide pressurized power network (real: London Hydraulic Power Co.).
   The mid-late "power grid".
4. **Compressed air / pneumatic** — late, paired with tubes.

Windmills as a sibling of waterwheels (pumping, milling) — quietly seeds the sail motif.

**Coal + water are the energy economy AND the transport fuel** — every engine on the map is a
mouth to feed, and the network that feeds the mouths is itself made of things with mouths. This
recursion is the game's power-grid pressure.

---

## 6. Batch-native machines & cadence

- Machines take **charges** (a hopper-full, a cartload) and run **cycles**; between deliveries
  they draw down bunkers. Player puzzle: buffer sizing × delivery cadence × burn rate.
- **The furnace rule:** a furnace that goes cold is expensive to relight (true to life — real
  blast furnaces ran for decades because restarts were ruinous). This is our "power died"
  anxiety: *don't let the fire starve between trains.*
- Failure states are visible and gradual: bunker gauge dropping, steam pressure sagging, the
  furnace glow dimming — never a popup first.
- **Cadence instrumentation is first-class UI** (the OpenTTD timetable joy): per-consumer burn
  rate vs delivery rhythm, starvation forecasts, yard occupancy.

---

## 7. Economy & crafting

- **Handcrafting:** Factorio-style hand-craft queue from the start (owner call). Automated
  crafting (workshops/manufactories) arrives as its own unlock arc — long-term everything
  handcraftable becomes automatable.
- **MVP economy is five goods:** logs → planks, charcoal (from wood — pre-coal fuel), ore, iron.
  Every MVP mover is gravity-or-water powered; steam arrives *after* the fun is proven, as the
  answer to the first problem gravity can't solve.
- **Barrels are the container layer** (post-MVP): flumes float wood because wood floats; iron
  sinks (protects rail's role). The **cooperage** generalizes flumes — anything barreled floats.
  Costs: a packaging step, hoops + staves, and an empties-return loop uphill. Barreled cargo also
  loads ships/barges faster later. (Factorio's barreling reborn as theme.)
- **Sorting is earned, not free:** the flume tail with mixed barreled cargo forces the
  **tally shed** — diversion by stencilled brand. That's our splitter/filter, arriving as the
  solution to a mess the player created by winning.
- Forestry is a farm: replanting cycles, coppicing — wood and iron must be farmable big time.
- Mines deplete near-surface and drive deeper → deeper needs pumping → pumping needs engines
  (§5.2). Depth is the ore-patch-richness analogue.

---

## 8. Progression

- **MVP: Company letters.** Deliver X goods → the Company sends drawings (blueprint unlock). No
  science packs. 4–5 unlocks total in the MVP; linear is fine at that length.
- **Known weakness (owner-flagged, agreed): deliver-for-blueprint lacks branching long-term.**
  Parked candidate fix: **multiple concurrent contracts, fulfil-to-choose** — the Company (or
  rival concerns) offers several standing requests; which one you tool up to satisfy *is* the
  branch. Possibly blended with an in-house drawing office (self-directed research) later.
  Open question §13 — not a commitment.
- Steam, rail, ships, towns each arrive as the *answer to a felt bottleneck*, never as a menu
  item that got cheap enough (§11).

---

## 9. World structure

- **Terraced maps:** integer height levels, cliff edges between plateaus, 3 levels in MVP.
  Rendering + projection contract in ADR 002.
- **Rivers** fall through the terraces in steps — they are power sites (wheels), flume feeders,
  log-drive routes (post-MVP), and eventually canal spines.
- **Scaling arc:** Factorio scales by ratio math + copy-paste; we scale by **network stress** —
  the single track saturates → double it; the siding becomes a marshalling yard; heavy rakes
  stall on gradients → banking engines or a cutting. Outgrowing your own infrastructure is the
  content, not a failure state.
- **The outer ring is the sea:** when the home valley saturates, ships open new regions with
  different resources (Space Age's planet structure, nautical). Harbors + locks are the
  interchange layer. Trade winds may give sea routes their own grain (open question).

---

## 10. Company towns

Owner-approved direction: no town *management*, towns as **consequence and reward**. Terraced
rows accrete near a big works; gaslights come on at dusk; a chapel, a pub. They are demand sinks
and a visual pulse of progress — never conversations. First appearance is scripted into the MVP's
closing beat: one worker's cottage, one lit window, when the first iron is tapped.

---

## 11. Desire chains (the bottleneck engine)

Factorio's compulsion loop: every unlock shifts the bottleneck or instantly creates a new want
(inserters need coal → then electricity → then they're too slow…). We design these chains
explicitly. **Rule: no unlock is pure relief — each either adds a mouth to feed or makes a new
inefficiency visible.**

The flagship chain (post-MVP, from one "QoL" unlock):

> Flumes carry only logs → **cooperage** unlocks barreled general cargo → flume tail now spits
> *mixed* barrels into one pond → **tally shed** (sorting by brand) → barrels are costly, so
> empties must return **uphill** → return traffic loads the incline's up-side → breaks the
> loaded-down ≥ empties-up balance → **rope haulage** → which eats coal → **coal logistics**.

Six hungers from one unlock. The MVP contains a miniature: sawmill removes sawing → makes
carrying the felt bottleneck → flume removes carrying → makes felling throughput and furnace
cadence the bottleneck. Every future system proposal should name its chain before it lands.

---

## 12. The first twenty minutes (beat script)

Onboarding grammar: **pain, then relief you built yourself** — every automation replaces a chore
the player personally resents; resentments are scheduled in ranked order.

- **0:00 — Arrival.** Terraced valley, forest up top, river falling in steps, drizzle. You have a
  cart, an axe, a barrow. A Company letter grants the concession: deliver iron.
- **0:30–4:00 — Hands.** Fell trees on the high terrace; barrow logs *downhill* (walk slightly
  too long, on purpose); pit-saw planks by hand. Felt ranking: chopping fine, sawing tedious,
  **carrying worst**.
- **4:00–8:00 — The wheel turns.** Waterwheel + line shaft + sawmill (shaft-reach taught
  physically). First automation: the saw's tempo becomes the base's soundtrack. You now do
  nothing but carry — the game has maneuvered you into hating exactly one thing.
- **8:00–13:00 — The flume.** Company drawings arrive. Survey trestles down the hillside; the
  teaching constraint: it won't run dry — cut a **feeder channel** to the flume head. Open the
  head-gate, tip the first log, it *rides* — splash into the mill pond, the sawmill takes it
  untouched. **The first-inserter moment. Best sound in the game.**
- **13:00–16:00 — The grain deepens.** Expand felling; trees west of the ridge can't reach the
  flume head — terrain says no; a second line needs its own water. The player is reasoning about
  verticality unprompted. The Company asks for iron; barrowing ore is a fresh, worse resentment.
- **16:00–20:00 — The incline and the fire.** **Charcoal clamp** (offcuts → fuel; no coal, no
  mines in MVP — the fuel economy rides the wood loop already automated). **Self-acting incline**
  from the ore terrace: loaded carts down haul empties up — free forever, but you earned the
  geometry. Minute 19: charge the furnace — ore + charcoal in batches — and light it. Last line
  of the letter, and the game's thesis, as UI: *“A furnace, once lit, must not go cold.”*
- **20:00–40:00 — The sustain loop.** Keep the fire fed off a flume, an incline, and a clamp.
  **This loop being compulsive is the entire hypothesis under test.**
- **Closing tease:** first iron tapped → one worker's cottage appears down-valley, lit window,
  chimney smoke. Nobody to talk to. The town has begun.

---

## 13. MVP definition

**In:** terraced map (3 levels) · trees + felling + replant · barrow-carry · pit saw · waterwheel
+ line-shaft reach · sawmill · **flume** (trestles + feeder channel + head-gate) · charcoal clamp
· ore outcrop · self-acting incline with carts · batch furnace with going-cold penalty ·
chutes/hoppers · Factorio-style handcrafting · Company-letter progression (4–5 unlocks) · one
cottage spawn · debug overlay + screenshot harness (ADR 002).

**Out (ruthlessly):** rail + locomotives · rope haulage · horses · coal/mines/pumping · ships,
canals, locks · ropeways · pneumatic tubes · barrels/cooperage/tally shed · river log-driving ·
automated crafting · real town simulation · weather · research trees · enemies (forever).

**Success criterion:** minutes 20–40 — the sustain loop — is fun. If keeping one furnace fed off
a flume, an incline, and a charcoal clamp compels for 30 minutes, the whole game works.

---

## 14. Open questions

- **Progression branching** — contracts-as-choice? drawing office? hybrid? (§8)
- **Trade winds** — do sea routes get their own grain (fast/slow directions)? (§9)
- **Log jams** — river drives with jam events: fun failure or annoyance? (post-MVP)
- **How hard is "must not go cold"?** — relight cost tuning; does the MVP furnace bank down
  gracefully or die?
- **Name.** Flumeworks is a working title.
- **People on screen at all?** Towns are ambient; do works have visible (non-interactive) crews,
  or is machinery self-acting? Leans empty; revisit after MVP art pass.
