// Locked palette. Flat, minimalist, Victorian-soot register (GDD art direction).
// Cool muted field; warm emissive accents (furnace glow, lit windows).

import type { BuildingKind, ResourceKind, Terrain } from '@/lib/sim/types';

// Soot & gaslight — the Plate II pixel-steampunk palette.
export const COLORS = {
  bg: 0x12121a,
  water: 0x2f6b86,
  waterEdge: 0x1b4155,
  waterLit: 0x57a2bd,
  grid: 0x2a2f3a,
  ghostOk: 0x8fe388,
  ghostBad: 0xe8746a,
  power: 0xd8a94a,
  brass: 0xd8a94a,
  brassL: 0xf2d283,
  brassD: 0x8a6524,
  copper: 0xb06a3a,
  verd: 0x4a9c80,
  iron: 0x484954,
  ironL: 0x66677a,
  ironD: 0x2a2b36,
  ember: 0xff8a2a,
  emberH: 0xffce5a,
  emberD: 0xbd3a0e,
  text: 0xe8e2d4,
  playerBody: 0xe0c070,
  playerCarry: 0xd8853a,
  action: 0xf2c14e,
  cliffShade: 0.6,
};

// Top-face colors per terrain, by height.
export function terrainColor(terrain: Terrain, height: number): number {
  switch (terrain) {
    case 'water':
      return COLORS.water;
    case 'forest':
      return height >= 2 ? 0x4c6236 : 0x42562f;
    case 'rock':
      return height === 1 ? 0x605b52 : 0x6a6560;
    case 'grass':
    default:
      return height >= 2 ? 0x566d3c : height === 1 ? 0x4c6136 : 0x445630;
  }
}

// A stable per-tile dither value in [0,1] for cheap ground texture.
export function tileNoise(tx: number, ty: number): number {
  return ((tx * 73 + ty * 151 + tx * ty * 13) % 17) / 17;
}

export function darken(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul));
  const b = Math.min(255, Math.round((color & 0xff) * mul));
  return (r << 16) | (g << 8) | b;
}

export const RESOURCE_COLORS: Record<ResourceKind, number> = {
  log: 0x9c6b3b,
  plank: 0xcaa15e,
  ore: 0x8a8f98,
  charcoal: 0x2c2c30,
  iron: 0xb9c2cc,
};

export const RESOURCE_GLYPH: Record<ResourceKind, string> = {
  log: '🪵',
  plank: '▤',
  ore: '◆',
  charcoal: '◼',
  iron: '⬢',
};

export const BUILDING_COLORS: Record<BuildingKind, number> = {
  stockpile: 0x6b5636,
  pitsaw: 0x7d5430,
  waterwheel: 0x5a3d24,
  sawmill: 0x6b655c,
  flume: 0x6b5236,
  flumeHead: 0x3f93a8,
  clamp: 0x3a3128,
  incline: 0x6a5a4a,
  furnace: 0x484954,
  blacksmith: 0x7a5238,
  wharf: 0x5a6b7a,
};
