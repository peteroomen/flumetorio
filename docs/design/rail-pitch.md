# Pitch: the first rails

**Date:** 2026-07-25 · Status: **pitch only — nothing here is built or committed to.**
Rail is a post-MVP tentpole (`docs/ROADMAP.md`); the MVP scope in GDD §13 is a hard wall. This is a
proposal for what rail should *be* and *look like* when its arc comes up, written now so the
renderer work in flight doesn't paint us into a corner.

---

## The one-line pitch

**A horse-drawn plateway, not a train set.** The first rails are Victorian-correct pre-steam
industrial rail: iron edge-rails on stone blocks, a wagon that holds one lot, a horse that walks it
along the flat. It is gloriously incapable of climbing — and *that* is the point.

## Why it earns its place (GDD §11 — every unlock names its desire chain)

Rail must not be a pure-relief unlock. Its chain:

- **Relief.** Hauling lots across the works floor by barrow is the dullest labour in the game.
  A plateway makes flat haulage cheap and, crucially, *legible* — you can see the route.
- **Relief.** A wagon carries a whole lot, so the batch semantics get a mover that respects them
  (charges and lots, never per-item flow).
- **HUNGER.** A loaded wagon cannot climb a terrace. The moment rail works, the valley's grain —
  the thing the whole game is built on — becomes the bottleneck *you can now see a queue forming
  against*. Wagons stack up at the foot of a rise. The answer is rope-worked inclines (the gravity
  incline already exists, and now wants a powered sibling), and past that, **steam**.

That is the convergence the GDD asks for: rail doesn't solve the valley, it *indicts* it, and points
straight at the steam tentpole.

It also fits the town guardrail: rail is logistics. You route it, load it, and deliver with it. You
never manage what the town does with the goods.

## What exists already

The **gravity incline** is effectively rail-zero: it already draws sleepers, two iron rails, a
winding drum and a shuttling cart, and it already encodes "the terrain has a grain" by only working
across a downhill step. The plateway should read as *the same railway family* — same rail gauge,
same sleeper rhythm, same iron — so that when you later join an incline to a plateway it looks like
one system rather than two features.

## How it looks

Grounded in the tile contract (ADR 002 — 64 × 32 tiles, 22px per height level) and the material
vocabulary from the 2026-07-25 pass (iron = rail, timber = structure, brass = power transmission,
verdigris = permanently wet, brick = holds fire).

**The permanent way.** Per-tile pieces with connectivity derived from the route, exactly as the
flume does it today (`computeFlumeConns` is the pattern to copy — a piece knows its ins and outs and
draws the right trough, so a rail piece can draw the right rail run).

- **Ballast bed** — a shallow recess, the same trick water uses (`WATER_RECESS`), one or two pixels
  down with a lighter scree fill. This is what makes the route read as a *ribbon* at 1× zoom rather
  than dissolving into ground clutter, and it means the cart ruts and pebbles from the ground pass
  stop at its edge instead of running through it.
- **Sleepers** — timber, every ~0.25 tile, drawn as short `box()` slabs so they catch the same face
  shading as everything else. Each gets the thin end of the shadow contract.
- **Rails** — two iron lines at roughly 0.28 tile gauge (matching the incline's `±0.13` offset so
  the two agree). Two-pass, like the line shaft: a dark iron stroke with a bright 1px highlight
  along the **screen-left** edge only, since that's the lit side under the established `SUN`. Iron
  that catches the light along one edge is what will sell "polished by use" at a glance.
- **Curves** — the piece that decides whether this looks bought or built. A 90° turn must be a real
  quarter-curve with the rails swept as short arcs, not two straights meeting at a corner. In
  dimetric this is very visible and very cheap.
- **Points** — where a route branches: a pair of switch blades and a **brass throw lever** with a
  counterweight ball, standing about 0.4 levels proud. It's the one piece of the permanent way that
  should be a readable, clickable-looking object, because it's the one the player reasons about.

**The wagon.** A four-wheel timber-bodied chaldron on iron tyres, roughly 0.55 × 0.35 tiles, sitting
about 0.18 levels above rail head.

- The **lot rides visible in the bed** — the same stacking treatment ground items already use, so a
  loaded wagon and a loaded stockpile speak the same visual language. You should be able to read
  "that's four logs" from across the valley.
- Wheels are small iron discs; at these sizes don't animate rotation — animate the **body sway** on
  a slight sine and let the wheels read as solid. Rotating an 8px disc just shimmers.
- A cast shadow from the `castShadow` footprint sweep, which will do the right thing automatically.

**The horse.** Small, plodding, ahead of the wagon on a trace line, using the same silhouette
grammar as the player (flat colour blocks, one lit side, a blob shadow). Its walk cycle can reuse
the player's phase trick — displacement-driven, no sim state. A horse is also the clearest possible
statement that this is *not yet* steam, which makes the eventual locomotive land harder.

**Signals of state**, via the existing status vocabulary: a wagon waiting at a gradient gets the
same badge treatment machines get, so "the queue is at the incline" is readable without opening
anything.

## How it plays

- **Batch, never flow.** A wagon is a container for one lot. It loads at a stockpile-adjacent
  loading dock, runs the route, unloads. No per-item conveyor semantics, ever.
- **Gradient is law.** Flat: fine. Downhill: fine, and faster. Uphill under load: refused. The
  refusal must be *diagnosed on screen* — the wagon stops at the foot with a clear reason, in the
  spirit of the guidance layer, not silently.
- **Capacity comes from route discipline**, not from upgrades. One wagon per route section; if you
  want throughput you build passing places and more sections. That's a spatial puzzle, which is the
  genre's real pleasure, and it keeps rail from being a flat multiplier.

## What to be careful about

- **Rail must not become a free belt.** The GDD forbids free belts and enemies and electricity
  forever. Rail stays expensive in iron, bound by gradient, and limited by section occupancy.
- **Don't let it obsolete the flume.** The flume is gravity and water, and it's the identity mover.
  Rail should be strong where flumes are weak (across the flat, uphill-adjacent, mixed cargo) and
  weak where flumes are strong (long descents, bulk timber). They should read as complementary.
- **Route drawing needs its own UX pass.** Placing a curve on a diagonal grid with a mouse is the
  single hardest interaction in this pitch, and it deserves its own slice rather than being
  smuggled in with the art.

## Smallest shippable first slice

If rail gets one branch, it should be: **straight pieces + one curve + a loading dock + one
horse-drawn wagon on a fixed two-point route, flat ground only, gradient refused with a visible
reason.** No points, no passing places, no scheduling. That's enough to prove the look, the batch
semantics and the gradient rule in one playable loop — and it sets up the queue-at-the-incline
moment that motivates everything after it.
