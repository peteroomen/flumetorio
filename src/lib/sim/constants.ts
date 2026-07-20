// Simulation constants. Pure data — no rendering concerns here.

export const SIM_STEP_MS = 100; // fixed sim tick
export const AUTOSAVE_MS = 10_000;

export const MAP_W = 34;
export const MAP_H = 34;

// Terrace band boundaries (by tile-y). Three integer height levels.
export const BAND_TOP_MAX_Y = 10; // rows [0..10]  -> height 2 (forest terrace)
export const BAND_MID_MAX_Y = 21; // rows [11..21] -> height 1 (ore terrace)
// rows [22..]  -> height 0 (works terrace, sea-level)

export const HEIGHT_TOP = 2;
export const HEIGHT_MID = 1;
export const HEIGHT_BOTTOM = 0;

// Player.
export const PLAYER_BASE_SPEED = 4.2; // tiles / second, unladen
export const PLAYER_LADEN_SPEED = 2.4; // tiles / second, full barrow
export const BARROW_CAPACITY = 6; // items the player can carry at once
export const REACH = 1.35; // interaction reach in tiles
export const CHOP_MS = 1300; // time to fell a tree
export const MINE_MS = 1600; // time to knock ore off the outcrop
export const SAW_MS = 1200; // hand pit-saw: 1 log -> 1 plank (banked)
export const ORE_REGROW_MS = 60_000; // an exhausted outcrop face recovers

// Yields.
export const TREE_LOG_YIELD = 4;
export const ORE_NODE_YIELD = 3;

// Power.
export const WATERWHEEL_POWER_RADIUS = 4.5; // tiles a wheel energizes (implicit line shaft)

// Machine timings (ms per cycle) and ratios.
export const SAWMILL_CYCLE_MS = 1500; // 1 log -> 2 planks
export const SAWMILL_LOG_PER_CYCLE = 1;
export const SAWMILL_PLANK_PER_CYCLE = 2;
export const SAWMILL_IN_CAP = 8;
export const SAWMILL_OUT_CAP = 12;

export const CLAMP_CYCLE_MS = 4000; // 2 logs -> 2 charcoal (slow, no power needed)
export const CLAMP_LOG_PER_CYCLE = 2;
export const CLAMP_CHARCOAL_PER_CYCLE = 2;
export const CLAMP_IN_CAP = 8;
export const CLAMP_OUT_CAP = 8;

// Furnace: batch smelter with a heat bar that decays. Going cold is expensive.
export const FURNACE_CYCLE_MS = 2600; // 2 ore + 1 charcoal -> 1 iron
export const FURNACE_ORE_PER_CYCLE = 2;
export const FURNACE_CHARCOAL_PER_CYCLE = 1;
export const FURNACE_IRON_PER_CYCLE = 1;
export const FURNACE_ORE_CAP = 12;
export const FURNACE_CHARCOAL_CAP = 10;
export const FURNACE_IRON_CAP = 20;
export const FURNACE_MAX_HEAT = 100;
export const FURNACE_HEAT_PER_CHARCOAL = 34; // stoking adds heat
export const FURNACE_FUEL_BURN_MS = 1600; // cadence at which a charcoal is burned for heat
export const FURNACE_HEAT_DECAY_PER_S = 3.2; // idle cooling
export const FURNACE_MIN_SMELT_HEAT = 40; // below this it can't smelt
export const FURNACE_RELIGHT_CHARCOAL = 2; // penalty charcoal to relight from cold
export const FURNACE_RELIGHT_MS = 3500; // penalty time when cold

// Flume: water-fed downhill conveyor. Items ride at this speed.
export const FLUME_SPEED = 2.6; // tiles / second along the path

// Incline: self-acting gravity cart. Moves items top->bottom.
export const INCLINE_INTERVAL_MS = 1400; // one cart trip cadence
export const INCLINE_CART_CAP = 3; // items per trip
export const INCLINE_BUFFER_CAP = 12;

// Forestry — replant.
export const SAPLING_GROW_MS = 45_000; // a stump regrows into a fellable tree

export const SAVE_KEY = 'flumetorio-save-v1';
export const SAVE_VERSION = 1;
