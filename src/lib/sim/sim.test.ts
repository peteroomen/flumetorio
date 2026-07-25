import { describe, expect, it, beforeEach } from 'vitest';
import { generateWorld, bandHeight, heightAt } from './world';
import { CLAMP_OUT_CAP, FURNACE_IRON_CAP, HEIGHT_BOTTOM, HEIGHT_MID, HEIGHT_TOP } from './constants';
import { tickMachines, bankAllOutputs } from './machines';
import { recomputeFlumePaths, tickFlume, tickIncline, tickFeeders } from './movers';
import { actions, getGame, makeInitialState, checkLetters } from './store';
import { placementError } from './buildings';
import { recomputeRailRoutes, tickRail } from './rail';
import { allUnlocksFor } from './progression';
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
      tickFeeders(g);
    }, 6);
    expect(furnace.input.ore ?? 0).toBeGreaterThan(0);
  });
});

describe('output banking', () => {
  it('banks a sawmill output when a stockpile sits beside it', () => {
    const g = makeInitialState(1);
    const mill = mkBuilding({ kind: 'sawmill', tx: 5, ty: 25, output: { plank: 3 } });
    g.buildings.push(mill, mkBuilding({ kind: 'stockpile', tx: 6, ty: 25 }));
    bankAllOutputs(g);
    expect(g.bank.plank).toBe(3);
    expect(mill.output.plank ?? 0).toBe(0);
  });
});

describe('progression', () => {
  beforeEach(() => actions.init(3));

  it('completes the first letter and unlocks the waterwheel + sawmill', () => {
    const g = getGame();
    expect(g.unlocked).not.toContain('sawmill');
    g.bank.plank = 8;
    checkLetters(g);
    const first = g.letters[0];
    expect(first.done).toBe(true);
    expect(g.unlocked).toContain('waterwheel');
    expect(g.unlocked).toContain('sawmill');
    expect(g.activeLetterId).toBe(g.letters[1].id);
  });

  it('wins when 10 iron is delivered to the blacksmith', () => {
    const g = getGame();
    // fast-forward the plank letters
    g.bank.plank = 40;
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

  it('chops a tree into logs, then a pit saw turns them into banked planks', () => {
    const g = getGame();
    const tree = g.trees.find((t) => t.state === 'tree')!;
    g.player.x = tree.tx + 0.5;
    g.player.y = tree.ty + 0.5;
    actions.interact(); // begin chop
    for (let i = 0; i < 20; i++) actions.updateAction(100);
    expect(g.player.carry).toBe('log');
    expect(g.player.carryCount).toBeGreaterThan(0);

    // Build a pit saw (free, unlocked from start) + a stockpile beside it to bank planks.
    expect(actions.place('pitsaw', 6, 25)).toBeNull();
    expect(actions.place('stockpile', 7, 25)).toBeNull();
    const saw = g.buildings.find((b) => b.kind === 'pitsaw')!;
    saw.input.log = 3;
    for (let i = 0; i < 140; i++) actions.simStep(100);
    expect(g.bank.plank).toBeGreaterThan(0); // pit saw (unpowered) produced + banked planks
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
  const find = (g: GameState, tx: number, ty: number) => g.buildings.find((b) => b.tx === tx && b.ty === ty)!;

  it('builds the automated furnace line on the real map and smelts iron', () => {
    actions.init(1);
    const g = getGame();
    g.unlocked = ['stockpile', 'waterwheel', 'sawmill', 'flumeHead', 'flume', 'clamp', 'incline', 'furnace', 'blacksmith'];
    g.bank.plank = 999;

    // Powered sawmill + banking stockpile on the works terrace.
    const ww = validSpot(g, 'waterwheel', 22, 32)!;
    expect(ww, 'a riverbank tile exists').toBeTruthy();
    expect(actions.place('waterwheel', ww.tx, ww.ty)).toBeNull();
    const mill = validSpot(g, 'sawmill', 22, 32, (tx, ty) => Math.hypot(tx - ww.tx, ty - ww.ty) <= 4)!;
    expect(mill, 'a sawmill fits within power reach').toBeTruthy();
    expect(actions.place('sawmill', mill.tx, mill.ty)).toBeNull();
    const millPile = neighborSpot(g, 'stockpile', mill)!;
    expect(actions.place('stockpile', millPile.tx, millPile.ty)).toBeNull();

    const beforePlank = g.bank.plank;
    find(g, mill.tx, mill.ty).input.log = 6;
    for (let i = 0; i < 140; i++) actions.simStep(100);
    expect(g.bank.plank).toBeGreaterThan(beforePlank); // powered sawmill banked planks

    // Automated furnace: incline (ore) + clamp (charcoal) feeding one furnace.
    const inc = validSpot(g, 'incline', 19, 21)!;
    expect(inc, 'a cliff-edge incline site exists near the ore').toBeTruthy();
    expect(actions.place('incline', inc.tx, inc.ty)).toBeNull();
    const furn = neighborSpot(g, 'furnace', inc)!;
    expect(furn, 'a furnace fits beside the incline').toBeTruthy();
    expect(actions.place('furnace', furn.tx, furn.ty)).toBeNull();
    const clamp = neighborSpot(g, 'clamp', furn, [inc])!;
    expect(clamp, 'a clamp fits beside the furnace').toBeTruthy();
    expect(actions.place('clamp', clamp.tx, clamp.ty)).toBeNull();

    find(g, inc.tx, inc.ty).input.ore = 12;
    find(g, clamp.tx, clamp.ty).input.log = 8;
    for (let i = 0; i < 450; i++) actions.simStep(100);
    expect(find(g, furn.tx, furn.ty).output.iron ?? 0).toBeGreaterThan(0); // iron smelted on the real map
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

  it('a blacksmith beside a stockpile draws banked iron toward the goal', () => {
    const g = getGame();
    g.buildings.push(mkBuilding({ kind: 'blacksmith', tx: 5, ty: 25 }));
    g.buildings.push(mkBuilding({ kind: 'stockpile', tx: 6, ty: 25 }));
    g.bank.iron = 4;
    for (let i = 0; i < 6; i++) actions.simStep(100);
    const smith = g.buildings.find((b) => b.kind === 'blacksmith')!;
    expect(smith.delivered ?? 0).toBeGreaterThan(0);
    expect(g.bank.iron).toBeLessThan(4);
  });

  it('knows valid drop targets by resource', () => {
    expect(isDropTargetKind(mkBuilding({ kind: 'blacksmith', tx: 0, ty: 0 }), 'iron')).toBe(true);
    expect(isDropTargetKind(mkBuilding({ kind: 'flumeHead', tx: 0, ty: 0 }), 'iron')).toBe(false);
    expect(isDropTargetKind(mkBuilding({ kind: 'incline', tx: 0, ty: 0 }), 'ore')).toBe(true);
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

describe('the plateway', () => {
  // A level run on the works terrace (rows 22+ are all height 0).
  function layRoute(g: GameState, y = 26, len = 4): { a: Building; b: Building } {
    const a = mkBuilding({ kind: 'railDock', tx: 5, ty: y, id: 1 });
    const b = mkBuilding({ kind: 'railDock', tx: 5 + len + 1, ty: y, id: 2 });
    g.buildings.push(a, b);
    for (let i = 1; i <= len; i++) {
      g.buildings.push(mkBuilding({ kind: 'rail', tx: 5 + i, ty: y, id: 100 + i }));
    }
    recomputeRailRoutes(g);
    return { a, b };
  }

  it('refuses to climb — rails must join on the level', () => {
    const g = makeInitialState(1);
    // BAND_MID_MAX_Y = 21, so row 21 is height 1 and row 22 is height 0: a terrace step.
    expect(heightAt(g.tiles, 8, 21)).not.toBe(heightAt(g.tiles, 8, 22));
    g.buildings.push(mkBuilding({ kind: 'railDock', tx: 8, ty: 22 }));
    const err = placementError(g, 'rail', 8, 21);
    expect(err).toMatch(/cannot climb/i);
    // ...but a level neighbour is fine
    expect(placementError(g, 'rail', 9, 22)).toBeNull();
  });

  it('will not start a run in mid-air', () => {
    const g = makeInitialState(1);
    expect(placementError(g, 'rail', 5, 26)).toMatch(/loading dock or another rail/i);
  });

  it('runs exactly one wagon per route, owned by the lower-id dock', () => {
    const g = makeInitialState(1);
    const { a, b } = layRoute(g);
    expect(a.wagon).toBeDefined();
    expect(b.wagon).toBeUndefined();
    expect(a.routeMateId).toBe(b.id);
    expect(a.path?.length).toBe(6); // dock + 4 rails + dock
  });

  it('carries a lot from one dock to the other', () => {
    const g = makeInitialState(1);
    const { a, b } = layRoute(g);
    a.input.ore = 5;
    drive((dt) => tickRail(g, dt), 20);
    expect(a.input.ore ?? 0).toBe(0);
    expect(b.output.ore ?? 0).toBe(5);
  });

  it('leaves a dock with no second terminus without a wagon, and says so', () => {
    const g = makeInitialState(1);
    const lone = mkBuilding({ kind: 'railDock', tx: 5, ty: 26, id: 1 });
    g.buildings.push(lone, mkBuilding({ kind: 'rail', tx: 6, ty: 26, id: 2 }));
    recomputeRailRoutes(g);
    expect(lone.wagon).toBeUndefined();
    expect(buildingStatus(g, lone)?.label).toMatch(/no route/i);
  });

  it('accepts any resource at a dock, and survives a save round-trip', () => {
    const g = makeInitialState(1);
    const { a } = layRoute(g);
    expect(isDropTargetKind(a, 'charcoal')).toBe(true);
    expect(isDropTargetKind(a, 'iron')).toBe(true);
    a.input.plank = 3;
    drive((dt) => tickRail(g, dt), 4);
    const clone = JSON.parse(JSON.stringify(g)) as GameState;
    recomputeRailRoutes(clone);
    const owner = clone.buildings.find((x) => x.id === a.id)!;
    expect(owner.wagon).toBeDefined();
    expect(owner.path?.length).toBe(6);
  });

  it('arrives as the reward for finishing the MVP arc', () => {
    const g = makeInitialState(1);
    expect(g.unlocked).not.toContain('rail');
    for (const l of g.letters) l.done = true;
    expect(allUnlocksFor(g.letters)).toContain('rail');
    expect(allUnlocksFor(g.letters)).toContain('railDock');
  });
});

describe('audit fixes', () => {
  it('serves a three-dock run with exactly one wagon and reciprocal pairing', () => {
    const g = makeInitialState(1);
    const dock = (tx: number, id: number) => {
      const b = mkBuilding({ kind: 'railDock', tx, ty: 26, id });
      g.buildings.push(b);
      return b;
    };
    const a = dock(5, 1);
    const b = dock(9, 2);
    const c = dock(13, 3);
    for (const tx of [6, 7, 8, 10, 11, 12]) {
      g.buildings.push(mkBuilding({ kind: 'rail', tx, ty: 26, id: 100 + tx }));
    }
    recomputeRailRoutes(g);
    expect(g.buildings.filter((x) => x.wagon).length).toBe(1);
    // whatever pairing is chosen, it must be reciprocal — never a->b while b->c
    for (const d of [a, b, c]) {
      if (d.routeMateId === undefined) continue;
      const mate = g.buildings.find((x) => x.id === d.routeMateId)!;
      expect(mate.routeMateId).toBe(d.id);
    }
  });

  it('does not destroy logs tipped into a head-gate with no run', () => {
    const g = makeInitialState(1);
    const head = mkBuilding({ kind: 'flumeHead', tx: 8, ty: 8, id: 1 });
    g.buildings.push(head);
    recomputeFlumePaths(g);
    g.flumeItems.push({ id: 900, headId: head.id, resource: 'log', progress: 0 });
    tickFlume(g, 100);
    expect(g.flumeItems.length).toBe(0);
    const dropped = g.ground.find((x) => x.tx === head.tx && x.ty === head.ty);
    expect(dropped?.resource).toBe('log');
    expect(dropped?.count).toBe(1);
  });

  it('reads output caps from constants, so a balance tweak cannot desync the badge', () => {
    const g = makeInitialState(1);
    const clamp = mkBuilding({ kind: 'clamp', tx: 5, ty: 26, input: { log: 2 } });
    g.buildings.push(clamp);
    clamp.output.charcoal = CLAMP_OUT_CAP - 1;
    expect(buildingStatus(g, clamp)?.key).not.toBe('outputFull');
    clamp.output.charcoal = CLAMP_OUT_CAP;
    expect(buildingStatus(g, clamp)?.key).toBe('outputFull');

    const furnace = mkBuilding({ kind: 'furnace', tx: 7, ty: 26, heat: 90, input: { ore: 4, charcoal: 2 } });
    g.buildings.push(furnace);
    furnace.output.iron = FURNACE_IRON_CAP;
    expect(buildingStatus(g, furnace)?.key).toBe('outputFull');
  });
});
