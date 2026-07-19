// Deterministic terraced-valley generation. Same seed => same valley.

import {
  BAND_MID_MAX_Y,
  BAND_TOP_MAX_Y,
  HEIGHT_BOTTOM,
  HEIGHT_MID,
  HEIGHT_TOP,
  MAP_H,
  MAP_W,
} from './constants';
import { makeRng, rngChance, type Rng } from './rng';
import type { OreNode, Tile, TreeNode } from './types';

export function idx(tx: number, ty: number): number {
  return ty * MAP_W + tx;
}

export function inBounds(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
}

export function bandHeight(ty: number): number {
  if (ty <= BAND_TOP_MAX_Y) return HEIGHT_TOP;
  if (ty <= BAND_MID_MAX_Y) return HEIGHT_MID;
  return HEIGHT_BOTTOM;
}

// The river runs roughly north->south, meandering a little, stepping down the terraces.
// Returns the river column for a given row.
export function riverColAt(ty: number): number {
  const base = Math.round(MAP_W * 0.5);
  const wobble = Math.round(Math.sin(ty * 0.55) * 2.2 + Math.sin(ty * 0.21) * 1.4);
  return base + wobble;
}

function isRiver(tx: number, ty: number): boolean {
  const col = riverColAt(ty);
  // 2-wide channel
  return tx === col || tx === col + 1;
}

export interface World {
  tiles: Tile[];
  trees: TreeNode[];
  ores: OreNode[];
}

export function generateWorld(seed: number): World {
  const rng: Rng = makeRng(seed);
  const tiles: Tile[] = new Array(MAP_W * MAP_H);
  const trees: TreeNode[] = [];
  const ores: OreNode[] = [];
  let id = 1;

  for (let ty = 0; ty < MAP_H; ty++) {
    const height = bandHeight(ty);
    for (let tx = 0; tx < MAP_W; tx++) {
      let terrain: Tile['terrain'] = 'grass';
      if (isRiver(tx, ty)) {
        terrain = 'water';
      } else if (height === HEIGHT_TOP) {
        // forest terrace: dense trees on grass
        terrain = 'grass';
      } else if (height === HEIGHT_MID) {
        terrain = 'rock';
      } else {
        terrain = 'grass';
      }
      tiles[idx(tx, ty)] = { terrain, height };
    }
  }

  // Plant trees on the top terrace (grass, not river, not the immediate river bank).
  for (let ty = 1; ty <= BAND_TOP_MAX_Y; ty++) {
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      const t = tiles[idx(tx, ty)];
      if (t.terrain !== 'grass') continue;
      if (isRiver(tx, ty) || isRiver(tx - 1, ty) || isRiver(tx + 1, ty)) continue;
      if (rngChance(rng, 0.42)) {
        t.terrain = 'forest';
        trees.push({ id: id++, tx, ty, state: 'tree', regrowAtMs: 0 });
      }
    }
  }

  // Ore outcrop: a cluster on the mid (rock) terrace, off to one side of the river.
  const oreCx = Math.round(MAP_W * 0.26);
  const oreCy = Math.round((BAND_TOP_MAX_Y + BAND_MID_MAX_Y) / 2);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = oreCx + dx;
      const ty = oreCy + dy;
      if (!inBounds(tx, ty)) continue;
      if (bandHeight(ty) !== HEIGHT_MID) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= 2 && rngChance(rng, 0.7)) {
        ores.push({ id: id++, tx, ty, remaining: 6, regrowAtMs: 0 });
      }
    }
  }

  return { tiles, trees, ores };
}

export function heightAt(tiles: Tile[], tx: number, ty: number): number {
  if (!inBounds(tx, ty)) return bandHeight(ty);
  return tiles[idx(tx, ty)].height;
}

export function isWaterAt(tiles: Tile[], tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  return tiles[idx(tx, ty)].terrain === 'water';
}

export function isAdjacentToWater(tiles: Tile[], tx: number, ty: number): boolean {
  return (
    isWaterAt(tiles, tx + 1, ty) ||
    isWaterAt(tiles, tx - 1, ty) ||
    isWaterAt(tiles, tx, ty + 1) ||
    isWaterAt(tiles, tx, ty - 1)
  );
}
