# Design workshop round 2 — the demand-pull town, aqueducts, desire-chain discipline

**Date:** 2026-07-19 · **Branch:** main · **Roadmap item:** pre-M0 — design canon

## Goal

Capture the second design conversation (owner + Claude) into the GDD/roadmap: the two threads were
(a) formalizing the bottleneck-shifting / desire-chain mechanic, and (b) the owner's idea that
company towns should be *interactable* — which turned out to answer the genre's core "what are you
feeding?" question.

## What actually happened — decisions locked

**The demand-pull town is now the spine (biggest decision).**
- Answers "what are you feeding?": not a rocket — a living, growing town. New pillar §3.7
  (demand-pull, not supply-push).
- Establishments = demand valves: each has an ongoing **demand** (goods → its dock) and a **yield**
  (population growth / a good you re-consume / blueprints / land-access).
- **Symbiotic — owner-confirmed.** Town yields goods you feed back in (blacksmith eats iron+coal →
  yields tools → tools speed extraction / gate higher machines). Introduce gradually (early
  establishments are pure sinks; the feedback loop arrives a tier or two later). It's a positive
  feedback loop → balance via the progression model ("we can always use modelling to balance it").
- **Resolves the §8 branching weakness for free:** concurrent demands you can't all serve → which
  you tool up for first *is* the branch (blacksmith/efficiency vs gasworks/expansion vs
  railway/logistics).
- **Late-game "bots" analogue = a town building** (Works/Building Office) providing an auto-build /
  auto-haul service once supplied — municipal service, not a drone swarm. Distinct from pneumatic
  tubes (which move items).
- **Guardrail (critical):** interact via logistics ONLY — never place/staff/zone/manage internals.
  Keeps us out of city-builder territory; preserves loneliness + automation-first identity.
- **Frostpunk without survival:** a starved town waits, it doesn't die (no fail states). Pressure
  is desire, not survival. "Part designed, part grown" (owner's phrase).
- **Two-tier sinks:** near = town (living/local/symbiotic); far = Company/export market (ship
  surplus for money/prestige; carries you to new regions).

**Aqueducts (owner wants to build one over a river).** Added to the mover hierarchy as the
water-network tentpole; a flume is its small kin. Carries a flume line or (late) a navigable canal
over a valley/river the grain forbids. Marquee build, not a footnote.

**Water as a routed resource.** New §5 subsection: water is medium+reagent+coolant; scales into
leats/reservoirs/aqueducts/pumps. Feeds the water desire chain.

**Desire-chain discipline (three principles, §11):** (1) rhythm — relief, relief, HUNGER, not
constant grind; (2) convergence — several chains point at one tentpole; **steam** worked as the
canonical convergence of water + fuel + power-radius chains; (3) bottlenecks must be physical and
visible.

**MVP reframe at zero scope cost:** the closing beat's delivery target *is* the town's first valve
— "The blacksmith has opened. It wants iron." Same deliver-N mechanic, warmer framing, plants the
spine. Explicitly OUT of MVP: multi-establishment town, symbiotic tool loop, auto-build service,
water-as-scarce-resource, aqueducts.

**Art direction (from the name/aesthetic aside earlier):** flat/minimalist geometric (shapez
lineage) in iso — already recorded in GDD §2.

## Files created / modified

docs/design/GDD.md (§1 pitch, §3 +pillar 7, §4 +aqueduct, §5 +water, §8 rewrite, §10 rewrite,
§11 +principles, §12 closing beat, §13 MVP in/out, §14 open questions) · docs/ROADMAP.md (M5
closing beat + parking lot) · CLAUDE.md (design conventions + current state) · this work log.

## Deferred to next session

- **M0** — first code slice (own branch + PR). Unchanged by this workshop.
- Open questions now live in GDD §14: town balance (runaway feedback), aqueduct scope
  (navigable vs supply-only), auto-build service shape, trade winds, name.

## Status

- [x] Complete (docs-only canon capture)
