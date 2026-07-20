// DOM HUD: bank counters, the active Company letter, the build bar, controls, toast, win banner.

import type { GameState, ResourceKind } from '@/lib/sim/types';
import { ALL_RESOURCES } from '@/lib/sim/types';
import { BUILDINGS, canAfford } from '@/lib/sim/buildings';
import { buildingStatus } from '@/lib/sim/status';
import { RESOURCE_GLYPH } from '@/render/palette';
import type { Input } from './input';
import { view } from './view';

const STATUS_HEX: Record<string, string> = {
  running: '#8fe388',
  needsInput: '#f2c14e',
  noPower: '#e8746a',
  outputFull: '#f2c14e',
  cold: '#6fb7ff',
};

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
  private infoEl = el('div', 'hud-info');
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
    this.root.append(
      this.letterEl,
      this.bankEl,
      this.buildBar,
      controls,
      this.toastEl,
      this.bannerEl,
      this.infoEl,
    );
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

  private updateInfo(state: GameState): void {
    const b = state.buildings.find((x) => x.id === view.selectedBuildingId);
    if (!b) {
      this.infoEl.classList.remove('show');
      return;
    }
    const def = BUILDINGS[b.kind];
    const st = buildingStatus(state, b);
    const io: string[] = [];
    for (const r of Object.keys(b.input) as ResourceKind[])
      if (b.input[r]) io.push(`in ${RESOURCE_GLYPH[r]} ${b.input[r]}`);
    for (const r of Object.keys(b.output) as ResourceKind[])
      if (b.output[r]) io.push(`out ${RESOURCE_GLYPH[r]} ${b.output[r]}`);
    const heat = b.kind === 'furnace' ? `<div class="ih">heat ${Math.round(b.heat ?? 0)}%${b.cold ? ' · cold' : ''}</div>` : '';
    const status = st
      ? `<div class="istat"><span class="dot" style="background:${STATUS_HEX[st.key]}"></span>${st.label}</div>`
      : '';
    this.infoEl.innerHTML = `<div class="it">${def.label}</div><div class="ib">${def.blurb}</div>${status}${io.length ? `<div class="io">${io.join(' · ')}</div>` : ''}${heat}<div class="ihint">click elsewhere to close</div>`;
    this.infoEl.classList.add('show');
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

    // Selected-building info panel.
    this.updateInfo(state);

    // Win banner.
    this.bannerEl.classList.toggle('show', state.won);
    if (state.won) this.bannerEl.textContent = '🏭 The town is begun — the forge is lit. (Vertical slice complete!)';
  }
}
