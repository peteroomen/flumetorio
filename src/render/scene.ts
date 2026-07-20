// PixiJS scene: draws the terraced valley, buildings, movers, items, and the player.
// Reads the sim state (never mutates it) and the view state. Terrain is cached; the
// dynamic layer + overlay are rebuilt each frame.

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameState } from '@/lib/sim/types';
import { bandHeight, heightAt, idx, inBounds } from '@/lib/sim/world';
import { MAP_H, MAP_W, WATERWHEEL_POWER_RADIUS } from '@/lib/sim/constants';
import { placementError } from '@/lib/sim/buildings';
import { isPoweredAt } from '@/lib/sim/machines';
import { buildingStatus, isDropTargetKind, promptFor, type StatusKey } from '@/lib/sim/status';
import type { ViewState } from '@/ui/view';
import { drawKey, HEIGHT_STEP, pointInQuad, project, tileDiamond, type Pt } from './iso';
import {
  BUILDING_COLORS,
  COLORS,
  darken,
  RESOURCE_COLORS,
  terrainColor,
  tileNoise,
} from './palette';

function flat(pts: Pt[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
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

export class Scene {
  app = new Application();
  private world = new Container();
  private terrainGfx = new Graphics();
  private dynGfx = new Graphics();
  private guidanceGfx = new Graphics();
  private ghostGfx = new Graphics();
  private overlayLayer = new Container();
  private overlayPool: Text[] = [];
  private promptText = new Text({ text: '', style: PROMPT_STYLE });
  private terrainDirty = true;
  private lastTerrainSig = '';
  private drawOrder: Array<{ tx: number; ty: number }> = [];

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
    this.app.stage.addChild(this.world);

    // Precompute a back-to-front draw order.
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

  // Center the camera on the player.
  private updateCamera(state: GameState, view: ViewState): void {
    const z = view.zoom;
    this.world.scale.set(z);
    const pc = project(state.player.x, state.player.y, this.playerHeight(state));
    this.world.x = this.app.renderer.width / 2 - pc.x * z;
    this.world.y = this.app.renderer.height / 2 - pc.y * z;
  }

  render(state: GameState, view: ViewState): void {
    // Terrain signature: rebuild only when tiles/trees/ores change.
    const sig = `${state.trees.filter((t) => t.state === 'tree').length}:${state.ores.filter((o) => o.remaining > 0).length}`;
    if (this.terrainDirty || sig !== this.lastTerrainSig) {
      this.drawTerrain(state);
      this.terrainDirty = false;
      this.lastTerrainSig = sig;
    }
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
    const treeAt = new Map<number, boolean>();
    for (const t of state.trees) if (t.state === 'tree') treeAt.set(idx(t.tx, t.ty), true);
    const oreAt = new Map<number, number>();
    for (const o of state.ores) if (o.remaining > 0) oreAt.set(idx(o.tx, o.ty), o.remaining);

    for (const { tx, ty } of this.drawOrder) {
      const tile = state.tiles[idx(tx, ty)];
      const h = tile.height;
      const top = terrainColor(tile.terrain, h);
      const diamond = tileDiamond(tx, ty, h);

      // Front faces (cliffs) toward lower neighbours.
      const rh = inBounds(tx + 1, ty) ? state.tiles[idx(tx + 1, ty)].height : bandHeight(ty);
      if (h > rh) {
        g.poly(
          flat([
            project(tx + 1, ty, h),
            project(tx + 1, ty + 1, h),
            project(tx + 1, ty + 1, rh),
            project(tx + 1, ty, rh),
          ]),
        ).fill({ color: darken(top, 0.6) });
      }
      const lh = inBounds(tx, ty + 1) ? state.tiles[idx(tx, ty + 1)].height : bandHeight(ty + 1);
      if (h > lh) {
        g.poly(
          flat([
            project(tx, ty + 1, h),
            project(tx + 1, ty + 1, h),
            project(tx + 1, ty + 1, lh),
            project(tx, ty + 1, lh),
          ]),
        ).fill({ color: darken(top, 0.48) });
      }

      // Top face.
      g.poly(flat(diamond)).fill({ color: top });
      // dither texture: a few darker specks per tile (skip water)
      if (tile.terrain !== 'water') {
        const n = tileNoise(tx, ty);
        const c0 = project(tx + 0.5, ty + 0.5, h);
        const spk = darken(top, 0.82);
        g.rect(c0.x - 10 + n * 14, c0.y - 4 + n * 6, 2, 2).fill({ color: spk });
        g.rect(c0.x + 4 - n * 10, c0.y + 2 - n * 5, 2, 2).fill({ color: spk });
      }
      g.poly(flat(diamond)).stroke({ width: 1, color: darken(top, 0.7), alpha: 0.45 });

      if (tile.terrain === 'water') {
        // a subtle inner ripple
        const c = project(tx + 0.5, ty + 0.5, h);
        g.ellipse(c.x, c.y, 10, 5).stroke({ width: 1, color: 0x8fd6e6, alpha: 0.25 });
      }

      // Decorations layered with their tile.
      const i = idx(tx, ty);
      if (treeAt.has(i)) this.drawTree(g, tx, ty, h);
      const ore = oreAt.get(i);
      if (ore !== undefined) this.drawOre(g, tx, ty, h);
    }
  }

  private drawTree(g: Graphics, tx: number, ty: number, h: number): void {
    const c = project(tx + 0.5, ty + 0.5, h);
    g.rect(c.x - 2, c.y - 10, 4, 12).fill({ color: 0x5a3d24 });
    g.poly([c.x, c.y - 30, c.x - 11, c.y - 6, c.x + 11, c.y - 6]).fill({ color: 0x3f6b34 });
    g.poly([c.x, c.y - 22, c.x - 8, c.y - 4, c.x + 8, c.y - 4]).fill({ color: 0x4c7d3c });
  }

  private drawOre(g: Graphics, tx: number, ty: number, h: number): void {
    const c = project(tx + 0.5, ty + 0.5, h);
    g.poly([c.x, c.y - 12, c.x - 9, c.y - 2, c.x - 3, c.y + 4, c.x + 7, c.y + 2, c.x + 9, c.y - 5]).fill({
      color: 0x777c86,
    });
    g.circle(c.x - 2, c.y - 3, 1.6).fill({ color: 0xc9a24a });
    g.circle(c.x + 3, c.y - 6, 1.4).fill({ color: 0xc9a24a });
  }

  // ---------------- dynamic ----------------
  private drawDynamic(state: GameState): void {
    const g = this.dynGfx;
    g.clear();

    // Sort buildings back-to-front.
    const bs = [...state.buildings].sort((a, b) => drawKey(a.tx, a.ty) - drawKey(b.tx, b.ty));
    for (const b of bs) {
      const h = heightAt(state.tiles, b.tx, b.ty);
      const c = project(b.tx + 0.5, b.ty + 0.5, h);
      const col = BUILDING_COLORS[b.kind];
      switch (b.kind) {
        case 'stockpile': {
          g.poly(flat(tileDiamond(b.tx, b.ty, h)))
            .fill({ color: col, alpha: 0.55 })
            .stroke({ width: 1, color: 0xd8c79a, alpha: 0.7 });
          break;
        }
        case 'waterwheel': {
          const rot = (state.timeMs / 1000) * 1.3;
          const R = 13;
          const wy = c.y - 12;
          g.circle(c.x, wy, R).stroke({ width: 3, color: 0x5a3d24 });
          for (let i = 0; i < 8; i++) {
            const a = rot + (i * Math.PI) / 4;
            const ex = c.x + Math.cos(a) * R;
            const ey = wy + Math.sin(a) * R;
            g.moveTo(c.x, wy).lineTo(ex, ey).stroke({ width: 1.5, color: 0x7a5230 });
            g.rect(ex - 2, ey - 2, 4, 4).fill({ color: 0x9c7142 });
          }
          g.circle(c.x, wy, 3).fill({ color: COLORS.brass });
          break;
        }
        case 'sawmill':
        case 'blacksmith': {
          g.rect(c.x - 12, c.y - 16, 24, 16).fill({ color: col });
          g.poly([c.x - 14, c.y - 16, c.x, c.y - 26, c.x + 14, c.y - 16]).fill({ color: darken(col, 0.7) });
          if (b.kind === 'blacksmith') {
            const lit = (b.delivered ?? 0) > 0;
            g.rect(c.x - 4, c.y - 12, 8, 8).fill({ color: lit ? 0xffb347 : 0x2a2320 });
          }
          break;
        }
        case 'pitsaw': {
          // a low saw-pit frame with a log and an angled saw blade
          g.poly(flat(tileDiamond(b.tx, b.ty, h))).fill({ color: darken(col, 0.6), alpha: 0.5 });
          g.rect(c.x - 10, c.y - 8, 20, 5).fill({ color: 0x9c6b3b }); // the log
          g.moveTo(c.x - 8, c.y - 14).lineTo(c.x + 6, c.y - 2).stroke({ width: 1.5, color: 0x8a8f98 }); // saw
          g.rect(c.x - 12, c.y - 3, 3, 6).fill({ color: darken(col, 0.8) });
          g.rect(c.x + 9, c.y - 3, 3, 6).fill({ color: darken(col, 0.8) });
          break;
        }
        case 'clamp': {
          g.poly([c.x, c.y - 16, c.x - 13, c.y + 2, c.x + 13, c.y + 2]).fill({ color: col });
          g.circle(c.x, c.y - 4, 3).fill({ color: 0x9a5a2a, alpha: 0.8 });
          break;
        }
        case 'incline': {
          g.poly([c.x - 14, c.y + 2, c.x + 14, c.y - 14, c.x + 14, c.y - 8, c.x - 14, c.y + 8]).fill({
            color: col,
          });
          break;
        }
        case 'furnace': {
          const heat = Math.max(0, Math.min(1, (b.heat ?? 0) / 100));
          const topW = 8;
          const botW = 11;
          const hgt = 26;
          // tapered iron stack + shaded right face
          g.poly([c.x - botW, c.y + 2, c.x + botW, c.y + 2, c.x + topW, c.y - hgt, c.x - topW, c.y - hgt]).fill({ color: COLORS.iron });
          g.poly([c.x + 1, c.y + 2, c.x + botW, c.y + 2, c.x + topW, c.y - hgt, c.x + 1, c.y - hgt]).fill({ color: COLORS.ironD, alpha: 0.5 });
          // brass hoop bands
          for (const tt of [0.22, 0.52, 0.82]) {
            const yy = c.y + 2 - hgt * tt;
            const w = botW + (topW - botW) * tt;
            g.moveTo(c.x - w, yy).lineTo(c.x + w, yy).stroke({ width: 1.5, color: COLORS.brass, alpha: 0.85 });
          }
          // chimney
          g.rect(c.x + 2, c.y - hgt - 6, 5, 7).fill({ color: COLORS.ironD });
          // tap-hole: glow scaled by heat, dark + blue cold-marker when out
          if (heat > 0.04) {
            g.circle(c.x - 2, c.y - 4, 6 + 7 * heat).fill({ color: COLORS.ember, alpha: 0.18 + 0.5 * heat });
            g.rect(c.x - 6, c.y - 9, 8, 8).fill({ color: COLORS.emberD });
            g.rect(c.x - 5, c.y - 8, 6, 6).fill({ color: heat > 0.6 ? COLORS.emberH : COLORS.ember });
            for (let s = 0; s < 3; s++) {
              const a = ((state.timeMs / 1000) * 0.4 + s / 3) % 1;
              g.circle(c.x + 4, c.y - hgt - 8 - a * 18, 1 + a * 3).fill({ color: 0xaeb4bc, alpha: (1 - a) * 0.32 });
            }
          } else {
            g.rect(c.x - 6, c.y - 9, 8, 8).fill({ color: 0x1a1512 });
          }
          break;
        }
        case 'flumeHead':
        case 'flume': {
          g.poly(flat(tileDiamond(b.tx, b.ty, h)))
            .fill({ color: col, alpha: b.kind === 'flumeHead' ? 0.9 : 0.7 })
            .stroke({ width: 1, color: 0x2a4a58, alpha: 0.8 });
          break;
        }
      }
    }

    // Flume items in transit.
    for (const it of state.flumeItems) {
      const head = state.buildings.find((b) => b.id === it.headId);
      if (!head?.path || head.path.length < 2) continue;
      const i = Math.min(head.path.length - 2, Math.floor(it.progress));
      const frac = Math.max(0, Math.min(1, it.progress - i));
      const a = head.path[i];
      const bp = head.path[i + 1];
      const wx = a.tx + (bp.tx - a.tx) * frac + 0.5;
      const wy = a.ty + (bp.ty - a.ty) * frac + 0.5;
      const hh = heightAt(state.tiles, a.tx, a.ty);
      const p = project(wx, wy, hh);
      g.circle(p.x, p.y - 4, 3).fill({ color: RESOURCE_COLORS[it.resource] });
    }

    // Loose ground items.
    for (const gi of state.ground) {
      const h = heightAt(state.tiles, gi.tx, gi.ty);
      const p = project(gi.tx + 0.5, gi.ty + 0.5, h);
      g.circle(p.x, p.y - 2, 3).fill({ color: RESOURCE_COLORS[gi.resource] }).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    }

    // Player.
    this.drawPlayer(g, state);
  }

  private drawPlayer(g: Graphics, state: GameState): void {
    const p = state.player;
    const h = this.playerHeight(state);
    const c = project(p.x, p.y, h);
    // shadow
    g.ellipse(c.x, c.y, 7, 3.5).fill({ color: 0x000000, alpha: 0.25 });
    // body
    g.rect(c.x - 4, c.y - 16, 8, 15).fill({ color: COLORS.playerBody });
    g.circle(c.x, c.y - 18, 4).fill({ color: 0xf0d9a8 });
    // facing nub
    g.circle(c.x + Math.cos(p.facing) * 6, c.y - 8 + Math.sin(p.facing) * 3, 2).fill({ color: 0x3a2c1a });
    // carry indicator
    if (p.carry && p.carryCount > 0) {
      g.rect(c.x - 6, c.y - 26, 12, 6).fill({ color: RESOURCE_COLORS[p.carry] }).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    }
    // action progress bar
    if (p.actionKind) {
      const dur = p.actionKind === 'chop' ? 1300 : p.actionKind === 'mine' ? 1600 : 1200;
      const frac = Math.max(0, Math.min(1, p.actionProgress / dur));
      g.rect(c.x - 12, c.y - 34, 24, 4).fill({ color: 0x000000, alpha: 0.5 });
      g.rect(c.x - 12, c.y - 34, 24 * frac, 4).fill({ color: COLORS.action });
    }
  }

  // ---------------- guidance (power viz, status, prompts, delivery) ----------------
  private drawGuidance(state: GameState, view: ViewState): void {
    const g = this.guidanceGfx;
    g.clear();
    const tiles = state.tiles;
    const at = (tx: number, ty: number, dz = 0.45) =>
      project(tx + 0.5, ty + 0.5, heightAt(tiles, tx, ty) + dz);

    // 1) driveshafts: a brass line-shaft from each waterwheel to powered sawmills in reach
    for (const w of state.buildings) {
      if (w.kind !== 'waterwheel') continue;
      const wc = at(w.tx, w.ty, 0.7);
      for (const m of state.buildings) {
        if (m.kind !== 'sawmill') continue;
        if (Math.hypot(m.tx - w.tx, m.ty - w.ty) > WATERWHEEL_POWER_RADIUS) continue;
        if (!isPoweredAt(state, m.tx, m.ty)) continue;
        const mc = at(m.tx, m.ty, 0.55);
        g.moveTo(wc.x, wc.y).lineTo(mc.x, mc.y).stroke({ width: 2.5, color: 0x8a6524, alpha: 0.9 });
        g.moveTo(wc.x, wc.y).lineTo(mc.x, mc.y).stroke({ width: 1, color: 0xd8a94a, alpha: 0.95 });
        // pulleys
        for (let k = 1; k <= 3; k++) {
          const f = k / 4;
          g.circle(wc.x + (mc.x - wc.x) * f, wc.y + (mc.y - wc.y) * f, 1.6).fill({ color: 0xd8a94a });
        }
      }
    }

    // 2) delivery highlights while carrying
    const carry = state.player.carry;
    if (carry && state.player.carryCount > 0) {
      for (const b of state.buildings) {
        if (!isDropTargetKind(b, carry)) continue;
        const inReach =
          Math.hypot(state.player.x - (b.tx + 0.5), state.player.y - (b.ty + 0.5)) <= 1.5;
        const c = at(b.tx, b.ty, 0.9);
        const col = b.kind === 'blacksmith' ? 0xffb347 : 0x8fe388;
        const a = inReach ? 1 : 0.4;
        g.poly([c.x - 4, c.y - 30, c.x + 4, c.y - 30, c.x, c.y - 25]).fill({ color: col, alpha: a });
      }
    }

    // 3) machine status badges — attention states flash and show WHAT they want
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin((state.timeMs / 1000) * 3.2));
    for (const b of state.buildings) {
      const st = buildingStatus(state, b);
      if (!st) continue;
      const c = at(b.tx, b.ty, 0.5);
      const col = STATUS_COLOR[st.key];
      if (st.key === 'running') {
        g.circle(c.x + 10, c.y - 22, 2).fill({ color: col, alpha: 0.85 });
        continue;
      }
      this.drawBadge(g, c.x, c.y - 26, st.key, col, pulse);
      if (st.want) {
        g.rect(c.x + 7, c.y - 30, 6, 6)
          .fill({ color: RESOURCE_COLORS[st.want], alpha: 0.5 + 0.5 * pulse })
          .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
      }
    }

    // 3b) delivery marker over the blacksmith while it's the active goal
    const active = state.letters.find((l) => l.id === state.activeLetterId);
    if (active && active.sink === 'blacksmith') {
      for (const b of state.buildings) {
        if (b.kind !== 'blacksmith') continue;
        const c = at(b.tx, b.ty, 0.9);
        g.rect(c.x - 3, c.y - 42, 6, 6).fill({ color: RESOURCE_COLORS.iron });
        g.poly([c.x - 5, c.y - 34, c.x + 5, c.y - 34, c.x, c.y - 28]).fill({ color: 0xffb347, alpha: 0.4 + 0.6 * pulse });
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
    if (view.mode !== 'build' || !view.buildKind || !view.hoverTile) return;
    const { tx, ty } = view.hoverTile;
    if (!inBounds(tx, ty)) return;
    const h = heightAt(state.tiles, tx, ty);
    const err = placementError(state, view.buildKind, tx, ty);
    const color = err ? COLORS.ghostBad : COLORS.ghostOk;
    g.poly(flat(tileDiamond(tx, ty, h)))
      .fill({ color, alpha: 0.35 })
      .stroke({ width: 2, color, alpha: 0.9 });
    // waterwheel / sawmill: show the power reach circle
    if (view.buildKind === 'waterwheel') {
      const c = project(tx + 0.5, ty + 0.5, h);
      g.ellipse(c.x, c.y, 4.5 * 32, 4.5 * 16).stroke({ width: 1.5, color: COLORS.power, alpha: 0.5 });
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
