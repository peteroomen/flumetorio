# ADR 003: Vanilla-TS UI for the MVP; React and Tailwind deferred

Date: 2026-07-19 · Status: Accepted

## Context

ADR 001 fixed the stack as Vite + TS + PixiJS + Zustand + Tailwind + Vitest + Playwright, and the
early CLAUDE.md sketch assumed a React shell. Building the whole MVP as a runnable slice in one
sitting, the UI surface is small (bank counters, the Company letter, a build bar, a toast, a win
banner) and the store is Zustand-vanilla driving an imperative Pixi loop. React's reconciliation
buys little here and adds setup, and Tailwind adds a build step for a handful of styles.

## Decision

- Build the MVP HUD as **vanilla TypeScript** DOM that reads the store and updates each frame
  (rebuilding only the build bar when the unlocked set changes). No React.
- **Defer Tailwind**; use one hand-written `src/ui/style.css`.
- Keep the store Zustand-vanilla and the renderer imperative (unchanged from ADR 001 intent).

## Consequences

- Fastest path to a playable, low-dependency slice; nothing re-renders per frame.
- If the UI grows complex (nested sheets, many panels), revisit React then — the store is already
  framework-agnostic, so adopting it later is contained to the `ui/` layer.
- CLAUDE.md's architecture note is updated to describe the vanilla `ui/` layer instead of React.
