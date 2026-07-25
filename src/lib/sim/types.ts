// Core simulation types. Pure — no PixiJS / DOM here.

export type ResourceKind = 'log' | 'plank' | 'ore' | 'charcoal' | 'iron';

export const ALL_RESOURCES: ResourceKind[] = ['log', 'plank', 'ore', 'charcoal', 'iron'];

export type Terrain = 'grass' | 'forest' | 'rock' | 'water';

export interface Tile {
  terrain: Terrain;
  height: number; // 0,1,2
}

export type TreeState = 'tree' | 'stump';

export interface TreeNode {
  id: number;
  tx: number;
  ty: number;
  state: TreeState;
  regrowAtMs: number; // sim-time at which a stump becomes a tree again (when state==='stump')
}

export interface OreNode {
  id: number;
  tx: number;
  ty: number;
  remaining: number; // how many ore left before it's exhausted for a while
  regrowAtMs: number;
}

export type BuildingKind =
  | 'stockpile'
  | 'pitsaw'
  | 'sawmill'
  | 'waterwheel'
  | 'flume'
  | 'flumeHead'
  | 'clamp'
  | 'incline'
  | 'furnace'
  | 'blacksmith'
  | 'rail'
  | 'railDock';

// A machine's internal buffers keyed by resource.
export type Buffers = Partial<Record<ResourceKind, number>>;

export interface Building {
  id: number;
  kind: BuildingKind;
  tx: number;
  ty: number;
  // generic buffers
  input: Buffers;
  output: Buffers;
  // cycle progress in ms
  progress: number;
  // furnace-only
  heat?: number;
  relighting?: number; // ms remaining on a relight penalty
  fuelTimer?: number; // ms until the next charcoal is burned for heat
  cold?: boolean; // went out; needs a costly relight
  // flume/incline path (tile coords) — for flumeHead this is the whole downhill run
  path?: Array<{ tx: number; ty: number }>;
  // incline-only: top/bottom buffers use input(top)/output(bottom)
  inclineTimer?: number;
  // powered flag recomputed each tick for machines needing a waterwheel
  powered?: boolean;
  // blacksmith-only: how much iron delivered
  delivered?: number;
  // railDock-only: set on the route's owning dock (the lower id of the pair)
  wagon?: Wagon;
  routeMateId?: number; // the dock at the far end of this dock's route, if any
}

// One horse-drawn wagon shuttling a route. A wagon holds one lot — batch, never flow.
export interface Wagon {
  pos: number; // 0..path.length-1 along the owning dock's path
  dir: 1 | -1;
  cargo: ResourceKind | null;
  count: number;
  dwell: number; // ms remaining loading/unloading at an end
}

// Items riding a flume (in transit).
export interface FlumeItem {
  id: number;
  headId: number; // building id of the flumeHead this item belongs to
  resource: ResourceKind;
  progress: number; // 0..path.length-1 position along the flume path
}

// Loose items resting on the ground (dropped, or shed by a tree/ore).
export interface GroundItem {
  id: number;
  tx: number;
  ty: number;
  resource: ResourceKind;
  count: number;
}

export interface PlayerState {
  x: number; // world tile coords (float)
  y: number;
  facing: number; // radians, for sprite orientation
  carry: ResourceKind | null;
  carryCount: number;
  // action in progress
  actionKind: 'chop' | 'mine' | null;
  actionTargetId: number | null;
  actionProgress: number; // ms elapsed
}

export interface Letter {
  id: string;
  title: string;
  body: string;
  // requirement: deliver N of a resource to a sink ('blacksmith' or 'company')
  wantResource: ResourceKind;
  wantCount: number;
  sink: 'company' | 'blacksmith';
  unlocks: BuildingKind[]; // buildings this letter grants on completion
  done: boolean;
}

export interface GameState {
  seed: number;
  timeMs: number; // accumulated sim time
  tiles: Tile[]; // MAP_W*MAP_H row-major
  trees: TreeNode[];
  ores: OreNode[];
  buildings: Building[];
  flumeItems: FlumeItem[];
  ground: GroundItem[];
  player: PlayerState;
  bank: Record<ResourceKind, number>; // delivered-to-company stock (the wallet)
  letters: Letter[];
  activeLetterId: string | null;
  unlocked: BuildingKind[]; // buildings the player may place
  nextId: number;
  won: boolean;
  // transient UI signals (not saved)
  toast?: string | null;
}
