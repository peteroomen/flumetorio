// DOM HUD: bank counters, the active Company letter, the build bar, controls, toast, win banner.

import type { GameState } from '@/lib/sim/types';
import { ALL_RESOURCES } from '@/lib/sim/types';
import { BUILDINGS, canAfford } from '@/lib/sim/buildings';
import { RESOURCE_GLYPH } from '@/render/palette';
import type { Input } from './input';
import { view } from './view';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Hud {
  private root: HTMLElement;
  private bankEl = el('div', 'hud-bank');
  private letterEl = el('div', 'hud-letter');
  private buildBar = el('div', 'hud-build');
  private toastEl = el('div', 'hud-toast');
  private bannerEl = el('div', 'hud-banner');
  private buildButtons = new Map<string, HTMLButtonElement>();
  private toastUntil = 0;
  private lastUnlockedKey = '';

  constructor(parent: HTMLElement, private input: Input) {
    this.root = el('div', 'hud-root');
    const controls = el(
      'div',
      'hud-controls',
      'WASD move · E act/collect · Q drop/deliver · 1–0 build · wheel zoom · G debug · N restart',
    );
    this.root.append(this.letterEl, this.bankEl, this.buildBar, controls, this.toastEl, this.bannerEl);
    parent.append(this.root);
  }

  private rebuildBuildBar(state: GameState): void {
    this.buildBar.replaceChildren();
    this.buildButtons.clear();
    const order = Object.values(BUILDINGS).filter((d) => state.unlocked.includes(d.kind));
    for (const def of order) {
      const btn = el('button', 'build-btn');
      const cost = Object.entries(def.cost)
        .map(([r, n]) => `${n}${RESOURCE_GLYPH[r as keyof typeof RESOURCE_GLYPH]}`)
        .join(' ');
      btn.innerHTML = `<span class="bk">${def.hotkey}</span> ${def.label}${cost ? ` <span class="cost">${cost}</span>` : ''}`;
      btn.title = def.blurb;
      btn.addEventListener('click', () => this.input.selectBuild(def.kind));
      this.buildBar.append(btn);
      this.buildButtons.set(def.kind, btn);
    }
  }

  update(state: GameState): void {
    // Bank.
    this.bankEl.replaceChildren();
    for (const r of ALL_RESOURCES) {
      const chip = el('div', 'bank-chip');
      chip.append(el('span', 'g', RESOURCE_GLYPH[r]), el('span', 'v', String(state.bank[r])));
      chip.title = r;
      this.bankEl.append(chip);
    }
    const carry = state.player.carry
      ? ` · carrying ${state.player.carryCount} ${state.player.carry}`
      : '';

    // Active letter.
    const letter = state.letters.find((l) => l.id === state.activeLetterId);
    if (letter) {
      const have =
        letter.sink === 'company'
          ? state.bank[letter.wantResource]
          : (state.buildings.find((b) => b.kind === 'blacksmith')?.delivered ?? 0);
      this.letterEl.innerHTML = `<div class="lt">✉ ${letter.title}</div><div class="lb">${letter.body}</div><div class="lp">Deliver ${letter.wantResource}: <b>${have}/${letter.wantCount}</b>${letter.sink === 'blacksmith' ? ' — carry iron to the blacksmith (Q)' : ''}${carry}</div>`;
    } else {
      this.letterEl.innerHTML = `<div class="lt">✓ Charter complete</div>${carry}`;
    }

    // Build bar (rebuild only when the unlocked set changes).
    const key = state.unlocked.join(',');
    if (key !== this.lastUnlockedKey) {
      this.rebuildBuildBar(state);
      this.lastUnlockedKey = key;
    }
    for (const [kind, btn] of this.buildButtons) {
      btn.classList.toggle('sel', view.buildKind === kind);
      const affordable = canAfford(state, kind as never);
      btn.classList.toggle('poor', !affordable);
    }

    // Toast.
    if (state.toast) {
      this.toastEl.textContent = state.toast;
      this.toastEl.classList.add('show');
      this.toastUntil = performance.now() + 4200;
      state.toast = null;
    }
    if (performance.now() > this.toastUntil) this.toastEl.classList.remove('show');

    // Win banner.
    this.bannerEl.classList.toggle('show', state.won);
    if (state.won) this.bannerEl.textContent = '🏭 The town is begun — the forge is lit. (Vertical slice complete!)';
  }
}
