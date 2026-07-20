// Keyboard + pointer input. Updates the view state and dispatches store actions.

import { actions, getGame } from '@/lib/sim/store';
import type { BuildingKind } from '@/lib/sim/types';
import { BUILDINGS } from '@/lib/sim/buildings';
import { clearSave } from '@/lib/sim/save';
import type { Scene } from '@/render/scene';
import { view } from './view';

const HOTKEY_TO_KIND: Record<string, BuildingKind> = {};
for (const def of Object.values(BUILDINGS)) HOTKEY_TO_KIND[def.hotkey] = def.kind;

export class Input {
  private keys = new Set<string>();

  constructor(private scene: Scene) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const canvas = scene.app.canvas;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.exitBuild();
    });
    window.addEventListener('wheel', this.onWheel, { passive: false });
  }

  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    // Screen up/down maps to world diagonals in iso: W = up-screen = (-,-).
    if (this.keys.has('w') || this.keys.has('arrowup')) {
      x -= 1;
      y -= 1;
    }
    if (this.keys.has('s') || this.keys.has('arrowdown')) {
      x += 1;
      y += 1;
    }
    if (this.keys.has('a') || this.keys.has('arrowleft')) {
      x -= 1;
      y += 1;
    }
    if (this.keys.has('d') || this.keys.has('arrowright')) {
      x += 1;
      y -= 1;
    }
    return { x, y };
  }

  private exitBuild(): void {
    view.mode = 'play';
    view.buildKind = null;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();

    if (k === 'e' || k === ' ') actions.interact();
    else if (k === 'q') actions.deposit();
    else if (k === 'g') view.overlay = !view.overlay;
    else if (k === 'escape') this.exitBuild();
    else if (k === 'n') {
      clearSave();
      actions.init(1);
      this.scene.markTerrainDirty();
    } else if (k === '=' || k === '+') view.zoom = Math.min(2.4, view.zoom + 0.15);
    else if (k === '-') view.zoom = Math.max(0.5, view.zoom - 0.15);
    else if (HOTKEY_TO_KIND[k]) {
      const kind = HOTKEY_TO_KIND[k];
      if (getGame().unlocked.includes(kind)) {
        view.mode = 'build';
        view.buildKind = kind;
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onPointerMove = (e: PointerEvent): void => {
    view.hoverTile = this.scene.pickTile(e.clientX, e.clientY, getGame());
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const tile = this.scene.pickTile(e.clientX, e.clientY, getGame());
    view.hoverTile = tile;
    if (view.mode === 'build' && view.buildKind && tile) {
      const err = actions.place(view.buildKind, tile.tx, tile.ty);
      if (err) getGame().toast = err;
      // stay in build mode for repeat placement (esc / right-click to exit)
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    view.zoom = Math.max(0.5, Math.min(2.4, view.zoom - Math.sign(e.deltaY) * 0.12));
  };

  selectBuild(kind: BuildingKind): void {
    if (!getGame().unlocked.includes(kind)) return;
    view.mode = 'build';
    view.buildKind = kind;
  }
}
