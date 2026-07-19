# Repo bootstrap — GDD, roadmap, ways of working

**Date:** 2026-07-19 · **Branch:** main (initial commit) · **Roadmap item:** pre-M0 — repo bootstrap

## Goal

Capture the full design workshop (owner + Claude, 2026-07-19) as a repo: GDD, MVP-scoped roadmap,
CLAUDE.md ways of working, and the two founding ADRs — so nothing lives only in chat.

## What actually happened

Docs-only initial commit, no application code:

- `docs/design/GDD.md` — pitch, tone (Frostpunk minus cold, Company frame, lonely-but-implied
  life), six pillars (batch-native, terrain grain, earned movers, **desire chains**, legibility,
  no enemies), full mover hierarchy incl. flumes/inclines/ropeways/locks, power ladder (line
  shafts → steam → hydraulic → pneumatic; no electricity), barrel/cooperage container layer +
  tally-shed sorting, Company-letter progression (branching flagged open; contracts-as-choice
  parked), first-20-minutes beat script, MVP in/out lists, open questions.
- `docs/ROADMAP.md` — build principles + M0–M5 (foundation/iso spike → manual valley → wheel →
  **flume** → incline+furnace → loop/letters/cottage + fun gate), post-MVP engine checkpoint,
  parking lot with the desire-chain rule.
- `CLAUDE.md` — ways of working carried over from Disaster Co. (pre/post-session checklists, plan
  files, one slice = one branch = one PR, ADRs, conventional commits) adapted to this project
  (sim purity, batch semantics, tile contract, instrumented verification, no
  enemies/electricity/free belts).
- ADR 001 — web-stack prototype (Vite/TS/PixiJS/Vitest/Playwright), pure sim as portability
  insurance, mandatory post-M5 Godot checkpoint.
- ADR 002 — 2:1 dimetric iso, discrete terrace heights, frozen tile contract, programmer art
  first, debug-overlay/instrument-based verification (designs around the AI-vision constraint).

Key owner calls recorded: flumes are MVP-mandatory (the centrepiece); iso approved; handcrafting
Factorio-style in MVP, automated crafting later; company town direction approved (consequence,
not management); deliver-for-blueprint progression accepted for MVP with branching concern noted.

Note: GitHub repo creation via the session's integration was denied (403 — app lacks repo-create
permission), so this repo was built locally, committed, and pushed once the owner created the
remote and granted access.

## Files created / modified

README.md · CLAUDE.md · docs/design/GDD.md · docs/ROADMAP.md ·
docs/decisions/001-web-prototype-engine.md · docs/decisions/002-isometric-projection-tile-contract.md ·
docs/work/2026-07-19-repo-bootstrap.md

## Deferred to next session

- **M0** (first code slice, own branch + PR): scaffold stack, iso terrace spike, tile contract
  doc+module, debug overlay, Playwright screenshot harness, pure sim skeleton.
- Naming — "Flumeworks" is a working title.

## Status

- [x] Complete
