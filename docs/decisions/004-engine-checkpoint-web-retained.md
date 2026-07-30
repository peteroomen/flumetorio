# ADR 004: Engine checkpoint — web retained, Godot decision deferred to the fun verdict

Date: 2026-07-30 · Status: Accepted

## Context

ADR 001 committed us to a **mandatory engine checkpoint immediately after M5**, to be recorded as a
new ADR either way. M5 has shipped, so this is that record.

ADR 001 asked the checkpoint to weigh three things. Here is what we actually have:

**1. Port cost against the pure sim — measured.**

| | LOC | fate in a Godot port |
| --- | --- | --- |
| `src/lib/sim` (pure, engine-agnostic) | 1,930 | ports **conceptually**; logic and tests translate, code does not run as-is |
| `src/render` + `src/ui` (PixiJS / DOM) | 2,916 | rewritten |
| `sim.test.ts` | 634 | retranslated to GUT / gdUnit |

The sim-purity discipline did its job: roughly 40% of the code carries its design across, and the
renderer is cleanly separable. But "portable" here means *the logic survives*, not the code — a port
is a hand-translation of ~2,600 lines plus a ~2,900-line rewrite. Choosing C# over GDScript would
make the sim half substantially more mechanical.

**2. Perf headroom — not measured, and not currently the deciding factor.**

ADR 001's argument still holds and has strengthened: batch semantics keep entity counts low by
design. A wagon is one entity carrying a lot where a belt-based game needs thousands of items. The
balance pass (2026-07-30) deliberately *slowed* every machine, which lowers event rates further.
Nothing in play so far approaches a perf ceiling, so a measurement now would be measuring the wrong
build.

**3. Distribution — the one genuine argument for Godot.**

Steam is the stated ambition and the web stack does not ship there without a wrapper. This is a
packaging problem with known solutions, not an architectural one, and it does not have to be solved
before the game is known to be worth shipping.

**The decisive input is missing.** ADR 001 ties this checkpoint to the fun gate, and the fun gate —
a structured playtest of minutes 20–40 with a written verdict (GDD §12, roadmap M5) — has not been
run. The balance pass has just moved every pacing constant, so any earlier impression of feel is
stale. Committing to the most expensive available action while the central question is open would
invert the point of ADR 001.

**A factor ADR 001 anticipated has become concrete.** ADR 001 named the owner's prior
"tileset/AI-vision friction" as a reason to prefer an instrumented web harness, and noted Godot's
equivalents are "far less mature for this workflow". That harness is now a substantial asset: a
debug overlay, Playwright instrument checks, and hooks like `Scene.flumeDeckAt()` and
`Scene.railPointsAt()` that let a *visual* property be asserted as a number. The crossed-rails bug
is the case in point — spotted by eye, then locked with `offsets 0.140..0.140` so it cannot return.
Rebuilding that verification loop is a real, unbudgeted cost of porting.

## Decision

- **Retain the web stack** (Vite · TypeScript · PixiJS · Zustand · Vitest · Playwright) for now.
- **Do not treat this as final.** The Godot question is deferred, not closed, and is re-opened by the
  fun verdict rather than by a date.
- **Keep paying the portability premium.** Sim purity (ADR 001), the tile contract (ADR 002) and the
  instrument-hook habit stay mandatory. They are what keeps this decision cheap to revisit.
- **Named reversal criteria.** Any one of these re-opens the checkpoint with a new ADR:
  1. The fun verdict is positive **and** the roadmap commits to a Steam release date.
  2. A measured frame-time or tick-time ceiling appears that batching cannot relieve — with numbers,
     from a real build, not a projection.
  3. The art direction moves to authored raster assets at a volume where Godot's tooling clearly
     beats hand-rolled Pixi (see the sprite-pipeline note below).
  4. The instrumented-verification workflow stops earning its keep.

## Consequences

- No port work now; the next milestone is the fun gate, not an engine migration.
- The renderer keeps accumulating value that a port would discard. This is accepted deliberately:
  the *design* knowledge in it (the tile contract, the material vocabulary, the `SUN` contract) is
  documented and ports as knowledge even when the code does not.
- Steam distribution stays an open question with two live answers (port, or wrap). Deciding it later
  costs less than deciding it wrong now.
- **Sprite pipeline is explicitly decoupled from this ADR.** Tools such as SpriteCook emit PNG sprite
  sheets and work with Pixi as readily as with Godot, so adopting authored sprites does not require
  an engine change. It does have a prerequisite of its own — the deferred true low-res pixel-upscale
  (integer zoom) — because authored pixel art filtered at fractional zoom looks worse than the
  current procedural geometry. Any move to sprites also trades *rules* for *images*: today one
  constant change propagates through every building via `kit.ts`, and baked assets give that up.
  That trade deserves its own ADR when it is made.
- This ADR discharges ADR 001's requirement to record the checkpoint's outcome.
