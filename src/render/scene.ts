// PixiJS scene: the terraced valley, buildings, movers, items, and the player, drawn in the
// Plate III register — true-dimetric massing composed from the component kit (kit.ts), block
// earth, clean recessed water. Reads sim state (never mutates it) and the view state.
// Terrain is cached; everything that stands on it joins one back-to-front dynamic pass.

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Building, BuildingKind, GameState, ResourceKind, Terrain } from '@/lib/sim/types';
import { bandHeight, heightAt, idx, inBounds } from '@/lib/sim/world';
import { INCLINE_INTERVAL_MS, MAP_H, MAP_W, WATERWHEEL_POWER_RADIUS } from '@/lib/sim/constants';
import { placementError, waterNeighbour } from '@/lib/sim/buildings';
import { isPoweredAt } from '@/lib/sim/machines';
import { buildingStatus, isDropTargetKind, promptFor, type StatusKey } from '@/lib/sim/status';
import type { ViewState } from '@/ui/view';
import { drawKey, HEIGHT_STEP, pointInQuad, project, TILE_HALF_H, TILE_HALF_W, tileDiamond } from './iso';
import {
  barrel,
  blobShadow,
  bandAround,
  box,
  castShadow,
  chimney,
  faceCog,
  faceWheel,
  faceWindow,
  flat,
  plankStack,
  roof,
  roofHeightAt,
  shaft,
  shaftPoint,
  smoke,
  trestleBent,
  type Face,
} from './kit';
import {
  COLORS,
  hash01,
  HAZE,
  mix,
  patchNoise,
  RESOURCE_COLORS,
  shade,
  terrainColor,
  tileNoise,
} from './palette';

// Approximate massing height (in levels) per building kind — drives cast-shadow length only.
const SHADOW_HZ: Record<BuildingKind, number> = {
  stockpile: 0.3,
  pitsaw: 0.55,
  waterwheel: 1.5,
  sawmill: 1.5,
  flume: 0.6,
  flumeHead: 0.9,
  clamp: 0.8,
  incline: 0.4,
  furnace: 2.4,
  blacksmith: 1.5,
  rail: 0.12,
  railDock: 0.7,
};

// Footprint each kind casts from, as [insetX, insetY, width, depth] in tiles — copied from the
// base `box()` of the massing in drawBuilding. One inset and one size applied to both axes left
// every non-square building's shadow offset on y.
const SHADOW_FOOT: Partial<Record<BuildingKind, [number, number, number, number]>> = {
  stockpile: [0.08, 0.08, 0.84, 0.84],
  sawmill: [0.06, 0.12, 0.88, 0.78],
  blacksmith: [0.08, 0.14, 0.84, 0.74],
  clamp: [0.12, 0.12, 0.76, 0.76],
  furnace: [0.06, 0.06, 0.88, 0.88], // the brick hearth course, not the iron stack above it
  waterwheel: [0.2, 0.2, 0.6, 0.6],
  pitsaw: [0.2, 0.2, 0.6, 0.6],
  railDock: [0.1, 0.1, 0.8, 0.8],
};

// How far the flume's deck rides above whatever carries it.
const FLUME_DECK_LIFT = 0.3;

const RAIL_GAUGE = 0.14; // half-gauge in tiles; matches the incline's rails so they read as kin

// One rail's centreline through a tile, in TILE space, for side +1 or -1.
//
// The offset comes from a consistent traversal — travel enters along -d1 and leaves along d2, and
// both ends take the perpendicular of travel. Taking it from each half's own outward direction
// flips its sign on a straight run (where d2 = -d1), which drew the same rail on either side of
// the centre line and turned every tile into an X.
function railPoints(
  cx: number,
  cy: number,
  dirs: Dir[],
  side: number,
): Array<{ x: number; y: number }> {
  const perp = (vx: number, vy: number) => ({ x: -vy, y: vx });
  const d1 = dirs[0];
  const pIn = perp(-d1.dx, -d1.dy);
  const a = {
    x: cx + d1.dx * 0.5 + pIn.x * RAIL_GAUGE * side,
    y: cy + d1.dy * 0.5 + pIn.y * RAIL_GAUGE * side,
  };
  if (dirs.length < 2) {
    return [{ x: cx + pIn.x * RAIL_GAUGE * side, y: cy + pIn.y * RAIL_GAUGE * side }, a];
  }
  const d2 = dirs[1];
  const pOut = perp(d2.dx, d2.dy);
  const e = {
    x: cx + d2.dx * 0.5 + pOut.x * RAIL_GAUGE * side,
    y: cy + d2.dy * 0.5 + pOut.y * RAIL_GAUGE * side,
  };
  if (d2.dx === -d1.dx && d2.dy === -d1.dy) return [a, e]; // straight through
  // quarter-arc: the two rail lines meet at this corner, so it is the Bezier control point
  const ctrl = { x: d1.dx !== 0 ? e.x : a.x, y: d1.dx !== 0 ? a.y : e.y };
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 6; i++) {
    const f = i / 6;
    const m = 1 - f;
    out.push({
      x: m * m * a.x + 2 * m * f * ctrl.x + f * f * e.x,
      y: m * m * a.y + 2 * m * f * ctrl.y + f * f * e.y,
    });
  }
  return out;
}

// A tree/stump's off-centre stand within its tile. Shared by the canopy and the stump it leaves,
// so felling doesn't teleport the trunk.
function floraOffset(tx: number, ty: number): { jx: number; jy: number } {
  return {
    jx: 0.5 + (hash01(tx, ty, 7) - 0.5) * 0.56,
    jy: 0.5 + (hash01(tx, ty, 13) - 0.5) * 0.56,
  };
}

const OVERLAY_STYLE = new TextStyle({ fill: 0xcfe8ff, fontSize: 11, fontFamily: 'monospace' });
const PROMPT_STYLE = new TextStyle({
  fill: 0xf2e6c8,
  fontSize: 12,
  fontFamily: 'monospace',
  stroke: { color: 0x0d1016, width: 4 },
});

const STATUS_COLOR: Record<StatusKey, number> = {
  running: 0x8fe388,
  needsInput: 0xf2c14e,
  needsFuel: 0xff8a2a,
  noPower: 0xe8746a,
  outputFull: 0xf2c14e,
  cold: 0x6fb7ff,
};

// Height (in levels above the tile) where each building's badge / chevron anchors — clear of
// the roofline so tall stacks don't wear their badge through the crown.
const BADGE_Z: Record<BuildingKind, number> = {
  stockpile: 0.8,
  pitsaw: 1.2,
  waterwheel: 1.7,
  sawmill: 2.0,
  flume: 1.0,
  flumeHead: 1.5,
  clamp: 1.3,
  incline: 1.1,
  furnace: 2.6,
  blacksmith: 2.0,
  rail: 0.6,
  railDock: 1.5,
};

interface Dir {
  dx: number;
  dy: number;
}
interface FlumeConn {
  ins: Dir[];
  outs: Dir[];
}
interface WaterAnim {
  tx: number;
  ty: number;
  surf: number; // height-level of the water surface
  drops: Array<{ dx: number; dy: number; toSurf: number }>;
}

const CARD: Dir[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const WATER_RECESS = 0.35; // water sits this many height-levels below its banks

function faceColors(terrain: string, top: number): [number, number] {
  // [left-face, right-face] — the plate's earthCube mid/dark per terrain ramp.
  switch (terrain) {
    case 'grass':
    case 'forest':
      return [COLORS.grass === top ? COLORS.grassD : COLORS.grass, COLORS.grassD];
    case 'rock':
      return [COLORS.rock === top ? COLORS.rockD : COLORS.rock, COLORS.rockD];
    default:
      return [COLORS.earth, COLORS.earthD];
  }
}

export class Scene {
  app = new Application();
  private world = new Container();
  private skyGfx = new Graphics();
  private hazeGfx = new Graphics();
  private terrainGfx = new Graphics();
  private dynGfx = new Graphics();
  private guidanceGfx = new Graphics();
  private ghostGfx = new Graphics();
  private overlayLayer = new Container();
  private overlayPool: Text[] = [];
  private promptText = new Text({ text: '', style: PROMPT_STYLE });
  private flumeDeck = new Map<number, number>();
  private railConns = new Map<number, FlumeConn>();
  private walkPhase = 0;
  private lastPx = 0;
  private lastPy = 0;
  private terrainDirty = true;
  private lastTerrainSig = '';
  private lastSkySize = '';
  private drawOrder: Array<{ tx: number; ty: number }> = [];
  private waterAnim: WaterAnim[] = [];

  async mount(parent: HTMLElement): Promise<void> {
    await this.app.init({
      background: COLORS.bg,
      resizeTo: window,
      antialias: false, // hard edges — a crisp, retro read
      autoDensity: false,
      resolution: 1,
    });
    parent.appendChild(this.app.canvas);
    this.world.addChild(this.terrainGfx, this.dynGfx, this.guidanceGfx, this.ghostGfx, this.overlayLayer);
    this.promptText.anchor.set(0.5, 1);
    this.world.addChild(this.promptText);
    this.app.stage.addChild(this.skyGfx, this.world, this.hazeGfx);

    const order: Array<{ tx: number; ty: number }> = [];
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) order.push({ tx, ty });
    order.sort((a, b) => drawKey(a.tx, a.ty) - drawKey(b.tx, b.ty));
    this.drawOrder = order;
  }

  markTerrainDirty(): void {
    this.terrainDirty = true;
  }

  private playerHeight(state: GameState): number {
    return heightAt(state.tiles, Math.floor(state.player.x), Math.floor(state.player.y));
  }

  private updateCamera(state: GameState, view: ViewState): void {
    const z = view.zoom;
    this.world.scale.set(z);
    const pc = project(state.player.x, state.player.y, this.playerHeight(state));
    this.world.x = this.app.renderer.width / 2 - pc.x * z;
    this.world.y = this.app.renderer.height / 2 - pc.y * z;
  }

  // Backdrop: the plate's soot-sky gradient, as cheap screen-space strips.
  private drawSky(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const sig = `${w}x${h}`;
    if (sig === this.lastSkySize) return;
    this.lastSkySize = sig;
    const g = this.skyGfx;
    g.clear();
    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const f = i / (steps - 1);
      const mix = (a: number, b: number) => Math.round(a + (b - a) * Math.min(1, f * 1.4));
      const c0 = COLORS.sky0;
      const c1 = COLORS.sky1;
      const col =
        (mix((c0 >> 16) & 0xff, (c1 >> 16) & 0xff) << 16) |
        (mix((c0 >> 8) & 0xff, (c1 >> 8) & 0xff) << 8) |
        mix(c0 & 0xff, c1 & 0xff);
      g.rect(0, (h / steps) * i, w, h / steps + 1).fill({ color: col });
    }
    this.drawHaze(w, h);
  }

  // Aerial perspective. The camera is centred on the player, so screen height *is* distance —
  // one screen-space gradient fogs everything uniformly (buildings included) for a single redraw
  // on resize, where a per-tile fog would have to be threaded through every kit function.
  // Deliberately stops short of full strength: the debug overlay lives under this and has to stay
  // readable (CLAUDE.md — the overlay stays functional forever).
  private drawHaze(w: number, h: number): void {
    const g = this.hazeGfx;
    g.clear();
    const steps = 56;
    const reach = h * 0.62;
    for (let i = 0; i < steps; i++) {
      const f = i / (steps - 1);
      const a = 0.3 * (1 - f) * (1 - f);
      if (a < 0.004) continue;
      g.rect(0, (reach / steps) * i, w, reach / steps + 1).fill({ color: HAZE, alpha: a });
    }
  }

  render(state: GameState, view: ViewState): void {
    const sig = `${state.trees.filter((t) => t.state === 'tree').length}:${state.ores.filter((o) => o.remaining > 0).length}`;
    if (this.terrainDirty || sig !== this.lastTerrainSig) {
      this.drawTerrain(state);
      this.terrainDirty = false;
      this.lastTerrainSig = sig;
    }
    this.drawSky();
    this.updateCamera(state, view);
    this.drawDynamic(state);
    this.drawGuidance(state, view);
    this.drawGhost(state, view);
    this.drawOverlay(state, view);
  }

  // ---------------- terrain ----------------
  private drawTerrain(state: GameState): void {
    const g = this.terrainGfx;
    g.clear();
    this.waterAnim = [];
    const tiles = state.tiles;
    const hOf = (tx: number, ty: number) => (inBounds(tx, ty) ? tiles[idx(tx, ty)].height : bandHeight(ty));
    const isWater = (tx: number, ty: number) => inBounds(tx, ty) && tiles[idx(tx, ty)].terrain === 'water';
    const surfOf = (tx: number, ty: number) => hOf(tx, ty) - (isWater(tx, ty) ? WATER_RECESS : 0);

    this.drawSkirt(g); // first, so real terrain always wins where the two meet

    for (const { tx, ty } of this.drawOrder) {
      const tile = tiles[idx(tx, ty)];
      const h = tile.height;

      if (tile.terrain === 'water') {
        const surf = h - WATER_RECESS;
        // Inner bank walls under the two far edges, where land meets the channel.
        if (!isWater(tx - 1, ty) && hOf(tx - 1, ty) >= h) {
          g.poly(
            flat([project(tx, ty, h), project(tx, ty + 1, h), project(tx, ty + 1, surf), project(tx, ty, surf)]),
          ).fill({ color: COLORS.earthD });
        }
        if (!isWater(tx, ty - 1) && hOf(tx, ty - 1) >= h) {
          g.poly(
            flat([project(tx, ty, h), project(tx + 1, ty, h), project(tx + 1, ty, surf), project(tx, ty, surf)]),
          ).fill({ color: COLORS.earthXD });
        }
        // Waterfall / spill faces toward lower front neighbours.
        const drops: WaterAnim['drops'] = [];
        const rSurf = surfOf(tx + 1, ty);
        if (surf > rSurf + 0.01) {
          g.poly(
            flat([
              project(tx + 1, ty, surf),
              project(tx + 1, ty + 1, surf),
              project(tx + 1, ty + 1, rSurf),
              project(tx + 1, ty, rSurf),
            ]),
          ).fill({ color: shade(COLORS.water0, 0.85) });
          drops.push({ dx: 1, dy: 0, toSurf: rSurf });
        }
        const lSurf = surfOf(tx, ty + 1);
        if (surf > lSurf + 0.01) {
          g.poly(
            flat([
              project(tx, ty + 1, surf),
              project(tx + 1, ty + 1, surf),
              project(tx + 1, ty + 1, lSurf),
              project(tx, ty + 1, lSurf),
            ]),
          ).fill({ color: COLORS.water0 });
          drops.push({ dx: 0, dy: 1, toSurf: lSurf });
        }
        // Surface.
        g.poly(flat(tileDiamond(tx, ty, surf))).fill({ color: COLORS.water1 });
        // faint, or the river wears the same tile lattice that was just taken off the land
        g.poly(flat(tileDiamond(tx, ty, surf))).stroke({ width: 1, color: COLORS.water0, alpha: 0.2 });
        this.waterAnim.push({ tx, ty, surf, drops });
        continue;
      }

      // Land: block-earth cliff faces toward lower neighbours (down to a water surface where
      // the neighbour is river, so banks meet the water with no gap).
      const top = terrainColor(tile.terrain, h);
      const [faceL, faceR] = faceColors(tile.terrain, top);
      const rTo = surfOf(tx + 1, ty);
      if (h > rTo) {
        g.poly(
          flat([project(tx + 1, ty, h), project(tx + 1, ty + 1, h), project(tx + 1, ty + 1, rTo), project(tx + 1, ty, rTo)]),
        ).fill({ color: shade(faceR, 0.82) });
        // strata lines at level boundaries
        for (let lv = Math.ceil(rTo + 0.01); lv < h; lv++) {
          const a = project(tx + 1, ty, lv);
          const b = project(tx + 1, ty + 1, lv);
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: shade(faceR, 0.6), alpha: 0.8 });
        }
      }
      const lTo = surfOf(tx, ty + 1);
      if (h > lTo) {
        g.poly(
          flat([project(tx, ty + 1, h), project(tx + 1, ty + 1, h), project(tx + 1, ty + 1, lTo), project(tx, ty + 1, lTo)]),
        ).fill({ color: faceL });
        for (let lv = Math.ceil(lTo + 0.01); lv < h; lv++) {
          const a = project(tx, ty + 1, lv);
          const b = project(tx + 1, ty + 1, lv);
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: shade(faceL, 0.62), alpha: 0.8 });
        }
      }

      // Top face. Two octaves of large-scale value noise, so the ground varies over several tiles
      // instead of per tile — and NO per-tile outline, which read as graph paper on open ground.
      const patch = patchNoise(tx, ty, 5.5) * 0.62 + patchNoise(tx, ty, 2.1, 17) * 0.38;
      const face = shade(top, 0.9 + patch * 0.19);
      g.poly(flat(tileDiamond(tx, ty, h))).fill({ color: face });
      this.drawGroundClutter(g, tx, ty, h, tile.terrain, face);

      // Ambient occlusion at the foot of a cliff. The terraces are the game's spine but read as
      // thin ribbons; a pool of shade where the ground meets a taller neighbour behind sells the
      // drop better than the cliff face alone can.
      if (hOf(tx - 1, ty) > h) {
        g.poly(
          flat([
            project(tx, ty, h),
            project(tx + 0.34, ty, h),
            project(tx + 0.34, ty + 1, h),
            project(tx, ty + 1, h),
          ]),
        ).fill({ color: 0x000000, alpha: 0.16 });
      }
      if (hOf(tx, ty - 1) > h) {
        g.poly(
          flat([
            project(tx, ty, h),
            project(tx + 1, ty, h),
            project(tx + 1, ty + 0.34, h),
            project(tx, ty + 0.34, h),
          ]),
        ).fill({ color: 0x000000, alpha: 0.16 });
      }
    }
  }

  // Flat band-height terraces continuing past the map bounds, dissolving into the backdrop. The
  // world otherwise ends on a hard diagonal edge that reads as a rendering artifact rather than
  // as the edge of a concession. Decoration only — `pickTile` still refuses out-of-bounds tiles.
  private drawSkirt(g: Graphics): void {
    const M = 10;
    const cells: Array<{ tx: number; ty: number }> = [];
    for (let ty = -M; ty < MAP_H + M; ty++) {
      for (let tx = -M; tx < MAP_W + M; tx++) {
        if (!inBounds(tx, ty)) cells.push({ tx, ty });
      }
    }
    // Back-to-front, exactly like the real terrain: unsorted skirt cliffs paint over the tiles in
    // front of them. Opaque, fading by *colour* toward the haze rather than by alpha — stacked
    // translucent diamonds compound at every shared edge and band the whole corner.
    cells.sort((a, b) => drawKey(a.tx, a.ty) - drawKey(b.tx, b.ty));
    for (const { tx, ty } of cells) {
      const out = Math.max(0, -tx, tx - (MAP_W - 1), -ty, ty - (MAP_H - 1));
      const hh = bandHeight(ty);
      const base = terrainColor(hh === 1 ? 'rock' : 'grass', hh);
      const patch = patchNoise(tx, ty, 5.5) * 0.62 + patchNoise(tx, ty, 2.1, 17) * 0.38;
      // `out` is a whole ring count, so a straight ramp fades in visible concentric steps.
      // Jittering it by the tile's own noise dithers the rings into a gradient.
      const fade = Math.max(0, Math.min(1, 1 - (out + (patch - 0.5) * 2.2) / (M + 1)));
      const top = mix(HAZE, shade(base, 0.9 + patch * 0.19), fade);
      g.poly(flat(tileDiamond(tx, ty, hh))).fill({ color: top });
      const lTo = bandHeight(ty + 1);
      if (hh > lTo) {
        g.poly(
          flat([
            project(tx, ty + 1, hh),
            project(tx + 1, ty + 1, hh),
            project(tx + 1, ty + 1, lTo),
            project(tx, ty + 1, lTo),
          ]),
        ).fill({ color: mix(HAZE, shade(base, 0.6), fade) });
      }
    }
  }

  // Scattered ground detail, hash-keyed so it lands identically on every cached rebuild.
  private drawGroundClutter(
    g: Graphics,
    tx: number,
    ty: number,
    h: number,
    terrain: Terrain,
    face: number,
  ): void {
    const c = project(tx + 0.5, ty + 0.5, h);
    const grassy = terrain === 'grass' || terrain === 'forest';

    // Cart ruts: rolled per row and drawn edge-to-edge, so consecutive tiles form one long track
    // worn across the works floor.
    if (!grassy && hash01(0, ty, 31) > 0.76 && hash01(tx, ty, 32) > 0.22) {
      for (const off of [-0.16, 0.1]) {
        const a = project(tx, ty + 0.5 + off, h);
        const b = project(tx + 1, ty + 0.5 + off, h);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: shade(face, 0.88), alpha: 0.55 });
      }
    }

    const roll = hash01(tx, ty, 3);
    if (grassy) {
      // tufts of grass, leaning with the light
      const n = roll > 0.72 ? 3 : roll > 0.4 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const ox = (hash01(tx, ty, 40 + i) - 0.5) * 22;
        const oy = (hash01(tx, ty, 60 + i) - 0.5) * 11;
        const tall = 2 + hash01(tx, ty, 80 + i) * 3;
        // one blade, leaning with the light — a symmetric pair reads as a printed 'v', not grass
        const lean = (hash01(tx, ty, 95 + i) - 0.3) * 2.6;
        const col = shade(face, 0.88 + hash01(tx, ty, 90 + i) * 0.2);
        g.moveTo(c.x + ox, c.y + oy).lineTo(c.x + ox + lean, c.y + oy - tall).stroke({ width: 1, color: col });
      }
      return;
    }

    // Works floor / rock: pebbles, the odd scree cluster, and rare standing water.
    if (roll > 0.965) {
      // standing water — damp patch rather than a hole; a dark fill reads as a pit from above
      const ox = (hash01(tx, ty, 11) - 0.5) * 14;
      const oy = (hash01(tx, ty, 12) - 0.5) * 7;
      const r = 5 + hash01(tx, ty, 14) * 3;
      g.ellipse(c.x + ox, c.y + oy, r, r * 0.5).fill({ color: shade(face, 0.8) });
      g.ellipse(c.x + ox, c.y + oy, r, r * 0.5).stroke({ width: 1, color: shade(face, 1.12), alpha: 0.35 });
      return;
    }
    const pebbles = roll > 0.66 ? 5 : roll > 0.3 ? 2 : 1;
    for (let i = 0; i < pebbles; i++) {
      const ox = (hash01(tx, ty, 100 + i) - 0.5) * 26;
      const oy = (hash01(tx, ty, 120 + i) - 0.5) * 13;
      const r = 1 + hash01(tx, ty, 140 + i) * 1.8;
      // flat chips, not domes — a lit cap on every one turned the floor into rivets
      g.ellipse(c.x + ox, c.y + oy, r, r * 0.45).fill({ color: shade(face, 0.82) });
      if (hash01(tx, ty, 160 + i) > 0.6) {
        g.ellipse(c.x + ox, c.y + oy - r * 0.25, r * 0.6, r * 0.22).fill({ color: shade(face, 1.1) });
      }
    }
  }

  // ---------------- dynamic (one back-to-front pass) ----------------
  private drawDynamic(state: GameState): void {
    const g = this.dynGfx;
    g.clear();
    const t = state.timeMs / 1000;
    const tiles = state.tiles;

    // Water animation first — it lies flat on the surface, under everything standing.
    for (const w of this.waterAnim) {
      for (let i = 0; i < 2; i++) {
        const f = (t * 0.22 + tileNoise(w.tx + i, w.ty) + i * 0.5) % 1;
        const p = project(w.tx + 0.25 + tileNoise(w.tx, w.ty + i) * 0.5, w.ty + f, w.surf);
        g.rect(p.x, p.y - 1, 5, 2).fill({ color: COLORS.water2, alpha: 0.5 * (1 - Math.abs(f - 0.5)) });
      }
      for (const d of w.drops) {
        const ex = w.tx + 0.5 + d.dx * 0.5;
        const ey = w.ty + 0.5 + d.dy * 0.5;
        for (let i = 0; i < 3; i++) {
          const f = (t * 0.9 + i / 3) % 1;
          const p = project(ex, ey, w.surf + (d.toSurf - w.surf) * f);
          g.rect(p.x - 4 + i * 4, p.y, 2, 4).fill({ color: COLORS.water2, alpha: 0.7 * (1 - f * 0.4) });
        }
        // Foam at the foot of the fall. A bare ring with nothing under it read as a stray debug
        // circle floating on the water, so the mass comes first and the ring only rims it.
        const sp = project(ex, ey, d.toSurf);
        const churn = 0.5 + 0.5 * Math.sin(t * 6);
        g.ellipse(sp.x, sp.y + 2, 6, 2.6).fill({ color: COLORS.foam, alpha: 0.3 + 0.16 * churn });
        for (let k = 0; k < 3; k++) {
          const ph = (t * 0.8 + k / 3) % 1;
          const bx = sp.x + (k - 1) * 4;
          g.ellipse(bx, sp.y + 2 + ph * 3, 3 * (1 - ph * 0.5), 1.4 * (1 - ph * 0.5)).fill({
            color: COLORS.foam,
            alpha: (1 - ph) * 0.4,
          });
        }
        g.ellipse(sp.x, sp.y + 2, 6, 2.6).stroke({ width: 1, color: COLORS.foam, alpha: 0.3 + 0.2 * churn });
      }
    }

    this.flumeDeck = this.computeFlumeDeck(state);
    const flumeConns = this.computeFlumeConns(state);
    const railConns = this.computeRailConns(state);
    this.railConns = railConns;

    interface Entry {
      key: number;
      draw: () => void;
    }
    const entries: Entry[] = [];

    for (const tree of state.trees) {
      const key = tree.tx + tree.ty + 1;
      if (tree.state === 'tree') entries.push({ key, draw: () => this.drawTree(g, tiles, tree.tx, tree.ty) });
      else entries.push({ key, draw: () => this.drawStump(g, tiles, tree.tx, tree.ty) });
    }
    for (const ore of state.ores) {
      if (ore.remaining <= 0) continue;
      entries.push({ key: ore.tx + ore.ty + 1, draw: () => this.drawOre(g, tiles, ore.tx, ore.ty, ore.remaining) });
    }
    for (const b of state.buildings) {
      const conn = b.kind === 'rail' ? railConns.get(idx(b.tx, b.ty)) : flumeConns.get(idx(b.tx, b.ty));
      entries.push({
        key: b.tx + b.ty + (b.kind === 'rail' ? 0.02 : 1), // track lies on the ground, under things
        draw: () => this.drawBuilding(g, state, b, t, conn),
      });
      // the wagon sorts by where it actually is, so it passes behind and in front correctly
      if (b.kind === 'railDock' && b.wagon && b.path && b.path.length >= 2) {
        const w = b.wagon;
        const i = Math.max(0, Math.min(b.path.length - 2, Math.floor(w.pos)));
        const f = Math.max(0, Math.min(1, w.pos - i));
        const wx = b.path[i].tx + (b.path[i + 1].tx - b.path[i].tx) * f;
        const wy = b.path[i].ty + (b.path[i + 1].ty - b.path[i].ty) * f;
        entries.push({ key: wx + wy + 1.1, draw: () => this.drawWagon(g, state, b, t) });
      }
    }
    for (const gi of state.ground) {
      const h = heightAt(tiles, gi.tx, gi.ty);
      entries.push({
        key: gi.tx + gi.ty + 1.05,
        draw: () => {
          const p = project(gi.tx + 0.5, gi.ty + 0.5, h);
          blobShadow(g, gi.tx + 0.5, gi.ty + 0.5, h, 0.12, 0.3, 0.2);
          const stack = Math.min(3, gi.count);
          for (let i = 0; i < stack; i++) {
            g.rect(p.x - 4 + i, p.y - 2 - i * 3, 8, 3)
              .fill({ color: RESOURCE_COLORS[gi.resource] })
              .stroke({ width: 1, color: 0x000000, alpha: 0.35 });
          }
        },
      });
    }
    for (const it of state.flumeItems) {
      const head = state.buildings.find((b) => b.id === it.headId);
      if (!head?.path || head.path.length < 2) continue;
      const i = Math.min(head.path.length - 2, Math.floor(it.progress));
      const frac = Math.max(0, Math.min(1, it.progress - i));
      const a = head.path[i];
      const bp = head.path[i + 1];
      const wx = a.tx + (bp.tx - a.tx) * frac + 0.5;
      const wy = a.ty + (bp.ty - a.ty) * frac + 0.5;
      // riding the trough, on the flume's own deck — not on the ground under it
      const da = this.flumeDeck.get(idx(a.tx, a.ty)) ?? heightAt(tiles, a.tx, a.ty) + FLUME_DECK_LIFT;
      const db = this.flumeDeck.get(idx(bp.tx, bp.ty)) ?? heightAt(tiles, bp.tx, bp.ty) + FLUME_DECK_LIFT;
      const hh = da + (db - da) * frac + 0.06;
      entries.push({
        key: wx + wy + 0.05, // just after its tile's trough, so it rides on the water
        draw: () => {
          const p = project(wx, wy, hh);
          const sx = (bp.tx - a.tx - (bp.ty - a.ty)) * TILE_HALF_W;
          const sy = (bp.tx - a.tx + (bp.ty - a.ty)) * TILE_HALF_H;
          const sl = Math.hypot(sx, sy) || 1;
          const ux = (sx / sl) * 5;
          const uy = (sy / sl) * 5;
          g.poly([p.x - ux, p.y - uy - 2, p.x + ux, p.y + uy - 2, p.x + ux, p.y + uy + 1, p.x - ux, p.y - uy + 1]).fill({
            color: RESOURCE_COLORS[it.resource],
          });
          g.circle(p.x + ux, p.y + uy - 0.5, 1.6).fill({ color: 0xc9a87a });
        },
      });
    }
    entries.push({ key: state.player.x + state.player.y, draw: () => this.drawPlayer(g, state) });

    entries.sort((a, b) => a.key - b.key);
    for (const e of entries) e.draw();
  }

  // Per-tile track connectivity, from each owning dock's route (fallback: adjacency, so track
  // you've laid but not yet joined to a second dock still draws as track).
  private computeRailConns(state: GameState): Map<number, FlumeConn> {
    const conns = new Map<number, FlumeConn>();
    const ensure = (tx: number, ty: number): FlumeConn => {
      const k = idx(tx, ty);
      let c = conns.get(k);
      if (!c) {
        c = { ins: [], outs: [] };
        conns.set(k, c);
      }
      return c;
    };
    const addDir = (list: Dir[], d: Dir) => {
      if (!list.some((x) => x.dx === d.dx && x.dy === d.dy)) list.push(d);
    };
    for (const dock of state.buildings) {
      if (dock.kind !== 'railDock' || !dock.path) continue;
      for (let i = 0; i < dock.path.length - 1; i++) {
        const a = dock.path[i];
        const b = dock.path[i + 1];
        const d = { dx: b.tx - a.tx, dy: b.ty - a.ty };
        addDir(ensure(a.tx, a.ty).outs, d);
        addDir(ensure(b.tx, b.ty).ins, { dx: -d.dx, dy: -d.dy });
      }
    }
    for (const b of state.buildings) {
      if (b.kind !== 'rail') continue;
      const c = ensure(b.tx, b.ty);
      if (c.ins.length || c.outs.length) continue;
      for (const d of CARD) {
        const hit = state.buildings.some(
          (o) => (o.kind === 'rail' || o.kind === 'railDock') && o.tx === b.tx + d.dx && o.ty === b.ty + d.dy,
        );
        if (hit) addDir(c.ins, d);
      }
      if (c.ins.length === 0) c.ins.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });
    }
    return conns;
  }

  // The flume's own elevation profile, per tile, in height-levels (absolute deck height).
  //
  // A flume is trestlework, not a groundsheet: it leaves the head-gate on a steady grade and the
  // ground falls away beneath it. Sampling terrain per tile made the trough drop a whole terrace
  // in one tile wherever the land did. So each run gets a straight line from head to tail, raised
  // wherever terrain would poke through it:
  //
  //   grade   = max over i of (th[i] - th[n]) / (n - i)   — the gentlest grade that still lands
  //   deck[i] = max(th[i], deck[i-1] - grade) + FLUME_DECK_LIFT
  //
  // i.e. descend no faster than `grade` per tile, but never sink into the ground. Both terms are
  // non-increasing (the sim only extends a run downhill or level), so the deck is too — it can
  // never run uphill. Taking the *worst* suffix grade rather than the head-to-tail average is
  // what stops a mid-run plateau forcing a late plunge: the run leaves the head already shallow
  // enough to clear the last cliff, so no single step has to make up the difference.
  //
  // The degenerate case stays honest: terrain that holds high until the final tile collapses the
  // profile back onto terrain, because there is nowhere else for the flume to go.
  private computeFlumeDeck(state: GameState): Map<number, number> {
    const deck = new Map<number, number>();
    const put = (tx: number, ty: number, z: number) => {
      const k = idx(tx, ty);
      const cur = deck.get(k);
      if (cur === undefined || z > cur) deck.set(k, z);
    };
    for (const head of state.buildings) {
      if (head.kind !== 'flumeHead' || !head.path || head.path.length === 0) continue;
      const path = head.path;
      const th = path.map((p) => heightAt(state.tiles, p.tx, p.ty));
      const n = path.length - 1;
      let grade = 0;
      for (let i = 0; i < n; i++) grade = Math.max(grade, (th[i] - th[n]) / (n - i));
      let z = th[0];
      put(path[0].tx, path[0].ty, z + FLUME_DECK_LIFT);
      for (let i = 1; i <= n; i++) {
        z = Math.max(th[i], z - grade);
        put(path[i].tx, path[i].ty, z + FLUME_DECK_LIFT);
      }
    }
    // Track laid but not yet part of a run still needs somewhere to sit.
    for (const b of state.buildings) {
      if (b.kind !== 'flume' && b.kind !== 'flumeHead') continue;
      if (deck.has(idx(b.tx, b.ty))) continue;
      put(b.tx, b.ty, heightAt(state.tiles, b.tx, b.ty) + FLUME_DECK_LIFT);
    }
    return deck;
  }

  // Per-tile flume connectivity, derived from every head's computed path (fallback: adjacency).
  private computeFlumeConns(state: GameState): Map<number, FlumeConn> {
    const conns = new Map<number, FlumeConn>();
    const ensure = (tx: number, ty: number): FlumeConn => {
      const k = idx(tx, ty);
      let c = conns.get(k);
      if (!c) {
        c = { ins: [], outs: [] };
        conns.set(k, c);
      }
      return c;
    };
    const addDir = (list: Dir[], d: Dir) => {
      if (!list.some((x) => x.dx === d.dx && x.dy === d.dy)) list.push(d);
    };
    for (const head of state.buildings) {
      if (head.kind !== 'flumeHead' || !head.path) continue;
      for (let i = 0; i < head.path.length - 1; i++) {
        const a = head.path[i];
        const b = head.path[i + 1];
        const d = { dx: b.tx - a.tx, dy: b.ty - a.ty };
        addDir(ensure(a.tx, a.ty).outs, d);
        addDir(ensure(b.tx, b.ty).ins, { dx: -d.dx, dy: -d.dy });
      }
    }
    // Disconnected trestles still show a trough toward adjacent flume pieces.
    for (const b of state.buildings) {
      if (b.kind !== 'flume' || conns.has(idx(b.tx, b.ty))) continue;
      const c = ensure(b.tx, b.ty);
      for (const d of CARD) {
        const hit = state.buildings.some(
          (o) => (o.kind === 'flume' || o.kind === 'flumeHead') && o.tx === b.tx + d.dx && o.ty === b.ty + d.dy,
        );
        if (hit) addDir(c.ins, d);
      }
      if (c.ins.length === 0) c.ins.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });
    }
    return conns;
  }

  // ---------------- flora / ore ----------------
  private drawTree(g: Graphics, tiles: GameState['tiles'], tx: number, ty: number, hOverride?: number): void {
    const h = hOverride ?? heightAt(tiles, tx, ty);
    const { jx, jy } = floraOffset(tx, ty);
    const c = project(tx + jx, ty + jy, h);
    const s = 0.82 + hash01(tx, ty, 21) * 0.4;
    // Three silhouettes and a four-entry green ramp — a wood, not a stamp repeated on a lattice.
    const variant = Math.floor(hash01(tx, ty, 5) * 3);
    const ramp = [
      [0x35502a, 0x4c6b38],
      [0x3a5230, 0x527440],
      [0x2f4726, 0x446033],
      [0x40593a, 0x5a7c49],
    ][Math.floor(hash01(tx, ty, 9) * 4)];
    const [dark, lit] = ramp;
    const tiers = variant === 1 ? 4 : variant === 2 ? 2 : 3;
    const spread = variant === 1 ? 10.5 : variant === 2 ? 15 : 13;
    const step = variant === 1 ? 8 : variant === 2 ? 11 : 9;
    const hz = ((14 + (tiers - 1) * step) * s) / HEIGHT_STEP;

    blobShadow(g, tx + jx, ty + jy, h, 0.16 * s, hz, 0.2);
    g.rect(c.x - 2, c.y - 8 * s, 4, 9 * s).fill({ color: COLORS.woodD });
    for (let i = 0; i < tiers; i++) {
      const w = (spread - i * (spread * 0.26)) * s;
      const yTop = c.y - (14 + i * step) * s;
      const yBot = c.y - (2 + i * step) * s;
      // Screen-LEFT is the lit side: `kit.box()` shades the +x (screen lower-right) wall darkest,
      // so the sun is up-screen-left. The canopy used to be lit from the right — inverted against
      // every building in frame.
      g.poly([c.x, yTop, c.x - w, yBot, c.x, yBot]).fill({ color: lit });
      g.poly([c.x, yTop, c.x + w, yBot, c.x, yBot]).fill({ color: dark });
      // a thin rim catching the sun along the lit edge
      g.moveTo(c.x, yTop)
        .lineTo(c.x - w, yBot)
        .stroke({ width: 1, color: shade(lit, 1.22), alpha: 0.75 });
    }
  }

  private drawStump(g: Graphics, tiles: GameState['tiles'], tx: number, ty: number): void {
    const h = heightAt(tiles, tx, ty);
    const { jx, jy } = floraOffset(tx, ty); // same stand the trunk occupied
    const c = project(tx + jx, ty + jy, h);
    blobShadow(g, tx + jx, ty + jy, h, 0.1, 0.2, 0.18);
    g.ellipse(c.x, c.y - 1, 4, 2).fill({ color: COLORS.wood });
    g.rect(c.x - 4, c.y - 4, 8, 4).fill({ color: COLORS.woodD });
    g.ellipse(c.x, c.y - 4, 4, 2).fill({ color: COLORS.woodL });
    g.ellipse(c.x, c.y - 4, 2, 1).stroke({ width: 1, color: COLORS.wood });
  }

  private drawOre(g: Graphics, tiles: GameState['tiles'], tx: number, ty: number, remaining: number): void {
    const h = heightAt(tiles, tx, ty);
    const jx = 0.5 + (hash01(tx, ty, 23) - 0.5) * 0.4;
    const jy = 0.5 + (hash01(tx, ty, 29) - 0.5) * 0.4;
    const c = project(tx + jx, ty + jy, h);
    blobShadow(g, tx + jx, ty + jy, h, 0.22, 0.35, 0.2);
    const rocks =
      remaining > 3
        ? [
            { x: -6, y: -1, r: 7 },
            { x: 5, y: 1, r: 6 },
            { x: 0, y: -6, r: 5 },
          ]
        : [
            { x: -4, y: 0, r: 6 },
            { x: 5, y: -2, r: 4.5 },
          ];
    for (const rk of rocks) {
      const x = c.x + rk.x;
      const y = c.y + rk.y;
      g.poly([x, y - rk.r, x - rk.r, y, x - rk.r * 0.4, y + rk.r * 0.55, x + rk.r * 0.7, y + rk.r * 0.4, x + rk.r, y - rk.r * 0.3]).fill({
        color: COLORS.stone,
      });
      g.poly([x, y - rk.r, x - rk.r, y, x + rk.r, y - rk.r * 0.3]).fill({ color: COLORS.stoneL });
    }
    g.circle(c.x - 3, c.y - 2, 1).fill({ color: COLORS.copper });
    if (remaining > 3) g.circle(c.x + 3, c.y - 4, 1).fill({ color: COLORS.copper });
  }

  // ---------------- buildings ----------------
  private drawBuilding(g: Graphics, state: GameState, b: Building, t: number, conn?: FlumeConn): void {
    const h = heightAt(state.tiles, b.tx, b.ty);
    const x = b.tx;
    const y = b.ty;
    // Ground the massing before drawing it. Kinds without a footprint entry (flume, incline) are
    // open trestlework — a solid slab under them would read as a floor, not a shadow.
    const foot = SHADOW_FOOT[b.kind];
    if (foot) castShadow(g, x + foot[0], y + foot[1], h, foot[2], foot[3], SHADOW_HZ[b.kind]);
    switch (b.kind) {
      case 'stockpile': {
        box(g, x + 0.08, y + 0.08, h, 0.84, 0.84, 0.07, COLORS.wood);
        for (const [px, py] of [
          [0.12, 0.12],
          [0.82, 0.12],
          [0.12, 0.82],
          [0.82, 0.82],
        ]) {
          box(g, x + px, y + py, h + 0.07, 0.07, 0.07, 0.14, COLORS.woodD);
        }
        plankStack(g, x + 0.18, y + 0.3, h + 0.07);
        barrel(g, x + 0.6, y + 0.55, h + 0.07);
        break;
      }
      case 'pitsaw': {
        this.drawPitsaw(g, b, h);
        break;
      }
      case 'waterwheel': {
        this.drawWaterwheel(g, state, b, h, t);
        break;
      }
      case 'sawmill': {
        const powered = b.powered ?? isPoweredAt(state, b.tx, b.ty);
        const working = powered && (b.input.log ?? 0) > 0;
        // timber mill-house on a stone footing, under slate
        box(g, x + 0.06, y + 0.12, h, 0.88, 0.78, 0.16, COLORS.stone);
        box(g, x + 0.1, y + 0.16, h + 0.16, 0.8, 0.7, 0.68, COLORS.wood);
        roof(g, x + 0.04, y + 0.1, h + 0.84, 0.92, 0.82, 0.42, COLORS.slate);
        faceWindow(g, { x: x + 0.52, y: y + 0.86, h }, { x: x + 0.9, y: y + 0.86, h }, 0.32, 0.6, t, working);
        // seated on the near slope at the roof's actual surface height there, not at the eave
        chimney(g, x + 0.44, y + 0.66, h + 0.84 + roofHeightAt(0.42, 0.43, 0.68), t, 0.6, true, working);
        // sized and centred to fit its wall — teeth used to overhang the silhouette
        faceCog(g, project(x + 0.32, y + 0.87, h + 0.44), 'left', 5, powered ? -t * 1.1 : -0.4, COLORS.brass, COLORS.brassD);
        if ((b.input.log ?? 0) > 0) {
          box(g, x + 0.62, y + 0.86, h, 0.3, 0.12, 0.1, 0x9c6b3b);
          box(g, x + 0.66, y + 0.86, h + 0.1, 0.22, 0.12, 0.09, 0x8a5c33);
        }
        if ((b.output.plank ?? 0) > 0) plankStack(g, x + 0.04, y + 0.55, h, Math.min(4, Math.ceil((b.output.plank ?? 0) / 3)));
        break;
      }
      case 'blacksmith': {
        // brick walls (it holds fire) under a verdigris roof — the works' one strong hue break
        const lit = (b.delivered ?? 0) > 0;
        box(g, x + 0.08, y + 0.14, h, 0.84, 0.74, 0.8, COLORS.brick);
        roof(g, x + 0.02, y + 0.08, h + 0.8, 0.96, 0.86, 0.48, COLORS.verd);
        faceWindow(g, { x: x + 0.08, y: y + 0.88, h }, { x: x + 0.92, y: y + 0.88, h }, 0.22, 0.6, t, lit);
        chimney(g, x + 0.44, y + 0.66, h + 0.8 + roofHeightAt(0.48, 0.44, 0.67), t, 0.72, true, lit);
        // anvil on a block out front
        box(g, x + 0.72, y + 0.86, h, 0.14, 0.1, 0.1, COLORS.woodD);
        box(g, x + 0.7, y + 0.85, h + 0.1, 0.18, 0.12, 0.07, COLORS.iron);
        break;
      }
      case 'clamp': {
        const working = (b.input.log ?? 0) > 0 || b.progress > 0;
        box(g, x + 0.12, y + 0.12, h, 0.76, 0.76, 0.3, COLORS.earth);
        box(g, x + 0.24, y + 0.24, h + 0.3, 0.52, 0.52, 0.26, COLORS.earthT);
        box(g, x + 0.36, y + 0.36, h + 0.56, 0.28, 0.28, 0.18, COLORS.earth);
        // turf seams
        const s1 = project(x + 0.5, y + 0.88, h + 0.15);
        g.rect(s1.x - 9, s1.y, 18, 1).fill({ color: COLORS.earthD, alpha: 0.7 });
        if (working) {
          for (const [vx, vy] of [
            [0.28, 0.8],
            [0.62, 0.86],
            [0.82, 0.55],
          ]) {
            const vp = project(x + vx, y + vy, h + 0.18);
            g.circle(vp.x, vp.y, 1.6).fill({ color: COLORS.ember, alpha: 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + vx * 9)) });
          }
          const cap = project(x + 0.5, y + 0.5, h + 0.74);
          smoke(g, cap.x, cap.y, t, 6, 34, COLORS.soot, 0.45);
        } else {
          const vp = project(x + 0.5, y + 0.5, h + 0.74);
          g.circle(vp.x, vp.y, 2).fill({ color: COLORS.earthXD });
        }
        break;
      }
      case 'incline': {
        this.drawIncline(g, state, b, h);
        break;
      }
      case 'furnace': {
        this.drawFurnace(g, b, h, t);
        break;
      }
      case 'rail': {
        this.drawRail(g, b, h, conn);
        break;
      }
      case 'railDock': {
        this.drawRailDock(g, b, h, t);
        break;
      }
      case 'flumeHead':
      case 'flume': {
        this.drawFlume(g, state, b, h, t, conn);
        break;
      }
    }
  }

  private drawPitsaw(g: Graphics, b: Building, h: number): void {
    const x = b.tx;
    const y = b.ty;
    // the pit itself
    const inset = 0.2;
    g.poly(
      flat([
        project(x + inset, y + inset, h),
        project(x + 1 - inset, y + inset, h),
        project(x + 1 - inset, y + 1 - inset, h),
        project(x + inset, y + 1 - inset, h),
      ]),
    ).fill({ color: COLORS.earthXD });
    trestleBent(g, x + 0.22, y + 0.5, h, 0.42, 1, 0);
    trestleBent(g, x + 0.78, y + 0.5, h, 0.42, 1, 0);
    const working = (b.input.log ?? 0) > 0;
    // the log across the pit
    box(g, x + 0.1, y + 0.42, h + 0.42, 0.8, 0.16, 0.12, 0x9c6b3b);
    const le = project(x + 0.1, y + 0.5, h + 0.5);
    g.ellipse(le.x, le.y, 2.5, 2).fill({ color: 0xc9a87a });
    // the saw blade, stroking when fed
    const cx = project(x + 0.5, y + 0.55, h + 0.42);
    const stroke = working ? Math.sin((b.progress / 400) * Math.PI * 2) * 3 : 0;
    g.rect(cx.x - 1, cx.y + 1 + stroke, 2, 13).fill({ color: COLORS.ironL });
    g.rect(cx.x - 3, cx.y - 1 + stroke, 6, 2).fill({ color: COLORS.woodD });
    // sawdust
    const sd = project(x + 0.62, y + 0.72, h);
    g.ellipse(sd.x, sd.y, 5, 2.5).fill({ color: 0xc2a06a, alpha: 0.8 });
    if ((b.output.plank ?? 0) > 0) plankStack(g, x + 0.06, y + 0.72, h, 2);
  }

  private drawWaterwheel(g: Graphics, state: GameState, b: Building, h: number, t: number): void {
    const x = b.tx;
    const y = b.ty;
    const wn = waterNeighbour(state.tiles, b.tx, b.ty);
    const dx = wn ? wn.tx - b.tx : 0;
    const dy = wn ? wn.ty - b.ty : 1;
    const face: Face = dx !== 0 ? 'right' : 'left';
    // wheel plane sits on the water-side wall, overhanging the channel
    const wc =
      dx !== 0
        ? project(x + (dx > 0 ? 1.04 : -0.04), y + 0.5, h + 0.42)
        : project(x + 0.5, y + (dy > 0 ? 1.04 : -0.04), h + 0.42);
    // support posts flanking the wheel along the wall
    const posts =
      dx !== 0
        ? [project(x + (dx > 0 ? 0.92 : 0.08), y + 0.12, h), project(x + (dx > 0 ? 0.92 : 0.08), y + 0.88, h)]
        : [project(x + 0.12, y + (dy > 0 ? 0.92 : 0.08), h), project(x + 0.88, y + (dy > 0 ? 0.92 : 0.08), h)];
    for (const p of posts) {
      g.rect(p.x - 1.5, p.y - 20, 3, 20).fill({ color: COLORS.woodD });
    }
    g.moveTo(posts[0].x, posts[0].y - 18)
      .lineTo(wc.x, wc.y)
      .lineTo(posts[1].x, posts[1].y - 18)
      .stroke({ width: 2, color: COLORS.wood });
    faceWheel(g, wc, face, 15, t * 1.3);
    // verdigris bearing plate on the wet side; the shaft it drives stays brass
    g.circle(wc.x, wc.y, 4.4).fill({ color: COLORS.verdD });
    g.circle(wc.x, wc.y, 3.2).fill({ color: COLORS.verd });
    g.circle(wc.x, wc.y, 1.6).fill({ color: COLORS.brass });
    // splash at the dipping paddles
    const sp = { x: wc.x, y: wc.y + 17 };
    for (let i = 0; i < 3; i++) {
      const f = (t * 1.2 + i / 3) % 1;
      g.circle(sp.x - 6 + i * 6, sp.y - f * 5, 1.2).fill({ color: 0xdff0f6, alpha: (1 - f) * 0.6 });
    }
  }

  private drawFurnace(g: Graphics, b: Building, h: number, t: number): void {
    const x = b.tx;
    const y = b.ty;
    const heat = Math.max(0, Math.min(1, (b.heat ?? 0) / 100));
    // brick hearth course carrying an iron stack — the fire lives in the brick
    box(g, x + 0.06, y + 0.06, h, 0.88, 0.88, 0.26, COLORS.brick);
    box(g, x + 0.1, y + 0.1, h + 0.26, 0.8, 0.8, 0.46, COLORS.iron);
    box(g, x + 0.19, y + 0.19, h + 0.72, 0.62, 0.62, 0.72, COLORS.iron);
    box(g, x + 0.27, y + 0.27, h + 1.44, 0.46, 0.46, 0.36, COLORS.iron);
    // brass hoop bands, each wrapping the stage it belongs to
    for (const bd of [
      { i: 0.1, s: 0.8, z: 0.32 },
      { i: 0.19, s: 0.62, z: 1.0 },
      { i: 0.27, s: 0.46, z: 1.62 },
    ]) {
      bandAround(g, x + bd.i, y + bd.i, h, bd.s, bd.s, bd.z, COLORS.brass, 2, COLORS.brassD);
    }
    chimney(g, x + 0.5, y + 0.5, h + 1.8, t, 0.55, false, heat > 0.15);
    if (heat > 0.5) {
      const cap = project(x + 0.5, y + 0.5, h + 2.35);
      smoke(g, cap.x + 4, cap.y + 2, t + 0.4, 4, 30, COLORS.soot, 0.3);
    }
    // Tap-hole, in the brick hearth course — a blast furnace taps from its hearth, and that is
    // exactly the course the brick adds. It also used to straddle the brick/iron seam and sit
    // half-buried in the plinth, which stands 0.04 proud of the iron above it.
    const A = (u: number, z: number) => project(x + 0.28 + u * 0.44, y + 0.94, h + 0.03 + z * 0.2);
    const glow = project(x + 0.5, y + 0.94, h + 0.12);
    const relightFlicker = (b.relighting ?? 0) > 0 && Math.sin(t * 14) > 0;
    if (heat > 0.04 || relightFlicker) {
      // Layered falloff. A single wide circle at this alpha read as a hard orange disc spilling
      // out past the furnace rather than as light coming off the tap-hole.
      for (const [r, a] of [
        [3.5 + 5.5 * heat, 0.1 + 0.16 * heat],
        [2.2 + 3.4 * heat, 0.12 + 0.18 * heat],
        [1.2 + 1.8 * heat, 0.14 + 0.2 * heat],
      ]) {
        g.circle(glow.x, glow.y, r).fill({ color: COLORS.ember, alpha: a });
      }
      g.poly(flat([A(0, 0), A(1, 0), A(1, 0.8), A(0.5, 1), A(0, 0.8)])).fill({ color: COLORS.emberD });
      g.poly(flat([A(0.16, 0.1), A(0.84, 0.1), A(0.84, 0.68), A(0.5, 0.85), A(0.16, 0.68)])).fill({
        color: heat > 0.6 ? COLORS.emberH : COLORS.ember,
      });
    } else {
      g.poly(flat([A(0, 0), A(1, 0), A(1, 0.8), A(0.5, 1), A(0, 0.8)])).fill({ color: 0x1a1512 });
    }
    // on the iron stage's wall plane (y+0.9) and clear of the brick plinth's top at h+0.26
    faceCog(g, project(x + 0.5, y + 0.9, h + 0.5), 'left', 6, heat > 0.04 ? t * 0.7 : 0.3, COLORS.brass, COLORS.brassD);
  }

  private drawIncline(g: Graphics, state: GameState, b: Building, h: number): void {
    const x = b.tx;
    const y = b.ty;
    const drop = CARD.find((d) => heightAt(state.tiles, b.tx + d.dx, b.ty + d.dy) < h) ?? { dx: 0, dy: 1 };
    const nh = heightAt(state.tiles, b.tx + drop.dx, b.ty + drop.dy);
    const cx = x + 0.5;
    const cy = y + 0.5;
    const S = { x: cx - drop.dx * 0.25, y: cy - drop.dy * 0.25, h };
    const E = { x: cx + drop.dx * 0.95, y: cy + drop.dy * 0.95, h: nh };
    const px = -drop.dy * 0.13;
    const py = drop.dx * 0.13;
    const at = (f: number, side: number) =>
      project(S.x + (E.x - S.x) * f + px * side, S.y + (E.y - S.y) * f + py * side, S.h + (E.h - S.h) * f);
    // sleepers then rails
    for (let k = 0; k <= 5; k++) {
      const a = at(k / 5, 1.3);
      const bpt = at(k / 5, -1.3);
      g.moveTo(a.x, a.y).lineTo(bpt.x, bpt.y).stroke({ width: 2, color: COLORS.woodD });
    }
    for (const side of [1, -1]) {
      const a = at(0, side);
      const bpt = at(1, side);
      g.moveTo(a.x, a.y).lineTo(bpt.x, bpt.y).stroke({ width: 2, color: COLORS.ironL });
    }
    // top platform + winding drum
    box(g, x + 0.3 - drop.dx * 0.28, y + 0.3 - drop.dy * 0.28, h, 0.4, 0.4, 0.12, COLORS.wood);
    const drum = project(cx - drop.dx * 0.34, cy - drop.dy * 0.34, h + 0.34);
    g.rect(drum.x - 4, drum.y - 3, 8, 6).fill({ color: COLORS.woodD });
    g.circle(drum.x, drum.y - 4, 3).fill({ color: COLORS.brass });
    // the cart, shuttling while there's ore to move
    const busy = (b.input.ore ?? 0) > 0 || (b.output.ore ?? 0) > 0;
    const f = busy ? 1 - Math.max(0, Math.min(1, (b.inclineTimer ?? 0) / INCLINE_INTERVAL_MS)) : 0.08;
    const cp = at(f, 0);
    g.rect(cp.x - 5, cp.y - 6, 10, 6).fill({ color: COLORS.iron });
    g.rect(cp.x - 5, cp.y - 6, 10, 1.5).fill({ color: COLORS.ironL });
    if ((b.input.ore ?? 0) > 0 && f < 0.5) {
      g.circle(cp.x - 1, cp.y - 7, 2).fill({ color: RESOURCE_COLORS.ore });
      g.circle(cp.x + 2, cp.y - 6.5, 1.6).fill({ color: RESOURCE_COLORS.ore });
    }
    // buffer heaps: top = input, bottom = output
    const heap = (wx: number, wy: number, hh: number, n: number) => {
      for (let i = 0; i < Math.min(5, n); i++) {
        const p = project(wx + (i % 3) * 0.12, wy + Math.floor(i / 3) * 0.12, hh);
        g.circle(p.x, p.y - 2, 2).fill({ color: RESOURCE_COLORS.ore });
      }
    };
    heap(x + 0.14 - drop.dx * 0.2, y + 0.14 - drop.dy * 0.2, h, b.input.ore ?? 0);
    heap(x + 0.4 + drop.dx * 1.0, y + 0.4 + drop.dy * 1.0, nh, b.output.ore ?? 0);
  }

  // ---------------- the plateway ----------------
  // A track piece: a recessed ballast bed (so the route reads as a ribbon at 1x instead of
  // dissolving into ground clutter), timber sleepers, and two iron edge-rails. A corner sweeps
  // its rails through the tile centre rather than meeting at a right angle — in dimetric a
  // mitred corner is very visible and a real quarter-curve costs nothing.
  private drawRail(g: Graphics, b: Building, h: number, conn?: FlumeConn): void {
    const x = b.tx;
    const y = b.ty;
    const cx = x + 0.5;
    const cy = y + 0.5;
    const dirs: Dir[] = [];
    for (const d of [...(conn?.ins ?? []), ...(conn?.outs ?? [])]) {
      if (!dirs.some((e) => e.dx === d.dx && e.dy === d.dy)) dirs.push(d);
    }
    if (dirs.length === 0) dirs.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });

    // ballast bed, one flat mass across every connected direction
    for (const d of dirs) {
      const px = -d.dy * 0.26;
      const py = d.dx * 0.26;
      g.poly(
        flat([
          project(cx + px, cy + py, h),
          project(cx + d.dx * 0.5 + px, cy + d.dy * 0.5 + py, h),
          project(cx + d.dx * 0.5 - px, cy + d.dy * 0.5 - py, h),
          project(cx - px, cy - py, h),
        ]),
      ).fill({ color: COLORS.stoneD });
    }
    // sleepers, laid across the run
    for (const d of dirs) {
      const px = -d.dy * 0.2;
      const py = d.dx * 0.2;
      for (const f of [0.2, 0.36, 0.5]) {
        const a = project(cx + d.dx * f + px, cy + d.dy * f + py, h + 0.01);
        const e = project(cx + d.dx * f - px, cy + d.dy * f - py, h + 0.01);
        g.moveTo(a.x, a.y).lineTo(e.x, e.y).stroke({ width: 2, color: COLORS.woodD });
      }
    }
    // Rails. The offset has to come from a consistent TRAVERSAL through the tile, not from each
    // half's own outward direction: on a straight run the two dirs are opposite, so a per-direction
    // perpendicular flips sign and draws the same rail on either side of the centre line — every
    // tile became an X. Travel enters along -d1 and leaves along d2, and both ends take the
    // perpendicular of travel, so a straight run is one straight rail and a bend pairs inner with
    // inner. Sampled in tile space and projected: `project` is linear in (wx, wy) at fixed height.
    for (const side of [1, -1]) {
      const scr = railPoints(cx, cy, dirs, side).map((q) => project(q.x, q.y, h + 0.04));
      const stroke = (dy: number, w: number, col: number) => {
        g.moveTo(scr[0].x, scr[0].y + dy);
        for (const q of scr.slice(1)) g.lineTo(q.x, q.y + dy);
        g.stroke({ width: w, color: col });
      };
      stroke(0, 2, COLORS.ironXD);
      // a hairline on the sun side — iron polished by use, not a pale tube
      stroke(-1.2, 0.8, COLORS.iron);
    }
  }

  private drawRailDock(g: Graphics, b: Building, h: number, t: number): void {
    const x = b.tx;
    const y = b.ty;
    // a low timber loading stage with an iron-shod edge and a lamp post
    box(g, x + 0.1, y + 0.1, h, 0.8, 0.8, 0.16, COLORS.wood);
    box(g, x + 0.14, y + 0.14, h + 0.16, 0.72, 0.72, 0.04, COLORS.woodL);
    bandAround(g, x + 0.1, y + 0.1, h, 0.8, 0.8, 0.17, COLORS.ironD, 2);
    // corner bollards
    for (const [px, py] of [
      [0.13, 0.13],
      [0.79, 0.13],
      [0.13, 0.79],
    ]) {
      box(g, x + px, y + py, h + 0.2, 0.08, 0.08, 0.16, COLORS.ironD);
    }
    // a gas lamp on the fourth corner — the dock is where you stand at dusk
    box(g, x + 0.78, y + 0.78, h + 0.2, 0.07, 0.07, 0.5, COLORS.iron);
    const lamp = project(x + 0.815, y + 0.815, h + 0.76);
    g.circle(lamp.x, lamp.y, 4).fill({ color: COLORS.glow, alpha: 0.16 });
    g.circle(lamp.x, lamp.y, 2.2).fill({ color: 0xffcd78, alpha: 0.75 + 0.25 * Math.sin(t * 3) });
    // what's waiting to leave, stacked on the stage
    const waiting = Object.entries(b.input).filter(([, n]) => (n ?? 0) > 0);
    let i = 0;
    for (const [res, n] of waiting) {
      for (let k = 0; k < Math.min(3, n ?? 0); k++) {
        const p = project(x + 0.3 + i * 0.22, y + 0.35, h + 0.2 + k * 0.05);
        g.rect(p.x - 4, p.y - 3 - k * 2, 8, 3).fill({ color: RESOURCE_COLORS[res as ResourceKind] });
      }
      i++;
      if (i >= 2) break;
    }
  }

  // The wagon and its horse, drawn at the wagon's position along the owning dock's route.
  private drawWagon(g: Graphics, state: GameState, dock: Building, t: number): void {
    const w = dock.wagon;
    if (!w || !dock.path || dock.path.length < 2) return;
    const i = Math.max(0, Math.min(dock.path.length - 2, Math.floor(w.pos)));
    const f = Math.max(0, Math.min(1, w.pos - i));
    const a = dock.path[i];
    const bp = dock.path[i + 1];
    const wx = a.tx + (bp.tx - a.tx) * f + 0.5;
    const wy = a.ty + (bp.ty - a.ty) * f + 0.5;
    const h = heightAt(state.tiles, a.tx, a.ty);
    const moving = w.dwell <= 0;
    const sway = moving ? Math.sin(t * 7) * 0.012 : 0;
    // Track is always axis-aligned, so the wagon is built in WORLD space from the kit and picks
    // up the same face shading as every building. Drawn as a screen-aligned rect it sat visibly
    // off the rails on any run that wasn't heading screen-right.
    const dx = (bp.tx - a.tx) * w.dir;
    const dy = (bp.ty - a.ty) * w.dir;
    const alongX = dx !== 0;
    const halfL = 0.3;
    const halfW = 0.17;
    const ex = alongX ? halfL : halfW;
    const ey = alongX ? halfW : halfL;

    blobShadow(g, wx, wy, h, 0.2, 0.5, 0.22);
    // wheels, on the rails
    for (const s of [1, -1]) {
      const gx = alongX ? 0.16 : 0.14 * s;
      const gy = alongX ? 0.14 * s : 0.16;
      for (const e2 of [1, -1]) {
        const p2 = project(wx + (alongX ? gx * e2 : gx), wy + (alongX ? gy : gy * e2), h + 0.04);
        g.circle(p2.x, p2.y, 2).fill({ color: COLORS.ironXD });
      }
    }
    // chaldron body — timber, iron-bound
    box(g, wx - ex, wy - ey + sway, h + 0.06, ex * 2, ey * 2, 0.2, COLORS.wood);
    bandAround(g, wx - ex, wy - ey + sway, h + 0.06, ex * 2, ey * 2, 0.19, COLORS.ironD, 1.5);
    // the lot rides visible in the bed — same stacking language as a ground item
    if (w.cargo && w.count > 0) {
      const stack = Math.min(3, Math.ceil(w.count / 3));
      for (let k = 0; k < stack; k++) {
        box(
          g,
          wx - ex * 0.7,
          wy - ey * 0.7 + sway,
          h + 0.26 + k * 0.06,
          ex * 1.4,
          ey * 1.4,
          0.06,
          RESOURCE_COLORS[w.cargo],
        );
      }
    }
    // the horse, ahead on the trace — the clearest statement that this is not yet steam
    const hx = wx + dx * 0.66;
    const hy = wy + dy * 0.66;
    const hp = project(hx, hy, h);
    const step = moving ? Math.sin(t * 6) * 1.3 : 0;
    blobShadow(g, hx, hy, h, 0.13, 0.7, 0.2);
    const tr0 = project(wx + dx * 0.3, wy + dy * 0.3, h + 0.2);
    const tr1 = project(hx - dx * 0.16, hy - dy * 0.16, h + 0.18);
    g.moveTo(tr0.x, tr0.y).lineTo(tr1.x, tr1.y).stroke({ width: 1, color: COLORS.woodD });
    g.rect(hp.x - 3, hp.y - 6 + step, 2, 6).fill({ color: 0x53381f }); // legs
    g.rect(hp.x + 1, hp.y - 6 - step, 2, 6).fill({ color: 0x53381f });
    box(g, hx - 0.16, hy - 0.1, h + 0.26, 0.32, 0.2, 0.18, 0x6b4a30); // barrel
    const fwd = (dx - dy) > 0 ? 1 : -1;
    g.rect(hp.x + fwd * 4 - 1.5, hp.y - 19, 3, 6).fill({ color: 0x6b4a30 }); // neck
    g.rect(hp.x + fwd * 5 - 2, hp.y - 21, 5, 3).fill({ color: 0x7d5738 }); // head
  }

  private drawFlume(g: Graphics, state: GameState, b: Building, h: number, t: number, conn?: FlumeConn): void {
    const x = b.tx;
    const y = b.ty;
    const cx = x + 0.5;
    const cy = y + 0.5;
    const isHead = b.kind === 'flumeHead';
    const wn = isHead ? waterNeighbour(state.tiles, b.tx, b.ty) : null;
    const dirs: Array<{ d: Dir; out: boolean }> = [];
    for (const d of conn?.ins ?? []) dirs.push({ d, out: false });
    for (const d of conn?.outs ?? []) dirs.push({ d, out: true });
    if (isHead && wn) {
      const wd = { dx: wn.tx - b.tx, dy: wn.ty - b.ty };
      if (!dirs.some((e) => e.d.dx === wd.dx && e.d.dy === wd.dy)) dirs.push({ d: wd, out: false });
    }
    if (dirs.length === 0) dirs.push({ d: { dx: 1, dy: 0 }, out: false }, { d: { dx: -1, dy: 0 }, out: false });

    // This tile's deck, and the elevation the trough hands over to each neighbour at their
    // shared edge — halfway between the two decks, so consecutive pieces meet exactly.
    const deck = this.flumeDeck.get(idx(x, y)) ?? h + FLUME_DECK_LIFT;
    const edgeZ = (d: Dir): number => {
      const nd = this.flumeDeck.get(idx(x + d.dx, y + d.dy));
      return nd === undefined ? deck : (deck + nd) / 2;
    };

    // Trestles: legs from the ground up to the deck, so they GROW under a flying span instead of
    // staying a fixed stub. A tall span gets a bent under its middle as well as its edges.
    for (const { d } of dirs) {
      const f = 0.34;
      const z = deck + (edgeZ(d) - deck) * (f / 0.5);
      trestleBent(g, cx + d.dx * f, cy + d.dy * f, h, z - h, d.dx, d.dy);
    }
    if (deck - h > 0.55) {
      const d0 = dirs[0].d;
      trestleBent(g, cx, cy, h, deck - h, d0.dx, d0.dy);
    }

    // trough halves: bed, water, rails — sloping from the tile centre out to each edge
    const half = (d: Dir, water: boolean, flowOut: boolean) => {
      const px = -d.dy;
      const py = d.dx;
      const ez = edgeZ(d);
      const quad = (wHalf: number, dz: number) =>
        flat([
          project(cx + px * wHalf, cy + py * wHalf, deck + dz),
          project(cx + d.dx * 0.5 + px * wHalf, cy + d.dy * 0.5 + py * wHalf, ez + dz),
          project(cx + d.dx * 0.5 - px * wHalf, cy + d.dy * 0.5 - py * wHalf, ez + dz),
          project(cx - px * wHalf, cy - py * wHalf, deck + dz),
        ]);
      g.poly(quad(0.19, 0)).fill({ color: COLORS.woodD });
      if (water) g.poly(quad(0.12, 0.04)).fill({ color: COLORS.water1 });
      for (const side of [1, -1]) {
        const a = project(cx + px * 0.19 * side, cy + py * 0.19 * side, deck + 0.1);
        const e = project(cx + d.dx * 0.5 + px * 0.19 * side, cy + d.dy * 0.5 + py * 0.19 * side, ez + 0.1);
        g.moveTo(a.x, a.y).lineTo(e.x, e.y).stroke({ width: 2, color: COLORS.wood });
      }
      if (water) {
        for (let i = 0; i < 2; i++) {
          const f0 = (t * 0.7 + i / 2 + tileNoise(x + i, y)) % 1;
          // in-halves flow edge→centre, out-halves centre→edge
          const off = flowOut ? 0.5 * f0 : 0.5 - 0.5 * f0;
          const z = deck + (ez - deck) * (off / 0.5);
          const p = project(cx + d.dx * off, cy + d.dy * off, z + 0.05);
          g.rect(p.x - 1, p.y - 1, 3, 1.5).fill({ color: COLORS.water2, alpha: 0.8 });
        }
      }
    };
    for (const { d, out } of dirs) half(d, true, out);

    if (isHead) {
      // head-gate: two posts flanking the trough at the intake edge, a crossbeam carrying the
      // raised gate board (water runs under it), and the brass gate screw on top.
      const gd = wn ? { dx: wn.tx - b.tx, dy: wn.ty - b.ty } : { dx: 0, dy: -1 };
      const gpx = -gd.dy * 0.24;
      const gpy = gd.dx * 0.24;
      const gx = cx + gd.dx * 0.4;
      const gy = cy + gd.dy * 0.4;
      // posts stand on the ground and carry the deck, however high that has risen
      const post = deck - h + 0.5;
      box(g, gx + gpx - 0.04, gy + gpy - 0.04, h, 0.08, 0.08, post, COLORS.woodD);
      box(g, gx - gpx - 0.04, gy - gpy - 0.04, h, 0.08, 0.08, post, COLORS.woodD);
      if (gd.dx !== 0) box(g, gx - 0.04, gy - 0.28, deck + 0.42, 0.08, 0.56, 0.08, COLORS.wood);
      else box(g, gx - 0.28, gy - 0.04, deck + 0.42, 0.56, 0.08, 0.08, COLORS.wood);
      const gb = (s: number, z: number) => project(gx + gpx * s * 0.8, gy + gpy * s * 0.8, deck + z);
      // the gate board is bound in verdigris — it stands in the water all day
      g.poly(flat([gb(1, 0.08), gb(-1, 0.08), gb(-1, 0.3), gb(1, 0.3)])).fill({ color: COLORS.wood });
      g.poly(flat([gb(1, 0.08), gb(-1, 0.08), gb(-1, 0.3), gb(1, 0.3)])).stroke({ width: 1.5, color: COLORS.verdD, alpha: 0.9 });
      g.moveTo(gb(1, 0.19).x, gb(1, 0.19).y).lineTo(gb(-1, 0.19).x, gb(-1, 0.19).y).stroke({ width: 1, color: COLORS.verd });
      const scr = project(gx, gy, deck + 0.58);
      g.circle(scr.x, scr.y, 3).stroke({ width: 1.5, color: COLORS.brass });
      g.moveTo(scr.x - 3, scr.y).lineTo(scr.x + 3, scr.y).stroke({ width: 1, color: COLORS.brass });
      g.moveTo(scr.x, scr.y - 3).lineTo(scr.x, scr.y + 3).stroke({ width: 1, color: COLORS.brass });
      // churn where the water enters under the gate
      const sp = project(gx, gy, deck + 0.05);
      g.rect(sp.x - 3, sp.y, 6, 2).fill({ color: COLORS.water2, alpha: 0.5 + 0.3 * Math.sin(t * 8) });
    }
  }

  private drawPlayer(g: Graphics, state: GameState): void {
    const p = state.player;
    const h = this.playerHeight(state);
    const c = project(p.x, p.y, h);
    // facing, projected into screen space (world-space atan2 lies on an iso screen)
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    let sx = (fx - fy) * TILE_HALF_W;
    let sy = (fx + fy) * TILE_HALF_H;
    const sl = Math.hypot(sx, sy) || 1;
    sx /= sl;
    sy /= sl;

    // Walk cycle, driven by the player's own movement between frames — render-only, so the sim
    // keeps no animation state. Standing still, the phase holds and he breathes instead.
    const moved = Math.hypot(p.x - this.lastPx, p.y - this.lastPy);
    this.lastPx = p.x;
    this.lastPy = p.y;
    const walking = moved > 0.0004;
    if (walking) this.walkPhase += moved * 5.2;
    const swing = walking ? Math.sin(this.walkPhase) : 0;
    const bob = walking
      ? Math.abs(Math.cos(this.walkPhase)) * 1.1
      : Math.sin(state.timeMs / 700) * 0.35;

    blobShadow(g, p.x, p.y, h, 0.11, 1.05, 0.25);
    const by = c.y - bob; // body rides the bob; feet stay on the ground
    // legs, swinging out of phase
    g.rect(c.x - 3.5, c.y - 6 - swing * 1.6, 3, 6 + swing * 1.6).fill({ color: 0x2e2a26 });
    g.rect(c.x + 0.5, c.y - 6 + swing * 1.6, 3, 6 - swing * 1.6).fill({ color: 0x2e2a26 });
    // coat
    g.rect(c.x - 4.5, by - 15, 9, 10).fill({ color: 0x3e4652 });
    g.rect(c.x - 4.5, by - 15, 9, 2).fill({ color: 0x4d5766 });
    g.rect(c.x - 0.5, by - 13, 1, 7).fill({ color: COLORS.brassD }); // button line
    // arms swing opposite the legs
    g.rect(c.x - 5.5, by - 14 + swing * 1.4, 2, 6).fill({ color: 0x353d48 });
    g.rect(c.x + 3.5, by - 14 - swing * 1.4, 2, 6).fill({ color: 0x353d48 });
    // head + flat cap, brim toward facing
    g.circle(c.x, by - 18, 3.6).fill({ color: 0xf0d9a8 });
    g.rect(c.x - 4, by - 23, 8, 3).fill({ color: 0x5a4a34 });
    g.rect(c.x - 4 + (sx > 0 ? 4 : -2), by - 21, 6, 1.5).fill({ color: 0x4a3c2a });

    // the barrow, when laden — pushed ahead of the walker
    if (p.carry && p.carryCount > 0) {
      const bx = c.x + sx * 10;
      const by = c.y + sy * 5;
      g.ellipse(bx, by + 2, 5, 2).fill({ color: 0x000000, alpha: 0.2 });
      g.circle(bx, by, 2.5).stroke({ width: 1.5, color: COLORS.woodD });
      g.rect(bx - 5, by - 6, 10, 4).fill({ color: COLORS.wood });
      g.moveTo(bx - 5, by - 3).lineTo(c.x + sx * 2, c.y - 8).stroke({ width: 1.5, color: COLORS.woodD });
      const stack = Math.min(3, p.carryCount);
      for (let i = 0; i < stack; i++) {
        g.rect(bx - 4 + i, by - 9 - i * 2.5, 8, 2.5)
          .fill({ color: RESOURCE_COLORS[p.carry] })
          .stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      }
    }
    // action progress bar
    if (p.actionKind) {
      const dur = p.actionKind === 'chop' ? 1300 : 1600;
      const frac = Math.max(0, Math.min(1, p.actionProgress / dur));
      g.rect(c.x - 12, c.y - 32, 24, 4).fill({ color: 0x000000, alpha: 0.5 });
      g.rect(c.x - 12, c.y - 32, 24 * frac, 4).fill({ color: COLORS.action });
    }
  }

  // ---------------- guidance (power viz, status, prompts, delivery) ----------------
  private drawGuidance(state: GameState, view: ViewState): void {
    const g = this.guidanceGfx;
    g.clear();
    const t = state.timeMs / 1000;
    const tiles = state.tiles;
    const anchor = (b: Building, dz = 0) =>
      project(b.tx + 0.5, b.ty + 0.5, heightAt(tiles, b.tx, b.ty) + BADGE_Z[b.kind] + dz);

    // 1) line shafts: wheel → each powered sawmill in reach, sagging like a real belt
    for (const w of state.buildings) {
      if (w.kind !== 'waterwheel') continue;
      const wc = project(w.tx + 0.5, w.ty + 0.5, heightAt(tiles, w.tx, w.ty) + 0.9);
      for (const m of state.buildings) {
        if (m.kind !== 'sawmill') continue;
        if (Math.hypot(m.tx - w.tx, m.ty - w.ty) > WATERWHEEL_POWER_RADIUS) continue;
        if (!isPoweredAt(state, m.tx, m.ty)) continue;
        const mc = project(m.tx + 0.5, m.ty + 0.5, heightAt(tiles, m.tx, m.ty) + 1.0);
        // Posts carry the shaft over the ground it crosses — without them a line shaft reads as a
        // gold line floating across bare earth.
        for (const f of [0.34, 0.66]) {
          const wx = w.tx + 0.5 + (m.tx - w.tx) * f;
          const wy = w.ty + 0.5 + (m.ty - w.ty) * f;
          const gh = heightAt(tiles, Math.floor(wx), Math.floor(wy));
          const top = shaftPoint(wc, mc, f);
          const foot = project(wx, wy, gh);
          if (foot.y - top.y < 4) continue; // shaft already sits on the ground here
          blobShadow(g, wx, wy, gh, 0.07, (foot.y - top.y) / HEIGHT_STEP, 0.18);
          g.moveTo(top.x, top.y).lineTo(foot.x, foot.y).stroke({ width: 2, color: COLORS.woodD });
          g.moveTo(top.x - 4, top.y + 3).lineTo(foot.x, foot.y).stroke({ width: 1, color: COLORS.wood });
          g.moveTo(top.x + 4, top.y + 3).lineTo(foot.x, foot.y).stroke({ width: 1, color: COLORS.wood });
        }
        shaft(g, wc, mc, t, true);
      }
    }

    // 2) delivery highlights while carrying
    const carry = state.player.carry;
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 3.2));
    if (carry && state.player.carryCount > 0) {
      for (const b of state.buildings) {
        if (!isDropTargetKind(b, carry)) continue;
        const inReach = Math.hypot(state.player.x - (b.tx + 0.5), state.player.y - (b.ty + 0.5)) <= 1.5;
        const c = anchor(b, 0.35);
        const col = b.kind === 'blacksmith' ? 0xffb347 : 0x8fe388;
        const a = inReach ? 1 : 0.4;
        g.poly([c.x - 4, c.y - 5, c.x + 4, c.y - 5, c.x, c.y]).fill({ color: col, alpha: a });
      }
    }

    // 3) machine status badges — attention states flash and show WHAT they want
    for (const b of state.buildings) {
      const st = buildingStatus(state, b);
      if (!st) continue;
      const c = anchor(b);
      const col = STATUS_COLOR[st.key];
      if (st.key === 'running') {
        g.circle(c.x + 10, c.y + 2, 2).fill({ color: col, alpha: 0.85 });
        continue;
      }
      this.drawBadge(g, c.x, c.y, st.key, col, pulse);
      if (st.want) {
        g.rect(c.x + 9, c.y - 5, 6, 6)
          .fill({ color: RESOURCE_COLORS[st.want], alpha: 0.5 + 0.5 * pulse })
          .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
      }
    }

    // 3b) delivery marker over the blacksmith while it's the active goal
    const active = state.letters.find((l) => l.id === state.activeLetterId);
    if (active && active.sink === 'blacksmith') {
      for (const b of state.buildings) {
        if (b.kind !== 'blacksmith') continue;
        const c = anchor(b, 0.75);
        g.rect(c.x - 3, c.y - 12, 6, 6).fill({ color: RESOURCE_COLORS.iron });
        g.poly([c.x - 5, c.y - 4, c.x + 5, c.y - 4, c.x, c.y + 2]).fill({ color: 0xffb347, alpha: 0.4 + 0.6 * pulse });
      }
    }

    // 4) selection ring
    if (view.selectedBuildingId != null) {
      const b = state.buildings.find((x) => x.id === view.selectedBuildingId);
      if (b) {
        const h = heightAt(tiles, b.tx, b.ty);
        g.poly(flat(tileDiamond(b.tx, b.ty, h))).stroke({ width: 2, color: 0xf2c14e, alpha: 0.95 });
      }
    }

    // 5) contextual prompt above the player
    const prompt = promptFor(state);
    if (prompt) {
      const pc = project(state.player.x, state.player.y, this.playerHeight(state));
      this.promptText.text = prompt;
      const s = 1 / Math.max(1, view.zoom); // stay screen-sized when zoomed in
      this.promptText.x = pc.x;
      this.promptText.y = pc.y - 52; // clear of machine status badges
      this.promptText.scale.set(s);
      this.promptText.visible = true;
      // A backing plate, drawn into the guidance layer (which sits under promptText). Bare
      // stroked text on open ground read as debug output rather than as an offered verb.
      const pw = this.promptText.width + 10 * s;
      const ph = this.promptText.height + 5 * s;
      g.roundRect(pc.x - pw / 2, pc.y - 52 - ph, pw, ph, 3 * s)
        .fill({ color: 0x11151c, alpha: 0.82 })
        .stroke({ width: 1, color: COLORS.brassD, alpha: 0.7 });
    } else {
      this.promptText.visible = false;
    }
  }

  private drawBadge(g: Graphics, x: number, y: number, key: StatusKey, col: number, pulse = 1): void {
    const a = 0.45 + 0.55 * pulse; // attention badges flash
    g.roundRect(x - 8, y - 6, 16, 12, 3).fill({ color: 0x11151c, alpha: 0.92 }).stroke({ width: 1, color: col, alpha: a });
    const cx = x;
    const cy = y;
    switch (key) {
      case 'noPower':
        g.moveTo(cx - 4, cy - 3).lineTo(cx + 4, cy + 3).stroke({ width: 1.4, color: col, alpha: a });
        g.poly([cx - 1, cy - 3, cx - 3, cy, cx, cy, cx - 2, cy + 3]).stroke({ width: 1, color: col, alpha: a });
        break;
      case 'needsFuel':
        // a flickering flame — the Factorio "out of fuel" alert
        g.poly([cx, cy - 4, cx + 3, cy + 1, cx + 1.5, cy + 3, cx - 1.5, cy + 3, cx - 3, cy + 1]).fill({ color: col, alpha: a });
        g.circle(cx, cy + 1, 1).fill({ color: 0xffe08a, alpha: a });
        break;
      case 'needsInput':
        g.poly([cx - 3, cy - 3, cx + 3, cy - 3, cx, cy + 3]).fill({ color: col, alpha: a });
        break;
      case 'outputFull':
        g.poly([cx - 3, cy + 3, cx + 3, cy + 3, cx, cy - 3]).fill({ color: col, alpha: a });
        break;
      case 'cold':
        g.circle(cx, cy, 2.4).fill({ color: col, alpha: a });
        g.moveTo(cx - 4, cy).lineTo(cx + 4, cy).stroke({ width: 1, color: col, alpha: a });
        g.moveTo(cx, cy - 4).lineTo(cx, cy + 4).stroke({ width: 1, color: col, alpha: a });
        break;
      default:
        break;
    }
  }

  // ---------------- ghost (placement preview) ----------------
  private drawGhost(state: GameState, view: ViewState): void {
    const g = this.ghostGfx;
    g.clear();
    if (view.mode !== 'build' || !view.buildKind || !view.hoverTile) {
      this.ghostGfx.alpha = 1;
      return;
    }
    const { tx, ty } = view.hoverTile;
    if (!inBounds(tx, ty)) return;
    const h = heightAt(state.tiles, tx, ty);
    // A placement lattice local to the cursor. The world carries no permanent grid any more, so
    // the grid appears only while it's information — and only where you're looking.
    const R = 6;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const gx = tx + dx;
        const gy = ty + dy;
        if (!inBounds(gx, gy)) continue;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        g.poly(flat(tileDiamond(gx, gy, heightAt(state.tiles, gx, gy)))).stroke({
          width: 1,
          color: COLORS.text,
          alpha: 0.16 * (1 - d / R),
        });
      }
    }
    const err = placementError(state, view.buildKind, tx, ty);
    const color = err ? COLORS.ghostBad : COLORS.ghostOk;
    g.poly(flat(tileDiamond(tx, ty, h)))
      .fill({ color, alpha: 0.3 })
      .stroke({ width: 2, color, alpha: 0.9 });
    // a live silhouette of the building itself
    this.ghostGfx.alpha = 0.6;
    const fake: Building = {
      id: -1,
      kind: view.buildKind,
      tx,
      ty,
      input: {},
      output: {},
      progress: 0,
      heat: 0,
      powered: true,
      delivered: 0,
      inclineTimer: 0,
    };
    this.drawBuilding(g, state, fake, state.timeMs / 1000);
    // waterwheel: show the power reach circle
    if (view.buildKind === 'waterwheel') {
      const c = project(tx + 0.5, ty + 0.5, h);
      g.ellipse(c.x, c.y, WATERWHEEL_POWER_RADIUS * TILE_HALF_W * 2 * 0.5, WATERWHEEL_POWER_RADIUS * TILE_HALF_H * 2 * 0.5).stroke({
        width: 1.5,
        color: COLORS.power,
        alpha: 0.5,
      });
    }
  }

  // ---------------- debug overlay ----------------
  private ensureLabels(n: number): void {
    while (this.overlayPool.length < n) {
      const t = new Text({ text: '', style: OVERLAY_STYLE });
      this.overlayLayer.addChild(t);
      this.overlayPool.push(t);
    }
    for (let i = 0; i < this.overlayPool.length; i++) this.overlayPool[i].visible = i < n;
  }

  private drawOverlay(state: GameState, view: ViewState): void {
    if (!view.overlay) {
      this.ensureLabels(0);
      return;
    }
    const labels: Array<{ x: number; y: number; text: string }> = [];
    labels.push({
      x: project(state.player.x, state.player.y, this.playerHeight(state)).x,
      y: project(state.player.x, state.player.y, this.playerHeight(state)).y - 44,
      text: `P (${state.player.x.toFixed(1)},${state.player.y.toFixed(1)}) carry:${state.player.carry ?? '-'}x${state.player.carryCount}`,
    });
    for (const b of state.buildings) {
      const h = heightAt(state.tiles, b.tx, b.ty);
      const c = project(b.tx + 0.5, b.ty + 0.5, h);
      const io: string[] = [];
      for (const [k, v] of Object.entries(b.input)) if (v) io.push(`i:${k}${v}`);
      for (const [k, v] of Object.entries(b.output)) if (v) io.push(`o:${k}${v}`);
      if (b.kind === 'furnace') io.push(`heat${Math.round(b.heat ?? 0)}${b.cold ? '(cold)' : ''}`);
      if (b.kind === 'sawmill') io.push(b.powered ? 'pwr' : 'NOPWR');
      labels.push({ x: c.x, y: c.y - 30, text: `${b.kind}@${b.tx},${b.ty} ${io.join(' ')}` });
    }
    this.ensureLabels(labels.length);
    for (let i = 0; i < labels.length; i++) {
      const t = this.overlayPool[i];
      if (t.text !== labels[i].text) t.text = labels[i].text;
      t.x = labels[i].x;
      t.y = labels[i].y;
      t.anchor.set(0.5, 1);
    }
  }

  // Screen (canvas CSS px) -> tile, accounting for camera + height. Frontmost hit wins.
  pickTile(clientX: number, clientY: number, state: GameState): { tx: number; ty: number } | null {
    const wsx = (clientX - this.world.x) / this.world.scale.x;
    const wsy = (clientY - this.world.y) / this.world.scale.y;
    let best: { tx: number; ty: number; key: number } | null = null;
    for (const { tx, ty } of this.drawOrder) {
      const h = state.tiles[idx(tx, ty)].height;
      if (pointInQuad({ x: wsx, y: wsy }, tileDiamond(tx, ty, h))) {
        const key = drawKey(tx, ty) * 10 + h;
        if (!best || key > best.key) best = { tx, ty, key };
      }
    }
    return best ? { tx: best.tx, ty: best.ty } : null;
  }

  get heightStep(): number {
    return HEIGHT_STEP;
  }

  // Instrument hook (ADR 002): the flume's deck elevation at a tile, so a verifier can read the
  // descent as numbers rather than judging pixels. Populated by the last rendered frame.
  flumeDeckAt(tx: number, ty: number): number | undefined {
    return this.flumeDeck.get(idx(tx, ty));
  }

  // Instrument hook (ADR 002): one rail's centreline through a tile in tile space, so a verifier
  // can prove the rails don't cross the track's centre line rather than judging pixels.
  railPointsAt(tx: number, ty: number, side: number): Array<{ x: number; y: number }> | null {
    const conn = this.railConns.get(idx(tx, ty));
    if (!conn) return null;
    const dirs: Dir[] = [];
    for (const d of [...conn.ins, ...conn.outs]) {
      if (!dirs.some((e) => e.dx === d.dx && e.dy === d.dy)) dirs.push(d);
    }
    if (dirs.length === 0) return null;
    return railPoints(tx + 0.5, ty + 0.5, dirs, side);
  }
}
