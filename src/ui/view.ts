// Shared, mutable view/UI state (not part of the sim). Read by the renderer + HUD.

import type { BuildingKind } from '@/lib/sim/types';

export interface ViewState {
  mode: 'play' | 'build';
  buildKind: BuildingKind | null;
  hoverTile: { tx: number; ty: number } | null;
  overlay: boolean;
  zoom: number;
}

export const view: ViewState = {
  mode: 'play',
  buildKind: null,
  hoverTile: null,
  overlay: false,
  zoom: 1,
};
