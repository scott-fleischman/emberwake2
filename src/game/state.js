// Persistent game state: creation, derived stats, (de)serialization, death penalty, storage.
// Pure — the world itself is regenerated from the seed, so only progress is saved.
import { CLASSES } from '../data/classes.js';

export const SAVE_KEY = 'emberwake.save.v1';
export const OPTIONS_KEY = 'emberwake.options.v1';
export const SAVE_VERSION = 1;
export const DEATH_PENALTY = 0.2;

export function newGameState(seed, classId) {
  const c = CLASSES[classId];
  if (!c) throw new Error(`Unknown class ${classId}`);
  return {
    version: SAVE_VERSION,
    seed: String(seed),
    classId,
    playTime: 0,
    player: { hp: c.maxHp, mana: c.maxMana, stamina: c.maxStamina, coins: c.coins, food: c.food, arrows: c.ammo.arrows, knives: c.ammo.knives, bombs: 0 },
    gear: { weapon: c.weapon, owned: [c.weapon], shield: c.shield, items: [...c.items], selected: 0 },
    upgrades: { hearts: 0, heartPieces: 0, quiver: 0, bombBag: 0, tomeMastery: false },
    artifacts: [],
    tools: { bombs: false, gloves: false, charm: false },
    talents: { points: 0, bought: 0, ranks: { [c.opening]: 1 } },
    quest: { main: 'wake', tracked: 'main', flags: {}, side: {}, kills: {} },
    progress: {
      opened: [], cleared: [], caches: [], gates: [], bosses: [], solved: [], unlocked: [], keys: {}, tides: {},
      visited: {}, dungeonMaps: [], fog: '', shards: 0, revealed: [], lore: [], seals: [], relics: [], elites: [], frozen: [], rung: [],
    },
    location: { area: 'interior', id: 'home', x: null, y: null },
    respawn: { area: 'overworld', x: null, y: null, label: 'home' },
    stats: { kills: 0, deaths: 0, coinsLost: 0 },
  };
}

export function derivedStats(state) {
  const c = CLASSES[state.classId];
  const r = state.talents.ranks;
  const u = state.upgrades;
  return {
    maxHp: c.maxHp + 2 * (r.vigor || 0) + 2 * u.hearts,
    maxMana: c.maxMana + 10 * (r.focus || 0),
    maxStamina: c.maxStamina + 20 * (r.endurance || 0),
    speed: c.speed * (1 + 0.06 * (r.fleet || 0)),
    dodgeCost: Math.max(8, c.dodgeCost - 3 * (r.fleet || 0)),
    manaRegen: c.manaRegen * (1 + 0.25 * (r.focus || 0)) * (r.arcane ? 1.5 : 1),
    meleeBonus: r.might || 0,
    rangedBonus: r.precision || 0,
    blockMult: r.bulwark ? 0.6 : 1,
    maxArrows: (state.classId === 'ranger' ? 40 : 30) + 10 * u.quiver,
    maxKnives: 15 + 5 * u.quiver,
    maxBombs: 8 + 4 * u.bombBag,
    scavenge: 0.12 * (r.scavenger || 0),
    pierce: !!r.eagle,
    shadow: !!r.shadow,
    cacheSense: state.classId === 'rogue' ? 140 : 30,
    fireboltCost: u.tomeMastery || state.classId === 'mage' ? (u.tomeMastery && state.classId === 'mage' ? 4 : 6) : 7,
    foodHeal: state.classId === 'ranger' ? 6 : 4,
  };
}

export function serialize(state) {
  return JSON.stringify(state);
}

// Returns a valid state or null. Never throws. Missing fields are filled from a fresh state.
export function deserialize(text) {
  try {
    if (typeof text !== 'string' || !text) return null;
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return null;
    if (typeof raw.seed !== 'string' || !CLASSES[raw.classId]) return null;
    if (!raw.player || typeof raw.player.hp !== 'number') return null;
    return mergeDefaults(newGameState(raw.seed, raw.classId), raw);
  } catch {
    return null;
  }
}

function mergeDefaults(base, raw) {
  if (Array.isArray(base)) return Array.isArray(raw) ? raw : base;
  if (base === null || typeof base !== 'object') return raw === undefined || (typeof raw !== typeof base && base !== null) ? base : raw;
  const out = { ...base };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) out[k] = k in base ? mergeDefaults(base[k], raw[k]) : raw[k];
  }
  return out;
}

export function applyDeathPenalty(state) {
  const lost = Math.floor(Math.max(0, state.player.coins) * DEATH_PENALTY);
  state.player.coins = Math.max(0, state.player.coins - lost);
  state.stats.deaths++;
  state.stats.coinsLost += lost;
  const d = derivedStats(state);
  state.player.hp = d.maxHp;
  state.player.mana = d.maxMana;
  state.player.stamina = d.maxStamina;
  state.location = { ...state.respawn };
  return lost;
}

// Bitset <-> base64 for the map's fog of war.
export function encodeBits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

export function decodeBits(text, n) {
  const bits = new Uint8Array(n);
  if (!text) return bits;
  try {
    const s = typeof atob === 'function' ? atob(text) : Buffer.from(text, 'base64').toString('binary');
    for (let i = 0; i < n; i++) bits[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch { /* corrupt fog just resets */ }
  return bits;
}

// Storage wrapper: tolerates missing/blocked localStorage.
export class SaveStore {
  constructor(storage) { this.storage = storage; }
  has() { try { return !!this.storage && !!this.storage.getItem(SAVE_KEY); } catch { return false; } }
  load() { try { return this.storage ? deserialize(this.storage.getItem(SAVE_KEY)) : null; } catch { return null; } }
  save(state) {
    try { this.storage.setItem(SAVE_KEY, serialize(state)); return true; } catch { return false; }
  }
  clear() { try { this.storage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
  loadOptions() {
    const defaults = { music: 0.5, sfx: 0.7, difficulty: 'normal', screenShake: true };
    try { return { ...defaults, ...JSON.parse(this.storage.getItem(OPTIONS_KEY) || '{}') }; } catch { return defaults; }
  }
  saveOptions(o) { try { this.storage.setItem(OPTIONS_KEY, JSON.stringify(o)); } catch { /* ignore */ } }
}

export const DIFFICULTY = {
  story: { label: 'Story', damageTaken: 0.25, enemyHp: 0.6 },
  gentle: { label: 'Gentle', damageTaken: 0.5, enemyHp: 0.8 },
  normal: { label: 'Normal', damageTaken: 1, enemyHp: 1 },
  hard: { label: 'Hard', damageTaken: 1.5, enemyHp: 1.25 },
};
