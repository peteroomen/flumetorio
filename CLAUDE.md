# Flumeworks — Claude Code Instructions

Read automatically at the start of every session. **Don't start writing application code before
completing the Pre-Session Checklist below and getting the plan confirmed.**

---

## What This Project Is

**Flumeworks (working title)** — a batch-native automation game (Factorio DNA) in a Victorian /
soft-steampunk register: terraced valleys, log flumes, gravity inclines, line shafts, batch
furnaces that must never go cold. Full design in `docs/design/GDD.md`; build order in
`docs/ROADMAP.md`.

**Stack (per ADR 001, scaffolded in M0):** Vite · TypeScript (strict) · PixiJS (iso renderer) ·
Zustand (game state) · Tailwind CSS (UI shell) · Vitest (sim tests) · Playwright (verification
harness) · pnpm. Rendering is 2:1 dimetric iso with discrete terrace heights (ADR 002).

**Ship small slices: one roadmap item = one plan = one branch = one PR.**

---

## Commands

```bash
pnpm dev          # vite dev server
pnpm build        # production build
pnpm lint         # eslint src
pnpm type-check   # tsc --noEmit
pnpm test         # vitest run (tests are src/**/*.test.{ts,tsx})
```

(Until M0 lands the scaffold, this repo is docs-only and these commands don't exist yet.)

Before declaring work done, run **`pnpm lint && pnpm type-check && pnpm test`** clean.

---

## Pre-Session Checklist

Complete in order. Do not write application code until the plan file exists and is confirmed.

1. **Orient**
   - Read `docs/ROADMAP.md` — identify the current milestone and today's specific slice.
   - Read the most recent file in `docs/work/` — what was done last session, what was deferred.
   - Read the relevant GDD sections (`docs/design/GDD.md`) if touching mechanics, economy,
     movers, or progression.
2. **Clarify** — if the task is ambiguous, ask **one** focused question before proceeding.
3. **Plan** — write `docs/work/YYYY-MM-DD-{slug}.md` (format below) including **Manual test
   steps** (happy path + at least one edge/failure case). Present a summary and get **explicit
   confirmation** before writing code.
4. **Branch** — `git checkout -b feature/{name}` (slices go on a branch, never straight to `main`).

---

## Architecture (target shape — established in M0)

```
src/
  lib/
    sim/            ← Pure simulation. No PixiJS, no DOM, no React. Vitest-covered.
                      Fixed-timestep loop, seeded RNG, terrain, movers, machines, save.
    render/         ← PixiJS only. No sim imports beyond read-only state. Iso projection,
                      tile contract, debug overlay.
  ui/               ← Vanilla-TS HUD + input + view state (ADR 003 — no React in the MVP).
                      Reads the store; the renderer + HUD poll it each frame.
scripts/            ← Playwright verifiers (screenshot harness, per-feature checks).
docs/               ← GDD, roadmap, decisions (ADRs), work logs. In .prettierignore.
```

**Data flow:** a Zustand store is the single source of truth; a fixed-timestep loop ticks the
sim; per-tick visuals are driven imperatively (never re-render React per frame).

---

## Coding Conventions

- **TypeScript strict** — no `any`, no `@ts-ignore` without a comment explaining why.
- **Sim purity is sacred** — `src/lib/sim/*` imports nothing from PixiJS/React/DOM. If logic
  can't be exercised in a Vitest test, reconsider where it lives. (This is also our engine
  portability insurance — ADR 001.)
- **Determinism** — all randomness in the sim flows through the seeded RNG; a seed reproduces a
  world and a run. `Math.random()` is allowed only in cosmetic-render code.
- **Batch semantics in the sim** — machines take charges and run cycles; movers carry cargo lots.
  Don't sneak in per-item continuous flow "because it's easier".
- **Store is the single source of truth** — never duplicate run state into component state.
- **Never re-render React per frame** — imperative updates for per-tick visuals.
- **Tile contract is law** (ADR 002) — grid size, anchors, height offsets, draw order live in one
  documented module; nothing renders off-contract. Debug overlay stays functional forever.
- **Verification is instrumented** — visual features ship with a Playwright verifier that reads
  the debug overlay (text annotations), not one that eyeballs pixels.
- **Touch-friendly but desktop-first** — pointer events; this targets desktop/Steam-shaped play,
  unlike prior mobile-first projects.
- **`const` by default**; no `console.log` in committed code (`console.error` for real errors).
- **Comments only when the WHY is non-obvious** (tuning constants, projection math edges).
- **Prettier:** semis, single quotes, `printWidth: 100`, trailing commas (`all`). `docs/` is in
  `.prettierignore` on purpose — **don't reformat hand-written docs.**
- **Path alias:** `@/*` → `src/*`.

---

## Design Conventions

- **Every unlock names its desire chain** (GDD §11) before it lands: what mouth does it add, or
  what new inefficiency does it expose? Pure-relief unlocks get redesigned. Chains follow
  relief-relief-HUNGER rhythm and converge on tentpoles (steam, rail, sea).
- **Demand-pull, not supply-push** (GDD §3.7/§8/§10) — progression is the town asking and you
  supplying. The town is the sink.
- **The town guardrail** — you interact with the town *only through logistics* (route, deliver,
  buffer). Never place/staff/zone/manage its internals. Any feature that micromanages the town's
  insides is out of scope (that's a city-builder, not this game).
- **No enemies. No electricity.** Pressure is entropy and gradient; power is shafts, steam,
  hydraulics, air.
- **The terrain has a grain** — never add a mover that ignores height for free.
- New mechanics/economy work must check against the GDD; update the GDD in the same PR when the
  design genuinely evolves.

---

## Key Docs

| Doc         | Path                        | Purpose                                   |
| ----------- | --------------------------- | ----------------------------------------- |
| Roadmap     | `docs/ROADMAP.md`           | Milestones M0–M5, build order             |
| Game Design | `docs/design/GDD.md`        | Full GDD — pillars, movers, MVP, open Qs  |
| Work logs   | `docs/work/YYYY-MM-DD-*.md` | Per-session notes — read the latest first |
| Decisions   | `docs/decisions/`           | ADRs 001 (engine), 002 (iso contract)     |

---

## Git Conventions

- Never commit directly to `main`. Feature branches: `feature/`, `fix/`, `chore/`, `docs/`.
- Conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`.
- One roadmap slice = one branch = one PR. Keep PRs small and reviewable.
- Don't bypass hooks (`--no-verify`).

---

## Plan File Format

Filename: `docs/work/YYYY-MM-DD-{short-slug}.md`

```markdown
# {Feature / Task Name}

**Date:** YYYY-MM-DD · **Branch:** feature/{name} · **Roadmap item:** Mn — {slice}

## Goal

One sentence: what does "done" look like this session?

## Approach

How it'll be built; key decisions; anything non-obvious or where options were weighed.

## Steps

- [ ] Specific step 1

## Manual test steps

Happy path + an edge/failure case, verifiable in the browser or via a Playwright verifier.

- [ ] e.g. fell a tree on the top terrace, tip it into the flume, expect it to ride and splash

## Out of scope for this session

---

<!-- Fill in during/after -->

## What actually happened

## Files created / modified

## Deferred to next session

## Status

- [ ] In progress - [ ] Complete - [ ] Partial — see deferred
```

---

## Post-Session Checklist

- [ ] Fill in "What actually happened" / "Files changed" / "Deferred" in the plan file.
- [ ] Update the **Current State** section of this file.
- [ ] Add an ADR to `docs/decisions/` if a significant architectural decision was made.
- [ ] `pnpm lint` clean · `pnpm type-check` clean · `pnpm test` green.
- [ ] Commit (conventional message) and push the branch.
- [ ] Open a PR — even small slices go through review.
- [ ] If handing off, write `docs/work/YYYY-MM-DD-handoff-{next-slice}.md` (assume a cold start).

---

## ADR Format

Create at `docs/decisions/NNN-{title}.md`:

```markdown
# ADR NNN: {Title}

Date: YYYY-MM-DD · Status: Accepted

## Context

## Decision

## Consequences
```

---

## Things Not To Do

- Don't write application code before the plan file exists and is confirmed.
- Don't add a library without an ADR.
- Don't build features outside the current milestone — check `docs/ROADMAP.md`. The MVP scope
  (GDD §13) is a hard wall; parking-lot items stay parked.
- Don't skip the PR step, no matter how small the slice.
- Don't put continuous per-item flow in the sim — batch semantics (charges, lots, cycles).
- Don't let sim code import render/DOM, or renderer code mutate sim state.
- Don't render off the tile contract or let the debug overlay rot.
- Don't add enemies, electricity, or free belts. Ever.
- Don't reformat `docs/`.

---

## Current State

> **Update this section at the end of every session** — what shipped, what's next.

- **Phase:** repo bootstrapped (2026-07-19) — docs only. No application code exists yet.
- **Design workshop round 2 (2026-07-19):** locked the **demand-pull town** as the progression
  spine and emotional core (new pillar §3.7; rewrote GDD §8 + §10) — the town is the sink, emits
  concurrent demands (which resolves the branching open question), yields symbiotically (goods you
  re-consume, e.g. blacksmith→tools→faster extraction — introduced gradually, balance via model),
  and hosts the late-game **auto-build/haul service** (the "bots" analogue, not a drone swarm).
  Hard guardrail: interact via logistics only, never manage town internals. Added **aqueducts**
  (the marquee water-network build) + **water as a routed resource** (reservoirs/leats/pumps) and
  the **three desire-chain principles** (rhythm; convergence on steam; visible bottlenecks).
  Reframed the MVP closing beat as **the first town valve** (blacksmith demands iron) at zero scope
  cost. See `docs/work/2026-07-19-workshop-town-demand-pull.md`.
- **MVP vertical slice shipped (2026-07-19, branch `feature/mvp-vertical-slice`).** M0–M5
  compressed into one playable build: iso terraced world, fell/hand-saw, power-gated sawmill,
  water flume + gravity incline + auto-feeders, blast furnace with going-cold/relight, company
  letters + the blacksmith win valve, save/load. Vanilla-TS UI (ADR 003). 14 Vitest green;
  Playwright verifier passes (incl. an in-browser furnace smelt); `pnpm dev` runs. A per-resource
  buffer-cap bug (furnace couldn't be fueled) was caught by the completability test and fixed. See
  `docs/work/2026-07-19-mvp-vertical-slice.md`.
- **Visual + guidance + pit-saw pass (2026-07-20, branch `feature/visual-guidance-pass`).** One
  combined PR: (A) pixel-steampunk retint — soot/brass/iron palette, hard edges, terrace dither,
  riveted furnace with heat-driven tap-hole glow, turning vertical waterwheel; (B) the **pit saw**
  (free/unpowered/slow log→plank) replacing the hand-saw so there's one "logs into a machine" model;
  (C) the **in-game guidance layer** — pure `status.ts` driving driveshaft power viz, machine status
  badges (no-power/needs-input/output-full/cold), floating action prompts, delivery highlights, and a
  click-to-inspect info panel. 17 Vitest green; verifier passes. Art direction explored first via a
  published pixel-steampunk mockup (Plate II). See `docs/work/2026-07-20-visual-guidance-pass.md`.
- **True-dimetric visual pass (2026-07-23, branch `claude/visual-design-pass-review-lnysno`).**
  Ported the locked art-direction artifact (Plate III · Rev C, pitch B) into the renderer: new
  `render/kit.ts` component kit (shaded iso boxes, roofs, chimneys+smoke, face-mounted
  cogs/wheels/windows, sagging shafts, trestles), plate palette ramps, block-earth cliffs with
  strata, recessed water with bank walls/waterfalls/flow glints, sky backdrop, and all ten
  buildings re-authored as dimetric volumes (incl. the previously-deferred flume-as-directional-
  trough, head-gate, incline rails+cart, clamp mound). One sorted back-to-front dynamic pass —
  the player walks behind buildings correctly. Render-only; sim untouched. 19 Vitest + verifier
  green. See `docs/work/2026-07-23-dimetric-visual-pass.md`.
- **Ground, flora, and light (2026-07-25, branch `claude/game-visual-improvements-4liquw`, on top of
  the dimetric pass).** Three fixes from a screenshot review of the pass, all one problem — the world
  read as *tiles with objects on them*: (1) dropped the per-tile diamond outline (graph paper on the
  works floor) for two-octave `patchNoise` value variation plus authored clutter (pebbles, scree,
  tufts, damp patches, cart ruts that run edge-to-edge along a row); the placement grid now appears
  only in build mode, local to the cursor. Also folded `forest` into the grass *height* ramp — keying
  it to one colour two-toned every wooded tile and put the lattice straight back. (2) Trees/stumps/ore
  stand off-centre via a shared `floraOffset` (so felling doesn't move the trunk), with three canopy
  silhouettes and a four-entry green ramp. (3) One documented sun (`SUN` in `palette.ts`, derived
  from `kit.box()`'s own face shading rather than invented), driving `castShadow` (footprint-sweep
  hexagon, one polygon so alpha can't double-darken) and `blobShadow` for every caster — buildings,
  flora, ore, player, ground items — plus trestle posts under the line shaft. Render-only. 19 Vitest
  + verifier green. See `docs/work/2026-07-25-ground-flora-light.md`.
- **Material identity + air (2026-07-25, same branch, second bundle).** (4) A **material vocabulary**
  the kit reads instead of per-kind tints — brass = power transmission, verdigris = weathered copper
  on anything permanently wet, brick = anything that holds fire, slate = roofs, timber = structure.
  So: brick smithy under a verdigris roof (the works' one strong hue break), brick hearth course
  under the furnace's iron stack, verdigris bearing plate on the waterwheel, verdigris-bound flume
  head-gate, slate on the sawmill. `BUILDING_COLORS` deleted — a flat colour per kind beside a
  material vocabulary is a second, silently-diverging source of truth. (5) Water desaturated: at full
  chroma the river out-pulled the furnace glow, which is meant to be the eye's destination. (6)
  Aerial perspective as one screen-space haze gradient (the camera is player-centred, so screen
  height *is* distance — no per-tile fog threaded through the kit), plus an **out-of-bounds terrain
  skirt** so the valley recedes into haze instead of ending on a hard diagonal. (8) Waterfall foam is
  a filled mass, not a bare ring that read as a stray debug circle. (9) Terrace-base AO — cliffs sit
  in a pool of their own shade, so the elevation spine reads as real drops. Render-only. 19 Vitest +
  verifier green. See `docs/work/2026-07-25-materials-and-air.md`.
- **Buildings sit in their own geometry (2026-07-25, same branch, third bundle).** From a per-building
  audit — each kind alone, flat ground, 4× zoom, tile footprint ringed, which made three sessions'
  worth of invisible drift obvious at once. Root causes, not nudges: `chimney()` took a *corner* and
  drew its stack at `wx+0.41`, so all three callers passed a centre to a corner parameter — signature
  now takes the centre, and new `roofHeightAt()` seats chimneys on the roof surface rather than at the
  eave; new `bandAround()` hoops a box along its two visible faces (the furnace's brass bands were
  screen-space horizontal rects crossing the silhouette); `SHADOW_FOOT` widened to `[ix,iy,w,d]` since
  one inset for both axes had every non-square building's shadow off on y (and the furnace's outright
  wrong after the brick course widened its base). Furnace tap-hole moved into the **brick hearth**
  where a blast furnace actually taps, its glow layered so it stops reading as an orange decal; cogs
  re-anchored onto wall planes. Also: **tree canopies were lit from the wrong side** — screen-right,
  while `kit.box()` has always lit from screen-left — so every tree opposed every building; flipped,
  with a sun-side rim. Player got a displacement-driven **walk cycle** + idle breathing (render-only,
  no sim state), and the action prompt a backing plate clear of status badges. 19 Vitest + verifier
  green. See `docs/work/2026-07-25-buildings-sit-right.md`.
- **Rail pitch (2026-07-25, `docs/design/rail-pitch.md`) — pitch only, nothing built.** A horse-drawn
  **plateway**, not a train set: iron edge-rails, one lot per wagon, and gloriously unable to climb —
  the desire chain is relief on the flat, then HUNGER as wagons queue at every rise, pointing at
  rope-worked inclines and then steam. Visual spec grounded in the tile contract and the material
  vocabulary (recessed ballast bed so the route reads as a ribbon at 1×, real quarter-curves, brass
  throw levers at points, lot visible in the wagon bed). The gravity incline is treated as rail-zero
  and the family the plateway must match.
- **Deferred fast-follow:** true low-res pixel-upscale (integer zoom, literal plate crispness),
  sound/juice. Known sim nits reported in the 2026-07-23 session review (flume-without-trestles
  destroys logs; status.ts caps duplicated from constants; HUD rebuilds DOM every frame).
  Open visual items: **status badges scale with zoom** (now the loudest thing in frame at close
  zoom), **world-gen band wobble** (the terraces are still perfectly straight diagonals — `bandHeight`
  keys purely off the row; it's sim, not render, so it wants its own branch with tests), and the
  emoji/glyph mismatch in `RESOURCE_GLYPH`.
- **Next:** balance/feel pass after live play (constants in `src/lib/sim/constants.ts`), the pixel
  fast-follow, then post-MVP arcs (demand-pull town, steam, rail, aqueducts) per `docs/ROADMAP.md`.
