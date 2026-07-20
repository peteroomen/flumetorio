// Pure derivations for the in-game guidance layer: why a machine isn't running,
// what the player can do right now, and where carried goods can go. No rendering here.

import { REACH } from './constants';
import { count } from './buffers';
import { isPoweredAt } from './machines';
import { FURNACE_MIN_SMELT_HEAT } from './constants';
import type { Building, BuildingKind, GameState, ResourceKind } from './types';

export type StatusKey = 'running' | 'needsInput' | 'needsFuel' | 'noPower' | 'outputFull' | 'cold';

export interface Status {
  key: StatusKey;
  attention: boolean; // true = wants the player's eye (amber/red badge)
  label: string;
  want?: ResourceKind; // the resource this machine is waiting for (shown as a glyph)
}

// A machine's live status, or null for things with no meaningful status badge.
export function buildingStatus(state: GameState, b: Building): Status | null {
  switch (b.kind) {
    case 'pitsaw':
    case 'sawmill':
    case 'clamp': {
      if (b.kind === 'sawmill' && !isPoweredAt(state, b.tx, b.ty))
        return { key: 'noPower', attention: true, label: 'No power — needs a waterwheel in reach' };
      const outRes: ResourceKind = b.kind === 'clamp' ? 'charcoal' : 'plank';
      if (count(b.input, 'log') < 1)
        return { key: 'needsInput', attention: true, want: 'log', label: 'Idle — needs logs' };
      if (count(b.output, outRes) >= outCapOf(b))
        return { key: 'outputFull', attention: true, label: 'Output full — collect it' };
      return { key: 'running', attention: false, label: 'Running' };
    }
    case 'furnace': {
      if (b.cold)
        return { key: 'needsFuel', attention: true, want: 'charcoal', label: 'Cold — needs charcoal (from a clamp) to relight' };
      if ((b.heat ?? 0) < FURNACE_MIN_SMELT_HEAT && count(b.input, 'charcoal') < 1)
        return { key: 'needsFuel', attention: true, want: 'charcoal', label: 'Cooling — needs charcoal' };
      if (count(b.input, 'ore') < 1)
        return { key: 'needsInput', attention: true, want: 'ore', label: 'Hot but idle — needs ore' };
      if ((b.output.iron ?? 0) >= 20)
        return { key: 'outputFull', attention: true, label: 'Full of iron — collect it' };
      return { key: 'running', attention: false, label: 'Smelting' };
    }
    case 'incline': {
      if (count(b.input, 'ore') < 1 && count(b.output, 'ore') < 1)
        return { key: 'needsInput', attention: true, label: 'Idle — load ore at the top' };
      return { key: 'running', attention: false, label: 'Hauling' };
    }
    default:
      return null;
  }
}

function outCapOf(b: Building): number {
  // mirrors the per-machine output cap used by the tick
  if (b.kind === 'clamp') return 8;
  if (b.kind === 'pitsaw') return 4;
  return 12; // sawmill
}

function dist(px: number, py: number, tx: number, ty: number): number {
  return Math.hypot(px - (tx + 0.5), py - (ty + 0.5));
}

// Is building `b` a valid place to deposit resource `res`? (kind-level, ignoring distance)
// The Wharf and a chest accept anything; machines accept their specific inputs.
export function isDropTargetKind(b: Building, res: ResourceKind): boolean {
  if (b.kind === 'wharf' || b.kind === 'stockpile') return true;
  switch (res) {
    case 'iron':
      return b.kind === 'blacksmith';
    case 'log':
      return b.kind === 'flumeHead' || b.kind === 'sawmill' || b.kind === 'clamp' || b.kind === 'pitsaw';
    case 'ore':
      return b.kind === 'incline' || b.kind === 'furnace';
    case 'charcoal':
      return b.kind === 'furnace';
    default:
      return false;
  }
}

// The single best contextual prompt for the player right now (or null).
export function promptFor(state: GameState): string | null {
  const p = state.player;
  if (p.actionKind) return null;

  // carrying? show where it can go
  if (p.carry && p.carryCount > 0) {
    const res = p.carry;
    let best: { d: number; verb: string } | null = null;
    for (const b of state.buildings) {
      if (!isDropTargetKind(b, res)) continue;
      const d = dist(p.x, p.y, b.tx, b.ty);
      if (d > REACH + 0.2) continue;
      const verb =
        b.kind === 'wharf'
          ? `Q — ship ${res} to the Company Wharf`
          : b.kind === 'blacksmith'
            ? `Q — deliver ${res} to the blacksmith`
            : b.kind === 'flumeHead'
              ? 'Q — tip logs into the flume'
              : b.kind === 'stockpile'
                ? `Q — stock ${res} in the chest`
                : `Q — load ${res} into the ${b.kind}`;
      if (!best || d < best.d) best = { d, verb };
    }
    if (best) return best.verb;
  }

  // near a tree / ore / collectable output / ground item?
  for (const t of state.trees) {
    if (t.state === 'tree' && dist(p.x, p.y, t.tx, t.ty) <= REACH) return 'E — fell timber';
  }
  for (const o of state.ores) {
    if (o.remaining > 0 && dist(p.x, p.y, o.tx, o.ty) <= REACH) return 'E — mine ore';
  }
  const outMap: Partial<Record<BuildingKind, ResourceKind>> = {
    pitsaw: 'plank',
    sawmill: 'plank',
    clamp: 'charcoal',
    furnace: 'iron',
  };
  for (const b of state.buildings) {
    const r = outMap[b.kind];
    if (r && (b.output[r] ?? 0) > 0 && dist(p.x, p.y, b.tx, b.ty) <= REACH)
      return `E — collect ${r}`;
  }
  for (const gi of state.ground) {
    if (dist(p.x, p.y, gi.tx, gi.ty) <= REACH) return `E — pick up ${gi.resource}`;
  }
  return null;
}
