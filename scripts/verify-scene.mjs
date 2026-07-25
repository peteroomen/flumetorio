// Instrument-based verification of the integrated app in a real browser (ADR 002).
// Boots the production build, checks: no page errors, the loop ticks, the player moves,
// placement + machines run end-to-end, and captures annotated screenshots.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4188;
const URL = `http://localhost:${PORT}/`;
const OUT = 'docs/work/assets';
mkdirSync(OUT, { recursive: true });

function startPreview() {
  const p = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'pipe',
  });
  return p;
}

async function waitForServer(timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  throw new Error('preview server did not start');
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

const preview = startPreview();
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push('console.error: ' + m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__fw && !!document.querySelector('canvas'), { timeout: 10000 });
  await sleep(1200); // let the loop run

  check('boots without page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  const t0 = await page.evaluate(() => window.__fw.getGame().timeMs);
  await sleep(700);
  const t1 = await page.evaluate(() => window.__fw.getGame().timeMs);
  check('fixed-timestep loop advances sim time', t1 > t0, `t0=${t0} t1=${t1}`);

  // Player moves on WASD.
  const px0 = await page.evaluate(() => window.__fw.getGame().player.x);
  await page.keyboard.down('d');
  await sleep(500);
  await page.keyboard.up('d');
  const px1 = await page.evaluate(() => window.__fw.getGame().player.x);
  check('player moves on input', Math.abs(px1 - px0) > 0.3, `dx=${(px1 - px0).toFixed(2)}`);

  // Placement of a waterwheel at a scanned valid (water-adjacent) tile.
  const placeOk = await page.evaluate(() => {
    const { getGame, actions } = window.__fw;
    actions.init(1);
    const g = getGame();
    g.unlocked.push('waterwheel');
    const W = 34,
      H = 34;
    const isWater = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && g.tiles[ty * W + tx].terrain === 'water';
    for (let ty = 23; ty < H - 1; ty++) {
      for (let tx = 1; tx < W - 1; tx++) {
        const t = g.tiles[ty * W + tx];
        if (t.terrain !== 'grass') continue;
        if (isWater(tx + 1, ty) || isWater(tx - 1, ty) || isWater(tx, ty + 1) || isWater(tx, ty - 1)) {
          g.bank.plank = 50;
          return actions.place('waterwheel', tx, ty);
        }
      }
    }
    return 'no water-adjacent grass tile found';
  });
  check('waterwheel places on a river-bank tile', placeOk === null, String(placeOk));

  // Machines run in the bundle: a fed furnace relights and smelts iron.
  const iron = await page.evaluate(() => {
    const { getGame, actions, machines } = window.__fw;
    actions.init(1);
    const g = getGame();
    g.buildings.push({
      id: 987654,
      kind: 'furnace',
      tx: 5,
      ty: 25,
      input: { ore: 20, charcoal: 12 },
      output: {},
      progress: 0,
      heat: 0,
      cold: true,
      fuelTimer: 0,
      relighting: 0,
    });
    for (let i = 0; i < 320; i++) machines.tickMachines(g, 100);
    return g.buildings.find((b) => b.id === 987654).output.iron ?? 0;
  });
  check('furnace smelts iron end-to-end in-browser', iron > 0, `iron=${iron}`);

  // The plateway: a level route between two docks moves a lot end to end, in-browser.
  const hauled = await page.evaluate(() => {
    const { getGame, actions, rail } = window.__fw;
    actions.init(1);
    const g = getGame();
    const mk = (kind, tx, ty, id) => ({
      id,
      kind,
      tx,
      ty,
      input: {},
      output: {},
      progress: 0,
    });
    const a = mk('railDock', 5, 26, 1);
    const b = mk('railDock', 10, 26, 2);
    g.buildings.push(a, b);
    for (let i = 1; i <= 4; i++) g.buildings.push(mk('rail', 5 + i, 26, 100 + i));
    rail.recomputeRailRoutes(g);
    a.input.ore = 5;
    for (let i = 0; i < 300; i++) rail.tickRail(g, 100);
    return { arrived: b.output.ore ?? 0, wagons: g.buildings.filter((x) => x.wagon).length };
  });
  check('plateway hauls a lot between docks in-browser', hauled.arrived === 5, `arrived=${hauled.arrived}`);
  check('exactly one wagon per route', hauled.wagons === 1, `wagons=${hauled.wagons}`);

  // Rails must not cross the track's centre line. A per-direction perpendicular flips sign on a
  // straight run and drew each rail on both sides of centre, turning every tile into an X.
  const straight = await page.evaluate(async () => {
    const { getGame, actions, rail, scene } = window.__fw;
    actions.init(1);
    const g = getGame();
    const mk = (kind, tx, ty, id) => ({ id, kind, tx, ty, input: {}, output: {}, progress: 0 });
    g.buildings.push(mk('railDock', 4, 26, 1));
    for (let i = 5; i <= 12; i++) g.buildings.push(mk('rail', i, 26, 100 + i));
    g.buildings.push(mk('railDock', 13, 26, 2));
    rail.recomputeRailRoutes(g);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // For an east-west run, every point of a given rail must stay on one side of y = ty + 0.5.
    const offsets = [];
    for (let tx = 5; tx <= 12; tx++) {
      const pts = scene.railPointsAt(tx, 26, 1);
      if (!pts) return { bad: `no rail at ${tx}` };
      for (const p of pts) offsets.push(p.y - 26.5);
    }
    const min = Math.min(...offsets);
    const max = Math.max(...offsets);
    return { min, max, crosses: min < 0 && max > 0, spread: max - min };
  });
  check(
    'rails run straight — never crossing the track centre line',
    straight.crosses === false && straight.spread < 1e-6,
    `offsets ${straight.min?.toFixed(3)}..${straight.max?.toFixed(3)}`,
  );

  // The flume descends on a steady grade instead of falling off the terraces with the ground.
  const deck = await page.evaluate(async () => {
    const { getGame, actions, movers, scene } = window.__fw;
    actions.init(1);
    const g = getGame();
    const col = 8;
    const mk = (kind, tx, ty, id) => ({ id, kind, tx, ty, input: {}, output: {}, progress: 0 });
    g.buildings.push(mk('flumeHead', col, 8, 1));
    let id = 10;
    for (let ty = 9; ty <= 25; ty++) g.buildings.push(mk('flume', col, ty, id++));
    for (const t of g.trees) if (t.tx === col) t.state = 'stump';
    movers.recomputeFlumePaths(g);
    scene.markTerrainDirty();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const decks = [];
    const ground = [];
    for (let ty = 8; ty <= 25; ty++) {
      decks.push(scene.flumeDeckAt(col, ty));
      ground.push(g.tiles[ty * 34 + col].height);
    }
    let maxStep = 0;
    let monotonic = true;
    for (let i = 1; i < decks.length; i++) {
      const d = decks[i - 1] - decks[i];
      if (d < -1e-6) monotonic = false;
      maxStep = Math.max(maxStep, d);
    }
    const groundDrop = Math.max(...ground.map((h, i) => (i ? ground[i - 1] - h : 0)));
    return { maxStep, monotonic, groundDrop, span: decks[0] - decks[decks.length - 1] };
  });
  check('flume deck never runs uphill', deck.monotonic);
  check('flume descends its whole run', deck.span > 1.5, `span=${deck.span?.toFixed(2)} levels`);
  check(
    'flume rides over the terrace edge instead of dropping with it',
    deck.maxStep < deck.groundDrop,
    `worst flume step=${deck.maxStep?.toFixed(2)} vs ground drop=${deck.groundDrop}`,
  );

  // Screenshots: fresh valley.
  await page.evaluate(() => {
    window.__fw.actions.init(1);
    window.__fw.scene.markTerrainDirty();
  });
  await sleep(600);
  await page.screenshot({ path: `${OUT}/slice-valley.png` });

  // Demo scene: one of every building near the player, so the sprites can be eyeballed.
  await page.evaluate(() => {
    const { getGame } = window.__fw;
    const g = getGame();
    const b = (kind, tx, ty, extra = {}) =>
      g.buildings.push({ id: g.nextId++, kind, tx, ty, input: {}, output: {}, progress: 0, ...extra });
    b('stockpile', 9, 13);
    b('waterwheel', 13, 12);
    b('sawmill', 11, 12, { powered: true, output: { plank: 3 } }); // running (shaft shows)
    b('pitsaw', 13, 14, { input: { log: 1 } });
    b('clamp', 9, 15); // needs input badge
    const furn = b('furnace', 11, 15, { heat: 0, cold: true }); // cold badge
    b('blacksmith', 9, 17, { delivered: 4 });
    b('flumeHead', 12, 10);
    b('flume', 12, 11);
    b('flume', 12, 12);
    b('incline', 8, 14, { input: { ore: 2 } });
    g.player.x = 12.5; // stand by the flume head, carrying a log -> prompt + highlight
    g.player.y = 10.7;
    g.player.carry = 'log';
    g.player.carryCount = 3;
    window.__fw.view.selectedBuildingId = furn.id ?? g.buildings.find((x) => x.kind === 'furnace').id;
    g.activeLetterId = g.letters.find((l) => l.sink === 'blacksmith').id; // show the delivery marker
    window.__fw.movers.recomputeFlumePaths(g);
    g.flumeItems.push({ id: g.nextId++, headId: g.buildings.find((x) => x.kind === 'flumeHead').id, resource: 'log', progress: 0.6 });
  });
  await sleep(500);
  await page.screenshot({ path: `${OUT}/slice-buildings.png` });

  await page.keyboard.press('g'); // debug overlay
  await sleep(400);
  await page.screenshot({ path: `${OUT}/slice-overlay.png` });

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
} catch (e) {
  console.error('verify crashed:', e);
  failures++;
} finally {
  if (browser) await browser.close();
  preview.kill('SIGTERM');
}

process.exit(failures === 0 ? 0 : 1);
