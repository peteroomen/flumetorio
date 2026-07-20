import { describe, expect, it, beforeEach } from 'vitest';
import { generateWorld, bandHeight, heightAt } from './world';
import { HEIGHT_BOTTOM, HEIGHT_MID, HEIGHT_TOP } from './constants';
import { tickMachines } from './machines';
import { recomputeFlumePaths, tickFlume, tickIncline, tickTransfers } from './movers';
import { actions, getGame, makeInitialState, checkLetters, ownedTotals } from './store';
import { placementError } from './buildings';
import { buildingStatus, isDropTargetKind, promptFor } from './status';
import type { Building, BuildingKind, GameState } from './types';

function drive(fn: (dt: number) => void, seconds: number, stepMs = 100): void {
  const steps = Math.round((seconds * 1000) / stepMs);
  for (let i = 0; i < steps; i++) fn(stepMs);
}

function mkBuilding(partial: Partial<Building> & Pick<Building, 'kind' | 'tx' | 'ty'>): Building {
  return { id: Math.floor(Math.random() * 1e9), input: {}, output: {}, progress: 0, ...partial };
}

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld(42);
    const b = generateWorld(42);
    expect(a.trees.length).toBe(b.trees.length);
    expect(a.ores.length).toBe(b.ores.length);
    expect(a.tiles.map((t) => t.height)).toEqual(b.tiles.map((t) => t.height));
  });

  it('lays three terrace bands', () => {
    expect(bandHeight(3)).toBe(HEIGHT_TOP);
    expect(bandHeight(15)).toBe(HEIGHT_MID);
    expect(bandHeight(30)).toBe(HEIGHT_BOTTOM);
  });

  it('produces trees and an ore outcrop', () => {
    const w = generateWorld(7);
    expect(w.trees.length).toBeGreaterThan(20);
    expect(w.ores.length).toBeGreaterThan(2);
  });
});

describe('sawmill power gating', () => {
  it('does not saw without a waterwheel in reach; saws with one', () => {
    const g = makeInitialState(1);
    const mill = mkBuilding({ kind: 'sawmill', tx: 5, ty: 5, input: { log: 4 } });
    g.buildings.push(mill);
    drive((dt) => tickMachines(g, dt), 5);
    expect(mill.output.plank ?? 0).toBe(0); // unpowered

    g.buildings.push(mkBuilding({ kind: 'waterwheel', tx: 6, ty: 5 }));
    drive((dt) => tickMachines(g, dt), 5);
    expect(mill.output.plank ?? 0).toBeGreaterThan(0); // powered -> planks
  });
});

describe('furnace heat / going cold', () => {
  it('relights from cold, smelts iron, then goes cold when starved of charcoal', () => {
    const g = makeInitialState(1);
    const furnace = mkBuilding({
      kind: 'furnace',
      tx: 5,
      ty: 25,
      input: { ore: 10, charcoal: 8 },
      heat: 0,
      cold: true,
      fuelTimer: 0,
      relighting: 0,
    });
    g.buildings.push(furnace);

    drive((dt) => tickMachines(g, dt), 25);
    expect(furnace.output.iron ?? 0).toBeGreaterThan(0);
    expect(furnace.cold).toBe(false);

    // Starve it of charcoal and let it cool.
    furnace.input.charcoal = 0;
    drive((dt) => tickMachines(g, dt), 60);
    expect(furnace.heat ?? 0).toBe(0);
    expect(furnace.cold).toBe(true);
  });
});

describe('flume transport', () => {
  it('rides logs downhill and deposits into an adjacent sawmill', () => {
    const g = makeInitialState(1);
    const head = mkBuilding({ kind: 'flumeHead', tx: 5, ty: 5 });
    const t1 = mkBuilding({ kind: 'flume', tx: 5, ty: 6 });
    const t2 = mkBuilding({ kind: 'flume', tx: 5, ty: 7 });
    const mill = mkBuilding({ kind: 'sawmill', tx: 6, ty: 7 });
    g.buildings.push(head, t1, t2, mill);
    recomputeFlumePaths(g);
    expect(head.path?.length).toBe(3);

    g.flumeItems.push({ id: 1, headId: head.id, resource: 'log', progress: 0 });
    drive((dt) => tickFlume(g, dt), 3);
    expect((mill.input.log ?? 0) + g.ground.length).toBeGreaterThan(0);
    expect(mill.input.log ?? 0).toBe(1);
  });
});

describe('incline + feeders', () => {
  it('carries ore to the bottom buffer and feeds an adjacent furnace', () => {
    const g = makeInitialState(1);
    const inc = mkBuilding({ kind: 'incline', tx: 10, ty: 12, input: { ore: 6 }, inclineTimer: 0 });
    const furnace = mkBuilding({ kind: 'furnace', tx: 11, ty: 12, heat: 50, cold: false });
    g.buildings.push(inc, furnace);
    drive((dt) => {
      tickIncline(g, dt);
      tickTransfers(g);
    }, 6);
    expect(furnace.input.ore ?? 0).toBeGreaterThan(0);
  });
});

describe('chests (stockpiles)', () => {
  it('collects a machine output into an adjacent chest', () => {
    const g = makeInitialState(1);
    const mill = mkBuilding({ kind: 'sawmill', tx: 5, ty: 25, output: { plank: 3 } });
    g.buildings.push(mill, mkBuilding({ kind: 'stockpile', tx: 6, ty: 25, store: {} }));
    tickTransfers(g);
    const chest = g.buildings.find((b) => b.kind === 'stockpile')!;
    expect(chest.store?.plank).toBe(3);
    expect(mill.output.plank ?? 0).toBe(0);
  });

  it('feeds an adjacent machine from a chest', () => {
    const g = makeInitialState(1);
    const chest = mkBuilding({ kind: 'stockpile', tx: 5, ty: 25, store: { log: 5 } });
    const mill = mkBuilding({ kind: 'clamp', tx: 6, ty: 25 });
    g.buildings.push(chest, mill);
    tickTransfers(g);
    expect((mill.input.log ?? 0) + (chest.store?.log ?? 0)).toBe(5);
    expect(mill.input.log ?? 0).toBeGreaterThan(0);
  });

  it('a flume tail deposits into an adjacent chest (the reported bug)', () => {
    const g = makeInitialState(1);
    const head = mkBuilding({ kind: 'flumeHead', tx: 5, ty: 5 });
    const t1 = mkBuilding({ kind: 'flume', tx: 5, ty: 6 });
    const chest = mkBuilding({ kind: 'stockpile', tx: 6, ty: 6, store: {} });
    g.buildings.push(head, t1, chest);
    recomputeFlumePaths(g);
    g.flumeItems.push({ id: 1, headId: head.id, resource: 'log', progress: 0 });
    drive((dt) => tickFlume(g, dt), 3);
    expect(chest.store?.log).toBe(1);
    expect(g.ground.length).toBe(0);
  });
});

describe('progression', () => {
  beforeEach(() => actions.init(3));

  it('completes the first letter when planks are shipped to the Wharf', () => {
    const g = getGame();
    expect(g.unlocked).not.toContain('sawmill');
    const wharf = g.buildings.find((b) => b.kind === 'wharf')!;
    wharf.shipped = { plank: 8 };
    checkLetters(g);
    const first = g.letters[0];
    expect(first.done).toBe(true);
    expect(g.unlocked).toContain('waterwheel');
    expect(g.unlocked).toContain('sawmill');
    expect(g.activeLetterId).toBe(g.letters[1].id);
  });

  it('wins when 10 iron is delivered to the blacksmith', () => {
    const g = getGame();
    // fast-forward the plank letters by shipping to the Wharf
    g.buildings.find((b) => b.kind === 'wharf')!.shipped = { plank: 40 };
    checkLetters(g);
    checkLetters(g);
    checkLetters(g);
    g.buildings.push(mkBuilding({ kind: 'blacksmith', tx: 5, ty: 28, delivered: 10 }));
    checkLetters(g);
    expect(g.won).toBe(true);
  });
});

describe('player verbs', () => {
  beforeEach(() => actions.init(1));

  it('chops a tree into logs, then a pit saw turns them into planks in a chest', () => {
    const g = getGame();
    const tree = g.trees.find((t) => t.state === 'tree')!;
    g.player.x = tree.tx + 0.5;
    g.player.y = tree.ty + 0.5;
    actions.interact(); // begin chop
    for (let i = 0; i < 20; i++) actions.updateAction(100);
    expect(g.player.carry).toBe('log');
    expect(g.player.carryCount).toBeGreaterThan(0);

    // A pit saw with a chest beside it: logs → planks → chest.
    g.buildings.push(mkBuilding({ kind: 'pitsaw', tx: 6, ty: 25, input: { log: 3 } }));
    const chest = mkBuilding({ kind: 'stockpile', tx: 7, ty: 25, store: {} });
    g.buildings.push(chest);
    for (let i = 0; i < 140; i++) actions.simStep(100);
    expect(chest.store?.plank ?? 0).toBeGreaterThan(0); // pit saw (unpowered) produced; chest caught it
  });

  it('builds using materials from a nearby chest (cost model A)', () => {
    const g = getGame();
    g.unlocked.push('waterwheel');
    // a chest of planks by the build site; a waterwheel costs 6 planks
    g.buildings.push(mkBuilding({ kind: 'stockpile', tx: 15, ty: 24, store: { plank: 10 } }));
    // find a valid riverbank tile within reach of the chest
    let placed: string | null = 'no spot';
    for (let ty = 22; ty <= 26 && placed; ty++)
      for (let tx = 13; tx <= 18 && placed; tx++)
        if (placementError(g, 'waterwheel', tx, ty) === null) placed = actions.place('waterwheel', tx, ty);
    expect(placed).toBeNull(); // paid from the chest
    const chest = g.buildings.find((b) => b.kind === 'stockpile')!;
    expect(chest.store?.plank).toBe(4); // 10 - 6
  });

  it('deposits carried logs into an adjacent flume head as riding items', () => {
    const g = getGame();
    // give the player logs and stand next to a flume head
    g.player.carry = 'log';
    g.player.carryCount = 3;
    g.buildings.push({ id: 555, kind: 'flumeHead', tx: 8, ty: 8, input: {}, output: {}, progress: 0 });
    g.player.x = 8.5;
    g.player.y = 8.5;
    actions.deposit();
    expect(g.flumeItems.length).toBe(3);
    expect(g.player.carryCount).toBe(0);
  });
});

describe('completable valley (seed 1)', () => {
  function validSpot(
    g: GameState,
    kind: BuildingKind,
    y0: number,
    y1: number,
    pred?: (tx: number, ty: number) => boolean,
  ): { tx: number; ty: number } | null {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = 1; tx < 33; tx++) {
        if (pred && !pred(tx, ty)) continue;
        if (placementError(g, kind, tx, ty) === null) return { tx, ty };
      }
    }
    return null;
  }
  function neighborSpot(
    g: GameState,
    kind: BuildingKind,
    c: { tx: number; ty: number },
    exclude: Array<{ tx: number; ty: number }> = [],
  ): { tx: number; ty: number } | null {
    for (const n of [
      { tx: c.tx + 1, ty: c.ty },
      { tx: c.tx - 1, ty: c.ty },
      { tx: c.tx, ty: c.ty + 1 },
      { tx: c.tx, ty: c.ty - 1 },
    ]) {
      if (exclude.some((e) => e.tx === n.tx && e.ty === n.ty)) continue;
      if (placementError(g, kind, n.tx, n.ty) === null) return n;
    }
    return null;
  }
  it('builds the automated furnace line on the real map and smelts iron', () => {
    actions.init(1);
    const g = getGame();
    const push = (kind: BuildingKind, tx: number, ty: number, extra: Partial<Building> = {}) => {
      const b = mkBuilding({ kind, tx, ty, ...extra });
      g.buildings.push(b);
      return b;
    };

    // Powered sawmill + collecting chest on the works terrace.
    const ww = validSpot(g, 'waterwheel', 22, 32)!;
    expect(ww, 'a riverbank tile exists').toBeTruthy();
    push('waterwheel', ww.tx, ww.ty);
    const mill = validSpot(g, 'sawmill', 22, 32, (tx, ty) => Math.hypot(tx - ww.tx, ty - ww.ty) <= 4)!;
    expect(mill, 'a sawmill fits within power reach').toBeTruthy();
    push('sawmill', mill.tx, mill.ty, { input: { log: 6 } });
    const millPile = neighborSpot(g, 'stockpile', mill)!;
    const chest = push('stockpile', millPile.tx, millPile.ty, { store: {} });
    for (let i = 0; i < 140; i++) actions.simStep(100);
    expect(chest.store?.plank ?? 0).toBeGreaterThan(0); // powered sawmill → chest

    // Automated furnace: incline (ore) + clamp (charcoal) feeding one furnace.
    const inc = validSpot(g, 'incline', 19, 21)!;
    expect(inc, 'a cliff-edge incline site exists near the ore').toBeTruthy();
    push('incline', inc.tx, inc.ty, { inclineTimer: 0, input: { ore: 12 } });
    const furn = neighborSpot(g, 'furnace', inc)!;
    expect(furn, 'a furnace fits beside the incline').toBeTruthy();
    const furnB = push('furnace', furn.tx, furn.ty, { heat: 0, cold: true, fuelTimer: 0, relighting: 0 });
    const clamp = neighborSpot(g, 'clamp', furn, [inc])!;
    expect(clamp, 'a clamp fits beside the furnace').toBeTruthy();
    push('clamp', clamp.tx, clamp.ty, { input: { log: 8 } });

    for (let i = 0; i < 450; i++) actions.simStep(100);
    expect(furnB.output.iron ?? 0).toBeGreaterThan(0); // iron smelted on the real map
  });
});

describe('guidance derivations', () => {
  beforeEach(() => actions.init(1));

  it('reports why a machine is not running', () => {
    const g = getGame();
    const mill = mkBuilding({ kind: 'sawmill', tx: 5, ty: 25 });
    g.buildings.push(mill);
    expect(buildingStatus(g, mill)?.key).toBe('noPower');
    g.buildings.push(mkBuilding({ kind: 'waterwheel', tx: 6, ty: 25 }));
    expect(buildingStatus(g, mill)?.key).toBe('needsInput'); // powered but no logs
    mill.input.log = 2;
    expect(buildingStatus(g, mill)?.key).toBe('running');

    const furnace = mkBuilding({ kind: 'furnace', tx: 5, ty: 27, heat: 0, cold: true });
    g.buildings.push(furnace);
    expect(buildingStatus(g, furnace)?.key).toBe('needsFuel');
  });

  it('offers the right contextual prompt', () => {
    const g = getGame();
    const tree = g.trees.find((t) => t.state === 'tree')!;
    g.player.x = tree.tx + 0.5;
    g.player.y = tree.ty + 0.5;
    expect(promptFor(g)).toBe('E — fell timber');

    g.player.carry = 'log';
    g.player.carryCount = 2;
    g.buildings.push(mkBuilding({ kind: 'flumeHead', tx: 8, ty: 8 }));
    g.player.x = 8.5;
    g.player.y = 8.5;
    expect(promptFor(g)).toBe('Q — tip logs into the flume');
  });

  it('a cold furnace asks for fuel; a hot one asks for ore', () => {
    const g = getGame();
    const cold = mkBuilding({ kind: 'furnace', tx: 5, ty: 25, heat: 0, cold: true });
    const hot = mkBuilding({ kind: 'furnace', tx: 8, ty: 25, heat: 80, cold: false, input: { charcoal: 5 } });
    g.buildings.push(cold, hot);
    const cs = buildingStatus(g, cold)!;
    expect(cs.key).toBe('needsFuel');
    expect(cs.want).toBe('charcoal');
    expect(buildingStatus(g, hot)?.want).toBe('ore');
  });

  it('a blacksmith draws iron from an adjacent chest toward the goal', () => {
    const g = getGame();
    g.buildings.push(mkBuilding({ kind: 'blacksmith', tx: 5, ty: 25 }));
    const chest = mkBuilding({ kind: 'stockpile', tx: 6, ty: 25, store: { iron: 4 } });
    g.buildings.push(chest);
    for (let i = 0; i < 6; i++) actions.simStep(100);
    const smith = g.buildings.find((b) => b.kind === 'blacksmith')!;
    expect(smith.delivered ?? 0).toBeGreaterThan(0);
    expect(chest.store?.iron ?? 0).toBeLessThan(4);
  });

  it('knows valid drop targets by resource (wharf + chest take anything)', () => {
    expect(isDropTargetKind(mkBuilding({ kind: 'blacksmith', tx: 0, ty: 0 }), 'iron')).toBe(true);
    expect(isDropTargetKind(mkBuilding({ kind: 'flumeHead', tx: 0, ty: 0 }), 'iron')).toBe(false);
    expect(isDropTargetKind(mkBuilding({ kind: 'incline', tx: 0, ty: 0 }), 'ore')).toBe(true);
    expect(isDropTargetKind(mkBuilding({ kind: 'wharf', tx: 0, ty: 0 }), 'plank')).toBe(true);
  });
});

describe('economy: wharf delivery + owned totals', () => {
  beforeEach(() => actions.init(1));

  it('shipping planks to the wharf progresses the Company letter', () => {
    const g = getGame();
    const wharf = g.buildings.find((b) => b.kind === 'wharf')!;
    g.player.x = wharf.tx + 0.5;
    g.player.y = wharf.ty + 0.5;
    g.player.carry = 'plank';
    g.player.carryCount = 8;
    actions.deposit();
    expect(wharf.shipped?.plank).toBe(8);
    expect(g.letters[0].done).toBe(true); // letter 1 wants 8 planks shipped
  });

  it('owned totals sum the barrow and chests', () => {
    const g = getGame();
    g.player.carry = 'plank';
    g.player.carryCount = 3;
    g.buildings.push(mkBuilding({ kind: 'stockpile', tx: 5, ty: 25, store: { plank: 4, log: 2 } }));
    const t = ownedTotals(g);
    expect(t.plank).toBe(7);
    expect(t.log).toBe(2);
  });
});

describe('serialization', () => {
  it('round-trips the game state through JSON', () => {
    const g = makeInitialState(9);
    const clone = JSON.parse(JSON.stringify(g)) as GameState;
    expect(clone.tiles.length).toBe(g.tiles.length);
    expect(clone.player.x).toBe(g.player.x);
    expect(heightAt(clone.tiles, 5, 3)).toBe(heightAt(g.tiles, 5, 3));
  });
});
