# flumetorio (placeholder name — see GDD §14)

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

## Play the vertical slice

A playable MVP lives on `feature/mvp-vertical-slice`.

```bash
pnpm install
pnpm dev          # open the printed localhost URL (default http://localhost:3100)
```

**Controls:** `WASD` move · `E` act (fell tree / mine ore / collect from a machine) ·
`Q` drop / deliver (into a flume head, incline, furnace, stockpile, or the blacksmith) ·
`C` hand-saw a carried log into a banked plank · `1`–`9` pick a building, click to place
(right-click / `Esc` to cancel) · mouse wheel zoom · `G` debug overlay · `N` restart.

**The loop:** fell trees → saw planks (by hand, then with a water-powered sawmill) → deliver planks
to the Company (drop at a stockpile) to earn building drawings → flume logs downhill to a charcoal
clamp, mine ore onto a gravity incline; both auto-feed a **blast furnace you must keep stoked**
(let it go cold and relighting is costly) → carry the iron to the **blacksmith** to light the
town's first forge (win). Progress autosaves.

```bash
pnpm test         # sim + completability tests (14)
pnpm lint && pnpm type-check
pnpm build && node scripts/verify-scene.mjs   # browser smoke test + screenshots to docs/work/assets
pnpm exec tsx scripts/dump-map.ts 1           # ASCII dump of a seed's valley
```

See `docs/work/2026-07-19-mvp-vertical-slice.md` for what's in the slice and what's deliberately
simplified vs the full GDD.

## Status

**MVP vertical slice is playable** (M0–M5 compressed onto one branch). Next: a balance/feel pass
after live play, then the post-MVP arcs (demand-pull town, steam, rail, aqueducts) per the roadmap.
