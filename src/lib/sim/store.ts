// The single source of truth: a Zustand-vanilla store holding the GameState plus all actions.
// Pure-ish — mutates the game object in place and bumps a revision for UI subscribers.
// The renderer polls getState() each frame; the HUD subscribes to `rev`.

import { createStore } from 'zustand/vanilla';
import {
  BARROW_CAPACITY,
  CHOP_MS,
  INCLINE_BUFFER_CAP,
  MINE_MS,
  ORE_NODE_YIELD,
  ORE_REGROW_MS,
  PLAYER_BASE_SPEED,
  PLAYER_LADEN_SPEED,
  REACH,
  SAPLING_GROW_MS,
  SAW_MS,
  TREE_LOG_YIELD,
} from './constants';
import { ALL_RESOURCES, type Building, type BuildingKind, type GameState, type ResourceKind } from './types';
import { generateWorld, idx, inBounds, isWaterAt } from './world';
import { BUILDINGS, canAfford, placementError } from './buildings';
import { FURNACE_CHARCOAL_CAP } from './constants';
import { add, count } from './buffers';
import { inputCap, tickMachines, bankAllOutputs } from './machines';
import { recomputeFlumePaths, tickFeeders, tickFlume, tickIncline } from './movers';
import { allUnlocksFor, initialLetters } from './progression';

export interface StoreShape {
  game: GameState;
  rev: number;
}

function emptyBank(): Record<ResourceKind, number> {
  return { log: 0, plank: 0, ore: 0, charcoal: 0, iron: 0 };
}

export function makeInitialState(seed: number): GameState {
  const world = generateWorld(seed);
  const letters = initialLetters();
  // Player starts at the works terrace, near the river mouth at the bottom.
  const startX = Math.round(34 * 0.5) - 3;
  const startY = 27;
  return {
    seed,
    timeMs: 0,
    tiles: world.tiles,
    trees: world.trees,
    ores: world.ores,
    buildings: [],
    flumeItems: [],
    ground: [],
    player: {
      x: startX + 0.5,
      y: startY + 0.5,
      facing: 0,
      carry: null,
      carryCount: 0,
      actionKind: null,
      actionTargetId: null,
      actionProgress: 0,
    },
    bank: emptyBank(),
    letters,
    activeLetterId: letters[0].id,
    unlocked: ['stockpile', 'blacksmith'],
    nextId: 100000,
    won: false,
    toast: null,
  };
}

export const store = createStore<StoreShape>(() => ({
  game: makeInitialState(1),
  rev: 0,
}));

function bump(): void {
  store.setState((s) => ({ rev: s.rev + 1 }));
}

export function getGame(): GameState {
  return store.getState().game;
}

function toast(g: GameState, msg: string): void {
  g.toast = msg;
}

// ---------- geometry helpers ----------
function centerDist(px: number, py: number, tx: number, ty: number): number {
  return Math.hypot(px - (tx + 0.5), py - (ty + 0.5));
}

function barrowRoom(g: GameState): number {
  return BARROW_CAPACITY - g.player.carryCount;
}

function canCarry(g: GameState, res: ResourceKind): boolean {
  if (g.player.carry === null) return true;
  return g.player.carry === res && barrowRoom(g) > 0;
}

function addToBarrow(g: GameState, res: ResourceKind, n: number): number {
  if (!canCarry(g, res)) return 0;
  const put = Math.min(n, barrowRoom(g));
  if (put <= 0) return 0;
  g.player.carry = res;
  g.player.carryCount += put;
  return put;
}

// ---------- movement ----------
function playerSpeed(g: GameState): number {
  const frac = g.player.carryCount / BARROW_CAPACITY;
  return PLAYER_BASE_SPEED + (PLAYER_LADEN_SPEED - PLAYER_BASE_SPEED) * frac;
}

function blocked(g: GameState, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return true;
  return isWaterAt(g.tiles, tx, ty);
}

export const actions = {
  init(seed: number): void {
    store.setState({ game: makeInitialState(seed), rev: 0 });
  },

  load(state: GameState): void {
    store.setState({ game: state, rev: 0 });
    recomputeFlumePaths(getGame());
    bump();
  },

  // Per-frame smooth movement. vx/vy are a unit-ish direction; dtSec seconds.
  movePlayer(dtSec: number, vx: number, vy: number): void {
    const g = getGame();
    const p = g.player;
    if (vx !== 0 || vy !== 0) {
      // moving cancels a stationary action
      if (p.actionKind) {
        p.actionKind = null;
        p.actionTargetId = null;
        p.actionProgress = 0;
      }
      const len = Math.hypot(vx, vy) || 1;
      const nx = (vx / len) * playerSpeed(g) * dtSec;
      const ny = (vy / len) * playerSpeed(g) * dtSec;
      p.facing = Math.atan2(ny, nx);
      if (!blocked(g, p.x + nx, p.y)) p.x += nx;
      if (!blocked(g, p.x, p.y + ny)) p.y += ny;
    }
  },

  // Advance any in-progress action (chop/mine/saw). dtMs.
  updateAction(dtMs: number): void {
    const g = getGame();
    const p = g.player;
    if (!p.actionKind) return;
    p.actionProgress += dtMs;
    if (p.actionKind === 'chop' && p.actionProgress >= CHOP_MS) {
      const tree = g.trees.find((t) => t.id === p.actionTargetId);
      if (tree && tree.state === 'tree') {
        tree.state = 'stump';
        tree.regrowAtMs = g.timeMs + SAPLING_GROW_MS;
        g.tiles[idx(tree.tx, tree.ty)].terrain = 'grass';
        const toBarrow = addToBarrow(g, 'log', TREE_LOG_YIELD);
        const rest = TREE_LOG_YIELD - toBarrow;
        if (rest > 0) dropGroundAt(g, tree.tx, tree.ty, 'log', rest);
      }
      p.actionKind = null;
      p.actionProgress = 0;
      bump();
    } else if (p.actionKind === 'mine' && p.actionProgress >= MINE_MS) {
      const ore = g.ores.find((o) => o.id === p.actionTargetId);
      if (ore && ore.remaining > 0) {
        const got = Math.min(ORE_NODE_YIELD, ore.remaining);
        ore.remaining -= got;
        if (ore.remaining <= 0) ore.regrowAtMs = g.timeMs + ORE_REGROW_MS;
        const toBarrow = addToBarrow(g, 'ore', got);
        const rest = got - toBarrow;
        if (rest > 0) dropGroundAt(g, ore.tx, ore.ty, 'ore', rest);
      }
      p.actionKind = null;
      p.actionProgress = 0;
      bump();
    } else if (p.actionKind === 'saw' && p.actionProgress >= SAW_MS) {
      // Hand pit-saw: consume 1 carried log, bank 1 plank.
      if (g.player.carry === 'log' && g.player.carryCount > 0) {
        g.player.carryCount -= 1;
        if (g.player.carryCount === 0) g.player.carry = null;
        g.bank.plank += 1;
        checkLetters(g);
      }
      p.actionKind = null;
      p.actionProgress = 0;
      bump();
    }
  },

  // Context action (E): chop / mine / collect / pick up.
  interact(): void {
    const g = getGame();
    const p = g.player;
    if (p.actionKind) return; // already busy

    // 1) tree
    let best: { d: number; id: number } | null = null;
    for (const t of g.trees) {
      if (t.state !== 'tree') continue;
      const d = centerDist(p.x, p.y, t.tx, t.ty);
      if (d <= REACH && (!best || d < best.d)) best = { d, id: t.id };
    }
    if (best && canCarry(g, 'log')) {
      p.actionKind = 'chop';
      p.actionTargetId = best.id;
      p.actionProgress = 0;
      bump();
      return;
    }
    // 2) ore
    best = null;
    for (const o of g.ores) {
      if (o.remaining <= 0) continue;
      const d = centerDist(p.x, p.y, o.tx, o.ty);
      if (d <= REACH && (!best || d < best.d)) best = { d, id: o.id };
    }
    if (best && canCarry(g, 'ore')) {
      p.actionKind = 'mine';
      p.actionTargetId = best.id;
      p.actionProgress = 0;
      bump();
      return;
    }
    // 3) collect a machine's output
    const outMap: Partial<Record<BuildingKind, ResourceKind>> = {
      sawmill: 'plank',
      clamp: 'charcoal',
      furnace: 'iron',
    };
    for (const b of g.buildings) {
      const res = outMap[b.kind];
      if (!res) continue;
      if (centerDist(p.x, p.y, b.tx, b.ty) > REACH) continue;
      const avail = b.output[res] ?? 0;
      if (avail > 0 && canCarry(g, res)) {
        const moved = addToBarrow(g, res, avail);
        b.output[res] = avail - moved;
        bump();
        return;
      }
    }
    // 4) ground item
    let bestG: { d: number; id: number } | null = null;
    for (const it of g.ground) {
      const d = centerDist(p.x, p.y, it.tx, it.ty);
      if (d <= REACH && canCarry(g, it.resource) && (!bestG || d < bestG.d)) bestG = { d, id: it.id };
    }
    if (bestG) {
      const it = g.ground.find((x) => x.id === bestG!.id)!;
      const moved = addToBarrow(g, it.resource, it.count);
      it.count -= moved;
      if (it.count <= 0) g.ground = g.ground.filter((x) => x.id !== it.id);
      bump();
    }
  },

  // Deposit / deliver (Q): put carried goods into the best adjacent target.
  deposit(): void {
    const g = getGame();
    const p = g.player;
    if (!p.carry || p.carryCount <= 0) return;
    const res = p.carry;

    const near = (b: Building): boolean => centerDist(p.x, p.y, b.tx, b.ty) <= REACH + 0.15;

    // Priority-ordered targets.
    const pick = (kind: BuildingKind): Building | undefined =>
      g.buildings.find((b) => b.kind === kind && near(b));

    if (res === 'iron') {
      const smith = pick('blacksmith');
      if (smith) {
        smith.delivered = (smith.delivered ?? 0) + p.carryCount;
        clearCarry(p);
        checkLetters(g);
        bump();
        return;
      }
    }
    if (res === 'log') {
      const head = pick('flumeHead');
      if (head) {
        for (let i = 0; i < p.carryCount; i++) {
          g.flumeItems.push({ id: g.nextId++, headId: head.id, resource: 'log', progress: 0 });
        }
        clearCarry(p);
        bump();
        return;
      }
      const mill = g.buildings.find(
        (b) => (b.kind === 'sawmill' || b.kind === 'clamp') && near(b) && count(b.input, 'log') < inputCap(b, 'log'),
      );
      if (mill) {
        const moved = add(mill.input, 'log', p.carryCount, inputCap(mill, 'log'));
        removeCarry(p, moved);
        bump();
        return;
      }
    }
    if (res === 'ore') {
      const inc = pick('incline');
      if (inc) {
        const moved = add(inc.input, 'ore', p.carryCount, INCLINE_BUFFER_CAP);
        removeCarry(p, moved);
        bump();
        return;
      }
      const furn = pick('furnace');
      if (furn) {
        const moved = add(furn.input, 'ore', p.carryCount, inputCap(furn, 'ore'));
        removeCarry(p, moved);
        bump();
        return;
      }
    }
    if (res === 'charcoal') {
      const furn = pick('furnace');
      if (furn) {
        const moved = add(furn.input, 'charcoal', p.carryCount, FURNACE_CHARCOAL_CAP);
        removeCarry(p, moved);
        bump();
        return;
      }
    }
    // Stockpile banks anything.
    const pile = pick('stockpile');
    if (pile) {
      g.bank[res] += p.carryCount;
      clearCarry(p);
      checkLetters(g);
      bump();
      return;
    }
    // Otherwise drop on the ground at the player's feet.
    dropGroundAt(g, Math.floor(p.x), Math.floor(p.y), res, p.carryCount);
    clearCarry(p);
    bump();
  },

  // Hand pit-saw a carried log into a banked plank.
  handSaw(): void {
    const g = getGame();
    const p = g.player;
    if (p.actionKind) return;
    if (p.carry !== 'log' || p.carryCount <= 0) return;
    p.actionKind = 'saw';
    p.actionTargetId = null;
    p.actionProgress = 0;
    bump();
  },

  // Attempt to place a building. Returns null on success or an error string.
  place(kind: BuildingKind, tx: number, ty: number): string | null {
    const g = getGame();
    if (!g.unlocked.includes(kind)) return 'Not yet unlocked.';
    if (!canAfford(g, kind)) return 'Not enough planks in the bank.';
    const err = placementError(g, kind, tx, ty);
    if (err) return err;
    // pay
    for (const [r, n] of Object.entries(BUILDINGS[kind].cost)) {
      g.bank[r as ResourceKind] -= n ?? 0;
    }
    const b: Building = {
      id: g.nextId++,
      kind,
      tx,
      ty,
      input: {},
      output: {},
      progress: 0,
    };
    if (kind === 'furnace') {
      b.heat = 0;
      b.cold = true;
      b.fuelTimer = 0;
      b.relighting = 0;
    }
    if (kind === 'incline') b.inclineTimer = 0;
    if (kind === 'blacksmith') b.delivered = 0;
    g.buildings.push(b);
    if (kind === 'flume' || kind === 'flumeHead') recomputeFlumePaths(g);
    bump();
    return null;
  },

  // Fixed sim step (dtMs). Advances machines, movers, feeders, banking, regrowth, letters.
  simStep(dtMs: number): void {
    const g = getGame();
    g.timeMs += dtMs;
    tickMachines(g, dtMs);
    tickFlume(g, dtMs);
    tickIncline(g, dtMs);
    tickFeeders(g);
    bankAllOutputs(g);
    regrow(g);
    checkLetters(g);
    bump();
  },
};

// ---------- internal helpers ----------
function clearCarry(p: GameState['player']): void {
  p.carry = null;
  p.carryCount = 0;
}
function removeCarry(p: GameState['player'], n: number): void {
  p.carryCount -= n;
  if (p.carryCount <= 0) clearCarry(p);
}

function dropGroundAt(g: GameState, tx: number, ty: number, res: ResourceKind, n: number): void {
  const existing = g.ground.find((x) => x.tx === tx && x.ty === ty && x.resource === res);
  if (existing) existing.count += n;
  else g.ground.push({ id: g.nextId++, tx, ty, resource: res, count: n });
}

function regrow(g: GameState): void {
  for (const t of g.trees) {
    if (t.state === 'stump' && t.regrowAtMs > 0 && g.timeMs >= t.regrowAtMs) {
      t.state = 'tree';
      t.regrowAtMs = 0;
      g.tiles[idx(t.tx, t.ty)].terrain = 'forest';
    }
  }
  for (const o of g.ores) {
    if (o.remaining <= 0 && o.regrowAtMs > 0 && g.timeMs >= o.regrowAtMs) {
      o.remaining = 6;
      o.regrowAtMs = 0;
    }
  }
}

export function checkLetters(g: GameState): void {
  if (g.won) return;
  const letter = g.letters.find((l) => l.id === g.activeLetterId);
  if (!letter || letter.done) return;
  let satisfied = false;
  if (letter.sink === 'company') {
    satisfied = (g.bank[letter.wantResource] ?? 0) >= letter.wantCount;
  } else {
    const smith = g.buildings.find((b) => b.kind === 'blacksmith');
    satisfied = (smith?.delivered ?? 0) >= letter.wantCount;
  }
  if (!satisfied) return;
  letter.done = true;
  g.unlocked = allUnlocksFor(g.letters);
  const next = g.letters.find((l) => !l.done);
  g.activeLetterId = next ? next.id : null;
  if (!next) {
    g.won = true;
    toast(g, 'The town is begun. The blacksmith’s forge is lit. (You win!)');
  } else {
    toast(g, `Drawings received: ${letter.unlocks.map((u) => BUILDINGS[u].label).join(', ') || 'the town grows'}.`);
  }
}

// Re-export for the HUD.
export { ALL_RESOURCES };
