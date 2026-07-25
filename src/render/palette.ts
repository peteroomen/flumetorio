// Locked palette — Plate III · Rev C ("soot & steam"). The hex ramps come verbatim from the
// published art-direction artifact; change them there first, then here.

import type { BuildingKind, ResourceKind, Terrain } from '@/lib/sim/types';

export const COLORS = {
  bg: 0x14141d,
  sky0: 0x232130, // zenith of the backdrop gradient
  sky1: 0x14141d,

  earth: 0x5a4a34,
  earthT: 0x6b5a40,
  earthD: 0x463829,
  earthXD: 0x31281d,
  grass: 0x5a6d3a,
  grassT: 0x6a7d46,
  grassD: 0x3f4d28,
  rock: 0x615c54,
  rockT: 0x726c62,
  rockD: 0x453f38,

  water0: 0x357089,
  water1: 0x4f97b2,
  water2: 0x74bcd6,

  iron: 0x4a4b56,
  ironL: 0x66677a,
  ironD: 0x2c2d38,
  ironXD: 0x1e1f28,
  brass: 0xd8a94a,
  brassL: 0xf2d283,
  brassD: 0x8a6524,
  copper: 0xb06a3a,
  copperL: 0xd08a54,
  verd: 0x4a9c80,
  stone: 0x726c62,
  stoneL: 0x8a8375,
  stoneD: 0x4a453d,
  brick: 0x8a4b39,
  brickL: 0xa5624a,
  brickD: 0x5f3325,
  wood: 0x7d5430,
  woodL: 0x9c7142,
  woodD: 0x472f1a,

  steam: 0xd6dae0,
  soot: 0x464852,
  ember: 0xff8a2a,
  emberH: 0xffce5a,
  emberD: 0xbd3a0e,
  glow: 0xffcf8a,

  ghostOk: 0x8fe388,
  ghostBad: 0xe8746a,
  power: 0xd8a94a,
  text: 0xe8e2d4,
  action: 0xf2c14e,
} as const;

// Top-face colors per terrain, by height band (top terrace grassy, mid rocky, floor earthy —
// per the plate's ground). Forest tiles share the grass ramp; the canopy carries the green.
export function terrainColor(terrain: Terrain, height: number): number {
  switch (terrain) {
    case 'water':
      return COLORS.water1;
    case 'rock':
      return height >= 2 ? COLORS.rockT : COLORS.rock;
    // Forest shares the grass ramp *including its height band* — keying it to a single colour
    // two-toned every wooded tile against its neighbours and put the lattice straight back.
    case 'forest':
    case 'grass':
    default:
      if (height >= 2) return COLORS.grassT;
      if (height === 1) return COLORS.grass;
      return COLORS.earthT; // the works floor is trodden earth
  }
}

// A stable per-tile dither value in [0,1] for cheap ground texture.
export function tileNoise(tx: number, ty: number): number {
  return ((tx * 73 + ty * 151 + tx * ty * 13) % 17) / 17;
}

// Stable integer hash -> [0,1). Cosmetic-only, but deliberately *not* Math.random: the terrain
// layer is cached and redrawn on demand, so anything scattered on it must land identically every
// rebuild or the ground shimmers.
export function hash01(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smoothed value noise over a lattice of `scale` tiles — large-scale ground patchiness, so the
// floor varies over metres rather than per tile (which just reads as noise).
export function patchNoise(tx: number, ty: number, scale: number, salt = 0): number {
  const x = tx / scale;
  const y = ty / scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n0 = hash01(x0, y0, salt) * (1 - sx) + hash01(x0 + 1, y0, salt) * sx;
  const n1 = hash01(x0, y0 + 1, salt) * (1 - sx) + hash01(x0 + 1, y0 + 1, salt) * sx;
  return n0 * (1 - sy) + n1 * sy;
}

// ---- the sun ----
// Derived from the kit's own massing, not invented: `box()` fills the +x wall at 0.55 and the +y
// wall at 0.75, so the light is opposite +x with a smaller -y component. Every shadow in the
// renderer sweeps along this vector (world tiles), scaled by the caster's height in levels.
export const SUN = { x: 1, y: 0.28 } as const;
export const SHADOW_PER_LEVEL = 0.22; // tiles of shadow per height-level of caster
export const SHADOW_ALPHA = 0.2;

// Multiply a colour's channels by `f` (clamped) — the plate's `sh()`. f>1 brightens.
export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((color & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

export const darken = shade;

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
  sawmill: 0x7d5430,
  flume: 0x7d5430,
  flumeHead: 0x4f97b2,
  clamp: 0x5a4a34,
  incline: 0x6a5a4a,
  furnace: 0x4a4b56,
  blacksmith: 0x726c62,
};
