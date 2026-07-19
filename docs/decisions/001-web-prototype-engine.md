# ADR 001: Web-stack prototype first; Godot decision deferred to a post-MVP checkpoint

Date: 2026-07-19 · Status: Accepted

## Context

The long-term home for an iso automation game with Steam-distribution ambitions is plausibly
Godot. But the MVP exists to answer one question fast — *is the batch-cadence loop fun?* — and the
team's proven, highest-velocity workflow is TypeScript: pure sim logic under Vitest, PixiJS
rendering, and Playwright screenshot verification driven by AI-assisted development. Godot's
equivalents (GUT/gdUnit, headless capture) exist but are far less mature for this workflow, and
the tileset/AI-vision friction the owner has hit before is best mitigated by the instrumented
web harness (see ADR 002).

Performance is not the deciding factor at MVP scale: batch logistics is computationally cheap.
A cart is one entity carrying a hold-full where Factorio needs thousands of belt items —
batching saves the CPU the same way it saves the player. The MVP is hundreds of entities;
PixiJS handles that trivially, and possibly the full game's scale too.

## Decision

- Prototype in **Vite + TypeScript (strict) + PixiJS + Zustand + Tailwind + Vitest + Playwright**.
- Keep the simulation core (`src/lib/sim/`) **pure and engine-agnostic**: no PixiJS/DOM/React
  imports, deterministic under seeded RNG, fully covered by Vitest. This is the portability
  insurance that bounds the cost of a later port.
- Hold a mandatory **engine checkpoint immediately after M5** (the fun gate): re-evaluate web vs
  Godot with real data — measured perf headroom, a port-cost estimate against the pure sim, and
  distribution goals. The outcome is recorded as a new ADR either way.

## Consequences

- Fastest possible path to the fun verdict, using tooling the team already trusts.
- Risk accepted: if Godot wins at the checkpoint, the renderer and UI shell are rewritten; the
  sim core ports conceptually (logic and tests translate, code does not run as-is).
- Web distribution (itch, browser demo) is nearly free during development — useful for playtests.
- If the game never needs Factorio-scale entity counts (plausible, per the batching argument),
  the web stack may simply remain the engine.
