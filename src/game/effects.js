// Status effects: timed ailments carried in `p.effects`. This module is the rules only (durations,
// damage over time, what each effect blocks, how it is shaken off) and touches no scene, so it runs
// against a bare { effects, controlImmune } object.

export const CONTROL_IMMUNITY = 3; // seconds after a control effect ends before another can land

// dur: seconds. control: locks the player down, so it earns immunity when it ends. speed: walk
// multiplier. tick/dmg: hp lost every `tick` seconds; floor: the hp it can't take you below.
// blocks: what the player can't do ('all' is everything but mashing). shake: the action that
// clears it, `need` times for control effects. upgrade: what a repeat hit hardens into.
export const EFFECTS = {
  snare: { dur: 5, control: true, blocks: ['move', 'roll'], shake: 'attack', need: 3, rgb: '176,136,72', sfx: 'fx_snare' },
  poison: { dur: 5, tick: 1.5, dmg: 1, floor: 1, shake: 'eat', rgb: '130,210,70', sfx: 'fx_poison' },
  mud: { dur: 5, speed: 0.5, shake: 'roll', rgb: '140,100,58', sfx: 'fx_mud' },
  blind: { dur: 5, shake: null, rgb: '176,160,220', sfx: 'fx_blind' },
  chill: { dur: 5, speed: 0.7, shake: null, upgrade: 'freeze', rgb: '140,208,255', sfx: 'fx_chill' },
  freeze: { dur: 5, control: true, blocks: ['all'], shake: 'press', need: 6, rgb: '200,236,255', sfx: 'fx_freeze' },
  burn: { dur: 5, tick: 1, dmg: 1, shake: 'roll', rgb: '255,140,48', sfx: 'fx_burn' },
};

// What applying `kind` gives right now: a second chill hardens into a freeze.
export const resolve = (p, kind) => (EFFECTS[kind]?.upgrade && p.effects[kind] ? EFFECTS[kind].upgrade : kind);

// False when a control effect is turned away by immunity. Applying one already on you refreshes
// its clock but keeps its progress, so a patch re-striking each second can't undo mashing or
// stop a burn's ticks from landing.
export function applyEffect(p, kind, { story = false } = {}) {
  if (!EFFECTS[kind]) return false;
  const to = resolve(p, kind), def = EFFECTS[to], cur = p.effects[to];
  if (def.control && p.controlImmune > 0) return false;
  if (to !== kind) delete p.effects[kind];
  const e = { t: story ? def.dur / 2 : def.dur, n: cur ? cur.n : 0 };
  if (def.tick) e.a = cur ? cur.a : 0;
  if (def.need) e.need = story && to === 'freeze' ? 1 : def.need;
  p.effects[to] = e;
  return true;
}

function end(p, kind) {
  delete p.effects[kind];
  if (EFFECTS[kind].control) p.controlImmune = CONTROL_IMMUNITY;
}

// Counts everything down and returns the hp of damage over time due this frame (unscaled).
export function tickEffects(p, dt) {
  if (p.controlImmune > 0) p.controlImmune = Math.max(0, p.controlImmune - dt);
  let dmg = 0;
  for (const [kind, e] of Object.entries(p.effects)) {
    const def = EFFECTS[kind];
    if (def.tick) for (e.a += dt; e.a >= def.tick; e.a -= def.tick) dmg += def.dmg;
    if ((e.t -= dt) <= 0) end(p, kind);
  }
  return dmg;
}

// The hp the damage over time on `p` can't take it below. Anything lethal in the mix, like
// burning, removes the floor: poison alone stops at half a heart.
export function dotFloor(p) {
  let floor = Infinity;
  for (const kind of Object.keys(p.effects)) if (EFFECTS[kind].dmg) floor = Math.min(floor, EFFECTS[kind].floor ?? 0);
  return floor === Infinity ? 0 : floor;
}

// `action` is 'attack' | 'roll' | 'press' | 'eat'. Returns the kinds that came off.
export function shakeEffects(p, action) {
  const gone = [];
  for (const [kind, e] of Object.entries(p.effects)) {
    const def = EFFECTS[kind];
    if (def.shake !== action || (def.need && ++e.n < e.need)) continue;
    end(p, kind);
    gone.push(kind);
  }
  return gone;
}

export function clearEffects(p) { p.effects = {}; }

export const moveMult = (p) => Object.keys(p.effects).reduce((m, k) => m * (EFFECTS[k].speed ?? 1), 1);

// `what`: 'move' | 'roll' | 'attack', or 'all' for the freeze that blocks everything.
export const blocked = (p, what) => Object.keys(p.effects).some((k) => EFFECTS[k].blocks?.some((b) => b === what || b === 'all'));
