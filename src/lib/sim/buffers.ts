// Small helpers for machine input/output buffers.

import type { Buffers, ResourceKind } from './types';

export function count(b: Buffers, res: ResourceKind): number {
  return b[res] ?? 0;
}

export function total(b: Buffers): number {
  let n = 0;
  for (const k of Object.keys(b) as ResourceKind[]) n += b[k] ?? 0;
  return n;
}

// Add up to `n`, respecting a per-buffer total cap. Returns the amount actually added.
export function add(b: Buffers, res: ResourceKind, n: number, cap: number): number {
  const room = cap - total(b);
  const put = Math.max(0, Math.min(n, room));
  if (put > 0) b[res] = (b[res] ?? 0) + put;
  return put;
}

// Remove up to `n`. Returns the amount actually removed.
export function take(b: Buffers, res: ResourceKind, n: number): number {
  const have = b[res] ?? 0;
  const got = Math.min(have, n);
  if (got > 0) b[res] = have - got;
  return got;
}
