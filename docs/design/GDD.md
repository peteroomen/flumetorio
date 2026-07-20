# Flumeworks (working title) — Game Design Document

Status: living document. Scope-of-truth for *what the game is*. How we build it lives in
`docs/ROADMAP.md`.

---

## 1. Pitch

**Settlers III's warmth and Factorio's engine, in a steampunk age-of-sail world where everything
flows downhill to the sea.**

An automation-first game — belts-and-machines DNA, growing factory, throughput puzzles — wearing a
Victorian / soft-steampunk skin. You hold a Company concession over a terraced valley. Logs ride
water flumes downhill, ore carts ride self-acting gravity inclines, a waterwheel spins your first
line shaft, and the blast furnace eats in charges and **must never go cold**. Later: narrow-gauge
trams, mainline rail, canals with locks, aqueducts striding over rivers, sailing ships to new
regions, aerial ropeways, hydraulic mains, pneumatic tubes.

**Four layers, one spine.** The identity reads as four references, each owning a layer:
**Settlers III** the *surface* (warm, characterful iso — a little economy you love to watch
breathe); **Factorio** the *engine* (automation, throughput, infinite scaling, the compulsion
loop); **steampunk** the *skin* (brass, iron, soot, steam, cogs — and the fiction that lets us
cheat); **age of sail** the *horizon* (expansion by water to the sea and new regions — the
frontier and the romance). What ties all four together is **water and elevation**: the river you
flume logs down early is the same water that becomes canals, locks, and the sea you finally sail —
rivers → flumes → aqueducts → canals+locks → harbours → sail, one continuous downhill spine. Guard
against the sail thread feeling bolted on: from the first map, the river always runs *toward a sea
edge you can't yet reach*, so ships arrive as a promise kept.

**Elevation is the organizing principle** (§3.2, §9). Height is what makes flumes work and what
makes "everything flows to the sea" literal — and it makes the self-acting incline a **two-way
economy**: a loaded cart rolling *down* is what drags fuel and finished goods *up* the same rope.
Raw materials descend for free; the machine sits partway up, fed by ore falling to it and fuel
hauled up on the descent's back. The terrain's grain is the puzzle.

**What are you feeding?** Not a rocket — a **town**. Half your world you design (the factory); half
grows around it (the town you supply but never manage). It asks for goods, grows when you deliver,
and asks for more — a living, escalating demand that pulls your whole supply web into being.

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

### Art direction

- **Flat, minimalist, geometric** — the shapez lineage, rendered in 2:1 dimetric iso (ADR 002).
  Clean flat-shaded shapes over textured realism: it reads instantly at automation scale, keeps
  cargo/mover states legible, ages well, and — not incidentally — makes the machine *watchable*
  (pillar §3.5) without fighting visual noise.
- This also aligns with the build plan: programmer art (flat colored diamonds, labeled shapes) is
  the *starting* aesthetic in M0, not just a placeholder — the finished look is a refinement of it,
  not a replacement. Low art risk, coherent from day one.
- Palette carries the tone (soot, drizzle, gaslight, smog); geometry carries the readability. Warm
  emissive accents (furnace glow, lit windows) punctuate a cool muted field.

---

## 3. Design pillars

1. **Batch-native automation.** Machines eat *charges*, not streams (real Victorian industry was
   batch: furnaces tap, coke ovens cycle). Transport delivers *rakes and hold-fulls*, not item
   streams. The core puzzle is **cadence** — sizing buffers and matching delivery rhythm to burn
   rate — i.e. timetabling, promoted from Factorio's late-game to the core loop.
2. **The terrain has a grain — and elevation is the spine.** Height is discrete (integer terrace
   levels); water flows downhill; gravity is free energy in one direction only. Movers can't be
   spammed — every level-crossing (flume, incline, lock) is a deliberate piece of infrastructure.
   The map wants to flow toward the sea. The keystone move: the **self-acting incline is a two-way
   economy** — a loaded cart descending *hauls the empty (or fuel-laden) cart up* the same rope, so
   the down-traffic pays for the up-traffic. Raw materials fall to the machine for free; fuel and
   finished goods climb on the descent's back. Placing a works partway up a slope — ore falling in
   from above, fuel dragged up from below — is a real puzzle the height creates.
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
7. **Demand-pull, not supply-push.** Factorio hands you a fixed goal (the rocket) and you push
   toward it. Here the world *asks* — the growing town emits living demands you scramble to supply,
   and satisfying them reshapes the world (§8, §10). What you're feeding is a place that grows back
   and needs more, not a distant one-shot. This is the game's answer to "what's the point," and its
   pacing engine.

---

## 4. The mover hierarchy

The "belt tier list". Ordered roughly by unlock; MVP-scope movers marked ★.

| Mover | Mode | Constraint / cost | Notes |
| --- | --- | --- | --- |
| ★ Chutes & hoppers | continuous | downhill only, last-metre | gravity is free; verticality is a resource |
| ★ Hand barrow | batch | the player's own body | the first twenty minutes; the baseline resentment |
| ★ **Flume** | continuous | downhill grade + **water fed at the head** | the setting's belt; carries floaters (logs; barreled goods later). The MVP centrepiece |
| River (log drive) | continuous | route is wherever the river goes; extract only at booms; jams | the *free, uncontrolled* tier below flumes. Post-MVP so it doesn't upstage them |
| ★ **Self-acting gravity incline** | batch | needs grain cooperation + loaded-down ≥ up-load balance | free forever where geometry allows (Denniston-style); the descent hauls **fuel/goods up** on the return rope — a two-way economy (§3.2) |
| Horse tramway | batch | cheap, slow, no fuel chain | the pre-steam workhorse |
| Rope haulage | batch | stationary engine: **eats coal + water**, any grade | the first uphill-load solution; steam's debut |
| Narrow-gauge steam tram | batch | small carts, short haul | "smaller rails with little carts" |
| Mainline rail | batch | big rakes, long haul; water towers + coaling stages en route | the backbone; yards, signals, gradients at scale |
| Aerial ropeway | quasi-continuous | powered, straight-line pylons, low throughput, any terrain incl. uphill | the closest thing to a true belt; earned mid-late |
| Canal + **locks** | batch | slow, colossal capacity; locks are engineered chokepoints | bulk inland tier |
| **Aqueduct** | carries flume/canal | a water route (flume or navigable canal) held aloft across a valley/river on piers | the tentpole build — see below; flumes are its small kin |
| Sailing ship | batch | inter-region; harbors; wind/weather later | the outer scaling ring (§9) |
| Pneumatic tube | continuous | small high-value goods only, late-game, steampunk licence | the "logistics bots" analogue (item movement) |

**Aqueducts** are the water network's tentpole. A flume is already a tiny aqueduct — a trough on
trestles holding a grade. Scale that up and it becomes the marquee build: a masonry aqueduct
carrying a **flume line** (or, late, a **navigable canal**, boats and all — Pontcysyllte-style)
*over* a river or valley the terrain grain would otherwise forbid. It's how you defeat a grain you
can't route around: expensive, spectacular, and it lets water — the scarce routing resource (§5) —
cross the map. The owner wants to build one over a river; the game should make that a memorable
milestone, not a footnote.

**Drive-type ladder for tramways** (each rung removes a constraint, adds an obligation):
player-push → horse → self-acting gravity incline → rope haulage (coal+water) → locomotive.

---

## 5. Power

**The governing rule — nature's grain is free; defying it costs power.** Power is a *throughput
multiplier and a way to defy the grain*, never a prerequisite for a machine to function. Two tiers,
one principle:

- **Primitive tier — free, but slow.** Anything running on hand-work, gravity, or a natural
  process works the moment it's fed and needs no power: the **pit saw** (hand-fed logs → planks),
  the charcoal clamp, a downhill flume, a gravity incline, a hand-dug leat/sluice. Cost = it's slow
  and doesn't scale.
- **Powered tier — fast, or against the grain.** The same job at big throughput, or a thing nature
  forbids (lifting water *uphill*, hauling loads *up* an incline) — in exchange for a line-shaft /
  steam hookup: the sawmill vs the pit saw; the steam pump vs the sluice; rope haulage vs the
  self-acting incline. Power arrives as the answer to a throughput bottleneck (a desire chain, §11),
  never as a gate on whether a thing works.

So: **downhill/hand/natural = free-but-slow; faster-or-uphill = powered.** That one line decides
whether any future building needs power. (Balance caveat: the free-slow tier must stay slow and
small-footprint enough that one powered machine beats a yard of free ones — a tuning number, not a
mechanic, since we don't model workers to make hand-work block the player as Factorio does.)

No electricity — ever, ideally. The powered ladder:

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

### Water as a routed resource

Water is medium, reagent, and coolant at once: it drives wheels, floats flumes, and *becomes*
steam. Early it's free (tap the river). At scale it's the game's most elegant constraint — see the
water desire chain in §11 — and its infrastructure is a whole logistics layer parallel to goods:

- **Leats / channels** route water along a grade (the flume feeder generalized).
- **Reservoirs** buffer it — you size a reservoir against draw the same way you size a bunker
  against burn (cadence applies to water itself).
- **Aqueducts** (§4) carry it across terrain the grain forbids.
- **Pumps** lift or recycle it — and pumps need power, which pushes you toward steam, which needs
  water. The loop closes on purpose.

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

**The spine is demand-pull via the town (§10, pillar §3.7).** As the town grows it opens
establishments, each of which *demands* goods and *yields* capability when supplied. Progression is
the loop: supply a demand → the town grows / yields a blueprint / yields a good you now need → new
establishments open with new demands. The tech tree is pulled into being by what the town asks for,
not pushed by a fixed research menu.

- **Branching falls out for free (resolves the old §8 weakness).** A growing town emits *multiple
  concurrent demands* you can't all serve at once — *which you tool up for first is the branch*:
  the blacksmith (→ tools → faster extraction, an efficiency path) vs the gasworks (→ the town
  grows faster, an expansion path) vs the railway office (→ rail unlocked early, a logistics path).
  Emergent build-order branching from a living demand set — the "multiple contracts, fulfil-to-
  choose" idea, embodied in a *place* instead of a menu.
- **Two-tier sinks (near + far).** The *town* is the near sink: living, local, symbiotic. The
  *Company / export market* is the far sink: ship surplus away by rail and sea for money and
  prestige — the abstract, infinitely-scaling "rocket" for when the town is momentarily sated, and
  the pull that carries you out to new regions (§9). The factory always has somewhere to push
  output, at both the intimate and epic scale.
- **MVP progression** is a thin slice of this: the Company grants the concession, and the target is
  the town's *first* establishment demand — **"The blacksmith has opened. It wants iron."** Same
  simple deliver-N mechanic as a letter, but it plants the whole spine (§12–13). 4–5 unlocks total.
- Steam, rail, ships each still arrive as the *answer to a felt bottleneck*, never as a menu item
  that got cheap enough (§11).

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
- **Elevation is the spine (§1, §3.2).** Every map is read top-to-sea: high ground (forest, ore)
  drains down through terraces to a **sea edge**. The river always runs *toward that sea edge, even
  before you can reach it* — so the age-of-sail horizon is seeded from minute one and ships later
  feel like a promise kept, not a genre-swap. The water spine: rivers → flumes → aqueducts →
  canals+locks → harbours → sail.
- **The outer ring is the sea:** when the home valley saturates, ships open new regions with
  different resources (Space Age's planet structure, nautical). Harbors + locks are the
  interchange layer. Trade winds may give sea routes their own grain (open question).

---

## 10. Company towns — the demand-pull engine

The town is **the sink, the pacing engine, and the emotional core** (pillar §3.7) — not decoration.
Half your world is *designed* (the factory you lay out) and half *grows* around it (the town you
supply but never place). It gives Frostpunk's warmth — a settlement you keep alive and watch bloom
— without the survival misery: a starved town doesn't die (no fail states, §3.6), it just waits,
quietly, for you to connect the supply line. The pressure is **desire**, not survival.

**Establishments are demand valves.** Each town building is a black box with an ongoing **demand**
(goods it wants, delivered to its receiving dock) and a **yield** when supplied:

- **Population growth** → the next establishment opens → new demands. The town escalates itself.
- **A good you re-consume (symbiotic — owner-confirmed).** The blacksmith eats iron + coal and
  yields **tools**; tools make miners/lumberjacks faster or are *required* to build higher machines.
  The town becomes a **node in your production graph** — you feed it raw, it feeds you refined, you
  feed it more. Introduce this *gradually*: the earliest establishments are pure sinks that just
  grow the town; the tools-feed-back-in loop arrives a tier or two later. Balance via the
  progression model (as in prior projects).
- **Blueprints / licences** — a drawing office, a guild: absorbs the deliver-for-blueprint mechanic
  into the town, organically.
- **Land / access** — satisfying the town grants new terraces, harbour rights (the gate to §9's
  sea and regions).

**Late-game automation lives in the town, too (owner idea).** The "logistics/construction bots"
analogue is not a swarm of drones — it's a late town establishment (a **Works / Building Office**)
that, once supplied, provides an **auto-build / auto-haul service** across your concession. Thematic,
on-brand (you don't get robots, you get a *municipal service*), and it keeps even endgame automation
routed through the town symbiosis. (Distinct from pneumatic tubes, which move *items*; this builds
and maintains *structures*.)

**The guardrail — this is what keeps it from becoming a city-builder.** You interact with the town
**only through logistics**: route, deliver, buffer. You never place a building, staff it, zone it,
or manage citizen happiness. The town is autonomous and opaque — it emits demands and grows or
waits. Any feature that has you micromanaging the town's *insides* is a different game and is out of
scope. This preserves the loneliness and the automation-first identity.

**MVP appearance:** the closing beat is the *first valve*, not decoration — the blacksmith opens,
issues the first demand (iron), and the cottage/works lights up when supplied (§12–13).

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

**Three design principles for chains:**

1. **Rhythm, not constant grind — relief, relief, HUNGER.** If every unlock spawns a new problem
   the player never exhales. Most unlocks are breathing room (bigger/faster/cheaper); the chains
   are the occasional spikes that upend a layer.
2. **Chains converge on tentpoles.** The best structure is *several* chains quietly pointing at the
   same big infrastructure beat, so it feels earned from every direction at once. **Steam is the
   canonical convergence:**
   - *Water chain* — flumes and wheels sip the river; build enough and the river visibly drops (a
     downstream wheel slows, a downstream flume runs dry). Water becomes contested and routed
     (reservoirs, leats, aqueducts); lifting/recycling it needs pumps → pumps need power beyond the
     shrinking river → **steam**.
   - *Fuel chain* — MVP fuel is charcoal from wood, but wood now feeds planks *and* charcoal *and*
     the town, and the forest is finite per replant. Contention drives you to a denser separate
     fuel → coal → mines → mines flood → pumping (→ water chain again) → **steam**.
   - *Power-radius chain* — the waterwheel's line shaft is short, cramping the factory against the
     river; you want to spread out → **steam** cuts the tether.
   Steam then consumes the very water you're short of *plus* the coal you just started mining — so
   it's not a checkbox, it's the answer to three simultaneous pressures. Rail and the sea are later
   convergence tentpoles.
3. **The bottleneck must be physical and visible** (legibility, §3.5): barrels piling at the flume
   tail, the river running low, the furnace glow dimming. You *see* the constraint before UI names
   it.

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
- **Closing beat — the first valve:** the Company letter's target *is* the town's first
  establishment. **"The blacksmith has opened. It wants iron."** Deliver the iron (same simple
  mechanic as any letter) → the smithy's forge lights, a cottage appears down-valley, lit window,
  chimney smoke. Nobody to talk to — but the town has begun, and the demand-pull spine (§8, §10) is
  revealed as the hook into the next session.

---

## 13. MVP definition

**In:** terraced map (3 levels) · trees + felling + replant · barrow-carry · pit saw · waterwheel
+ line-shaft reach · sawmill · **flume** (trestles + feeder channel + head-gate) · charcoal clamp
· ore outcrop · self-acting incline with carts · batch furnace with going-cold penalty ·
chutes/hoppers · Factorio-style handcrafting · Company-letter progression (4–5 unlocks) · **the
first town valve** (blacksmith opens → demands iron → lights up when supplied — one establishment,
demand + visible yield, no town internals) · debug overlay + screenshot harness (ADR 002).

**Out (ruthlessly):** rail + locomotives · rope haulage · horses · coal/mines/pumping · ships,
canals, locks · **aqueducts** · ropeways · pneumatic tubes · barrels/cooperage/tally shed · river
log-driving · automated crafting · **town auto-build service** · water-as-scarce-resource
(reservoirs/leats/pumps) · **multi-establishment town + symbiotic tool loop** · real town
simulation/management · weather · research trees · enemies (forever). *(The MVP ships exactly one
demand valve to plant the spine — the full demand-pull town, §8/§10, is the primary post-MVP arc.)*

**Success criterion:** minutes 20–40 — the sustain loop — is fun. If keeping one furnace fed off
a flume, an incline, and a charcoal clamp compels for 30 minutes, the whole game works.

---

## 14. Open questions

- ~~**Progression branching**~~ — *resolved:* demand-pull via the town's concurrent demands (§8).
- ~~**Symbiotic vs pure-sink town**~~ — *resolved:* symbiotic, introduced gradually (§10).
- **Town balance** — the symbiotic tool-feedback loop (town yields tools → faster extraction →
  more supply → faster town growth) is a positive feedback loop; needs the progression model to
  keep it from running away or stalling. (Owner: "we can always use modelling to balance it.")
- **Aqueduct scope** — navigable (boats cross a valley) vs water-supply-only (a flume/leat aloft)?
  Both are wanted; which lands first, and how big a build is the marquee one? (§4)
- **Auto-build service shape** — radius from the Works office? queue-based? what does it cost to
  run (a standing goods demand, keeping it in the symbiosis)? (§10)
- **Trade winds** — do sea routes get their own grain (fast/slow directions)? (§9)
- **Log jams** — river drives with jam events: fun failure or annoyance? (post-MVP)
- **How hard is "must not go cold"?** — relight cost tuning; does the MVP furnace bank down
  gracefully or die?
- **Name.** The repo is `flumetorio` (a deliberately tortured placeholder — "flume" + "-torio"
  from the genre's naming meme). It needs a real, less-derivative name before anything ships.
  Candidates should evoke the terrain-grain / batch-flow / Victorian-works identity without
  leaning on the Factorio suffix. "Flumeworks" is one earlier working title in the mix.
- **People on screen at all?** Towns are ambient; do works have visible (non-interactive) crews,
  or is machinery self-acting? Leans empty; revisit after MVP art pass.
