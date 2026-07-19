# ADR 002: 2:1 dimetric isometric projection, discrete terrace heights, and an instrumented tile contract

Date: 2026-07-19 · Status: Accepted

## Context

Verticality is the game's core mechanic (the terrain has a grain; flumes, inclines, and locks are
the only level-crossers). Strict top-down 2D reads height poorly — Factorio is famously flat and
treats cliffs as pure obstacles. Continuous slopes are also hard to read *and* hard to build
tilesets for. Separately, the owner has previously hit real friction combining tilesets with
AI-assisted development: AI vision is unreliable at judging rendered art, which makes visual
regressions expensive to catch.

## Decision

1. **Projection:** classic **2:1 dimetric** ("isometric") in the AoE/OpenTTD/RCT lineage.
2. **Height is discrete:** integer terrace levels rendered as flat plateaus with cliff edges;
   lower terraces shaded darker. No continuous slopes. Only dedicated movers cross levels.
3. **A single tile contract, frozen early in M0 and treated as law:** one grid size, one
   documented sprite anchor/origin convention, per-level height offsets, deterministic draw
   order, autotile rules in code. It lives in one module + one doc; nothing renders
   off-contract.
4. **Programmer art until the contract freezes:** flat colored diamonds and labeled shapes.
   Real art is a swappable skin applied late *against* the frozen contract, whether
   commissioned or generated.
5. **Instrument-based verification, not eyeball-based:** a permanent debug overlay renders grid
   coordinates, height levels, and entity/mover labels as *text*; Playwright verifiers drive
   fixed-seed scenes and assert against annotated screenshots. AI (and humans) verify layout
   correctness by reading annotations, not judging pixels.

## Consequences

- Terraces, inclines, and flumes plunging downhill read clearly; the rendering limitation of
  discrete heights *is* the design (height scarcity makes routing a puzzle).
- Tileset work is bounded: the contract is small and testable; art risk is decoupled from
  mechanics risk and pushed late.
- The AI-vision constraint is designed around rather than fought: the overlay makes visual state
  machine-readable forever (it must never rot — see CLAUDE.md).
- Cost: dimetric projection math (picking, draw order, cliff occlusion) is more work up front
  than top-down; M0 exists to pay that cost before any game code depends on it.
