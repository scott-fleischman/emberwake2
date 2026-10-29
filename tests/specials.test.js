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
import { ARCHETYPES, enemyStats } from '../src/data/enemies.js';
import { makeZone, zoneDanger, drawZones } from '../src/game/zones.js';

const ARCH = ['brute', 'lunger', 'skirmisher', 'ranged'];
const DONE = ['forest', 'swamp', 'desert', 'mountain', 'snow', 'volcanic'];
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
test('Gloam-touched monsters are tier 2.2 and violet', () => {
  const e = new Enemy('brute', 0, 0, 0, { gloam: true });
  assert.equal(e.maxHp, Math.round(ARCHETYPES.brute.hp * 2.2));
  assert.match(e.name, /^Gloam /);
  assert.notDeepEqual(e.st.pal, enemyStats('brute', 0).pal);
});
test('Ice Wisps freeze on touch; Frost Archers chill', async () => {
  assert.ok((await specialHits('skirmisher', 'snow')).effects.includes('freeze'));
  assert.ok((await specialHits('ranged', 'snow')).effects.includes('chill'));
});
test('a tier overrides the region, and Gloam monsters keep their own sprites', () => {
  assert.equal(enemyStats('lunger', 0, { tier: 2.2 }).hp, Math.round(ARCHETYPES.lunger.hp * 2.2));
  assert.equal(enemyStats('lunger', 4).hp, Math.round(ARCHETYPES.lunger.hp * 1.9));
  const g = new Enemy('lunger', 4, 0, 0, { gloam: true }), plain = new Enemy('lunger', 4, 0, 0);
  assert.equal(g.name, 'Gloam Frost Wolf');
  assert.notEqual(g.key, plain.key); // the sprite cache is keyed on it
  assert.equal(g.sig, plain.sig);
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
// R12
const shieldUp = (s) => { s.game.state.gear.shield = 'buckler'; s.app.input.press('KeyL'); s.game.player.aim = Math.PI; };
test('a shield turns away a blockable effect-only strike, effect and all', async () => {
  const strike = async (blockable) => {
    const s = await sandbox(), p = s.game.player, heard = [];
    s.app.audio.sfx = (name) => heard.push(name);
    shieldUp(s); s.step(0.1);
    s.area.zones.push(makeZone('circle', { x: p.x, y: p.y, r: 10, t: 0.05, life: 0.1, dmg: 0, effect: 'poison', blockable, owner: { x: p.x - 20, y: p.y, hp: 1 } }));
    s.step(0.2);
    return { poisoned: !!p.effects.poison, blocked: heard.includes('block') };
  };
  assert.deepEqual(await strike(true), { poisoned: false, blocked: true });
  assert.deepEqual(await strike(false), { poisoned: true, blocked: false });
});
test("a Mire Leech's leap and a Marsh Fly's dive can be blocked; a blocked leech doesn't latch", async () => {
  const { s, e } = await special('lunger', 'swamp', { dx: -50 });
  shieldUp(s);
  assert.ok(stepUntil(s, () => e.sub === 'recover'));
  assert.ok(!e.latched); assert.ok(!s.game.player.effects.poison);
  const f = await special('skirmisher', 'swamp');
  assert.ok(stepUntil(f.s, () => f.s.area.zones.some((z) => z.owner === f.e && z.dmg > 0)));
  assert.ok(f.s.area.zones.find((z) => z.owner === f.e && z.dmg > 0).blockable);
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
  assert.ok(e.hidden); assert.ok(s.area.zones.some((z) => z.owner === e && z.art === 'ripple'));
  assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e && z.effect === 'blind'), 3));
  const mark = s.area.zones.find((z) => z.owner === e && z.effect === 'blind');
  assert.ok(Math.hypot(mark.x - p.x, mark.y - p.y) < 1); assert.ok(Math.abs(mark.t - 0.8) < 0.02);
  assert.ok(e.untargetable);
  assert.ok(stepUntil(s, () => !e.untargetable, 1.2));
  assert.ok(Math.hypot(e.x - mark.x, e.y - mark.y) < 2);
  assert.ok(p.effects.blind);
});
// R14: the move's own clock ends it, so losing its zones can't strand it.
test('a burrow and a dust devil end on their own clocks, even with their zones swept away', async () => {
  const { s, e } = await special('lunger', 'desert', { dx: 80 });
  assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e && z.effect === 'blind'), 4));
  s.area.zones = [];
  assert.ok(stepUntil(s, () => !e.untargetable && !e.hidden, 1.5));
  assert.ok(stepUntil(s, () => e.state !== 'special', 1.5));
  const q = await special('lunger', 'desert', { dx: 80 });
  assert.ok(stepUntil(q.s, () => q.e.hidden));
  q.s.area.zones = [];
  assert.ok(stepUntil(q.s, () => q.e.state !== 'special', 4));
  assert.ok(!q.e.untargetable);
  const d = await special('skirmisher', 'desert', { dx: 70 });
  assert.ok(stepUntil(d.s, () => d.e.sub === 'act'));
  d.s.step(1); d.s.area.zones = [];
  assert.ok(stepUntil(d.s, () => d.e.state !== 'special', 5));
});
// R13
test('knocked back mid-windup, a special fizzles into its recovery with nothing left behind', async () => {
  const { s, e } = await special('brute', 'forest'), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  assert.ok(stepUntil(s, () => e.state === 'special'));
  e.knock(150, 0, 0.15); s.step(1 / 60);
  assert.equal(e.sub, 'recover');
  s.step(1.5);
  assert.notEqual(e.state, 'special');
  assert.ok(!s.area.zones.some((z) => z.owner === e)); assert.ok(!heard.includes('mv_forest_brute'));
  assert.ok(e.specialCool >= 7);
});
test('a Harpy dives out of reach, its shadow marking the spot 0.9 s before a heavy knockback', async () => {
  const { s, e } = await special('skirmisher', 'mountain');
  assert.ok(stepUntil(s, () => e.untargetable));
  const z = s.area.zones.find((q) => q.owner === e && q.dmg > 0);
  assert.equal(z.shape, 'circle'); assert.equal(z.t0, 0.9);
  assert.equal(z.effect, 'knockback'); assert.equal(z.knock, 260);
  assert.ok(stepUntil(s, () => e.lift > 30, 0.5));
  assert.ok(stepUntil(s, () => z.t <= 0.02, 1)); assert.ok(e.untargetable);
  assert.ok(stepUntil(s, () => !e.untargetable, 0.2));
  assert.ok(Math.hypot(e.x - z.x, e.y - z.y) < 2); assert.ok(!e.lift);
});
test('a heavy knockback throws the player further than a plain blow', async () => {
  const push = async (knock) => {
    const s = await sandbox(), p = s.game.player, x0 = p.x;
    s.game.damagePlayer(1, { x: p.x - 10, y: p.y }, { knock });
    s.step(0.5);
    return p.x - x0;
  };
  const plain = await push(0), heavy = await push(260);
  assert.ok(plain > 5 && heavy > plain * 1.3, `${plain} -> ${heavy}`);
});
test('a Stone Ogre stomp drops four rocks around it, one where the player stands, landing 0.9-1.4 s on', async () => {
  const { s, e } = await special('brute', 'mountain');
  assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e)));
  const rocks = s.area.zones.filter((z) => z.owner === e && z.shape === 'circle' && z.dmg > 0), p = s.game.player;
  assert.equal(rocks.length, 4);
  const ts = rocks.map((z) => z.t0).sort((a, b) => a - b);
  assert.ok(Math.abs(ts[0] - 0.9) < 1e-9 && Math.abs(ts[3] - 1.4) < 1e-9, ts.join());
  const r0 = Math.hypot(rocks[0].x - e.x, rocks[0].y - e.y);
  for (const z of rocks) assert.ok(Math.abs(Math.hypot(z.x - e.x, z.y - e.y) - r0) < 1);
  assert.ok(rocks.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1));
});
test('a rolling shot lands, then rolls on along the ground as a moving segment zone until a wall stops it', async () => {
  const s = await sandbox(), p = s.game.player, hp0 = s.game.state.player.hp;
  const pr = s.spawn(new Projectile('boulder', p.x - 80, p.y, 0, 80, 1, 'enemy', { lob: 0.5, roll: { speed: 100, time: 4, w: 10, dmg: 1 } }));
  s.step(0.45);
  assert.ok(!s.area.zones.length); assert.equal(s.game.state.player.hp, hp0);
  s.step(0.1);
  const z = s.area.zones.find((q) => q.shape === 'segment');
  assert.ok(z && z.t <= 0 && z.vx === 100 && z.vy === 0 && z.w === 10);
  const x0 = z.x; s.step(0.2);
  assert.ok(Math.abs(z.x - x0 - 20) < 2); assert.ok(Math.abs(pr.x - z.x) < 3);
  s.step(0.4);
  assert.ok(s.game.state.player.hp < hp0);
  s.step(3);
  assert.ok(pr.dead); assert.ok(!s.area.zones.includes(z));
  assert.ok(pr.x < s.area.map.pixelW - 16);
});
test('a Yeti snowball rolls through the player and freezes', async () => {
  const r = await specialHits('brute', 'snow');
  assert.ok(r.effects.includes('freeze')); assert.ok(r.hpLost > 0);
});
test("a Frost Wolf's breath is a cone of chill in front of it", async () => {
  const { s, e } = await special('lunger', 'snow');
  assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e)));
  const z = s.area.zones.find((q) => q.owner === e);
  assert.equal(z.shape, 'cone'); assert.equal(z.effect, 'chill');
  assert.ok(Math.abs(Math.atan2(s.game.player.y - e.y, s.game.player.x - e.x) - z.a) < 0.05);
});
test('volcanic moves leave burning ground behind: fissures, paw prints, a fire trail, a fire patch', async () => {
  for (const [a, shape] of [['brute', 'segment'], ['lunger', 'circle'], ['skirmisher', 'segment'], ['ranged', 'circle']]) {
    const { s, e } = await special(a, 'volcanic');
    assert.ok(stepUntil(s, () => s.area.zones.some((z) => z.owner === e && z.effect === 'burn' && z.art && z.life >= 2)), a);
    const z = s.area.zones.find((q) => q.owner === e && q.art);
    assert.equal(z.shape, shape, a); assert.ok(['fire', 'fissure'].includes(z.art), a);
  }
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
test('the bot sees a rolling boulder coming, and knows a shield will not stop it', async () => {
  const s = await sandbox(), p = s.game.player;
  s.spawn(new Projectile('boulder', p.x - 60, p.y, 0, 20, 1, 'enemy', { lob: 0.1, roll: { speed: 100, time: 2, w: 10, dmg: 1 } }));
  s.step(0.35); // rolling, and about to arrive
  const d = new Bot(s.game).danger(p.x, p.y, []);
  assert.ok(d.lv >= 2); assert.equal(d.block, false);
});
// R15: a ripple warns of nothing, so the bot needn't roll away from it.
test('a live zone that neither hurts nor afflicts is no danger; a telegraph still warns as it counts down', () => {
  assert.equal(zoneDanger(makeZone('circle', { x: 0, y: 0, r: 10, t: 0, life: 4, dmg: 0, art: 'ripple' }), 0, 0), 0);
  assert.equal(zoneDanger(makeZone('circle', { x: 0, y: 0, r: 10, t: 0, life: 4, dmg: 0, effect: 'blind' }), 0, 0), 3);
  assert.equal(zoneDanger(makeZone('segment', { x1: 0, y1: 0, x2: 50, y2: 0, w: 8, t: 0.3, dmg: 0 }), 20, 0), 2);
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
  for (const k of ['vine', 'mud', 'poison', 'sand', 'seed', 'boulder', 'snowball', 'fireball']) things.push(new Projectile(k, 40, 40, 0.3, 80, 1, 'enemy', { lob: k === 'vine' ? 0 : 1 }));
  things.push(new Projectile('ice', 40, 40, 0.3, 80, 1, 'enemy', { effect: 'chill' }));
  for (const k of ['boulder', 'snowball']) things.push(Object.assign(new Projectile(k, 40, 40, 0.3, 80, 1, 'enemy', { lob: 1, roll: { speed: 90, time: 1 } }), { lob: 0, rolling: true }));
  const harpy = new Enemy('skirmisher', 3, 50, 50);
  harpy.lift = 60; things.push(harpy);
  const { g, calls } = recorder(), rnd = Math.random;
  Math.random = () => { throw new Error('drawing used Math.random'); };
  try { for (const t of things) t.draw(g, cam, s.area.ctx); } finally { Math.random = rnd; }
  assert.ok(calls.filter((c) => c[0] === 'drawImage').length >= 24);
  assert.ok(calls.some((c) => c[0] === 'arc'));
});
test('the burrow ripple is harmless ground with its own art', async () => {
  const { s, e } = await special('lunger', 'desert', { dx: 80 });
  assert.ok(stepUntil(s, () => e.hidden));
  const z = s.area.zones.find((q) => q.owner === e);
  assert.equal(z.art, 'ripple'); assert.equal(z.dmg, 0); assert.equal(z.effect, null);
  z.t = -0.5;
  const { g, calls } = recorder(), rnd = Math.random;
  Math.random = () => { throw new Error('drawing used Math.random'); };
  try { drawZones(g, { left: 0, top: 0 }, [z], 1); } finally { Math.random = rnd; }
  assert.ok(calls.filter((c) => c[0] === 'fillRect').length >= 3);
});
// R16
test('a hidden elite draws nothing at all, aura and nameplate included', async () => {
  await sandbox(); // the canvas shim
  const e = new Elite('frostfang', 50, 50);
  e.hidden = true;
  const { g, calls } = recorder();
  e.draw(g, { left: 0, top: 0 });
  assert.deepEqual(calls, []);
  e.hidden = false; e.draw(g, { left: 0, top: 0 });
  assert.ok(calls.some((c) => c[0] === 'fillText'));
});
