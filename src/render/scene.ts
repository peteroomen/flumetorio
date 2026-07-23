// PixiJS scene: the terraced valley, buildings, movers, items, and the player, drawn in the
// Plate III register — true-dimetric massing composed from the component kit (kit.ts), block
// earth, clean recessed water. Reads sim state (never mutates it) and the view state.
// Terrain is cached; everything that stands on it joins one back-to-front dynamic pass.

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Building, BuildingKind, GameState } from '@/lib/sim/types';
import { bandHeight, heightAt, idx, inBounds } from '@/lib/sim/world';
import { INCLINE_INTERVAL_MS, MAP_H, MAP_W, WATERWHEEL_POWER_RADIUS } from '@/lib/sim/constants';
import { placementError, waterNeighbour } from '@/lib/sim/buildings';
import { isPoweredAt } from '@/lib/sim/machines';
import { buildingStatus, isDropTargetKind, promptFor, type StatusKey } from '@/lib/sim/status';
import type { ViewState } from '@/ui/view';
import { drawKey, HEIGHT_STEP, pointInQuad, project, TILE_HALF_H, TILE_HALF_W, tileDiamond, type Pt } from './iso';
import {
  barrel,
  box,
  chimney,
  faceCog,
  faceWheel,
  faceWindow,
  flat,
  plankStack,
  roof,
  shaft,
  smoke,
  trestleBent,
  type Face,
} from './kit';
import { COLORS, RESOURCE_COLORS, shade, terrainColor, tileNoise } from './palette';

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
  private terrainGfx = new Graphics();
  private dynGfx = new Graphics();
  private guidanceGfx = new Graphics();
  private ghostGfx = new Graphics();
  private overlayLayer = new Container();
  private overlayPool: Text[] = [];
  private promptText = new Text({ text: '', style: PROMPT_STYLE });
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
    this.app.stage.addChild(this.skyGfx, this.world);

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
        g.poly(flat(tileDiamond(tx, ty, surf))).stroke({ width: 1, color: COLORS.water0, alpha: 0.5 });
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

      // Top face + block-earth dither.
      g.poly(flat(tileDiamond(tx, ty, h))).fill({ color: top });
      const n = tileNoise(tx, ty);
      const c0 = project(tx + 0.5, ty + 0.5, h);
      const spk = shade(top, 0.86);
      g.rect(c0.x - 10 + n * 14, c0.y - 4 + n * 6, 2, 2).fill({ color: spk });
      g.rect(c0.x + 4 - n * 10, c0.y + 2 - n * 5, 2, 2).fill({ color: spk });
      if (n > 0.6) g.rect(c0.x - 2 + n * 6, c0.y - 6 + n * 4, 2, 2).fill({ color: shade(top, 1.1) });
      g.poly(flat(tileDiamond(tx, ty, h))).stroke({ width: 1, color: shade(top, 0.78), alpha: 0.35 });
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
        const sp = project(ex, ey, d.toSurf);
        g.ellipse(sp.x, sp.y + 2, 5, 2).stroke({ width: 1, color: 0xdff0f6, alpha: 0.35 + 0.2 * Math.sin(t * 6) });
      }
    }

    const flumeConns = this.computeFlumeConns(state);

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
      entries.push({
        key: b.tx + b.ty + 1,
        draw: () => this.drawBuilding(g, state, b, t, flumeConns.get(idx(b.tx, b.ty))),
      });
    }
    for (const gi of state.ground) {
      const h = heightAt(tiles, gi.tx, gi.ty);
      entries.push({
        key: gi.tx + gi.ty + 1.05,
        draw: () => {
          const p = project(gi.tx + 0.5, gi.ty + 0.5, h);
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
      const ha = heightAt(tiles, a.tx, a.ty);
      const hb = heightAt(tiles, bp.tx, bp.ty);
      const hh = ha + (hb - ha) * frac + 0.34; // riding the trough
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
    const c = project(tx + 0.5, ty + 0.5, h);
    const n = tileNoise(tx, ty);
    const s = 0.85 + n * 0.35;
    const dark = n > 0.5 ? 0x35502a : 0x3a5230;
    const lit = n > 0.5 ? 0x4c6b38 : 0x527440;
    g.ellipse(c.x, c.y + 1, 9 * s, 4 * s).fill({ color: 0x000000, alpha: 0.18 });
    g.rect(c.x - 2, c.y - 8 * s, 4, 9 * s).fill({ color: COLORS.woodD });
    for (let i = 0; i < 3; i++) {
      const w = (13 - i * 3.4) * s;
      const yTop = c.y - (14 + i * 9) * s;
      const yBot = c.y - (2 + i * 9) * s;
      g.poly([c.x, yTop, c.x - w, yBot, c.x, yBot]).fill({ color: dark });
      g.poly([c.x, yTop, c.x + w, yBot, c.x, yBot]).fill({ color: lit });
    }
  }

  private drawStump(g: Graphics, tiles: GameState['tiles'], tx: number, ty: number): void {
    const h = heightAt(tiles, tx, ty);
    const c = project(tx + 0.5, ty + 0.5, h);
    g.ellipse(c.x, c.y - 1, 4, 2).fill({ color: COLORS.wood });
    g.rect(c.x - 4, c.y - 4, 8, 4).fill({ color: COLORS.woodD });
    g.ellipse(c.x, c.y - 4, 4, 2).fill({ color: COLORS.woodL });
    g.ellipse(c.x, c.y - 4, 2, 1).stroke({ width: 1, color: COLORS.wood });
  }

  private drawOre(g: Graphics, tiles: GameState['tiles'], tx: number, ty: number, remaining: number): void {
    const h = heightAt(tiles, tx, ty);
    const c = project(tx + 0.5, ty + 0.5, h);
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
    const c = project(x + 0.5, y + 0.5, h);
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
        box(g, x + 0.06, y + 0.12, h, 0.88, 0.78, 0.16, COLORS.stone);
        box(g, x + 0.1, y + 0.16, h + 0.16, 0.8, 0.7, 0.68, COLORS.wood);
        roof(g, x + 0.04, y + 0.1, h + 0.84, 0.92, 0.82, 0.42, shade(COLORS.woodD, 1.35));
        faceWindow(g, { x: x + 0.48, y: y + 0.86, h }, { x: x + 0.88, y: y + 0.86, h }, 0.32, 0.6, t, working);
        chimney(g, x + 0.38, y + 0.18, h + 0.84, t, 0.7, true, working);
        faceCog(g, project(x + 0.2, y + 0.87, h + 0.42), 'left', 6, powered ? -t * 1.1 : -0.4, COLORS.brass, COLORS.brassD);
        if ((b.input.log ?? 0) > 0) {
          box(g, x + 0.62, y + 0.86, h, 0.3, 0.12, 0.1, 0x9c6b3b);
          box(g, x + 0.66, y + 0.86, h + 0.1, 0.22, 0.12, 0.09, 0x8a5c33);
        }
        if ((b.output.plank ?? 0) > 0) plankStack(g, x + 0.04, y + 0.55, h, Math.min(4, Math.ceil((b.output.plank ?? 0) / 3)));
        break;
      }
      case 'blacksmith': {
        const lit = (b.delivered ?? 0) > 0;
        box(g, x + 0.08, y + 0.14, h, 0.84, 0.74, 0.8, COLORS.stone);
        roof(g, x + 0.02, y + 0.08, h + 0.8, 0.96, 0.86, 0.48, COLORS.brick);
        faceWindow(g, { x: x + 0.08, y: y + 0.88, h }, { x: x + 0.92, y: y + 0.88, h }, 0.22, 0.6, t, lit);
        chimney(g, x + 0.34, y + 0.16, h + 0.8, t, 0.85, true, lit);
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
        this.drawFurnace(g, b, h, t, c);
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
    g.circle(wc.x, wc.y, 2.6).fill({ color: COLORS.brass });
    // splash at the dipping paddles
    const sp = { x: wc.x, y: wc.y + 17 };
    for (let i = 0; i < 3; i++) {
      const f = (t * 1.2 + i / 3) % 1;
      g.circle(sp.x - 6 + i * 6, sp.y - f * 5, 1.2).fill({ color: 0xdff0f6, alpha: (1 - f) * 0.6 });
    }
  }

  private drawFurnace(g: Graphics, b: Building, h: number, t: number, c: Pt): void {
    const x = b.tx;
    const y = b.ty;
    const heat = Math.max(0, Math.min(1, (b.heat ?? 0) / 100));
    box(g, x + 0.1, y + 0.1, h, 0.8, 0.8, 0.72, COLORS.iron);
    box(g, x + 0.19, y + 0.19, h + 0.72, 0.62, 0.62, 0.72, COLORS.iron);
    box(g, x + 0.27, y + 0.27, h + 1.44, 0.46, 0.46, 0.36, COLORS.iron);
    // brass hoop bands + rivets across the front
    for (const bd of [
      { z: 0.32, w: 22 },
      { z: 1.0, w: 17 },
      { z: 1.62, w: 12 },
    ]) {
      const p = project(x + 0.5, y + 0.5, h + bd.z);
      g.rect(p.x - bd.w, p.y + 6, bd.w * 2, 2).fill({ color: COLORS.brass });
      for (let rv = -bd.w + 3; rv <= bd.w - 3; rv += 6) {
        g.rect(p.x + rv, p.y + 8.5, 1, 1).fill({ color: COLORS.brassD });
      }
    }
    chimney(g, x + 0.34, y + 0.16, h + 1.8, t, 0.55, false, heat > 0.15);
    if (heat > 0.5) {
      const cap = project(x + 0.5, y + 0.5, h + 2.35);
      smoke(g, cap.x + 4, cap.y + 2, t + 0.4, 4, 30, COLORS.soot, 0.3);
    }
    // tap-hole arch on the near-left face
    const A = (u: number, z: number) => project(x + 0.24 + u * 0.36, y + 0.9, h + 0.04 + z * 0.42);
    const relightFlicker = (b.relighting ?? 0) > 0 && Math.sin(t * 14) > 0;
    if (heat > 0.04 || relightFlicker) {
      g.circle(c.x - 6, c.y - 3, 5 + 7 * heat).fill({ color: COLORS.ember, alpha: 0.1 + 0.3 * heat });
      g.poly(flat([A(0, 0), A(1, 0), A(1, 0.8), A(0.5, 1), A(0, 0.8)])).fill({ color: COLORS.emberD });
      g.poly(flat([A(0.16, 0.1), A(0.84, 0.1), A(0.84, 0.68), A(0.5, 0.85), A(0.16, 0.68)])).fill({
        color: heat > 0.6 ? COLORS.emberH : COLORS.ember,
      });
    } else {
      g.poly(flat([A(0, 0), A(1, 0), A(1, 0.8), A(0.5, 1), A(0, 0.8)])).fill({ color: 0x1a1512 });
    }
    faceCog(g, project(x + 0.11, y + 0.62, h + 0.34), 'left', 6, heat > 0.04 ? t * 0.7 : 0.3, COLORS.brass, COLORS.brassD);
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

  private drawFlume(g: Graphics, state: GameState, b: Building, h: number, t: number, conn?: FlumeConn): void {
    const x = b.tx;
    const y = b.ty;
    const cx = x + 0.5;
    const cy = y + 0.5;
    const lift = 0.28;
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

    // trestle legs near each connected edge
    for (const { d } of dirs) {
      trestleBent(g, cx + d.dx * 0.34, cy + d.dy * 0.34, h, lift, d.dx, d.dy);
    }
    // trough halves: bed, water, rails
    const half = (d: Dir, water: boolean, flowOut: boolean) => {
      const px = -d.dy;
      const py = d.dx;
      const quad = (wHalf: number, z: number) =>
        flat([
          project(cx + px * wHalf, cy + py * wHalf, h + z),
          project(cx + d.dx * 0.5 + px * wHalf, cy + d.dy * 0.5 + py * wHalf, h + z),
          project(cx + d.dx * 0.5 - px * wHalf, cy + d.dy * 0.5 - py * wHalf, h + z),
          project(cx - px * wHalf, cy - py * wHalf, h + z),
        ]);
      g.poly(quad(0.19, lift)).fill({ color: COLORS.woodD });
      if (water) g.poly(quad(0.12, lift + 0.04)).fill({ color: COLORS.water1 });
      for (const side of [1, -1]) {
        const a = project(cx + px * 0.19 * side, cy + py * 0.19 * side, h + lift + 0.1);
        const e = project(cx + d.dx * 0.5 + px * 0.19 * side, cy + d.dy * 0.5 + py * 0.19 * side, h + lift + 0.1);
        g.moveTo(a.x, a.y).lineTo(e.x, e.y).stroke({ width: 2, color: COLORS.wood });
      }
      if (water) {
        for (let i = 0; i < 2; i++) {
          const f0 = (t * 0.7 + i / 2 + tileNoise(x + i, y)) % 1;
          // in-halves flow edge→centre, out-halves centre→edge
          const off = flowOut ? 0.5 * f0 : 0.5 - 0.5 * f0;
          const p = project(cx + d.dx * off, cy + d.dy * off, h + lift + 0.05);
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
      box(g, gx + gpx - 0.04, gy + gpy - 0.04, h, 0.08, 0.08, lift + 0.5, COLORS.woodD);
      box(g, gx - gpx - 0.04, gy - gpy - 0.04, h, 0.08, 0.08, lift + 0.5, COLORS.woodD);
      if (gd.dx !== 0) box(g, gx - 0.04, gy - 0.28, h + lift + 0.42, 0.08, 0.56, 0.08, COLORS.wood);
      else box(g, gx - 0.28, gy - 0.04, h + lift + 0.42, 0.56, 0.08, 0.08, COLORS.wood);
      const gb = (s: number, z: number) => project(gx + gpx * s * 0.8, gy + gpy * s * 0.8, h + lift + z);
      g.poly(flat([gb(1, 0.08), gb(-1, 0.08), gb(-1, 0.3), gb(1, 0.3)])).fill({ color: COLORS.wood });
      g.poly(flat([gb(1, 0.08), gb(-1, 0.08), gb(-1, 0.3), gb(1, 0.3)])).stroke({ width: 1, color: COLORS.woodD, alpha: 0.8 });
      const scr = project(gx, gy, h + lift + 0.58);
      g.circle(scr.x, scr.y, 3).stroke({ width: 1.5, color: COLORS.brass });
      g.moveTo(scr.x - 3, scr.y).lineTo(scr.x + 3, scr.y).stroke({ width: 1, color: COLORS.brass });
      g.moveTo(scr.x, scr.y - 3).lineTo(scr.x, scr.y + 3).stroke({ width: 1, color: COLORS.brass });
      // churn where the water enters under the gate
      const sp = project(gx, gy, h + lift + 0.05);
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

    g.ellipse(c.x, c.y + 1, 7, 3.5).fill({ color: 0x000000, alpha: 0.25 });
    // legs
    g.rect(c.x - 3.5, c.y - 6, 3, 6).fill({ color: 0x2e2a26 });
    g.rect(c.x + 0.5, c.y - 6, 3, 6).fill({ color: 0x2e2a26 });
    // coat
    g.rect(c.x - 4.5, c.y - 15, 9, 10).fill({ color: 0x3e4652 });
    g.rect(c.x - 4.5, c.y - 15, 9, 2).fill({ color: 0x4d5766 });
    g.rect(c.x - 0.5, c.y - 13, 1, 7).fill({ color: COLORS.brassD }); // button line
    // head + flat cap, brim toward facing
    g.circle(c.x, c.y - 18, 3.6).fill({ color: 0xf0d9a8 });
    g.rect(c.x - 4, c.y - 23, 8, 3).fill({ color: 0x5a4a34 });
    g.rect(c.x - 4 + (sx > 0 ? 4 : -2), c.y - 21, 6, 1.5).fill({ color: 0x4a3c2a });

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
      this.promptText.x = pc.x;
      this.promptText.y = pc.y - 44;
      this.promptText.scale.set(1 / Math.max(1, view.zoom)); // stay screen-sized when zoomed in
      this.promptText.visible = true;
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
}
