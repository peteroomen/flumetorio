// Versioned localStorage save. GameState is plain JSON (no functions), so we persist it directly.

import { SAVE_KEY, SAVE_VERSION } from './constants';
import type { GameState } from './types';

interface SaveEnvelope {
  version: number;
  state: GameState;
}

export function saveGame(state: GameState): void {
  try {
    const env: SaveEnvelope = { version: SAVE_VERSION, state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(env));
  } catch (e) {
    console.error('save failed', e);
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as SaveEnvelope;
    if (!env || env.version !== SAVE_VERSION || !env.state) return null;
    // Minimal shape guard.
    if (!Array.isArray(env.state.tiles) || !env.state.player) return null;
    env.state.toast = null;
    return env.state;
  } catch (e) {
    console.error('load failed', e);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
