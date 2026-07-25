// Machine tick logic: power, sawmill, charcoal clamp, blast furnace, and output banking.
// Pure functions that mutate the passed buildings / bank. Exercised in Vitest.

import {
  CLAMP_CHARCOAL_PER_CYCLE,
  CLAMP_CYCLE_MS,
  CLAMP_IN_CAP,
  CLAMP_LOG_PER_CYCLE,
  CLAMP_OUT_CAP,
  FURNACE_CHARCOAL_CAP,
  FURNACE_CYCLE_MS,
  FURNACE_FUEL_BURN_MS,
  FURNACE_HEAT_DECAY_PER_S,
  FURNACE_HEAT_PER_CHARCOAL,
  FURNACE_IRON_CAP,
  FURNACE_IRON_PER_CYCLE,
  FURNACE_MAX_HEAT,
  FURNACE_MIN_SMELT_HEAT,
  FURNACE_ORE_PER_CYCLE,
  FURNACE_RELIGHT_CHARCOAL,
  FURNACE_RELIGHT_MS,
  PITSAW_CYCLE_MS,
  PITSAW_IN_CAP,
  PITSAW_LOG_PER_CYCLE,
  PITSAW_OUT_CAP,
  PITSAW_PLANK_PER_CYCLE,
  SAWMILL_CYCLE_MS,
  SAWMILL_IN_CAP,
  SAWMILL_LOG_PER_CYCLE,
  SAWMILL_OUT_CAP,
  SAWMILL_PLANK_PER_CYCLE,
  WATERWHEEL_POWER_RADIUS,
} from './constants';
import { add, count, take, total } from './buffers';
import type { Building, GameState, ResourceKind } from './types';

export function isPoweredAt(state: GameState, tx: number, ty: number): boolean {
  for (const b of state.buildings) {
    if (b.kind !== 'waterwheel') continue;
    const d = Math.hypot(b.tx - tx, b.ty - ty);
    if (d <= WATERWHEEL_POWER_RADIUS) return true;
  }
  return false;
}

export function recomputePower(state: GameState): void {
  for (const b of state.buildings) {
    if (b.kind === 'sawmill') b.powered = isPoweredAt(state, b.tx, b.ty);
  }
}

function tickSawmill(b: Building, dt: number): void {
  if (!b.powered) {
    return; // no shaft power, no saw
  }
  const hasLog = count(b.input, 'log') >= SAWMILL_LOG_PER_CYCLE;
  const hasRoom = total(b.output) + SAWMILL_PLANK_PER_CYCLE <= SAWMILL_OUT_CAP;
  if (!hasLog || !hasRoom) {
    return;
  }
  b.progress += dt;
  if (b.progress >= SAWMILL_CYCLE_MS) {
    b.progress -= SAWMILL_CYCLE_MS;
    take(b.input, 'log', SAWMILL_LOG_PER_CYCLE);
    add(b.output, 'plank', SAWMILL_PLANK_PER_CYCLE, SAWMILL_OUT_CAP);
  }
}

function tickPitsaw(b: Building, dt: number): void {
  // Free, unpowered, slow: log -> plank. No power gate (nature's grain is free).
  const hasLog = count(b.input, 'log') >= PITSAW_LOG_PER_CYCLE;
  const hasRoom = total(b.output) + PITSAW_PLANK_PER_CYCLE <= PITSAW_OUT_CAP;
  if (!hasLog || !hasRoom) return;
  b.progress += dt;
  if (b.progress >= PITSAW_CYCLE_MS) {
    b.progress -= PITSAW_CYCLE_MS;
    take(b.input, 'log', PITSAW_LOG_PER_CYCLE);
    add(b.output, 'plank', PITSAW_PLANK_PER_CYCLE, PITSAW_OUT_CAP);
  }
}

function tickClamp(b: Building, dt: number): void {
  const hasLog = count(b.input, 'log') >= CLAMP_LOG_PER_CYCLE;
  const hasRoom = total(b.output) + CLAMP_CHARCOAL_PER_CYCLE <= CLAMP_OUT_CAP;
  if (!hasLog || !hasRoom) return;
  b.progress += dt;
  if (b.progress >= CLAMP_CYCLE_MS) {
    b.progress -= CLAMP_CYCLE_MS;
    take(b.input, 'log', CLAMP_LOG_PER_CYCLE);
    add(b.output, 'charcoal', CLAMP_CHARCOAL_PER_CYCLE, CLAMP_OUT_CAP);
  }
}

function tickFurnace(b: Building, dt: number): void {
  const dts = dt / 1000;
  b.heat = Math.max(0, (b.heat ?? 0) - FURNACE_HEAT_DECAY_PER_S * dts);

  if ((b.heat ?? 0) <= 0) b.cold = true;

  // A cold furnace must be relit — a charcoal + a wait — before it will hold heat again.
  if (b.cold) {
    if ((b.relighting ?? 0) <= 0) {
      if (count(b.input, 'charcoal') >= FURNACE_RELIGHT_CHARCOAL) {
        take(b.input, 'charcoal', FURNACE_RELIGHT_CHARCOAL);
        b.relighting = FURNACE_RELIGHT_MS;
      }
      // else: sit cold, waiting for charcoal to be delivered
    } else {
      b.relighting = (b.relighting ?? 0) - dt;
      if ((b.relighting ?? 0) <= 0) {
        b.relighting = 0;
        b.cold = false;
        b.heat = FURNACE_MIN_SMELT_HEAT;
      }
    }
    b.progress = 0;
    return;
  }

  // Auto-stoke: burn charcoal on a cadence to keep the heat up.
  b.fuelTimer = (b.fuelTimer ?? 0) - dt;
  if ((b.fuelTimer ?? 0) <= 0) {
    b.fuelTimer = FURNACE_FUEL_BURN_MS;
    if ((b.heat ?? 0) < FURNACE_MAX_HEAT && count(b.input, 'charcoal') >= 1) {
      take(b.input, 'charcoal', 1);
      b.heat = Math.min(FURNACE_MAX_HEAT, (b.heat ?? 0) + FURNACE_HEAT_PER_CHARCOAL);
    }
  }

  // Smelt ore -> iron while hot enough.
  const hot = (b.heat ?? 0) >= FURNACE_MIN_SMELT_HEAT;
  const hasOre = count(b.input, 'ore') >= FURNACE_ORE_PER_CYCLE;
  const hasRoom = (b.output.iron ?? 0) + FURNACE_IRON_PER_CYCLE <= FURNACE_IRON_CAP;
  if (hot && hasOre && hasRoom) {
    b.progress += dt;
    if (b.progress >= FURNACE_CYCLE_MS) {
      b.progress -= FURNACE_CYCLE_MS;
      take(b.input, 'ore', FURNACE_ORE_PER_CYCLE);
      b.output.iron = (b.output.iron ?? 0) + FURNACE_IRON_PER_CYCLE;
    }
  } else {
    b.progress = 0;
  }
}

// Input capacity per machine/resource — used by feed transfers.
export function inputCap(b: Building, res: ResourceKind): number {
  switch (b.kind) {
    case 'pitsaw':
      return res === 'log' ? PITSAW_IN_CAP : 0;
    case 'sawmill':
      return res === 'log' ? SAWMILL_IN_CAP : 0;
    case 'clamp':
      return res === 'log' ? CLAMP_IN_CAP : 0;
    case 'furnace':
      if (res === 'ore') return FURNACE_ORE_PER_CYCLE * 6; // ore bunker
      if (res === 'charcoal') return FURNACE_CHARCOAL_CAP;
      return 0;
    default:
      return 0;
  }
}

function adjacentStockpile(state: GameState, b: Building): boolean {
  return state.buildings.some(
    (s) => s.kind === 'stockpile' && Math.abs(s.tx - b.tx) + Math.abs(s.ty - b.ty) === 1,
  );
}

// Machine outputs bank themselves if a stockpile sits beside them (the automation reward).
export function bankAllOutputs(state: GameState): void {
  for (const b of state.buildings) {
    // A dock beside a stockpile banks what the wagon brought, so rail→stockpile automates the
    // last metre the same way a mill beside one does.
    if (
      b.kind !== 'pitsaw' &&
      b.kind !== 'sawmill' &&
      b.kind !== 'clamp' &&
      b.kind !== 'furnace' &&
      b.kind !== 'railDock'
    )
      continue;
    if (!adjacentStockpile(state, b)) continue;
    for (const res of Object.keys(b.output) as ResourceKind[]) {
      const n = b.output[res] ?? 0;
      if (n > 0) {
        state.bank[res] += n;
        b.output[res] = 0;
      }
    }
  }
}

export function tickMachines(state: GameState, dt: number): void {
  recomputePower(state);
  for (const b of state.buildings) {
    switch (b.kind) {
      case 'pitsaw':
        tickPitsaw(b, dt);
        break;
      case 'sawmill':
        tickSawmill(b, dt);
        break;
      case 'clamp':
        tickClamp(b, dt);
        break;
      case 'furnace':
        tickFurnace(b, dt);
        break;
      default:
        break;
    }
  }
}
