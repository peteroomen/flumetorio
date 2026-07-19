# Flumeworks (working title)

A batch-native automation game in a Victorian / soft-steampunk register: **Factorio's brain,
Railroad Tycoon's heart, Frostpunk's soul (minus the cold)**. You hold a Company concession over a
terraced valley. Everything wants to flow downhill to the sea — logs ride flumes, ore carts ride
gravity inclines, furnaces eat in batches and must never go cold.

The genre gap this fills: automation games are crowded with sci-fi (Factorio, Satisfactory, DSP),
abstract (shapez), and cozy-fantasy (Factory Town) skins. Nobody has shipped an automation-first
game — belts-and-machines DNA, infinite scaling, throughput puzzles — wearing a pre-electric skin
where **batch transport is the core loop**, not the late-game layer.

## The one-line design thesis

> The terrain has a grain. Height, water, and gravity are scarce routing resources; every mover is
> earned; machines eat charges, not streams — so the puzzle is **cadence**, and cadence is
> timetabling, which is the part of Factorio/OpenTTD people already love most.

## Documents

| Doc                | Path                                     | Purpose                                  |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| Game Design        | `docs/design/GDD.md`                     | The full design — pillars, systems, MVP  |
| Roadmap            | `docs/ROADMAP.md`                        | How we build it — milestones M0–M5       |
| Ways of working    | `CLAUDE.md`                              | Session process, conventions, checklists |
| Decisions          | `docs/decisions/`                        | ADRs (engine choice, iso projection)     |
| Work logs          | `docs/work/YYYY-MM-DD-*.md`              | Per-session notes                        |

## Status

Docs-only. Next step is **M0** (see the roadmap): scaffold the web prototype stack, the iso terrace
renderer spike, and the screenshot-verification harness.
