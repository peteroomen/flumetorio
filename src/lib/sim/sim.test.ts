import { describe, expect, it, beforeEach } from 'vitest';
import { generateWorld, bandHeight, heightAt } from './world';
import { HEIGHT_BOTTOM, HEIGHT_MID, HEIGHT_TOP } from './constants';
import { tickMachines, bankAllOutputs } from './machines';
import { recomputeFlumePaths, tickFlume, tickIncline, tickFeeders } from './movers';
import { actions, getGame, makeInitialState, checkLetters } from './store';
import type { Building, GameState } from './types';

function drive(g: GameState, fn: (dt: number) => void, seconds: number, stepMs = 100): void {
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
    drive(g, (dt) => tickMachines(g, dt), 5);
    expect(mill.output.plank ?? 0).toBe(0); // unpowered

    g.buildings.push(mkBuilding({ kind: 'waterwheel', tx: 6, ty: 5 }));
    drive(g, (dt) => tickMachines(g, dt), 5);
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

    drive(g, (dt) => tickMachines(g, dt), 25);
    expect(furnace.output.iron ?? 0).toBeGreaterThan(0);
    expect(furnace.cold).toBe(false);

    // Starve it of charcoal and let it cool.
    furnace.input.charcoal = 0;
    drive(g, (dt) => tickMachines(g, dt), 60);
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
    drive(g, (dt) => tickFlume(g, dt), 3);
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
    drive(
      g,
      (dt) => {
        tickIncline(g, dt);
        tickFeeders(g);
      },
      6,
    );
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

describe('serialization', () => {
  it('round-trips the game state through JSON', () => {
    const g = makeInitialState(9);
    const clone = JSON.parse(JSON.stringify(g)) as GameState;
    expect(clone.tiles.length).toBe(g.tiles.length);
    expect(clone.player.x).toBe(g.player.x);
    expect(heightAt(clone.tiles, 5, 3)).toBe(heightAt(g.tiles, 5, 3));
  });
});
