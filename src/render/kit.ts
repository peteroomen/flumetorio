// The Plate III component kit at game scale: shaded dimetric cuboids, roofs, chimneys, smoke,
// and detail mounted ON the two visible wall faces (cogs, wheels, windows). Author a part once,
// compose every building from it. Pure drawing — reads nothing from the sim.

import type { Graphics } from 'pixi.js';
import { project, TILE_HALF_H, TILE_HALF_W, type Pt } from './iso';
import { COLORS, shade } from './palette';

export type Face = 'left' | 'right'; // left = the +y wall (screen lower-left), right = the +x wall

export function flat(pts: Pt[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}

// ---- face-plane mapping ----
// The plate mounts round detail on walls with a canvas transform; Pixi Graphics has no path
// transform, so we map face-plane (u along the wall, v up) into screen space explicitly and
// draw circles as mapped N-gons. u/v are in screen pixels.
const FL = Math.hypot(TILE_HALF_W, TILE_HALF_H);
const FUX = TILE_HALF_W / FL;
const FUY = TILE_HALF_H / FL;

export function faceUV(c: Pt, face: Face, u: number, v: number): Pt {
  const sx = face === 'right' ? -1 : 1;
  return { x: c.x + sx * u * FUX, y: c.y + u * FUY - v };
}

function faceNgon(c: Pt, face: Face, r: number, n = 14, rot = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    pts.push(faceUV(c, face, Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

// ---- massing ----
// Shaded iso cuboid; w/d in tiles, hz in height-levels. Right face darkest, left mid, top full.
export function box(
  g: Graphics,
  wx: number,
  wy: number,
  h: number,
  w: number,
  d: number,
  hz: number,
  col: number,
): void {
  const P = (x: number, y: number, z: number) => project(x, y, z);
  g.poly(
    flat([P(wx + w, wy, h + hz), P(wx + w, wy + d, h + hz), P(wx + w, wy + d, h), P(wx + w, wy, h)]),
  ).fill({ color: shade(col, 0.55) });
  g.poly(
    flat([P(wx, wy + d, h + hz), P(wx + w, wy + d, h + hz), P(wx + w, wy + d, h), P(wx, wy + d, h)]),
  ).fill({ color: shade(col, 0.75) });
  g.poly(
    flat([P(wx, wy, h + hz), P(wx + w, wy, h + hz), P(wx + w, wy + d, h + hz), P(wx, wy + d, h + hz)]),
  ).fill({ color: col });
}

// Two-slope roof with ridge + tile-row texture, apex over the footprint centre.
export function roof(
  g: Graphics,
  wx: number,
  wy: number,
  h: number,
  w: number,
  d: number,
  peak: number,
  col: number,
): void {
  const P = (x: number, y: number, z: number) => project(x, y, z);
  const ap = P(wx + w / 2, wy + d / 2, h + peak);
  g.poly(flat([P(wx, wy, h), P(wx + w, wy, h), P(wx + w, wy + d, h), ap])).fill({
    color: shade(col, 1.06),
  });
  g.poly(flat([P(wx, wy, h), P(wx, wy + d, h), P(wx + w, wy + d, h), ap])).fill({
    color: shade(col, 0.74),
  });
  for (let k = 1; k <= 3; k++) {
    const f = k / 4;
    const a = P(wx, wy + d * f, h);
    const b = P(wx + w, wy + d * f, h);
    g.moveTo(a.x, a.y).lineTo(ap.x, ap.y).stroke({ width: 1, color: shade(col, 0.62) });
    g.moveTo(b.x, b.y).lineTo(ap.x, ap.y).stroke({ width: 1, color: shade(col, 0.62) });
  }
  const eave = P(wx, wy + d, h);
  g.moveTo(eave.x, eave.y).lineTo(ap.x, ap.y).stroke({ width: 1, color: shade(col, 0.5) });
}

// ---- particles ----
export function smoke(
  g: Graphics,
  x: number,
  y: number,
  tSec: number,
  n: number,
  rise: number,
  col: number,
  alpha = 0.36,
): void {
  for (let i = 0; i < n; i++) {
    const a = (tSec * 0.12 + i / n) % 1;
    const yy = y - a * rise;
    const xx = x + Math.sin(a * 5 + i * 2) * 4 * a;
    const r = 1 + a * a * 4;
    g.circle(xx, yy, r).fill({ color: col, alpha: (1 - a) * alpha });
  }
}

// ---- kit parts ----
// Brick (or iron) chimney with a brass lip, banding, and a smoke plume.
export function chimney(
  g: Graphics,
  wx: number,
  wy: number,
  h: number,
  tSec: number,
  tall = 1.0,
  brick = true,
  smoking = true,
): void {
  const col = brick ? COLORS.brick : COLORS.iron;
  const cd = brick ? COLORS.brickD : COLORS.ironD;
  box(g, wx + 0.41, wy + 0.41, h, 0.18, 0.18, tall, col);
  box(g, wx + 0.38, wy + 0.38, h + tall - 0.05, 0.24, 0.24, 0.06, COLORS.brass);
  for (let b = 0.25; b < tall - 0.1; b += 0.35) {
    const p = project(wx + 0.5, wy + 0.5, h + b);
    g.rect(p.x - 5, p.y + 3, 10, 1).fill({ color: cd, alpha: 0.85 });
  }
  if (smoking) {
    const cap = project(wx + 0.5, wy + 0.5, h + tall);
    smoke(g, cap.x, cap.y - 3, tSec, 7, 42, COLORS.soot);
  }
}

// A cog lying flat on a wall face (foreshortened), centred at screen point `c`.
export function faceCog(
  g: Graphics,
  c: Pt,
  face: Face,
  r: number,
  rot: number,
  col: number,
  cd: number,
): void {
  const teeth = Math.max(8, Math.round(r));
  for (let i = 0; i < teeth; i++) {
    const a = rot + (i * Math.PI * 2) / teeth;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // tooth: a small radial quad just outside the rim, in face-plane coords
    const quad = [
      { u: ca * r - sa * 1.4, v: sa * r + ca * 1.4 },
      { u: ca * r + sa * 1.4, v: sa * r - ca * 1.4 },
      { u: ca * (r + 2.6) + sa * 1.4, v: sa * (r + 2.6) - ca * 1.4 },
      { u: ca * (r + 2.6) - sa * 1.4, v: sa * (r + 2.6) + ca * 1.4 },
    ].map((p) => faceUV(c, face, p.u, p.v));
    g.poly(flat(quad)).fill({ color: col });
  }
  g.poly(flat(faceNgon(c, face, r, 14, rot))).fill({ color: col });
  g.poly(flat(faceNgon(c, face, r - 2, 14, rot))).fill({ color: cd });
  g.poly(flat(faceNgon(c, face, 2, 8))).fill({ color: col });
  const s1 = faceUV(c, face, -r + 2.5, 0);
  const s2 = faceUV(c, face, r - 2.5, 0);
  const s3 = faceUV(c, face, 0, -r + 2.5);
  const s4 = faceUV(c, face, 0, r - 2.5);
  g.moveTo(s1.x, s1.y).lineTo(s2.x, s2.y).stroke({ width: 1, color: col });
  g.moveTo(s3.x, s3.y).lineTo(s4.x, s4.y).stroke({ width: 1, color: col });
}

// A spoked, paddled waterwheel on a wall face.
export function faceWheel(g: Graphics, c: Pt, face: Face, r: number, rot: number): void {
  g.poly(flat(faceNgon(c, face, r, 16))).stroke({ width: 3, color: COLORS.woodD });
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tip = faceUV(c, face, ca * (r - 1), sa * (r - 1));
    g.moveTo(c.x, c.y).lineTo(tip.x, tip.y).stroke({ width: 1, color: COLORS.woodL });
    // paddle: a tangential board at the rim
    const quad = [
      { u: ca * r - sa * 3.4, v: sa * r + ca * 3.4 },
      { u: ca * r + sa * 3.4, v: sa * r - ca * 3.4 },
      { u: ca * (r + 3) + sa * 3.4, v: sa * (r + 3) - ca * 3.4 },
      { u: ca * (r + 3) - sa * 3.4, v: sa * (r + 3) + ca * 3.4 },
    ].map((p) => faceUV(c, face, p.u, p.v));
    g.poly(flat(quad)).fill({ color: COLORS.wood });
  }
  g.poly(flat(faceNgon(c, face, 3, 8))).fill({ color: COLORS.brass });
}

// A warm lit window on the wall spanning world points a→b (same height), between zLo..zHi
// height-levels above h. Glow flickers gently unless `lit` is false (then a dark socket).
export function faceWindow(
  g: Graphics,
  a: Pt3,
  b: Pt3,
  zLo: number,
  zHi: number,
  tSec: number,
  lit: boolean,
): void {
  const P = (u: number, z: number) =>
    project(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.h + zLo + (zHi - zLo) * z);
  const q = [P(0.28, 0), P(0.72, 0), P(0.72, 1), P(0.28, 1)];
  const cx = (q[0].x + q[2].x) / 2;
  const cy = (q[0].y + q[2].y) / 2;
  if (lit) {
    const fl = 0.82 + Math.sin(tSec * 7) * 0.18;
    g.circle(cx, cy, 12).fill({ color: COLORS.glow, alpha: 0.1 * fl });
    g.circle(cx, cy, 7).fill({ color: COLORS.glow, alpha: 0.14 * fl });
    g.poly(flat(q)).fill({ color: COLORS.woodD });
    const inn = [P(0.34, 0.14), P(0.66, 0.14), P(0.66, 0.86), P(0.34, 0.86)];
    g.poly(flat(inn)).fill({ color: 0xffcd78, alpha: Math.min(1, fl) });
    const m1 = P(0.5, 0.14);
    const m2 = P(0.5, 0.86);
    g.moveTo(m1.x, m1.y).lineTo(m2.x, m2.y).stroke({ width: 1, color: COLORS.woodD });
  } else {
    g.poly(flat(q)).fill({ color: COLORS.woodD });
    const inn = [P(0.34, 0.14), P(0.66, 0.14), P(0.66, 0.86), P(0.34, 0.86)];
    g.poly(flat(inn)).fill({ color: 0x232532 });
  }
}

export interface Pt3 {
  x: number;
  y: number;
  h: number;
}

// A sagging line-shaft / belt between two screen points, with travelling pulse dots.
export function shaft(g: Graphics, p0: Pt, p1: Pt, tSec: number, turning: boolean): void {
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2 + 6; // sag
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const omf = 1 - f;
    pts.push({
      x: omf * omf * p0.x + 2 * omf * f * mx + f * f * p1.x,
      y: omf * omf * p0.y + 2 * omf * f * my + f * f * p1.y,
    });
  }
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke({ width: 3, color: COLORS.brassD, alpha: 0.9 });
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke({ width: 1, color: COLORS.brass, alpha: 0.95 });
  for (let k = 0; k < 3; k++) {
    const f = ((turning ? tSec * 0.5 : 0) + k / 3) % 1;
    const omf = 1 - f;
    const x = omf * omf * p0.x + 2 * omf * f * mx + f * f * p1.x;
    const y = omf * omf * p0.y + 2 * omf * f * my + f * f * p1.y;
    g.circle(x, y, 1.6).fill({ color: COLORS.brassL });
  }
}

// A trestle bent (two splayed legs + X brace) supporting something at world (wx,wy), height
// h+lift, oriented across direction (dx,dy). Used by the flume and the pit saw.
export function trestleBent(
  g: Graphics,
  wx: number,
  wy: number,
  h: number,
  lift: number,
  dx: number,
  dy: number,
): void {
  // legs splay perpendicular to the run direction
  const px = -dy * 0.28;
  const py = dx * 0.28;
  const topA = project(wx + px * 0.6, wy + py * 0.6, h + lift);
  const topB = project(wx - px * 0.6, wy - py * 0.6, h + lift);
  const footA = project(wx + px, wy + py, h);
  const footB = project(wx - px, wy - py, h);
  g.moveTo(topA.x, topA.y).lineTo(footA.x, footA.y).stroke({ width: 2, color: COLORS.woodD });
  g.moveTo(topB.x, topB.y).lineTo(footB.x, footB.y).stroke({ width: 2, color: COLORS.woodD });
  g.moveTo(topA.x, topA.y).lineTo(footB.x, footB.y).stroke({ width: 1, color: COLORS.wood });
  g.moveTo(topB.x, topB.y).lineTo(footA.x, footA.y).stroke({ width: 1, color: COLORS.wood });
}

// A small stack of sawn planks (decoration for mills / stockpiles).
export function plankStack(g: Graphics, wx: number, wy: number, h: number, layers = 3): void {
  for (let i = 0; i < layers; i++) {
    box(g, wx, wy + (i % 2) * 0.03, h + i * 0.07, 0.34, 0.2, 0.06, i % 2 ? 0xcaa15e : 0xb8905a);
  }
}

// A round-bellied barrel with brass hoops.
export function barrel(g: Graphics, wx: number, wy: number, h: number): void {
  box(g, wx, wy, h, 0.2, 0.2, 0.3, COLORS.wood);
  const p1 = project(wx + 0.1, wy + 0.2, h + 0.08);
  const p2 = project(wx + 0.1, wy + 0.2, h + 0.22);
  g.rect(p1.x - 4, p1.y - 1, 9, 1).fill({ color: COLORS.brassD });
  g.rect(p2.x - 4, p2.y - 1, 9, 1).fill({ color: COLORS.brassD });
}
