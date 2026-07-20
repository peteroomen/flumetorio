// Locked palette. Flat, minimalist, Victorian-soot register (GDD art direction).
// Cool muted field; warm emissive accents (furnace glow, lit windows).

import type { BuildingKind, ResourceKind, Terrain } from '@/lib/sim/types';

export const COLORS = {
  bg: 0x1a2029,
  water: 0x2f6b86,
  waterEdge: 0x244f63,
  grid: 0x3a4453,
  ghostOk: 0x8fe388,
  ghostBad: 0xe8746a,
  power: 0x6fd6c8,
  text: 0xe7e2d6,
  playerBody: 0xe0c070,
  playerCarry: 0xd8853a,
  action: 0xf2c14e,
  cliffShade: 0.68, // multiplier applied to a top color for its front faces
};

// Top-face colors per terrain, by height (higher terraces read a touch lighter/greener).
export function terrainColor(terrain: Terrain, height: number): number {
  switch (terrain) {
    case 'water':
      return COLORS.water;
    case 'forest':
      return height >= 2 ? 0x51643c : 0x47582f;
    case 'rock':
      return 0x6a6a72;
    case 'grass':
    default:
      return height >= 2 ? 0x5f7a44 : height === 1 ? 0x556b3d : 0x4c6138;
  }
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
  stockpile: 0x7d6b4e,
  pitsaw: 0x6e4d2c,
  waterwheel: 0x6d5334,
  sawmill: 0x8a6a44,
  flume: 0x53788a,
  flumeHead: 0x3f93a8,
  clamp: 0x4a4038,
  incline: 0x6a5a4a,
  furnace: 0x55504e,
  blacksmith: 0x8a5a3a,
};
