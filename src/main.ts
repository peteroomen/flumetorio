// Bootstrap: mount the Pixi scene, wire input + HUD, load or start a game, run the loop.

import './ui/style.css';
import { Scene } from './render/scene';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { startLoop } from './lib/sim/loop';
import { actions, getGame } from './lib/sim/store';
import { loadGame } from './lib/sim/save';
import * as machines from './lib/sim/machines';
import * as movers from './lib/sim/movers';
import { view } from './ui/view';

async function main(): Promise<void> {
  const parent = document.getElementById('app');
  if (!parent) throw new Error('no #app');

  const scene = new Scene();
  await scene.mount(parent);

  const saved = loadGame();
  if (saved) actions.load(saved);
  else actions.init(1);
  scene.markTerrainDirty();

  const input = new Input(scene);
  const hud = new Hud(parent, input);

  // Instrument bridge for verification / debugging (ADR 002).
  (window as unknown as { __fw: unknown }).__fw = { getGame, actions, view, machines, movers, scene };

  startLoop(scene, hud, input);
}

void main();
