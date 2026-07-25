# Buildings sit in their own geometry (+ flora light, player walk cycle)

**Date:** 2026-07-25 · **Branch:** claude/game-visual-improvements-4liquw · **Roadmap item:** post-MVP — visual follow-up, third bundle

## Goal

Every part of a building should be attached to the massing it belongs to: bands that wrap the form
instead of crossing it, chimneys that stand on the roof, cogs bolted to a wall, shadows that match
the footprint. Plus two things that were inconsistent with the sun contract established in the first
bundle.

## Context

Third bundle, from a per-building audit: each kind rendered alone on flat ground at 4× zoom with its
tile footprint ringed. Findings, worst first:

1. **Furnace hoop bands are screen-space horizontal rects.** They cross the silhouette as straight
   lines and overshoot it on both sides at the narrower stages. A band around a dimetric box is a
   shallow V — two segments meeting at the near vertical edge.
2. **Cast-shadow footprints don't match the massing.** `SHADOW_FOOT` stores one inset and one size,
   applied to both axes, but the sawmill is 0.88 × 0.78 inset (0.06, 0.12) and the blacksmith
   0.84 × 0.74 inset (0.08, 0.14). And I broke the furnace myself in the second bundle: adding the
   brick hearth course widened its base to 0.88 inset 0.06, while its shadow still says 0.72/0.14.
3. **Chimneys float.** All three are positioned by a corner rather than a centre — `chimney()` draws
   its stack at `wx + 0.41`, so the centre is `wx + 0.5`, and every caller passes the position as if
   it were the centre already. The furnace's chimney therefore sits a third of a tile right of its
   own stack, hanging off the top box. The sawmill's and smith's sit at the eave, and both are
   based at the *eave height* rather than on the roof surface, so they read as pasted on rather
   than emerging.
4. **Face-mounted cogs hang off the wall.** `faceCog` is handed an interior point rather than one on
   the wall plane, and the sawmill's is centred close enough to the corner that the teeth overhang
   the silhouette.
5. **The furnace tap-hole straddles two materials.** It spans h+0.04…h+0.46, but the brick course
   now occupies h…h+0.26 and stands 0.04 proud of the iron above it — so the arch is half-buried in
   the plinth.
6. **The action prompt collides with status badges** and still reads as bare debug text.

Two more from the same sun contract:

7. **Trees are lit from the wrong side.** `kit.box()` shades the +x (screen down-right) wall darkest,
   so the light is up-screen-left and screen-left faces are brighter — but the canopy paints its
   screen-*left* half dark and its right half lit. Inverted against every building in frame.
8. **The player never animates.** No walk cycle, so he slides.

## Approach

Fix positions at the source rather than nudging by eye: give `chimney()` callers a centre, seat the
chimney at the *computed roof surface height* for its position on the slope, and widen `SHADOW_FOOT`
to a real `[ix, iy, w, d]`. Add one kit helper, `bandAround`, so any box can be hooped correctly and
future buildings inherit it.

The tap-hole moves onto the brick, which is better than merely legal: a blast furnace taps from its
hearth, and the hearth is exactly the course the second bundle added.

Player walk is render-only — the renderer tracks the player's own position delta between frames to
drive the phase. No sim change, no new state in the store.

## Steps

- [ ] `kit.ts`: `bandAround` (V-shaped hoop wrapping a box's two visible faces).
- [ ] Furnace: banded per stage, chimney centred, tap-hole re-seated on the brick, cog on the wall.
- [ ] `SHADOW_FOOT` → `[ix, iy, w, d]`; every kind's footprint matched to its massing.
- [ ] Sawmill + blacksmith: chimney centred on the near slope, seated at the roof surface.
- [ ] Sawmill cog re-anchored and sized to fit its wall.
- [ ] Trees: flip the canopy lighting to match the sun; add a sun-side rim.
- [ ] Player: walk cycle (leg swing, body bob) + idle breathing.
- [ ] Action prompt: backing plate, raised clear of badges.

## Manual test steps

Happy path:

- [ ] Each building alone at 4× zoom: no part crosses or overshoots its own silhouette; every
      shadow sits under the massing that casts it.
- [ ] Chimneys stand on the roof, centred, with smoke rising from the pot.
- [ ] The furnace taps from its brick hearth, and its hoops wrap the stack stage by stage.
- [ ] Trees are lit on the same side as the buildings.
- [ ] Walk: legs swing and the body bobs; standing still, he breathes rather than freezing.

Edge / failure cases:

- [ ] Stand next to a machine showing a status badge: the prompt plate must not collide with it.
- [ ] A building on the height-2 terrace still casts onto its own terrace.
- [ ] Walk diagonally then stop dead: the walk phase must not keep running while idle.
- [ ] `pnpm lint && pnpm type-check && pnpm test` clean; `pnpm verify` passes.

## Out of scope for this session

Item 7 from the original review (badge scaling with zoom), item 10 (world-gen band wobble — own
branch), item 11 (`RESOURCE_GLYPH`). Rails are a **pitch only** this session — see
`docs/design/rail-pitch.md`; no rail code lands, since rail is a post-MVP tentpole per the roadmap
and the MVP scope is a hard wall.

---

<!-- Fill in during/after -->

## What actually happened

All eight landed. The audit method mattered more than any single fix: rendering each kind **alone,
on flat ground, at 4× zoom, with its tile footprint ringed** made every one of these obvious in
seconds, where they'd been invisible in a busy 1× scene for three sessions.

Root causes rather than nudges:

- `chimney()` took a corner and drew its stack at `wx + 0.41`, so its centre was `wx + 0.5` — and
  all three callers passed what they believed was a centre. Changing the signature to take the
  centre fixed every chimney at once and makes the next one correct by default.
- New `roofHeightAt()` seats a chimney at the roof's actual surface height for its position on the
  slope, so it stands *on* the roof instead of being based at the eave and floating over it.
- New `bandAround()` hoops a box along its two visible faces, meeting at the near vertical edge.
  The furnace's bands were screen-space horizontal rects that crossed the silhouette and overshot
  it at every narrower stage.
- `SHADOW_FOOT` became `[ix, iy, w, d]`. One inset and one size applied to both axes had put every
  non-square building's shadow off on y — and I'd broken the furnace's outright in the previous
  bundle by widening its base for the brick course without updating the table.

One fix beyond the plan: with the tap-hole re-seated, the ember glow — a single wide circle at
alpha 0.39 — read as a hard orange disc spilling past the furnace. Replaced with three layered
rings, so it reads as light rather than as a decal.

The tree lighting was the most embarrassing find: canopies had been lit from the screen-right while
`kit.box()` has always shaded the +x wall darkest, i.e. sun from screen-left. Every tree in the game
was lit opposite to every building. Flipped, with a sun-side rim added.

## Files created / modified

`src/render/kit.ts` (`bandAround`, `roofHeightAt`, `chimney` takes a centre) · `src/render/scene.ts`
(furnace bands/chimney/tap-hole/cog/glow, sawmill + blacksmith chimneys seated on the roof, sawmill
cog re-anchored, `SHADOW_FOOT` widened, tree lighting flipped + rim, player walk cycle and idle
breathing, prompt backing plate) · `docs/design/rail-pitch.md` (new — pitch only, no code) ·
`CLAUDE.md` · this plan.

## Deferred to next session

Unchanged from before: badge scaling with zoom (still the loudest thing in frame at close zoom),
world-gen band wobble (own branch — it's sim), `RESOURCE_GLYPH`. Rail remains unbuilt by design;
`docs/design/rail-pitch.md` proposes the arc and its smallest shippable first slice.

## Status

- [x] Complete
