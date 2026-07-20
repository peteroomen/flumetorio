// Building catalog: costs, labels, and placement validity. Pure.

import type { BuildingKind, GameState, ResourceKind, Tile } from './types';
import { heightAt, idx, inBounds, isAdjacentToWater, isWaterAt } from './world';

export interface BuildingDef {
  kind: BuildingKind;
  label: string;
  blurb: string;
  cost: Partial<Record<ResourceKind, number>>;
  hotkey: string;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  stockpile: {
    kind: 'stockpile',
    label: 'Stockpile',
    blurb: 'A yard to drop and gather goods. A machine beside one banks its output automatically.',
    cost: {},
    hotkey: '1',
  },
  pitsaw: {
    kind: 'pitsaw',
    label: 'Pit saw',
    blurb: 'Logs → planks by hand. Free and needs no power, but slow. Your first way to make planks.',
    cost: {},
    hotkey: '2',
  },
  waterwheel: {
    kind: 'waterwheel',
    label: 'Waterwheel',
    blurb: 'Must sit beside the river. Powers machines within its line-shaft reach.',
    cost: { plank: 6 },
    hotkey: '3',
  },
  sawmill: {
    kind: 'sawmill',
    label: 'Sawmill',
    blurb: 'Logs → planks. Needs waterwheel power within reach.',
    cost: { plank: 4 },
    hotkey: '4',
  },
  flumeHead: {
    kind: 'flumeHead',
    label: 'Flume head-gate',
    blurb: 'Must sit beside water. Tip logs here; they ride downhill to the tail.',
    cost: { plank: 5 },
    hotkey: '5',
  },
  flume: {
    kind: 'flume',
    label: 'Flume trestle',
    blurb: 'Extends the flume run. Must continue downhill or level.',
    cost: { plank: 1 },
    hotkey: '6',
  },
  clamp: {
    kind: 'clamp',
    label: 'Charcoal clamp',
    blurb: 'Logs → charcoal. Slow, needs no power.',
    cost: { plank: 4 },
    hotkey: '7',
  },
  incline: {
    kind: 'incline',
    label: 'Gravity incline',
    blurb: 'Place across a downhill step. Self-acting carts carry ore to the low end.',
    cost: { plank: 6 },
    hotkey: '8',
  },
  furnace: {
    kind: 'furnace',
    label: 'Blast furnace',
    blurb: 'Ore + charcoal → iron. Stoke it — a cold furnace is costly to relight.',
    cost: { plank: 8 },
    hotkey: '9',
  },
  blacksmith: {
    kind: 'blacksmith',
    label: 'Blacksmith',
    blurb: 'The town’s first works. Deliver iron here.',
    cost: {},
    hotkey: '0',
  },
};

// Multi-tile? All MVP buildings occupy a single tile for simplicity.
export function canAfford(state: GameState, kind: BuildingKind): boolean {
  const cost = BUILDINGS[kind].cost;
  for (const [res, n] of Object.entries(cost)) {
    if ((state.bank[res as ResourceKind] ?? 0) < (n ?? 0)) return false;
  }
  return true;
}

export function tileOccupied(state: GameState, tx: number, ty: number): boolean {
  return state.buildings.some((b) => b.tx === tx && b.ty === ty);
}

// Returns null if placement is valid, otherwise a reason string.
export function placementError(
  state: GameState,
  kind: BuildingKind,
  tx: number,
  ty: number,
): string | null {
  const tiles = state.tiles;
  if (!inBounds(tx, ty)) return 'Out of bounds.';
  if (tileOccupied(state, tx, ty)) return 'Something is already here.';
  const tile: Tile = tiles[idx(tx, ty)];

  // Nothing but the flume-head / waterwheel may sit on water; nothing sits on a tree tile without felling.
  if (tile.terrain === 'water' && kind !== 'flume') return 'Cannot build on the river.';

  switch (kind) {
    case 'waterwheel':
      if (!isAdjacentToWater(tiles, tx, ty)) return 'Must be placed beside the river.';
      return null;
    case 'flumeHead':
      if (!isAdjacentToWater(tiles, tx, ty)) return 'The head-gate needs water — place it beside the river.';
      return null;
    case 'flume': {
      // A trestle must be adjacent to an existing flume/head and not go uphill from it.
      const neighbours = state.buildings.filter(
        (b) =>
          (b.kind === 'flume' || b.kind === 'flumeHead') &&
          Math.abs(b.tx - tx) + Math.abs(b.ty - ty) === 1,
      );
      if (neighbours.length === 0) return 'Flumes must extend from a head-gate or another trestle.';
      const here = heightAt(tiles, tx, ty);
      const anyDownhillOrLevel = neighbours.some((b) => heightAt(tiles, b.tx, b.ty) >= here);
      if (!anyDownhillOrLevel) return 'Water won’t flow uphill — extend downhill or level.';
      return null;
    }
    case 'incline': {
      // Must border a downhill step (a neighbouring tile one level lower).
      const here = heightAt(tiles, tx, ty);
      const bordersDrop =
        heightAt(tiles, tx + 1, ty) < here ||
        heightAt(tiles, tx - 1, ty) < here ||
        heightAt(tiles, tx, ty + 1) < here ||
        heightAt(tiles, tx, ty - 1) < here;
      if (!bordersDrop) return 'An incline needs a downhill step — build it at a terrace edge.';
      return null;
    }
    case 'pitsaw':
    case 'sawmill':
    case 'clamp':
    case 'furnace':
    case 'stockpile':
    case 'blacksmith':
      if (tile.terrain === 'forest') return 'Fell the tree here first.';
      return null;
    default:
      return null;
  }
}

// Which water tile a flume-head draws from (for rendering the feeder).
export function waterNeighbour(
  tiles: Tile[],
  tx: number,
  ty: number,
): { tx: number; ty: number } | null {
  const cand = [
    { tx: tx + 1, ty },
    { tx: tx - 1, ty },
    { tx, ty: ty + 1 },
    { tx, ty: ty - 1 },
  ];
  for (const c of cand) if (isWaterAt(tiles, c.tx, c.ty)) return c;
  return null;
}
