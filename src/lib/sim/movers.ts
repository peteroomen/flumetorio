// Movers: the flume (water-fed downhill conveyor) and the self-acting gravity incline.
// Plus the auto-feeders that let an adjacent clamp/incline supply a furnace.

import {
  FLUME_SPEED,
  INCLINE_BUFFER_CAP,
  INCLINE_CART_CAP,
  INCLINE_INTERVAL_MS,
  STOCKPILE_CAP,
} from './constants';
import { add, count, take, total } from './buffers';
import { inputCap } from './machines';
import { ALL_RESOURCES, type Building, type GameState, type GroundItem, type ResourceKind } from './types';
import { heightAt, idx } from './world';

function manhattanAdjacent(a: { tx: number; ty: number }, b: { tx: number; ty: number }): boolean {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1;
}

// A chest holds up to STOCKPILE_CAP total. Returns the amount actually stored.
export function chestAdd(store: Building['store'], res: ResourceKind, n: number): number {
  const s = store ?? {};
  const room = STOCKPILE_CAP - total(s);
  const put = Math.max(0, Math.min(n, room));
  if (put > 0) s[res] = (s[res] ?? 0) + put;
  return put;
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
      arrived.push(it.id);
      continue;
    }
    it.progress += dSteps;
    const end = head.path.length - 1;
    if (it.progress >= end) {
      // Deposit at the tail: into an adjacent machine that accepts it, else a chest, else ground.
      const tail = head.path[end];
      const machine = state.buildings.find(
        (b) =>
          (b.kind === 'sawmill' || b.kind === 'clamp' || b.kind === 'pitsaw') &&
          manhattanAdjacent(b, tail) &&
          count(b.input, 'log') < inputCap(b, 'log'),
      );
      const chest = state.buildings.find(
        (b) => b.kind === 'stockpile' && manhattanAdjacent(b, tail) && total(b.store ?? {}) < STOCKPILE_CAP,
      );
      if (machine) add(machine.input, 'log', 1, inputCap(machine, 'log'));
      else if (chest) chestAdd((chest.store ??= {}), it.resource, 1);
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

const MACHINE_OUT: Partial<Record<Building['kind'], ResourceKind>> = {
  pitsaw: 'plank',
  sawmill: 'plank',
  clamp: 'charcoal',
  furnace: 'iron',
};

// Unified adjacency transfers: chests feed machines and catch their output; a clamp/incline
// still feeds a furnace directly; a blacksmith draws iron from an adjacent chest.
export function tickTransfers(state: GameState): void {
  const chests = state.buildings.filter((b) => b.kind === 'stockpile');

  // 1) machine output → adjacent chest
  for (const m of state.buildings) {
    const outRes = MACHINE_OUT[m.kind];
    if (!outRes) continue;
    const have = count(m.output, outRes);
    if (have <= 0) continue;
    const chest = chests.find((c) => manhattanAdjacent(c, m) && total(c.store ?? {}) < STOCKPILE_CAP);
    if (chest) {
      const put = chestAdd((chest.store ??= {}), outRes, have);
      take(m.output, outRes, put);
    }
  }

  // 2) chest → adjacent machine input (push whatever the machine accepts)
  for (const c of chests) {
    if (!c.store) continue;
    for (const m of state.buildings) {
      if (!manhattanAdjacent(c, m)) continue;
      for (const res of ALL_RESOURCES) {
        const cap = inputCap(m, res);
        if (cap <= 0) continue;
        const have = c.store[res] ?? 0;
        const room = cap - count(m.input, res);
        const move = Math.min(have, room);
        if (move > 0) {
          add(m.input, res, move, cap);
          c.store[res] = have - move;
        }
      }
    }
  }

  // 3) direct chain: incline bottom / clamp output → adjacent furnace (no chest needed)
  for (const furnace of state.buildings) {
    if (furnace.kind !== 'furnace') continue;
    for (const src of state.buildings) {
      if (!manhattanAdjacent(src, furnace)) continue;
      const res: ResourceKind | null = src.kind === 'incline' ? 'ore' : src.kind === 'clamp' ? 'charcoal' : null;
      if (!res) continue;
      const have = count(src.output, res);
      if (have > 0) {
        const put = add(furnace.input, res, have, inputCap(furnace, res));
        take(src.output, res, put);
      }
    }
  }

  // 4) blacksmith ← adjacent chest (iron)
  for (const smith of state.buildings) {
    if (smith.kind !== 'blacksmith') continue;
    const chest = chests.find((c) => manhattanAdjacent(c, smith) && (c.store?.iron ?? 0) > 0);
    if (chest?.store) {
      chest.store.iron = (chest.store.iron ?? 0) - 1;
      smith.delivered = (smith.delivered ?? 0) + 1;
    }
  }
}

// Convenience for tests / picking: does a tile carry a flume?
export function flumeAt(state: GameState, tx: number, ty: number): boolean {
  const i = idx(tx, ty);
  return state.buildings.some((b) => (b.kind === 'flume' || b.kind === 'flumeHead') && idx(b.tx, b.ty) === i);
}
