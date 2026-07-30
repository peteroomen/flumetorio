# The fun gate — protocol, instrumentation, and verdict template

**Date:** 2026-07-30 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** M5 exit — the fun gate

## Goal

Answer the one question the MVP exists to answer, honestly and on evidence:

> **Is the batch-cadence sustain loop — minutes 20–40, keeping one furnace fed off a flume, an
> incline, and a charcoal clamp — fun?**

"Done" = a played session and a **written verdict** in `docs/work/`, with the numbers that back it,
and a named decision that follows from it.

## The blocker nobody logged

Roadmap M5 lists **"Cadence instrumentation v1: burn rate vs delivery rhythm per consumer;
starvation forecast"** as a deliverable. It was never built — it fell out when M5 was compressed
into the single vertical-slice PR. Nothing in the game currently records what happened during a
session.

That matters because the question is specifically about **cadence**, and cadence is exactly the
thing memory is worst at. Without a log the verdict is "it felt a bit slow", which is not a basis
for deciding whether to build the demand-pull town or re-cut the loop. So instrumentation comes
first, and it is small.

## Part 1 — Cadence instrumentation v1 (the enabling work)

A pure, append-only event log in the sim plus a console export. **No gameplay change**, and it must
not violate sim purity — it records what the sim already does.

**Events to record** (with sim timestamp, so it's independent of frame rate):

- `letter.done` — which letter, at what time
- `build.place` — kind, tile
- `furnace.cold` / `furnace.relit` — the central pressure of the whole question
- `machine.starved` — kind + which resource, on the transition into starvation (not per tick)
- `machine.outputFull` — kind, on transition (the "I'm not collecting fast enough" signal)
- `player.pickup` / `player.deposit` — resource, count (a barrow trip is a pickup→deposit pair)
- `player.idle` — entered/left idle after N seconds without input

**Derived per 5-minute bucket**, which is what the verdict actually needs:

- Furnace **uptime %** (hot and smelting vs total)
- **Starvation events** per bucket, split by resource — is it ore, charcoal, or logs that bites?
- Player **time split**: acting (chop/mine) · hauling (carrying) · building · idle
- **Barrow trips** per bucket and mean trip duration — the "you do nothing but carry" metric
- **Letter intervals** — did the arc actually land on the 4 / 8 / 13 / 20–40 beats?

**Export:** `window.__fw.cadence.dump()` returning JSON, plus a summary table printed to the
console, so the verdict can quote figures rather than impressions.

**Scope guard:** logging only. No HUD graphs, no in-game readout. If the numbers prove useful, a
visible readout is a later slice.

## Part 2 — The playtest protocol

Conditions, so the result means something:

- **Fresh save.** `N` to restart, seed 1. No prior-session state.
- **No dev tools.** No debug overlay, no console, no dropping resources in. Play it as shipped.
- **No documentation.** Don't re-read the GDD or this file mid-session. The letters are the tutorial;
  if they don't teach, that's a finding.
- **One uninterrupted sitting, 40 minutes minimum.** Stop at 40 unless still engaged — if you keep
  playing past 40 without noticing, record that, it's the strongest possible signal.
- **Think aloud into a recording, or jot timestamped one-liners.** Either is fine; unrecorded
  impressions are not.

Watch for, and note the **time** of, each:

- The first moment of genuine satisfaction (candidate: the first log riding the flume)
- The first moment of boredom, and what you were doing
- The first moment of frustration, and whether it was the game or the interface
- Every time the furnace went cold — and whether you *noticed it happening* or only discovered it
- Any point where you didn't know what to do next
- Any point where you wanted a thing the game doesn't have (these are the desire chains talking)

## Part 3 — The verdict template

File as `docs/work/YYYY-MM-DD-fun-verdict.md`. **Write the prose verdict before reading the log** —
then check the numbers against it and record where they disagree. Disagreements are the most
valuable output.

```markdown
# Fun verdict — minutes 20–40

## The answer
Yes / No / Qualified — in one paragraph, written before looking at the data.

## What the log says
Furnace uptime by bucket · starvation by resource · time split · barrow trips · letter intervals.

## Where the numbers disagreed with the feeling
(the most useful section)

## The three worst moments
## The three best moments

## What the game was asking for that it doesn't have

## Decision
One of:
- **Proceed** — the loop holds; open the demand-pull town arc (GDD §8/§10).
- **Re-tune** — the loop is right but the numbers are wrong; name which and re-run the model.
- **Re-cut** — the loop itself isn't carrying 20 minutes; name what to change before more content.
```

## Interpretation guide (agreed before playing, so the result can't be rationalised)

| Symptom | Reading |
| --- | --- |
| High furnace uptime, player bored | Too easy. The loop needs a tighter constraint, not more content. |
| Low uptime, player frustrated by walking | Logistics relief is insufficient — the flume/incline/rail aren't doing enough. |
| Furnace went cold and you didn't notice | The central pressure isn't legible. A guidance failure, not a balance one. |
| Hauling dominates the time split | The thing the game exists to relieve is still the game. Serious. |
| Letters land far off the 4 / 8 / 13 / 20 beats | Balance-pass numbers are wrong; rerun `model-economy.ts` with new targets. |
| You played past 40 minutes without noticing | Proceed. |

## Steps

- [ ] Cadence instrumentation v1 (pure sim log + `dump()` export + derived summary).
- [ ] A test that the log records a furnace cold/relit cycle and a barrow trip.
- [ ] Owner plays the 40-minute session under the protocol above.
- [ ] Verdict written from template; decision recorded.
- [ ] If the decision is Re-tune, feed the targets back into `scripts/model-economy.ts`.

## Out of scope

Any content work until the verdict exists — that's the entire point of a gate. Also out: HUD
cadence graphs, multi-session A/B testing, and external playtesters (a stranger test is valuable but
answers a different question — legibility, not whether the loop is fun).

---

<!-- Fill in during/after -->

## What actually happened

## Files created / modified

## Status

- [ ] In progress - [ ] Complete - [ ] Partial — see deferred
