// Balance model: drives the REAL sim headlessly and reports measured rates, ratios and
// time-to-milestone, so tuning is argued from numbers rather than from feel.
//
//   pnpm exec tsx scripts/model-economy.ts
//
// Everything here reads the sim; nothing is re-derived by hand. If a constant changes, rerun.

import * as C from '../src/lib/sim/constants';
import { tickMachines } from '../src/lib/sim/machines';
import { tickIncline, tickFeeders } from '../src/lib/sim/movers';
import { makeInitialState } from '../src/lib/sim/store';
import { generateWorld } from '../src/lib/sim/world';
import type { Building, BuildingKind, GameState, ResourceKind } from '../src/lib/sim/types';

const STEP = 100;

function b(kind: BuildingKind, extra: Partial<Building> = {}): Building {
  return { id: Math.random(), kind, tx: 5, ty: 25, input: {}, output: {}, progress: 0, ...extra };
}

function run(g: GameState, seconds: number, each?: (g: GameState) => void): void {
  for (let t = 0; t < (seconds * 1000) / STEP; t++) {
    each?.(g);
    tickMachines(g, STEP);
    tickIncline(g, STEP);
    tickFeeders(g);
  }
}

function fmt(n: number, d = 2): string {
  return n.toFixed(d).padStart(7);
}

const lines: string[] = [];
const say = (s = '') => lines.push(s);
const rule = (t: string) => {
  say();
  say(`── ${t} ${'─'.repeat(Math.max(0, 66 - t.length))}`);
};

// ── 1. Machine throughput, measured with inputs never starved ────────────────
rule('MEASURED THROUGHPUT (inputs never starved, per minute)');

function produced(kind: BuildingKind, out: ResourceKind, mins = 5): { made: number; used: Record<string, number> } {
  const g = makeInitialState(1);
  const m = b(kind, { heat: 100, cold: false, fuelTimer: 0, relighting: 0 });
  g.buildings.push(m);
  // recomputePower() overwrites `powered` every tick, so a sawmill needs a real wheel in reach
  if (kind === 'sawmill') g.buildings.push(b('waterwheel', { tx: 6, ty: 25 }));
  let made = 0;
  const used: Record<string, number> = {};
  const inputs: ResourceKind[] = kind === 'furnace' ? ['ore', 'charcoal'] : ['log'];
  // Measure by DIFF after each tick, then refill — counting the refill amount instead double-
  // counted whatever the tick had not yet consumed.
  const STOCK = 999;
  for (const res of inputs) m.input[res] = STOCK;
  run(g, mins * 60, undefined);
  // (the loop below re-runs with per-tick accounting; `run` above only warms the machine up)
  for (const res of inputs) m.input[res] = STOCK;
  m.output[out] = 0;
  for (let t = 0; t < (mins * 60 * 1000) / STEP; t++) {
    tickMachines(g, STEP);
    tickIncline(g, STEP);
    tickFeeders(g);
    for (const res of inputs) {
      const have = m.input[res] ?? 0;
      if (have < STOCK) {
        used[res] = (used[res] ?? 0) + (STOCK - have);
        m.input[res] = STOCK;
      }
    }
    made += m.output[out] ?? 0;
    m.output[out] = 0;
  }
  for (const k of Object.keys(used)) used[k] /= mins;
  return { made: made / mins, used };
}

const saw = produced('sawmill', 'plank');
const pit = produced('pitsaw', 'plank');
const clamp = produced('clamp', 'charcoal');
const furn = produced('furnace', 'iron');

say(`sawmill    ${fmt(saw.made)} plank/min   consuming ${fmt(saw.used.log ?? 0)} log/min`);
say(`pit saw    ${fmt(pit.made)} plank/min   consuming ${fmt(pit.used.log ?? 0)} log/min`);
say(`clamp      ${fmt(clamp.made)} charc/min   consuming ${fmt(clamp.used.log ?? 0)} log/min`);
say(`furnace    ${fmt(furn.made)} iron /min   consuming ${fmt(furn.used.ore ?? 0)} ore/min, ${fmt(furn.used.charcoal ?? 0)} charcoal/min`);
say();
say(`sawmill is ${fmt(saw.made / pit.made, 1)}x the pit saw (design intent: ~4x)`);

// ── 2. The charcoal question ────────────────────────────────────────────────
rule('CHARCOAL: is the furnace actually hungry?');
const clampsPerFurnace = (furn.used.charcoal ?? 0) / clamp.made;
say(`furnace burns    ${fmt(furn.used.charcoal ?? 0)} charcoal/min (fuel only — smelting consumes ORE, not charcoal)`);
say(`one clamp makes  ${fmt(clamp.made)} charcoal/min`);
say(`=> clamps needed per furnace: ${fmt(clampsPerFurnace)}   (${(1 / clampsPerFurnace).toFixed(1)} furnaces per clamp)`);
say();
say(`heat decay ${C.FURNACE_HEAT_DECAY_PER_S}/s vs +${C.FURNACE_HEAT_PER_CHARCOAL} per charcoal`);
say(`=> a lit furnace tops up roughly every ${(C.FURNACE_HEAT_PER_CHARCOAL / C.FURNACE_HEAT_DECAY_PER_S).toFixed(1)}s`);

// ── 3. How long can a furnace coast? (the "never go cold" pressure) ─────────
rule('GOING COLD: how long can an unattended furnace coast?');
{
  const g = makeInitialState(1);
  const f = b('furnace', { heat: C.FURNACE_MAX_HEAT, cold: false, fuelTimer: 0, relighting: 0, input: { ore: 999 } });
  g.buildings.push(f);
  let tSmeltStop = -1;
  let tCold = -1;
  for (let t = 0; t < 6000; t++) {
    tickMachines(g, STEP);
    const sec = (t * STEP) / 1000;
    if (tSmeltStop < 0 && (f.heat ?? 0) < C.FURNACE_MIN_SMELT_HEAT) tSmeltStop = sec;
    if (tCold < 0 && f.cold) tCold = sec;
    if (tCold > 0) break;
  }
  say(`from full heat with NO charcoal: stops smelting at ${tSmeltStop.toFixed(1)}s, goes cold at ${tCold.toFixed(1)}s`);
  say(`relight costs ${C.FURNACE_RELIGHT_CHARCOAL} charcoal + ${(C.FURNACE_RELIGHT_MS / 1000).toFixed(1)}s`);
}

// ── 4. Supply chain: logs needed to keep one furnace running ────────────────
rule('THE CHAIN: what one furnace demands upstream');
const logsForCharcoal = clampsPerFurnace * (clamp.used.log ?? 0);
say(`1 furnace  needs ${fmt(furn.used.ore ?? 0)} ore/min      (mining yields ${fmt((C.ORE_NODE_YIELD / C.MINE_MS) * 60000)} ore/min while actively mining)`);
say(`           needs ${fmt(clampsPerFurnace, 2)} clamps -> ${fmt(logsForCharcoal)} log/min`);
say(`1 tree gives ${C.TREE_LOG_YIELD} logs in ${(C.CHOP_MS / 1000).toFixed(1)}s => ${fmt((C.TREE_LOG_YIELD / C.CHOP_MS) * 60000)} log/min while actively felling`);
say();
say(`ore is the binding constraint: the player must mine ${fmt(((furn.used.ore ?? 0) / ((C.ORE_NODE_YIELD / C.MINE_MS) * 60000)) * 100, 0)}% of the time, forever, per furnace`);

// ── 5. Ore field sustain ────────────────────────────────────────────────────
rule('ORE FIELD: can the outcrop sustain a furnace?');
{
  const w = generateWorld(1);
  const nodes = w.ores.length;
  const stock = nodes * C.ORE_NODE_CAPACITY;
  const regenPerMin = (stock / C.ORE_REGROW_MS) * 60000;
  say(`outcrop: ${nodes} nodes x ${C.ORE_NODE_CAPACITY} ore = ${stock} ore, each face regrows after ${(C.ORE_REGROW_MS / 1000).toFixed(0)}s`);
  say(`=> sustained ceiling ${fmt(regenPerMin)} ore/min, against one furnace wanting ${fmt(furn.used.ore ?? 0)} ore/min`);
  say(`=> the field supports ${fmt(regenPerMin / (furn.used.ore ?? 1), 1)} furnace(s) at full tilt`);
}

// ── 6. Progression: the letters ─────────────────────────────────────────────
rule('PROGRESSION: what each letter actually asks for');
const g0 = makeInitialState(1);
for (const l of g0.letters) {
  const per =
    l.wantResource === 'plank' ? saw.made : l.wantResource === 'iron' ? furn.made : 0;
  const pitMins = l.wantResource === 'plank' ? l.wantCount / pit.made : NaN;
  say(
    `${l.id.padEnd(16)} ${String(l.wantCount).padStart(3)} ${l.wantResource.padEnd(6)}` +
      `  = ${fmt(l.wantCount / per, 1)} min of one ${l.wantResource === 'iron' ? 'furnace' : 'sawmill'}` +
      (Number.isFinite(pitMins) ? `, ${fmt(pitMins, 1)} min of one pit saw` : ''),
  );
}

// ── 7. Build costs against production ───────────────────────────────────────
rule('COSTS: what a building is worth in machine-minutes');
import('../src/lib/sim/buildings').then(({ BUILDINGS }) => {
  for (const def of Object.values(BUILDINGS)) {
    const parts: string[] = [];
    for (const [res, n] of Object.entries(def.cost)) {
      const rate = res === 'plank' ? saw.made : res === 'iron' ? furn.made : 0;
      if (rate > 0) parts.push(`${n} ${res} = ${(n / rate).toFixed(1)} min`);
    }
    if (parts.length) say(`${def.label.padEnd(18)} ${parts.join('  ·  ')}`);
  }

  rule('RAIL: the open pricing question');
  const shortRoute = 2 * (BUILDINGS.railDock.cost.iron ?? 0) + 10 * (BUILDINGS.rail.cost.iron ?? 0);
  say(`a 10-tile route = 2 docks + 10 rail = ${shortRoute} iron`);
  say(`the letter that UNLOCKS rail asks for ${g0.letters[3].wantCount} iron`);
  say(`=> ${fmt(shortRoute / furn.made, 1)} min of furnace output for one short route`);

  console.log(lines.join('\n'));
});
