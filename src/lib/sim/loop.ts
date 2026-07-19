// Fixed-timestep loop: smooth per-frame player movement + fixed 100ms sim steps + autosave.

import { AUTOSAVE_MS, SIM_STEP_MS } from './constants';
import { actions, getGame } from './store';
import { saveGame } from './save';
import type { Scene } from '@/render/scene';
import type { Hud } from '@/ui/hud';
import type { Input } from '@/ui/input';
import { view } from '@/ui/view';

export function startLoop(scene: Scene, hud: Hud, input: Input): void {
  let last = performance.now();
  let simAcc = 0;
  let saveAcc = 0;

  function frame(now: number): void {
    const dt = Math.min(100, now - last);
    last = now;

    const mv = input.moveVector();
    actions.movePlayer(dt / 1000, mv.x, mv.y);
    actions.updateAction(dt);

    simAcc += dt;
    let guard = 0;
    while (simAcc >= SIM_STEP_MS && guard++ < 8) {
      actions.simStep(SIM_STEP_MS);
      simAcc -= SIM_STEP_MS;
    }

    saveAcc += dt;
    if (saveAcc >= AUTOSAVE_MS) {
      saveGame(getGame());
      saveAcc = 0;
    }

    const state = getGame();
    scene.render(state, view);
    hud.update(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
