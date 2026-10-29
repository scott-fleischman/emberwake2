import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, recorder, sfxDuringFight } from './helpers/sandbox.js';
import { WARDEN_MOVES, createBoss, viewFrom } from '../src/game/bosses.js';
import { Enemy } from '../src/game/enemies.js';
import { Bomb, Projectile } from '../src/game/entities.js';
import { makeZone } from '../src/game/zones.js';
import { AudioEngine, SFX_NAMES, MUSIC_KEYS } from '../src/audio/audio.js';
import { paintCinder, CINDER_PAL } from '../src/gfx/art-cinder.js';
import { paintThornmaw, THORN_PAL } from '../src/gfx/art-thornmaw.js';
import { paintRime, RIME_PAL } from '../src/gfx/art-rime.js';
import { portraitPose } from '../src/gfx/bossart.js';
import { T } from '../src/world/tiles.js';
import { Bot } from '../src/bot/bot.js';

test('every warden has a complete moveset', () => {
  for (const [k, m] of Object.entries(WARDEN_MOVES)) {
    assert.ok(m.phase1[m.first], `${k} first state`);
    assert.equal(typeof m.vulnerable, 'function');
    // A borrowed form begins at `first`, so a hit has to land there at once.
    assert.ok(!m.untargetable?.({ state: m.first }), `${k} first state is targetable`);
    assert.equal(typeof m.phase2, 'object');
    assert.equal(typeof m.enter2, 'function');
    assert.equal(typeof m.clear, 'function');
  }
});

test('painters take a palette', () => {
  const rec = recorder();                      // a Proxy context logging fillStyle assignments
  paintCinder(rec.g, portraitPose('cinder', 1), [], { ...CINDER_PAL, core: '#123456' });
  assert.ok(rec.fills.includes('#123456'));
});

// Repainted with every palette colour swapped, no colour the painter uses may stay the same.
test('a palette reaches every colour its painter uses', () => {
  const swap = (pal) => JSON.parse(JSON.stringify(pal).replace(/#[0-9a-f]{6}/gi, '#010203').replace(/\d+,\d+,\d+/g, '1,2,3'));
  const states = ['intro', 'stalk', 'wind', 'charge', 'stunned', 'thorns', 'roots', 'spores', 'lash', 'transform', 'volley', 'vent', 'fadeout', 'orbit', 'dash', 'skid', 'rain', 'dying'];
  const colours = (kind, paint, pal) => {
    const rec = recorder(), L = [];
    rec.g.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    for (const state of states) for (const phase of [1, 2, 3]) for (const roarT of [0, 0.2]) for (const view of ['side', 'front', 'back']) {
      paint(rec.g, { ...portraitPose(kind, 1.3), state, phase, roarT, phaseT: 0.5, timer: 0.5, cdx: 1, cdy: 0, view }, L, pal);
    }
    return [...rec.fills, ...rec.calls.filter((c) => c[0] === 'addColorStop').map((c) => c[2]), ...L.map((l) => l.rgb)].filter((c) => typeof c === 'string');
  };
  for (const [kind, paint, pal] of [['thornmaw', paintThornmaw, THORN_PAL], ['cinder', paintCinder, CINDER_PAL], ['rime', paintRime, RIME_PAL]]) {
    const a = colours(kind, paint, pal), b = colours(kind, paint, swap(pal));
    assert.equal(a.length, b.length);
    a.forEach((c, i) => assert.notEqual(c, b[i], `${kind} paints ${c} from outside its palette`));
  }
});

test('boss telegraphs are zones', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.state = 'volley'; b.volleys = 1; b.phase = 2; b.timer = 0;
  s.step(0.1);
  assert.ok(s.area.zones.some((z) => z.owner === b));
});

test('eruptions and shard drops strike where the player stood', async () => {
  for (const [kind, state, dmg] of [['cinder', 'volley', 2], ['rime', 'rain', 1]]) {
    const s = await sandbox(), res = s.game.state.player, p = s.game.player;
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); b.state = state; b.volleys = 1; b.phase = 2; b.timer = 0;
    s.step(1 / 60);
    const mine = s.area.zones.filter((z) => z.owner === b && z.shape === 'circle');
    assert.ok(mine.length >= 3, `${kind} puts down its circles`);
    assert.ok(mine.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1), `${kind} aims one at the player`);
    // Only the zones may hurt: park the boss and clear its shots.
    b.state = 'parked';
    for (const e of s.area.entities) if (e !== b && e.team === 'enemy') e.dead = true;
    const hp = res.hp;
    s.step(1);
    assert.equal(hp - res.hp, dmg * s.game.diff.damageTaken, `${kind} strike`);
  }
});

test('charge windups show the lane the charge will take', async () => {
  for (const [kind, state] of [['thornmaw', 'stalk'], ['rime', 'orbit']]) {
    const s = await sandbox();
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); b.state = state; b.timer = 0; b.shotT = 9;
    s.step(1 / 60);
    assert.equal(b.state, 'wind');
    const z = s.area.zones.find((q) => q.owner === b && q.shape === 'segment');
    assert.ok(z, `${kind} lane`);
    assert.equal(z.w, 24); assert.equal(z.dmg, 0);
    assert.deepEqual([z.x1, z.y1], [b.x, b.y]);
    assert.ok(Math.abs((z.x2 - z.x1) / 300 - b.cdx) < 1e-9 && Math.abs((z.y2 - z.y1) / 300 - b.cdy) < 1e-9, `${kind} lane runs 300 px along the charge`);
    while (b.state === 'wind') s.step(1 / 60);
    assert.ok(!s.area.zones.includes(z), `${kind} lane is gone once the charge starts`);
  }
});

test('the Rime Sovereign takes her walls down when she dies, once', async () => {
  const s = await sandbox(), map = s.area.map;
  const b = s.spawn(createBoss('rime', s.center.x, s.center.y - 60)); b.state = 'orbit'; b.timer = 9; b.shotT = 9;
  let clears = 0; b.moves = { ...b.moves, clear: (...a) => { clears++; WARDEN_MOVES.rime.clear(...a); } };
  b.hp = b.maxHp * 0.5; s.step(1.6);
  const walls = b.walls.map((w) => [w.tx, w.ty]);
  assert.ok(walls.length > 0 && walls.every(([x, y]) => map.get(x, y) === T.DWALL));
  b.damage(9999, s.game.player, s.area.ctx); s.step(1 / 60);
  assert.ok(walls.every(([x, y]) => map.get(x, y) === T.DFLOOR));
  s.step(3.2); assert.ok(b.dead); assert.equal(clears, 1);
});

// ---------------------------------------------------------------- views, phases and the centered death
test('viewFrom has hysteresis', () => {
  assert.equal(viewFrom(50, 0, 'front'), 'side');
  assert.equal(viewFrom(0, 50, 'side'), 'front');
  assert.equal(viewFrom(0, -50, 'side'), 'back');
  assert.equal(viewFrom(40, 38, 'back'), 'back');
  assert.equal(viewFrom(1, 2, 'side'), 'side');
});
test('a warden faces the way it moves, or where its telegraph aims', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.state = 'parked';
  const walk = (dx, dy) => { for (let i = 0; i < 10; i++) { b.x += dx; b.y += dy; s.step(1 / 60); } };
  walk(0, 1); assert.equal(b.view, 'front');
  walk(-1, 0); assert.equal(b.view, 'side'); assert.equal(b.face, -1);
  walk(0, -1); assert.equal(b.view, 'back');
  walk(0.6, -0.55); assert.equal(b.view, 'back'); // a diagonal keeps the view it had
  Object.assign(b, { state: 'wind', timer: 9, cdx: 0, cdy: 1 }); s.step(1 / 30); assert.equal(b.view, 'front');
  Object.assign(b, { cdx: 1, cdy: 0 }); s.step(1 / 30); assert.equal(b.view, 'side'); assert.equal(b.face, 1);
});
test('every warden paints a front and a back view unlike its side, without randomness', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('painters must not call Math.random'); };
  try {
    for (const [kind, paint] of [['thornmaw', paintThornmaw], ['cinder', paintCinder], ['rime', paintRime]]) {
      const draw = (view, o = {}) => { const r = recorder(); paint(r.g, { ...portraitPose(kind, 1), view, ...o }, []); return JSON.stringify(r.calls); };
      assert.notEqual(draw('front'), draw('side'), kind); assert.notEqual(draw('back'), draw('side'), kind); assert.notEqual(draw('front'), draw('back'), kind);
      for (const state of ['charge', 'vent', 'dash', 'dying', 'transform']) for (const view of ['side', 'front', 'back']) draw(view, { state, phase: 2, phaseT: 0.4 });
    }
  } finally { Math.random = random; }
});
test('a warden entered straight at its first state fights at once (init sets what its intro did)', async () => {
  for (const kind of ['thornmaw', 'cinder', 'rime']) {
    const s = await sandbox(), m = WARDEN_MOVES[kind];
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 50)); b.state = m.first;
    const seen = new Set(), shots = () => s.area.entities.filter((e) => e.team === 'enemy' && e.dmg && !e.boss).length;
    let fired = 0;
    for (let t = 0; t < 3.5; t += 1 / 60) { s.step(1 / 60); seen.add(b.state); fired = Math.max(fired, shots()); s.game.state.player.hp = 99; }
    assert.ok(seen.size > 1, `${kind} moves on from ${m.first}`);
    assert.ok(kind === 'thornmaw' ? seen.has('charge') : fired > 0, `${kind} attacks`);
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `${kind} stays put somewhere real`);
  }
});
test('wardens have double HP and transform at half', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.state = 'stalk';
  assert.equal(b.maxHp, 120);
  b.damage(61, s.game.player, s.game.area.ctx);
  s.step(0.05); assert.equal(b.state, 'transform'); assert.ok(b.untargetable);
  s.step(1.6); assert.equal(b.phase, 2); assert.notEqual(b.state, 'transform');
});
test('the transform roars in the warden\'s own voice, swells the music, then runs phase 2\'s entry', async () => {
  assert.deepEqual([createBoss('cinder', 0, 0).maxHp, createBoss('rime', 0, 0).maxHp], [144, 168]);
  const s = await sandbox(), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.state = 'stalk';
  b.damage(70, s.game.player, s.area.ctx); s.step(0.05);
  assert.ok(heard.includes('thornmaw_phase')); assert.equal(s.app.audio.cur.key, 'boss2');
  assert.equal(b.damage(5, s.game.player, s.area.ctx), false, 'no hurting it mid-transform');
  s.step(1.5);
  assert.equal(s.area.enemyList.filter((e) => e.archetype === 'lunger' && !e.dead).length, 2, 'enter2 ran');
  assert.equal(b.state, WARDEN_MOVES.thornmaw.first2 ?? WARDEN_MOVES.thornmaw.first);
});
test('a huge hit cannot skip phase 2', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('rime', s.center.x, s.center.y - 40)); b.state = 'orbit';
  b.hp = b.maxHp * 0.51; b.damage(500, s.game.player, s.game.area.ctx);
  assert.equal(b.hp, b.maxHp * 0.5); s.step(0.05); assert.equal(b.state, 'transform');
});
test('the death flow clears the arena and frees the player', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'volley';
  s.spawn(new Enemy('skirmisher', 5, s.center.x - 30, s.center.y));
  s.area.zones.push(makeZone('circle', { ...s.center, r: 10, t: 2 }));
  const foeShot = s.spawn(new Projectile('thorn', s.center.x + 60, s.center.y - 20, Math.PI, 90, 1, 'enemy'));
  const myShot = s.spawn(new Projectile('arrow', s.center.x - 60, s.center.y - 20, 0, 90, 1, 'player'));
  b.x += 70; s.game.player.x = b.spawn.x; s.game.player.y = b.spawn.y;
  let defeated = false; s.area.onBossDefeated = () => { defeated = true; };
  b.damage(9999, s.game.player, s.game.area.ctx);
  s.step(1.2);
  assert.deepEqual({ x: b.x, y: b.y }, b.spawn);
  assert.equal(b.view, 'front');
  assert.equal(s.area.enemyList.filter((e) => !e.boss && !e.dead).length, 0);
  assert.ok(foeShot.dead && myShot.dead && !s.area.entities.some((e) => e instanceof Projectile), 'every shot, theirs and ours, is gone');
  assert.equal(s.area.zones.length, 0);
  assert.ok(!s.area.map.isSolid(Math.floor(s.game.player.x / 16), Math.floor(s.game.player.y / 16)));
  assert.ok(s.game.player.y > b.spawn.y);
  s.step(2); assert.ok(defeated);
});
// The player's blow runs before the warden's own update, so a melee kill leaves it a turn to act in.
test('a warden killed this frame does nothing more this frame', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'thorns'; b.timer = 0; b.bursts = 1;
  b.damage(9999, s.game.player, s.area.ctx);
  const seen = s.area.entities.length;
  b.update(1 / 60, s.area.ctx);
  assert.equal(s.area.entities.length, seen, 'its thorn ring would have outlived the sweep');
  assert.equal(b.state, 'thorns');
});
test('a lit bomb goes with the death sweep and never goes off', async () => {
  const s = await sandbox(), p = s.game.player; let blasts = 0;
  s.area.explode = () => { blasts++; };
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'vent';
  const bomb = s.spawn(new Bomb(p.x + 10, p.y, p));
  b.damage(9999, p, s.area.ctx); s.step(3.4);
  assert.ok(bomb.dead && !s.area.entities.includes(bomb));
  assert.equal(blasts, 0);
});
test('the player is freed from a roll, a charge and a lock, standing where the flow set them', async () => {
  const s = await sandbox(), p = s.game.player;
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'vent';
  Object.assign(p, { mode: 'dodge', modeT: 0.3, dodgeX: 1, dodgeY: 0, charge: 5, lock: b });
  b.damage(9999, p, s.area.ctx); s.step(1.2);
  assert.deepEqual([p.mode, p.charge, p.lock, p.facing], ['normal', 0, null, 'up']);
  const at = { x: p.x, y: p.y };
  s.step(3.2); // the flow ends and the area runs on a few frames
  assert.ok(b.dead && !s.game.bossDeath);
  assert.deepEqual({ x: p.x, y: p.y }, at, 'no roll or spin carried on from the killing blow');
  assert.equal(p.mode, 'normal');
});
// A zone or a foe earlier in the frame can kill the player before the arrow that fells the warden lands.
test('a warden felled after the player died starts no death flow', async () => {
  const s = await sandbox(), p = s.game.player;
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'vent';
  s.game.die();
  b.damage(9999, p, s.area.ctx);
  assert.ok(!s.game.bossDeath, 'no white stop-flash over the death screen');
  assert.equal(s.game.touchMode(), 'ui');
  s.game.deathT = 0; // the screen has run; the fallen player waits on the dialog
  b.damage(9999, p, s.area.ctx);
  assert.ok(!s.game.bossDeath);
});
// R11: a patch outlives its owner, so the flow must clear it, and nothing may afflict the victor.
test('nothing hurts or afflicts the player while a warden dies', async () => {
  const s = await sandbox(), p = s.game.player, heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'vent';
  s.area.zones.push(makeZone('circle', { x: p.x, y: p.y, r: 30, t: 0.05, life: 6, dmg: 0, effect: 'burn', art: 'fire', owner: b }));
  s.spawn(new Enemy('skirmisher', 5, p.x + 20, p.y));
  b.damage(9999, p, s.area.ctx); s.step(1 / 60);
  assert.equal(s.area.zones.length, 0);
  assert.equal(s.game.touchMode(), 'watch');
  assert.equal(s.game.applyEffect('snare', b), false);
  assert.equal(s.game.damagePlayer(2, b), 'ignored');
  assert.deepEqual(p.effects, {});
  s.step(3.2);
  assert.ok(b.dead); assert.ok(!s.game.bossDeath); assert.ok(heard.includes('cinder_death'));
  assert.equal(s.game.touchMode(), 'play');
});
test('the outro is focused on the arena centre', async () => {
  const s = await sandbox(); s.game.enterDungeon('verdant');
  const a = s.game.area; s.game.state.quest.flags['intro:thornmaw'] = true; a.enterRoom(a.dungeon.bossId, 's');
  const b = a.boss; b.state = 'stalk'; b.phase = 2; b.x -= 60;
  let shots = null; s.game.queueCutscene = (fn) => fn(); s.game.playCutscene = (sh) => { shots = sh; };
  b.damage(9999, s.game.player, s.game.area.ctx); s.step(4);
  assert.deepEqual(shots[0].focus, b.spawn);
});
test('each warden has its own phase and death sounds, and the fight a second theme', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['thornmaw', 'cinder', 'rime'].flatMap((k) => [`${k}_phase`, `${k}_death`]);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
  assert.ok(MUSIC_KEYS.includes('boss2'));
});

// ---------------------------------------------------------------- Thornmaw's Bloom
test('Thornmaw blooms: phase 2 uses new attacks', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 50)); b.phase = 2; b.state = WARDEN_MOVES.thornmaw.first;
  const seen = new Set(); for (let t = 0; t < 30; t += 1 / 60) { s.step(1 / 60); seen.add(b.state); s.game.state.player.hp = 99; }
  for (const st of ['roots', 'spores', 'lash']) assert.ok(seen.has(st), st);
});
test('Thornmaw has its own voice', async () => {
  const names = await sfxDuringFight('thornmaw', 40);   // sandbox helper: spies game.audio.sfx over a fight
  assert.ok(names.filter((n) => n.startsWith('thornmaw_')).length >= 4);
  assert.ok(!names.includes('boss'));
});
test('Thornmaw front and back views differ from the side', () => {
  const draw = (view) => { const r = recorder(); paintThornmaw(r.g, { ...portraitPose('thornmaw', 1), view }, []); return JSON.stringify(r.calls); };
  assert.notEqual(draw('front'), draw('side')); assert.notEqual(draw('back'), draw('side')); assert.notEqual(draw('front'), draw('back'));
});
// Each Bloom attack is the stalk's next move by turns; the charge comes between them.
test('the Bloom attacks put down the zones they promise, each in its own voice', async () => {
  const cast = async (turn, near) => {
    const s = await sandbox(), p = s.game.player, heard = [];
    s.app.audio.sfx = (name) => heard.push(name);
    const b = s.spawn(createBoss('thornmaw', p.x, p.y - (near ? 40 : 90)));
    Object.assign(b, { phase: 2, state: 'stalk', timer: 0, turn });
    s.step(1 / 60);
    return { b, p, heard, zones: s.area.zones.filter((z) => z.owner === b) };
  };
  const close = (a, x) => Math.abs(a - x) < 0.05;
  let { b, p, heard, zones } = await cast(0, false);
  assert.equal(b.state, 'roots');
  assert.equal(zones.length, 3);
  assert.deepEqual(zones.map((z) => [z.shape, z.w]), [['segment', 14], ['segment', 14], ['segment', 14]]);
  [0.7, 0.9, 1.1].forEach((t, i) => assert.ok(close(zones[i].t, t), `root ${i} strikes at ${zones[i].t}`));
  assert.ok(zones.every((z) => Math.hypot(z.x1 - b.x, z.y1 - b.y) < 1 && (z.y2 - z.y1) > 0), 'racing from it toward the player');
  assert.ok(heard.includes('thornmaw_roots'));
  ({ b, p, heard, zones } = await cast(1, false));
  assert.equal(b.state, 'wind', 'the charge between');
  ({ b, p, heard, zones } = await cast(2, false));
  assert.equal(b.state, 'spores');
  const [sp] = zones;
  assert.deepEqual([sp.shape, sp.r, sp.life, sp.dmg, sp.effect, sp.art], ['circle', 40, 2.5, 0, 'snare', 'roots']);
  assert.ok(close(sp.t, 1) && Math.hypot(sp.x - p.x, sp.y - p.y) < 1);
  assert.ok(heard.includes('thornmaw_spores'));
  ({ b, p, heard, zones } = await cast(4, true));
  assert.equal(b.state, 'lash');
  const [cone] = zones;
  assert.deepEqual([cone.shape, cone.spread, cone.r, cone.dmg], ['cone', 1.1, 70, 2]);
  assert.ok(close(cone.t, 0.6) && close(cone.a, Math.PI / 2), 'swept at the player');
  assert.ok(heard.includes('thornmaw_lash'));
});
test('every Thornmaw sound is its own', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['roar', 'charge', 'slam', 'roots', 'spores', 'lash', 'phase', 'death'].map((k) => `thornmaw_${k}`);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});

// ---------------------------------------------------------------- zone strikes
// R18: a zone's blow comes from the zone, not from whoever cast it.
test('a zone strike knocks the player away from the impact, not its owner', async () => {
  const s = await sandbox(), p = s.game.player, x0 = p.x, y0 = p.y, owner = { x: p.x - 120, y: p.y, hp: 1, name: 'caster' };
  s.area.zones.push(makeZone('circle', { x: p.x + 6, y: p.y, r: 12, t: 0.05, owner }));
  s.step(0.3);
  assert.ok(p.x < x0 - 2, `pushed west, away from the impact (${p.x - x0})`);
  const q = await sandbox(), qp = q.game.player, qy = qp.y;
  q.area.zones.push(makeZone('segment', { x1: qp.x - 100, y1: qp.y + 5, x2: qp.x + 300, y2: qp.y + 5, w: 16, t: 0.05, owner: { x: qp.x + 300, y: qp.y + 5, hp: 1 } }));
  q.step(0.3);
  assert.ok(qp.y < qy - 2, `pushed off the line, not along it (${qp.y - qy})`);
});
test('eruptions and shard drops strike on the frame their telegraph promised', async () => {
  for (const [kind, state, t] of [['cinder', 'volley', 0.9], ['rime', 'rain', 0.8]]) {
    const s = await sandbox();
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); b.state = state; b.volleys = 1; b.phase = 2; b.timer = 0;
    s.step(1 / 60);
    const first = s.area.zones.find((z) => z.owner === b && z.shape === 'circle');
    assert.ok(Math.abs(first.t - t) < 1e-9, `${kind}: ${first.t}`);
  }
});

// ---------------------------------------------------------------- the bot, in fights twice as long
const idleBot = (s) => { const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })(); return bot; };
const run = (s, bot, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) { bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); } };
test('the bot leaves a charge lane square to the side, not along it toward the warden', async () => {
  const s = await sandbox(), p = s.game.player, bot = idleBot(s);
  const b = s.spawn(createBoss('rime', p.x, p.y - 70)); Object.assign(b, { state: 'wind', timer: 9, cdx: 0, cdy: 1, aggro: true }); // aggro: the arena isn't a boss room
  const out = bot.laneEscape([b]);
  assert.equal(out[1], 0); assert.equal(Math.abs(out[0]), 1);
  run(s, bot, 0.5);
  assert.ok(Math.abs(p.x - b.x) >= 20, `out of the lane (${(p.x - b.x).toFixed(1)})`);
  assert.ok(p.y - b.y > 50, 'not rolled up the lane at her');
});
test('the bot won\'t roll onto a warden it can\'t hurt yet', async () => {
  const s = await sandbox(), p = s.game.player, bot = idleBot(s);
  const b = s.spawn(createBoss('thornmaw', p.x, p.y - 46)); b.state = 'thorns';
  assert.ok(bot.rollsOntoBoss([0, -1], [b])); assert.ok(!bot.rollsOntoBoss([0, 1], [b]));
  b.state = 'stunned'; b.vulnerable = true; assert.ok(!bot.rollsOntoBoss([0, -1], [b]));
});
test('the bot keeps clear of the brambles beside its path', async () => {
  const s = await sandbox(), p = s.game.player, map = s.area.map, bot = idleBot(s);
  const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16); p.x = tx * 16 + 8; p.y = ty * 16 + 8;
  map.set(tx + 1, ty, T.THORNS); map.set(tx + 1, ty - 1, T.THORNS); map.set(tx + 1, ty + 1, T.THORNS);
  const foe = s.spawn(new Enemy('brute', 0, p.x + 120, p.y)); // pulls it toward the brambles
  const mv = bot.bestMove([foe], foe, 40, { lv: 0 });
  assert.ok(!mv || mv[0] <= 0, `stepped ${mv}`);
});
