// Movers: the flume (water-fed downhill conveyor) and the self-acting gravity incline.
// Plus the auto-feeders that let an adjacent clamp/incline supply a furnace.

import {
  FLUME_SPEED,
  FURNACE_CHARCOAL_CAP,
  INCLINE_BUFFER_CAP,
  INCLINE_CART_CAP,
  INCLINE_INTERVAL_MS,
} from './constants';
import { add, count, take } from './buffers';
import { inputCap } from './machines';
import type { GameState, GroundItem } from './types';
import { heightAt, idx } from './world';

function manhattanAdjacent(a: { tx: number; ty: number }, b: { tx: number; ty: number }): boolean {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1;
}

// Walk the connected flume run from each head, stepping downhill/level, to build an ordered path.
export function recomputeFlumePaths(state: GameState): void {
  const flumeTiles = state.buildings.filter((b) => b.kind === 'flume' || b.kind === 'flumeHead');
  for (const head of state.buildings) {
    if (head.kind !== 'flumeHead') continue;
    const path: Array<{ tx: number; ty: number }> = [{ tx: head.tx, ty: head.ty }];
    const visited = new Set<string>([`${head.tx},${head.ty}`]);
    let cur = { tx: head.tx, ty: head.ty };
    // Greedy downhill walk along adjacent flume tiles.
    for (;;) {
      const curH = heightAt(state.tiles, cur.tx, cur.ty);
      const next = flumeTiles.find(
        (t) =>
          !visited.has(`${t.tx},${t.ty}`) &&
          manhattanAdjacent(cur, t) &&
          heightAt(state.tiles, t.tx, t.ty) <= curH,
      );
      if (!next) break;
      visited.add(`${next.tx},${next.ty}`);
      path.push({ tx: next.tx, ty: next.ty });
      cur = { tx: next.tx, ty: next.ty };
    }
    head.path = path;
  }
}

function dropGround(state: GameState, tx: number, ty: number, resource: GroundItem['resource']): void {
  const existing = state.ground.find((g) => g.tx === tx && g.ty === ty && g.resource === resource);
  if (existing) existing.count += 1;
  else state.ground.push({ id: state.nextId++, tx, ty, resource, count: 1 });
}

export function tickFlume(state: GameState, dt: number): void {
  const dSteps = (FLUME_SPEED * dt) / 1000;
  const arrived: number[] = [];
  for (const it of state.flumeItems) {
    const head = state.buildings.find((b) => b.id === it.headId);
    if (!head || !head.path || head.path.length < 2) {
      // A head-gate with no run yet: the load stays put at the gate. It used to be deleted, so
      // tipping a barrow into a flume you hadn't built out destroyed the logs with no feedback.
      if (head) dropGround(state, head.tx, head.ty, it.resource);
      arrived.push(it.id);
      continue;
    }
    it.progress += dSteps;
    const end = head.path.length - 1;
    if (it.progress >= end) {
      // Deposit at the tail.
      const tail = head.path[end];
      const sink = state.buildings.find(
        (b) =>
          (b.kind === 'sawmill' || b.kind === 'clamp' || b.kind === 'pitsaw') &&
          manhattanAdjacent(b, tail) &&
          count(b.input, 'log') < inputCap(b, 'log'),
      );
      if (sink) add(sink.input, 'log', 1, inputCap(sink, 'log'));
      else dropGround(state, tail.tx, tail.ty, it.resource);
      arrived.push(it.id);
    }
  }
  if (arrived.length) state.flumeItems = state.flumeItems.filter((it) => !arrived.includes(it.id));
}

export function tickIncline(state: GameState, dt: number): void {
  for (const b of state.buildings) {
    if (b.kind !== 'incline') continue;
    b.inclineTimer = (b.inclineTimer ?? 0) - dt;
    if ((b.inclineTimer ?? 0) <= 0) {
      b.inclineTimer = INCLINE_INTERVAL_MS;
      // A cart trip carries ore from the top buffer (input) to the bottom buffer (output).
      const moved = take(b.input, 'ore', INCLINE_CART_CAP);
      if (moved > 0) add(b.output, 'ore', moved, INCLINE_BUFFER_CAP);
    }
  }
}

// Auto-feed: an incline's bottom buffer and a clamp's output supply an adjacent furnace;
// a blacksmith draws banked iron from an adjacent stockpile (so furnace→stockpile→blacksmith
// automates — and hand-carrying iron to the blacksmith still works).
export function tickFeeders(state: GameState): void {
  for (const furnace of state.buildings) {
    if (furnace.kind !== 'furnace') continue;
    for (const src of state.buildings) {
      if (!manhattanAdjacent(src, furnace)) continue;
      if (src.kind === 'incline') {
        const have = count(src.output, 'ore');
        if (have > 0) {
          const put = add(furnace.input, 'ore', have, inputCap(furnace, 'ore'));
          take(src.output, 'ore', put);
        }
      } else if (src.kind === 'clamp') {
        const have = count(src.output, 'charcoal');
        if (have > 0) {
          const put = add(furnace.input, 'charcoal', have, FURNACE_CHARCOAL_CAP);
          take(src.output, 'charcoal', put);
        }
      }
    }
  }
  for (const smith of state.buildings) {
    if (smith.kind !== 'blacksmith') continue;
    const nearStockpile = state.buildings.some(
      (s) => s.kind === 'stockpile' && manhattanAdjacent(s, smith),
    );
    if (nearStockpile && state.bank.iron > 0) {
      state.bank.iron -= 1;
      smith.delivered = (smith.delivered ?? 0) + 1;
    }
  }
}

// Convenience for tests / picking: does a tile carry a flume?
export function flumeAt(state: GameState, tx: number, ty: number): boolean {
  const i = idx(tx, ty);
  return state.buildings.some((b) => (b.kind === 'flume' || b.kind === 'flumeHead') && idx(b.tx, b.ty) === i);
}
