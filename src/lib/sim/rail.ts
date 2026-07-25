// The plateway: a horse-drawn tramroad running between two loading docks. Pure sim.
//
// Batch, never flow — a wagon is a container for one lot, not a conveyor. Level only: the
// gradient rule is enforced at placement (buildings.ts) so the refusal can be read, and the
// queue it eventually creates at every rise is the point of the whole arc.

import { RAIL_DOCK_CAP, RAIL_SPEED, WAGON_CAPACITY, WAGON_DWELL_MS } from './constants';
import { add, count, take } from './buffers';
import type { Building, GameState, ResourceKind, Wagon } from './types';
import { ALL_RESOURCES } from './types';
import { heightAt } from './world';

function manhattanAdjacent(a: { tx: number; ty: number }, b: { tx: number; ty: number }): boolean {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1;
}

function newWagon(): Wagon {
  return { pos: 0, dir: 1, cargo: null, count: 0, dwell: WAGON_DWELL_MS };
}

// Walk the connected level run from a dock along rail tiles until another dock is reached.
// Returns the ordered tile path including both docks, or null if there's no far terminus.
function traceRoute(state: GameState, from: Building): { path: Array<{ tx: number; ty: number }>; mate: Building } | null {
  const pieces = state.buildings.filter((b) => b.kind === 'rail' || b.kind === 'railDock');
  const path = [{ tx: from.tx, ty: from.ty }];
  const visited = new Set<string>([`${from.tx},${from.ty}`]);
  let cur: { tx: number; ty: number } = from;
  for (;;) {
    const curH = heightAt(state.tiles, cur.tx, cur.ty);
    const next = pieces.find(
      (t) =>
        !visited.has(`${t.tx},${t.ty}`) &&
        manhattanAdjacent(cur, t) &&
        heightAt(state.tiles, t.tx, t.ty) === curH,
    );
    if (!next) return null; // ran out of track without finding a second dock
    visited.add(`${next.tx},${next.ty}`);
    path.push({ tx: next.tx, ty: next.ty });
    if (next.kind === 'railDock') return { path, mate: next };
    cur = next;
  }
}

// Recompute every dock's route. Exactly ONE wagon per route, owned by the lower-id dock, so a
// route can't sprout two wagons that pass through each other.
export function recomputeRailRoutes(state: GameState): void {
  const docks = state.buildings.filter((b) => b.kind === 'railDock');
  for (const d of docks) {
    d.path = undefined;
    d.routeMateId = undefined;
  }
  const owned = new Set<number>();
  for (const d of [...docks].sort((a, b) => a.id - b.id)) {
    if (owned.has(d.id)) continue;
    const route = traceRoute(state, d);
    if (!route) {
      d.wagon = undefined;
      continue;
    }
    d.path = route.path;
    d.routeMateId = route.mate.id;
    route.mate.routeMateId = d.id;
    owned.add(d.id);
    owned.add(route.mate.id);
    // the far dock never owns a wagon; only this one runs the route
    route.mate.wagon = undefined;
    if (!d.wagon) d.wagon = newWagon();
    else d.wagon.pos = Math.min(d.wagon.pos, route.path.length - 1);
  }
  // Docks that lost their route keep no wagon.
  for (const d of docks) if (!d.path) d.wagon = undefined;
}

function dockAt(state: GameState, id: number | undefined): Building | undefined {
  return id === undefined ? undefined : state.buildings.find((b) => b.id === id);
}

// Unload what the wagon is carrying into a dock's `output` (arrived here), then load whatever is
// waiting in that dock's `input` (waiting to leave). Symmetric at both ends.
function serviceEnd(w: Wagon, dock: Building): void {
  if (w.cargo && w.count > 0) {
    const put = add(dock.output, w.cargo, w.count, RAIL_DOCK_CAP);
    w.count -= put;
    if (w.count <= 0) {
      w.cargo = null;
      w.count = 0;
    }
  }
  if (w.cargo === null) {
    for (const res of ALL_RESOURCES) {
      const have = count(dock.input, res);
      if (have <= 0) continue;
      const got = take(dock.input, res, WAGON_CAPACITY);
      w.cargo = res as ResourceKind;
      w.count = got;
      break;
    }
  }
}

export function tickRail(state: GameState, dt: number): void {
  for (const owner of state.buildings) {
    if (owner.kind !== 'railDock' || !owner.wagon || !owner.path || owner.path.length < 2) continue;
    const w = owner.wagon;
    const end = owner.path.length - 1;
    const mate = dockAt(state, owner.routeMateId);
    if (!mate) continue;

    if (w.dwell > 0) {
      w.dwell -= dt;
      if (w.dwell <= 0) {
        w.dwell = 0;
        serviceEnd(w, w.pos <= 0 ? owner : mate);
        w.dir = w.pos <= 0 ? 1 : -1;
      }
      continue;
    }

    w.pos += (w.dir * RAIL_SPEED * dt) / 1000;
    if (w.pos >= end) {
      w.pos = end;
      w.dwell = WAGON_DWELL_MS;
    } else if (w.pos <= 0) {
      w.pos = 0;
      w.dwell = WAGON_DWELL_MS;
    }
  }
}

// Convenience for rendering / tests: does a tile carry track?
export function railAt(state: GameState, tx: number, ty: number): boolean {
  return state.buildings.some((b) => (b.kind === 'rail' || b.kind === 'railDock') && b.tx === tx && b.ty === ty);
}
