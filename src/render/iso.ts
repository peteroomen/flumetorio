// The tile contract (ADR 002): 2:1 dimetric projection, discrete integer heights.
// Everything that converts between tile-space and screen-space lives here.

export const TILE_HALF_W = 32; // half tile width  (so tiles are 64 wide)
export const TILE_HALF_H = 16; // half tile height (so tiles are 32 tall)
export const HEIGHT_STEP = 22; // screen pixels a full height level raises a tile

export interface Pt {
  x: number;
  y: number;
}

// World tile-space (wx, wy) + integer height -> screen pixels (pre-camera).
export function project(wx: number, wy: number, h: number): Pt {
  return {
    x: (wx - wy) * TILE_HALF_W,
    y: (wx + wy) * TILE_HALF_H - h * HEIGHT_STEP,
  };
}

// The four screen corners of a tile's top face.
export function tileDiamond(tx: number, ty: number, h: number): [Pt, Pt, Pt, Pt] {
  return [
    project(tx, ty, h), // top
    project(tx + 1, ty, h), // right
    project(tx + 1, ty + 1, h), // bottom
    project(tx, ty + 1, h), // left
  ];
}

// Point-in-convex-quad via consistent cross-product sign.
export function pointInQuad(p: Pt, quad: [Pt, Pt, Pt, Pt]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

// Draw order key: back-to-front for 2:1 iso.
export function drawKey(tx: number, ty: number): number {
  return tx + ty;
}
