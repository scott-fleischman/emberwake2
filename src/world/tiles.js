// Tile vocabulary shared by every map type (overworld, interiors, caves, dungeon rooms).

export const TILE = 16;

export const T = {
  GRASS: 0, ROAD: 1, SAND: 2, SNOW: 3, ASH: 4, MUD: 5,
  WATER: 6, SHALLOW: 7, CLIFF: 8, STAIRS: 9, BRIDGE: 10, BORDER: 11,
  LAVA: 12, PLAZA: 13, TALLGRASS: 14, CRACKED: 15, BOULDER: 16, RIDGE: 17,
  ICE: 18, CAVE: 19, DUNGEON: 20, BUILDING: 21, DOOR: 22,
  // interiors
  FLOOR: 30, WALL: 31, EXIT: 32, RUG: 33, FURNITURE: 34, COUNTER: 35,
  // dungeon rooms & caves
  DFLOOR: 40, DWALL: 41, PIT: 42, GATE: 43, DDOOR: 44, CFLOOR: 45, CWALL: 46,
  HAZARD: 47, BLOCKSPOT: 48, DWATER: 49, THORNS: 50, DICE: 51,
};

export const BIOME = { FOREST: 0, SWAMP: 1, DESERT: 2, MOUNTAIN: 3, SNOW: 4, VOLCANIC: 5 };
export const BIOME_NAMES = ['Forest', 'Swamp', 'Desert', 'Mountain', 'Snowy Peaks', 'Volcanic Wastes'];
export const BIOME_KEYS = ['forest', 'swamp', 'desert', 'mountain', 'snow', 'volcanic'];
export const BIOME_MUSIC = ['forest', 'wetland', 'frontier', 'mountain', 'snow', 'volcanic'];
export const GROUND = [T.GRASS, T.MUD, T.SAND, T.GRASS, T.SNOW, T.ASH];

// Decoration layer (overworld only)
export const D = { NONE: 0, TREE: 1, BUSH: 2, ROCK: 3, FLOWER: 4, REED: 5, RUIN: 6, STUMP: 7, TENT: 8, FIRE: 9, SIGN: 10, LORE: 11, FENCE: 12, WELL: 13, SHRINE: 14 };

const info = (solid, extra = {}) => ({ solid, slow: 1, damage: 0, water: false, ...extra });

export const TILE_INFO = [];
const set = (id, v) => { TILE_INFO[id] = v; };
for (let i = 0; i < 64; i++) set(i, info(false));
set(T.WATER, info(true, { water: true }));
set(T.SHALLOW, info(false, { slow: 0.6, water: true }));
set(T.CLIFF, info(true));
set(T.BORDER, info(true));
set(T.LAVA, info(false, { damage: 2, slow: 0.7 }));
set(T.CRACKED, info(true));
set(T.BOULDER, info(true));
set(T.RIDGE, info(true));
set(T.BUILDING, info(true));
set(T.WALL, info(true));
set(T.FURNITURE, info(true));
set(T.COUNTER, info(true));
set(T.DWALL, info(true));
set(T.PIT, info(false, { pit: true }));
set(T.GATE, info(true));
set(T.CWALL, info(true));
set(T.HAZARD, info(false, { damage: 1 }));
set(T.DWATER, info(true, { water: true }));
set(T.THORNS, info(true, { damage: 1 }));
set(T.MUD, info(false, { slow: 0.9 }));
set(T.TALLGRASS, info(false, { slow: 0.95 }));

export const DECO_SOLID = new Set([D.TREE, D.BUSH, D.ROCK, D.RUIN, D.TENT, D.FIRE, D.SIGN, D.LORE, D.FENCE, D.WELL, D.STUMP, D.SHRINE]);
// Decorations a melee weapon can clear.
export const DECO_CUTTABLE = new Set([D.BUSH]);

export function isWalkableTile(id) {
  return !TILE_INFO[id].solid;
}
