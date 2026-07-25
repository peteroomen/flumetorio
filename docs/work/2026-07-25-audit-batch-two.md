# Audit batch two: stranded goods, starved cargo, HUD churn, shouting badges

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — correctness/polish pass

## Goal

Clear the remaining open items from the audit, worst-consequence first.

## The findings

**1. A routeless dock strands goods permanently.** `isDropTargetKind` returns `true` for `railDock`
unconditionally, so the green delivery chevron invites you to load a dock with no second terminus —
and `interact()` only collects from a dock's `output`, never its `input`. Goods loaded onto a dock
that never gets a route cannot be retrieved. That's the same class of bug as the flume eating logs:
goods in, nothing out, no explanation.

**2. The wagon starves everything behind logs.** `serviceEnd` walks `ALL_RESOURCES` and takes the
first non-empty pile, so the order is always log → plank → ore → charcoal → iron. A dock with logs
arriving will never move the iron sitting behind them.

**3. The HUD rewrites DOM every frame.** The build bar was fixed to rebuild only on unlock change,
but the five bank chips are torn down and rebuilt every frame, and the letter panel and info panel
each get a fresh `innerHTML` — a full HTML reparse, 60×/second.

**4. Status badges scale with zoom.** The action prompt got `scale.set(1 / zoom)`; badges never did,
so at 4× they are 64×48px and the loudest thing on screen.

**5. `RESOURCE_GLYPH` mixes an emoji with geometric glyphs.** 🪵 renders in its own colour palette
next to `▤ ◆ ◼ ⬢`.

## Approach

For (1), fix both halves: a dock only advertises as a drop target once it has a route, **and** goods
can always be taken back off a loading stage — `interact()` collects `output` first (what arrived),
then `input` (what you changed your mind about). Advertising alone would still leave the goods of
anyone who pressed Q anyway stuck.

For (2), round-robin rather than largest-pile: remember what the wagon last carried and start the
scan after it, so a continuously-refilled log pile can't monopolise the route.

For (3), cache a content key per panel and only touch the DOM when it changes.

For (4), scale badge geometry by `1 / max(1, zoom)` exactly as the prompt does, so badges hold a
constant screen size. The tile selection ring stays in world space — it's marking a tile, not
labelling a machine.

## Steps

- [ ] `status.ts`: a dock is only a drop target once it has a route.
- [ ] `store.ts`: `interact()` also collects from a dock's `input`.
- [ ] `rail.ts`: round-robin cargo selection via a remembered last resource.
- [ ] `hud.ts`: content-keyed updates for bank chips, letter and info panel.
- [ ] `scene.ts`: badges, want-chips and delivery markers hold constant screen size.
- [ ] `palette.ts`: a geometric glyph for `log`.
- [ ] Tests for 1 and 2.

## Manual test steps

Happy path:

- [ ] Place a lone dock: no green chevron while carrying. Run rails to a second dock: the chevron
      appears.
- [ ] Load a dock, then press E beside it: the goods come back off the stage.
- [ ] Load a dock with logs *and* iron: the wagon alternates instead of draining logs forever.
- [ ] Zoom 1× → 4×: badges stay the same size on screen.

Edge / failure cases:

- [ ] Load a routeless dock anyway (press Q): the goods are still retrievable with E.
- [ ] A dock with only one resource waiting: round-robin must not stall it.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope

World-gen band wobble — its own commit, next. Rail pricing is a balance-pass question.

---

<!-- Fill in during/after -->

## What actually happened

All five, as planned. The one that changed shape on contact was (1): the audit had it filed as a
guidance nit ("routeless docks advertise as drop targets"), but writing the test showed it was
really a **goods-loss bug** — `interact()` only ever read a dock's `output`, so anything loaded onto
a dock that never got a route was gone for good. Advertising was only half of it; letting goods come
back off the loading stage is the actual fix, and the one worth having regardless.

Round-robin (2) needed one field on the wagon (`lastRes`) rather than a heuristic. The test refills
the log pile on *every tick* — a genuine monopoliser — and asserts iron still reaches the far dock.

## Files created / modified

sim: `status.ts` (dock advertises only with a route) · `store.ts` (collect from a dock's input too) ·
`rail.ts` + `types.ts` (round-robin cargo) · `sim.test.ts` (+3) · ui: `hud.ts` (content-keyed bank
chips, letter and info panel) · render: `scene.ts` (badges/want-chips/delivery marker hold constant
screen size), `palette.ts` (geometric `log` glyph) · this plan.

## Deferred to next session

Rail pricing (14 iron for a short route against a 10-iron unlock) — a balance-pass question, not a
bug. World-gen band wobble is the next commit.

## Status

- [x] Complete
