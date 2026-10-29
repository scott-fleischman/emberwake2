import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox } from './helpers/sandbox.js';
import { makeZone, inZone, zoneDanger, drawZones } from '../src/game/zones.js';
import { Enemy } from '../src/game/enemies.js';
import { Bot } from '../src/bot/bot.js';

test('shapes: inside and outside', () => {
  assert.ok(inZone(makeZone('circle', { x: 0, y: 0, r: 10 }), 6, 6));
  assert.ok(!inZone(makeZone('circle', { x: 0, y: 0, r: 10 }), 9, 9));
  assert.ok(inZone(makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 8 }), 50, 3));
  assert.ok(!inZone(makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 8 }), 50, 9));
  const ring = makeZone('ring', { x: 0, y: 0, r: 40, width: 8, gaps: [[0, 0.4]] });
  assert.ok(inZone(ring, 0, 40));       // on the ring
  assert.ok(!inZone(ring, 40, 0));      // in the gap
  assert.ok(!inZone(ring, 0, 20));      // inside the ring's hole
  assert.ok(inZone(makeZone('cone', { x: 0, y: 0, a: 0, spread: 0.5, r: 50 }), 30, 5));
  assert.ok(!inZone(makeZone('cone', { x: 0, y: 0, a: 0, spread: 0.5, r: 50 }), -30, 0));
});
test('pad grows every shape', () => {
  assert.ok(inZone(makeZone('circle', { x: 0, y: 0, r: 10 }), 12, 0, 3));
  assert.ok(!inZone(makeZone('circle', { x: 0, y: 0, r: 10 }), 12, 0));
  assert.ok(inZone(makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 8 }), 50, 9, 6));
  assert.ok(inZone(makeZone('ring', { x: 0, y: 0, r: 40, width: 8 }), 0, 47, 4));
  assert.ok(inZone(makeZone('cone', { x: 0, y: 0, a: 0, spread: 0.5, r: 50 }), 52, 0, 4));
  // a gap narrower than the pad leaves no safe room in it
  const ring = makeZone('ring', { x: 0, y: 0, r: 40, width: 8, gaps: [[0, 0.1]] });
  assert.ok(!inZone(ring, 40, 0));
  assert.ok(inZone(ring, 40, 0, 6));
});
test('a ring with no gaps is closed all the way round', () => {
  const ring = makeZone('ring', { x: 0, y: 0, r: 40, width: 8 });
  for (const a of [0, 1.5, 3.1, -2.5]) assert.ok(inZone(ring, Math.cos(a) * 40, Math.sin(a) * 40));
});
test('danger levels follow the countdown', () => {
  const z = makeZone('circle', { x: 0, y: 0, r: 10, t: 1.2, life: 1 });
  assert.equal(zoneDanger(z, 0, 0), 1);
  z.t = 0.5; assert.equal(zoneDanger(z, 0, 0), 2);
  z.t = -0.1; assert.equal(zoneDanger(z, 0, 0), 3);
  assert.equal(zoneDanger(z, 50, 0), 0);
});
// R26: a wave or a ring is read where it will be, not only where it is: the sooner it arrives, the
// nearer the strike.
test('a moving zone reads as danger before it arrives, and not once it has passed', () => {
  const z = makeZone('segment', { x1: -60, y1: -40, x2: 60, y2: -40, w: 10, t: -0.1, life: 3, vy: 100 });
  assert.equal(inZone(z, 0, 0, 4), false);
  assert.equal(zoneDanger(z, 0, 0, 4), 1, '0.31 s off: an early warning');
  z.y1 = z.y2 = -20; assert.equal(zoneDanger(z, 0, 0, 4), 2, '0.11 s off: about to land');
  z.y1 = z.y2 = -100; assert.equal(zoneDanger(z, 0, 0, 4), 0, 'a second off: nothing yet');
  z.y1 = z.y2 = 20; assert.equal(zoneDanger(z, 0, 0, 4), 0, 'passed');
  z.y1 = z.y2 = -20; z.life = 0.15; assert.equal(zoneDanger(z, 0, 0, 4), 0, 'gone before it gets here');
});
test('a telegraph that will move once live reads where it is going', () => {
  const z = makeZone('segment', { x1: -60, y1: -30, x2: 60, y2: -30, w: 10, t: 0.2, life: 3, vy: 100 });
  assert.equal(zoneDanger(z, 0, 0, 4), 1, 'live in 0.2 s, here 0.21 s after');
  assert.equal(zoneDanger(makeZone('segment', { x1: -60, y1: -30, x2: 60, y2: -30, w: 10, t: 0.2, life: 3 }), 0, 0, 4), 0, 'one that stays put');
});
test('a growing ring reads as danger before it arrives, but not through its gaps or inside it', () => {
  const z = makeZone('ring', { x: 0, y: 0, r: 20, width: 8, t: -0.1, life: 3, grow: 90, gaps: [[0, 0.4]] });
  assert.equal(zoneDanger(z, 0, 40, 4), 2);
  assert.equal(zoneDanger(z, 40, 0, 4), 0, 'in the gap');
  assert.equal(zoneDanger(z, 0, 4, 4), 0, 'inside: it grows away');
});
test('a zone strikes the player once, when its timer runs out', async () => {
  const s = await sandbox();
  const hp0 = s.game.state.player.hp;
  s.area.zones.push(makeZone('circle', { ...s.center, r: 12, t: 0.5, life: 1, dmg: 2 }));
  s.step(0.4); assert.equal(s.game.state.player.hp, hp0);
  s.step(0.2); const hp1 = s.game.state.player.hp; assert.ok(hp1 < hp0);
  s.step(1.5); assert.equal(s.game.state.player.hp, hp1);
  assert.equal(s.area.zones.length, 0);
});
test('a zone that misses the player strikes nothing', async () => {
  const s = await sandbox();
  const hp0 = s.game.state.player.hp;
  s.area.zones.push(makeZone('circle', { x: s.center.x + 80, y: s.center.y, r: 12, t: 0.2, life: 0.3, dmg: 2 }));
  s.step(1);
  assert.equal(s.game.state.player.hp, hp0);
  assert.equal(s.area.zones.length, 0);
});
test('a strike the player rolls through is not spent while the zone stays live', async () => {
  const s = await sandbox();
  const hp0 = s.game.state.player.hp;
  s.game.player.iframes = 0.5;
  s.area.zones.push(makeZone('circle', { ...s.center, r: 12, t: 0.1, life: 2, dmg: 1 }));
  s.step(0.3); assert.equal(s.game.state.player.hp, hp0);
  s.step(0.5); const hp1 = s.game.state.player.hp; assert.ok(hp1 < hp0);
  s.step(1.5); assert.equal(s.game.state.player.hp, hp1);
});
test('a segment zone with no owner can hurt the player, and has a centre to push from', async () => {
  const s = await sandbox();
  const hp0 = s.game.state.player.hp, { x, y } = s.center;
  const z = makeZone('segment', { x1: x - 30, y1: y, x2: x + 30, y2: y, w: 8, t: 0.1 });
  s.area.zones.push(z);
  assert.deepEqual([z.x, z.y], [x, y]); // damagePlayer reads src.x/y for knockback and shield checks
  s.step(0.3);
  assert.ok(s.game.state.player.hp < hp0);
});
test('a zero-damage effect zone applies its effect instead of hurting', async () => {
  const s = await sandbox();
  const hp0 = s.game.state.player.hp, seen = [];
  s.game.applyEffect = (kind, src) => seen.push([kind, src]);
  const z = makeZone('circle', { ...s.center, r: 12, t: 0.1, life: 0.5, dmg: 0, effect: 'slow' });
  s.area.zones.push(z);
  s.step(1);
  assert.deepEqual(seen.map(([k, src]) => [k, src.x, src.y]), [['slow', z.x, z.y]]); // struck from the zone itself
  assert.equal(s.game.state.player.hp, hp0);
});
test("a dead owner's zones vanish, but ground patches stay", async () => {
  const s = await sandbox();
  const e = s.spawn(new Enemy('brute', 0, s.center.x + 60, s.center.y));
  s.area.zones.push(makeZone('circle', { x: 0, y: 0, r: 5, t: 3, owner: e }), makeZone('circle', { x: 0, y: 0, r: 5, t: 3, owner: e, art: 'mud' }));
  e.dead = true; s.step(0.1);
  assert.deepEqual(s.area.zones.map((z) => z.art), ['mud']);
});
test('live zones move and grow', async () => {
  const s = await sandbox();
  const z = makeZone('circle', { x: 0, y: 0, r: 10, t: 0, life: 2, dmg: 0, vx: 20, vy: -10, grow: 5 });
  s.area.zones.push(z);
  s.step(1);
  assert.ok(Math.abs(z.x - 20) < 0.5 && Math.abs(z.y + 10) < 0.5 && Math.abs(z.r - 15) < 0.2);
});
test('the bot reads zones as danger', async () => {
  const s = await sandbox();
  s.area.zones.push(makeZone('circle', { ...s.center, r: 12, t: 0.3 }));
  assert.equal(new Bot(s.game).danger(s.center.x, s.center.y, []).lv, 2);
});
// A wave wall to wall can't be walked round or outrun: a roll carries the bot through it while it
// can't be hurt. Rolling away would only let it catch up once the roll ran out.
test('the bot rolls through a wave it can\'t get round', async () => {
  const s = await sandbox(), p = s.game.player, res = s.game.state.player, hp0 = res.hp;
  const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })();
  const { createBoss } = await import('../src/game/bosses.js');
  Object.assign(s.spawn(createBoss('thornmaw', p.x + 60, p.y)), { state: 'parked', aggro: true }); // something to fight, that does nothing
  const z = makeZone('segment', { x1: 16, y1: p.y - 60, x2: s.area.map.pixelW - 16, y2: p.y - 60, w: 14, t: 0, life: 3, dmg: 1, vy: 120 });
  s.area.zones.push(z);
  let rolled = null;
  for (let t = 0; t < 2.5; t += 1 / 60) {
    bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame();
    if (p.mode === 'dodge' && !rolled) rolled = { dy: p.dodgeY, ahead: z.y1 - p.y };
  }
  assert.equal(res.hp, hp0, 'the wave never caught it');
  assert.ok(rolled && rolled.dy < 0, `rolled up into the wave, not away from it (${JSON.stringify(rolled)})`);
});
// From every side, walking out of zones or pressing an opening, a wave wall to wall never catches it.
test('the bot crosses a wave from any side, pressing an opening or not', async () => {
  const { createBoss } = await import('../src/game/bosses.js');
  const caught = [];
  let n = 0;
  for (const open of [false, true]) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const cls = ['swordsman', 'mage', 'ranger', 'rogue'][n++ % 4];
    const s = await sandbox({ cls, seed: `wave${n}` }), p = s.game.player, res = s.game.state.player, hp0 = res.hp, { pixelW: W, pixelH: H } = s.area.map;
    const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })();
    const b = Object.assign(s.spawn(createBoss('thornmaw', p.x + 40, p.y + 40)), open ? { state: 'stunned', timer: 99 } : { state: 'parked' }, { aggro: true });
    bot.threats = () => [b]; // as in its own room, where the warden is always the fight
    s.area.zones.push(dy ? makeZone('segment', { x1: 16, y1: p.y - dy * 60, x2: W - 16, y2: p.y - dy * 60, w: 14, t: 0, life: 4, dmg: 1, vy: dy * 120 })
      : makeZone('segment', { x1: p.x - dx * 60, y1: 16, x2: p.x - dx * 60, y2: H - 16, w: 14, t: 0, life: 4, dmg: 1, vx: dx * 120 }));
    for (let t = 0; t < 2; t += 1 / 60) { bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); }
    if (res.hp < hp0) caught.push(`${cls} ${open ? 'open' : 'closed'} ${dx},${dy}`);
  }
  assert.deepEqual(caught, []);
});
// Only a wave or a ring is crossed by rolling against the way it comes: a spreading pool is filled, so
// rolling at its middle lands in it, and a widening line has no way it comes from.
test('a spreading pool or a widening line is no wave to roll through; a ring is', async () => {
  const s = await sandbox(), p = s.game.player, bot = new Bot(s.game, 'any');
  const pool = makeZone('circle', { x: p.x - 28.5, y: p.y, r: 24, t: -0.1, life: 6, dmg: 0, effect: 'burn', art: 'fire', grow: 4 });
  s.area.zones = [pool];
  let d = bot.danger(p.x, p.y, []);
  assert.equal(d.lv, 2, 'read where it will spread to');
  assert.equal(d.shot, null, 'but not as a wave');
  s.area.zones = [makeZone('segment', { x1: p.x - 40, y1: p.y - 12, x2: p.x + 40, y2: p.y - 12, w: 10, t: -0.1, life: 3, dmg: 1, grow: 30 })];
  d = bot.danger(p.x, p.y, []);
  assert.equal(d.lv, 2); assert.equal(d.shot, null, 'a line widening in place');
  s.area.zones = [makeZone('ring', { x: p.x - 30, y: p.y, r: 12, width: 8, t: -0.1, life: 3, dmg: 1, grow: 90 })];
  d = bot.danger(p.x, p.y, []);
  assert.ok(d.shot?.wave && d.shot.vx > 0 && d.shot.vy === 0, `a ring comes outward from its middle: ${JSON.stringify(d.shot)}`);
});
test('the bot won\'t roll into the middle of a spreading pool', async () => {
  const s = await sandbox(), p = s.game.player;
  const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })();
  const { createBoss } = await import('../src/game/bosses.js');
  const b = Object.assign(s.spawn(createBoss('thornmaw', p.x + 60, p.y)), { state: 'parked', aggro: true });
  bot.threats = () => [b];
  const pool = makeZone('circle', { x: p.x - 28.5, y: p.y, r: 24, t: -0.1, life: 6, dmg: 0, effect: 'burn', art: 'fire', grow: 4 });
  s.area.zones.push(pool);
  let into = null;
  for (let t = 0; t < 1; t += 1 / 60) {
    bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame();
    if (p.mode === 'dodge' && p.dodgeX < 0 && !into) into = { x: p.x, dodgeX: p.dodgeX };
  }
  assert.equal(into, null, `rolled toward the pool's middle: ${JSON.stringify(into)}`);
  assert.ok(!p.effects.burn, 'and never set alight');
});
test('the bot treats blockable zones as shield-stoppable', async () => {
  const s = await sandbox();
  const bot = new Bot(s.game), { x, y } = s.center;
  s.area.zones.push(makeZone('circle', { x, y, r: 12, t: 0.3, blockable: true }));
  assert.equal(bot.danger(x, y, []).block, true);
  s.area.zones.push(makeZone('circle', { x, y, r: 12, t: 0.3 }));
  assert.equal(bot.danger(x, y, []).block, false);
});
test('drawing zones needs no randomness and covers every shape', async () => {
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => { calls.push(k); }), set: (t, k, v) => { t[k] = v; return true; } });
  const zs = [
    makeZone('circle', { x: 10, y: 10, r: 8 }), makeZone('segment', { x1: 0, y1: 0, x2: 40, y2: 0, w: 6 }),
    makeZone('ring', { x: 50, y: 50, r: 20, width: 6, gaps: [[0, 0.3], [3, 0.5]] }), makeZone('cone', { x: 0, y: 0, a: 0, spread: 0.4, r: 30 }),
    makeZone('circle', { x: 5, y: 5, r: 8, art: 'mud', t: -1, life: 4 }),
  ];
  const rnd = Math.random;
  Math.random = () => { throw new Error('drawing used Math.random'); };
  try { drawZones(g, { left: 0, top: 0 }, zs, 1.3); } finally { Math.random = rnd; }
  assert.ok(calls.filter((c) => c === 'fill').length >= 5);
});
// The outline once took its phase from the unbounded area clock, so it strobed after a few seconds.
test('the telegraph pulse is smooth in elapsed telegraph time, whatever the area clock says', () => {
  const strokes = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'stroke' ? () => strokes.push(+/,([\d.]+)\)$/.exec(t.strokeStyle)[1]) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const z = makeZone('circle', { x: 0, y: 0, r: 10, t: 0.8 });
  const alphas = (clock) => {
    strokes.length = 0; z.t = 0.8;
    for (let i = 0; i < 48; i++) { drawZones(g, { left: 0, top: 0 }, [z], clock + i / 60); z.t -= 1 / 60; }
    return strokes.slice();
  };
  const early = alphas(0.5), late = alphas(5000);
  assert.deepEqual(late, early);
  for (const run of [early, late]) for (let i = 1; i < run.length; i++) assert.ok(Math.abs(run[i] - run[i - 1]) < 0.25, `frame ${i} jumped ${run[i - 1]} -> ${run[i]}`);
});
test('a blockable zone is stopped by a facing shield, an unblockable one is not', async () => {
  const s = await sandbox(), p = s.game.player, { x, y } = s.center, res = s.game.state.player;
  s.game.state.gear.shield = 'buckler';
  s.app.input.press('KeyL'); p.aim = 0;
  const hp0 = res.hp, stamina0 = res.stamina;
  s.area.zones.push(makeZone('circle', { x: x + 14, y, r: 12, t: 0.2, life: 1, dmg: 1, blockable: true }));
  s.step(0.5);
  assert.equal(res.hp, hp0); assert.ok(res.stamina < stamina0);
  p.iframes = 0;
  s.area.zones.push(makeZone('circle', { x: x + 14, y, r: 40, t: 0.2, life: 1, dmg: 1 })); // wide: the block's push can't carry him out
  s.step(0.5);
  assert.ok(res.hp < hp0);
});
test('a ground patch strikes again every second while the player stays in it', async () => {
  const s = await sandbox(), res = s.game.state.player, hp0 = res.hp;
  s.area.zones.push(makeZone('circle', { ...s.center, r: 60, t: 0.1, life: 5, dmg: 1, art: 'fire' })); // wide: a hit's knockback doesn't carry him out
  s.step(3.5);
  assert.ok(hp0 - res.hp >= 3 && hp0 - res.hp <= 4, `${hp0 - res.hp}`);
  // a plain zone of the same size strikes once
  const q = await sandbox(), hq = q.game.state.player.hp;
  q.area.zones.push(makeZone('circle', { ...q.center, r: 60, t: 0.1, life: 5, dmg: 1 }));
  q.step(3.5);
  assert.equal(hq - q.game.state.player.hp, 1);
});
// A ground patch outlives its owner, so it must not follow the player through a door to land at the
// same pixels in the next room.
test('a patch left in one room does not carry into the next', async () => {
  const s = await sandbox(); s.game.enterDungeon('verdant');
  const a = s.game.area, next = a.dungeon.rooms.find((r) => r.id !== a.roomId), p = s.game.player, struck = [];
  s.game.damagePlayer = (...args) => { struck.push(args); return 'hit'; };
  a.zones.push(makeZone('circle', { x: p.x, y: p.y, r: 600, t: 0, life: 4, dmg: 1, art: 'poison' }));
  a.enterRoom(next.id, 's');
  assert.equal(a.zones.length, 0);
  s.step(1);
  assert.equal(struck.length, 0);
});
