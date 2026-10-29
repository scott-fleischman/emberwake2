import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox } from './helpers/sandbox.js';
import { SPECIALS, specialCooldown, firstDelay } from '../src/game/specials.js';
import { EFFECTS } from '../src/game/effects.js';
import { Enemy } from '../src/game/enemies.js';
import { Elite } from '../src/game/elites.js';
import { Projectile } from '../src/game/entities.js';
import { lockOnTarget, meleeTargets } from '../src/game/combat.js';
import { BIOME_KEYS } from '../src/world/tiles.js';
import { AudioEngine, SFX_NAMES } from '../src/audio/audio.js';
import { Bot } from '../src/bot/bot.js';

const ARCH = ['brute', 'lunger', 'skirmisher', 'ranged'];
const DONE = ['forest', 'swamp', 'desert'];
test('each of these regions has a move for all four archetypes', () => {
  for (const b of DONE) for (const a of ['brute', 'lunger', 'skirmisher', 'ranged']) {
    const m = SPECIALS[b][a];
    assert.ok(m && m.windup >= 0.5, `${b}/${a}`);
    assert.ok(EFFECTS[m.effect] || ['knockback', 'rockfall'].includes(m.effect), `${b}/${a} effect`);
  }
});
// Fires one special at a player standing still; reports what it did. Normal attacks are off.
async function specialHits(a, b) {
  const s = await sandbox({ seed: `${b}${a}` });
  const e = s.spawn(new Enemy(a, BIOME_KEYS.indexOf(b), s.center.x + 30, s.center.y));
  e.specialCool = 0.2; e.cool = 99;
  let windup = false; const effects = new Set();
  for (let t = 0; t < 8; t += 1 / 60) {
    s.step(1 / 60);
    windup ||= e.state === 'special' && e.sub === 'windup';
    for (const k of Object.keys(s.game.player.effects)) effects.add(k);
  }
  return { windup, effects: [...effects], hpLost: s.game.derived.maxHp - s.game.state.player.hp };
}
test('a special waits for its first delay, telegraphs, then lands', async () => {
  for (const b of DONE) for (const a of ['brute', 'lunger', 'skirmisher', 'ranged']) {
    const r = await specialHits(a, b), m = SPECIALS[b][a];
    assert.ok(r.windup, `${b}/${a} telegraph`);
    assert.ok(EFFECTS[m.effect] ? r.effects.includes(m.effect) : r.hpLost > 0, `${b}/${a} landed`);
  }
});
test('normal attacks carry no effect', async () => {
  const s = await sandbox();
  const e = s.spawn(new Enemy('lunger', 0, s.center.x + 60, s.center.y)); e.specialCool = 999;
  s.step(6);
  assert.deepEqual(s.game.player.effects, {});
});
test('specials come back on an 8-12 s cooldown', () => {
  for (let i = 0; i < 200; i++) { const c = specialCooldown(); assert.ok(c >= 8 && c <= 12); const f = firstDelay(); assert.ok(f >= 3 && f <= 9); }
});

// ---------------------------------------------------------------- the framework
const special = async (a, b, opts = {}) => {
  const s = await sandbox({ seed: opts.seed || `${b}${a}` });
  const e = s.spawn(opts.elite ? new Elite(opts.elite, s.center.x + 30, s.center.y) : new Enemy(a, BIOME_KEYS.indexOf(b), s.center.x + (opts.dx ?? 30), s.center.y));
  e.specialCool = 0.2; e.cool = 99;
  return { s, e };
};
const stepUntil = (s, until, max = 8) => { for (let t = 0; t < max && !until(); t += 1 / 60) s.step(1 / 60); return until(); };

test('a new enemy waits out a random first delay before its special', () => {
  const e = new Enemy('brute', 0, 0, 0);
  assert.ok(e.specialCool >= 3 && e.specialCool <= 9);
});
test('a special winds up, plays its sound, runs, recovers and goes back on cooldown', async () => {
  const { s, e } = await special('brute', 'forest'), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  assert.ok(stepUntil(s, () => e.state === 'special'));
  assert.equal(e.sub, 'windup'); assert.equal(e.timer, SPECIALS.forest.brute.windup);
  assert.ok(s.area.tokens.has(e));
  assert.ok(stepUntil(s, () => e.sub === 'act'));
  assert.ok(heard.includes('mv_forest_brute'));
  assert.ok(stepUntil(s, () => e.sub === 'recover'));
  assert.ok(Math.abs(e.timer - 0.6) < 0.02);
  assert.ok(stepUntil(s, () => e.state !== 'special', 1));
  assert.ok(e.specialCool >= 7.9 && e.specialCool <= 12); assert.ok(!s.area.tokens.has(e));
});
test('no special out of range, or while another attack is under way', async () => {
  const { s, e } = await special('brute', 'forest', { dx: 140 });
  e.aggro = true; e.leash = 999;
  s.step(1);
  assert.notEqual(e.state, 'special');
  const q = await special('brute', 'forest');
  q.e.state = 'windup'; q.e.timer = 5; q.s.step(0.6);
  assert.notEqual(q.e.state, 'special');
});
test('moves publish their danger as zones owned by the monster', async () => {
  for (const b of DONE) for (const a of ARCH) {
    const { s, e } = await special(a, b);
    assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e)), `${b}/${a}`);
  }
});
test('elites run the same move with zones 1.6 times the size', async () => {
  const size = async (opts) => {
    const { s, e } = await special('brute', 'forest', opts);
    stepUntil(s, () => s.area.zones.some((z) => z.owner === e));
    return s.area.zones.find((z) => z.owner === e).width;
  };
  const plain = await size({}), elite = await size({ elite: 'warchief' });
  assert.ok(Math.abs(elite / plain - 1.6) < 1e-9, `${plain} -> ${elite}`);
});
test('a monster that loses the player mid-special lets go of it', async () => {
  const { s, e } = await special('lunger', 'desert');
  assert.ok(stepUntil(s, () => e.untargetable));
  s.game.player.mode = 'dead';
  s.step(0.1);
  assert.notEqual(e.state, 'special'); assert.ok(!e.untargetable && !e.hidden);
  assert.ok(!s.area.zones.some((z) => z.owner === e));
});

// ---------------------------------------------------------------- the mechanics
test('a Mire Leech latches on, keeps the poison going, and comes off with a roll', async () => {
  const { s, e } = await special('lunger', 'swamp');
  const p = s.game.player;
  assert.ok(stepUntil(s, () => e.latched));
  assert.ok(p.effects.poison);
  s.step(4); // poison alone lasts five seconds; the leech keeps it fresh
  assert.ok(e.latched); assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < 8); assert.ok(p.effects.poison.t > 3);
  p.tryDodge(1, 0, s.area.ctx); s.step(0.1);
  assert.ok(!e.latched);
});
test('a hit knocks a latched leech off', async () => {
  const { s, e } = await special('lunger', 'swamp');
  assert.ok(stepUntil(s, () => e.latched));
  e.damage(0.01, s.game.player, s.area.ctx);
  s.step(0.5);
  assert.ok(!e.latched); assert.notEqual(e.sub, 'act');
});
test('a Dune Scorpion burrows out of reach, then erupts where the player stood after a 0.8 s mark', async () => {
  const { s, e } = await special('lunger', 'desert', { dx: 80 });
  const p = s.game.player;
  assert.ok(stepUntil(s, () => e.untargetable));
  assert.ok(e.hidden); assert.ok(s.area.zones.some((z) => z.owner === e && z.art === 'dust'));
  assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e && z.effect === 'blind'), 3));
  const mark = s.area.zones.find((z) => z.owner === e && z.effect === 'blind');
  assert.ok(Math.hypot(mark.x - p.x, mark.y - p.y) < 1); assert.ok(Math.abs(mark.t - 0.8) < 0.02);
  assert.ok(e.untargetable);
  assert.ok(stepUntil(s, () => !e.untargetable, 1.2));
  assert.ok(Math.hypot(e.x - mark.x, e.y - mark.y) < 2);
  assert.ok(p.effects.blind);
});
test('a dust devil steers toward the player at 30 px/s and blinds inside', async () => {
  const s = await sandbox({ seed: 'devil' });
  const e = s.spawn(new Enemy('skirmisher', 2, s.center.x + 70, s.center.y));
  e.specialCool = 0.2; e.cool = 99;
  assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e && z.t <= 0)));
  const z = s.area.zones.find((q) => q.owner === e);
  s.game.player.y += 40; s.step(0.5);
  assert.ok(Math.abs(Math.hypot(z.vx, z.vy) - 30) < 0.01);
  const toward = Math.atan2(s.game.player.y - z.y, s.game.player.x - z.x);
  assert.ok(Math.abs(Math.atan2(z.vy, z.vx) - toward) < 0.2);
  assert.equal(z.life, 4); assert.equal(z.effect, 'blind');
});
test('a lobbed projectile flies over the player and lands where it was aimed', async () => {
  const s = await sandbox(), p = s.game.player, hp0 = s.game.state.player.hp;
  let landed = null;
  s.spawn(new Projectile('mud', p.x - 40, p.y, 0, 80, 3, 'enemy', { lob: 1, land: (pr) => { landed = { x: pr.x, y: pr.y }; } }));
  s.step(0.6);
  assert.equal(s.game.state.player.hp, hp0); assert.equal(landed, null);
  s.step(0.6);
  assert.ok(landed && Math.abs(landed.x - (p.x + 40)) < 3, JSON.stringify(landed));
});
test('a projectile carries its effect onto the player only when it hits', async () => {
  const s = await sandbox(), p = s.game.player;
  s.spawn(new Projectile('vine', p.x - 30, p.y, 0, 150, 1, 'enemy', { effect: 'snare' }));
  s.step(0.5);
  assert.ok(p.effects.snare);
  const q = await sandbox(), qp = q.game.player;
  q.game.state.gear.shield = 'buckler'; q.app.input.press('KeyL'); qp.aim = Math.PI;
  q.spawn(new Projectile('vine', qp.x - 30, qp.y, 0, 150, 1, 'enemy', { effect: 'snare' }));
  q.step(0.5);
  assert.ok(!qp.effects.snare);
});

// R3: an untargetable monster must be passed over, not hit for nothing.
test('a burrowed monster is skipped by blades, arrows and lock-on', async () => {
  const s = await sandbox(), p = s.game.player, ctx = s.area.ctx;
  const e = s.spawn(new Enemy('lunger', 2, p.x + 14, p.y)), hp = e.hp;
  e.untargetable = true;
  assert.deepEqual(meleeTargets(p.x, p.y, 0, 30, Math.PI, [e]), []);
  s.area.meleeStrike(p, { angle: 0, reach: 30, arc: Math.PI, dmg: 5, knock: 0 }, ctx);
  assert.equal(e.hp, hp);
  const arrow = new Projectile('arrow', e.x, e.y, 0, 100, 5, 'player');
  s.area.resolveProjectile(arrow, ctx);
  assert.equal(e.hp, hp); assert.ok(!arrow.dead); assert.ok(!arrow.hitSet.has(e));
  assert.equal(lockOnTarget(p.x, p.y, s.area.targetables(), 150), null);
  e.untargetable = false; p.lock = e; e.specialCool = 99; e.cool = 99;
  e.untargetable = true; s.step(1 / 60);
  assert.equal(p.lock, null);
});

// ---------------------------------------------------------------- the bot
const idleBot = (s) => { const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })(); return bot; };
test('the bot rolls to shake off a latched leech', async () => {
  const { s, e } = await special('lunger', 'swamp');
  assert.ok(stepUntil(s, () => e.latched));
  const bot = idleBot(s), p = s.game.player;
  let rolled = false;
  for (let i = 0; i < 30 && !rolled; i++) { bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); rolled = p.mode === 'dodge'; }
  assert.ok(rolled);
  s.step(0.1); assert.ok(!e.latched);
});
test("the bot's roll off a leech wins over a swing at something else that same frame", async () => {
  const { s, e } = await special('lunger', 'swamp');
  assert.ok(stepUntil(s, () => e.latched));
  const p = s.game.player, b = s.spawn(new Enemy('brute', 1, p.x + 16, p.y));
  Object.assign(b, { state: 'idle', aggro: true, cool: 99, specialCool: 99 });
  p.lock = b;
  const bot = idleBot(s);
  let rolled = false;
  for (let i = 0; i < 10 && !rolled; i++) { bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); rolled = p.mode === 'dodge'; }
  assert.ok(rolled);
});
test('the bot holds off a monster winding up a special, and treats it as danger', async () => {
  const { s, e } = await special('brute', 'forest');
  assert.ok(stepUntil(s, () => e.state === 'special'));
  const bot = new Bot(s.game, 'any');
  assert.equal(bot.attackWindow(e), false);
  assert.ok(bot.danger(e.x - 10, e.y, [e]).lv >= 1);
});
test('the bot does not read a lobbed projectile as a threat on its ground path', async () => {
  const s = await sandbox(), p = s.game.player;
  s.spawn(new Projectile('mud', p.x - 20, p.y, 0, 80, 0, 'enemy', { lob: 1 }));
  assert.equal(new Bot(s.game).danger(p.x, p.y, []).lv, 0);
});

// ---------------------------------------------------------------- art and sound
test('every move has its own sound, named for its region and archetype', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = DONE.flatMap((b) => ARCH.map((a) => { assert.equal(SPECIALS[b][a].sfx, `mv_${b}_${a}`); return SPECIALS[b][a].sfx; }));
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});
const recorder = () => {
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; return true; } });
  return { g, calls };
};
test('monsters mid-special and the new projectiles draw without randomness', async () => {
  const s = await sandbox(), cam = { left: 0, top: 0 };
  const things = [];
  for (const b of DONE) for (const a of ARCH) {
    const e = new Enemy(a, BIOME_KEYS.indexOf(b), 50, 50);
    e.state = 'special'; e.sub = 'windup'; e.anim = 0.01;
    things.push(e);
  }
  for (const k of ['vine', 'mud', 'poison', 'sand', 'seed']) things.push(new Projectile(k, 40, 40, 0.3, 80, 1, 'enemy', { lob: k === 'vine' ? 0 : 1 }));
  const { g, calls } = recorder(), rnd = Math.random;
  Math.random = () => { throw new Error('drawing used Math.random'); };
  try { for (const t of things) t.draw(g, cam, s.area.ctx); } finally { Math.random = rnd; }
  assert.ok(calls.filter((c) => c[0] === 'drawImage').length >= 12);
  assert.ok(calls.some((c) => c[0] === 'arc'));
});
