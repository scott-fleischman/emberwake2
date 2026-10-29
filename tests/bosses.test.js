import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, recorder, sfxDuringFight } from './helpers/sandbox.js';
import { WARDEN_MOVES, createBoss, viewFrom } from '../src/game/bosses.js';
import { Enemy } from '../src/game/enemies.js';
import { Bomb, Projectile } from '../src/game/entities.js';
import { makeZone } from '../src/game/zones.js';
import { AudioEngine, SFX_NAMES, MUSIC_KEYS } from '../src/audio/audio.js';
import { paintCinder, CINDER_PAL, cinderHands, cinderPalms } from '../src/gfx/art-cinder.js';
import { paintThornmaw, THORN_PAL } from '../src/gfx/art-thornmaw.js';
import { paintRime, RIME_PAL } from '../src/gfx/art-rime.js';
import { portraitPose } from '../src/gfx/bossart.js';
import { T } from '../src/world/tiles.js';
import { Bot } from '../src/bot/bot.js';
import { reachMap, tileOf } from '../src/bot/nav.js';
import { rectSolid } from '../src/game/physics.js';

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
  const states = ['intro', 'stalk', 'wind', 'charge', 'stunned', 'thorns', 'roots', 'spores', 'lash', 'transform', 'volley', 'vent', 'fadeout', 'ready', 'meteors', 'sweep', 'pools', 'orbit', 'dash', 'skid', 'rain', 'dying'];
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

// The Cinder Warden's meteor rain is its first Unbound attack: 'ready' with nothing done yet.
test('boss telegraphs are zones', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); Object.assign(b, { state: 'ready', turn: 0, phase: 2, timer: 0 });
  s.step(0.1);
  assert.ok(s.area.zones.some((z) => z.owner === b));
});

test('meteors and shard drops strike where the player stood', async () => {
  for (const [kind, state, dmg, secs] of [['cinder', 'ready', 2, 1.1], ['rime', 'rain', 1, 1]]) {
    const s = await sandbox(), res = s.game.state.player, p = s.game.player;
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); Object.assign(b, { state, turn: 0, volleys: 1, phase: 2, timer: 0 });
    s.step(1 / 60);
    const mine = s.area.zones.filter((z) => z.owner === b && z.shape === 'circle');
    assert.ok(mine.length >= 3, `${kind} puts down its circles`);
    assert.ok(mine.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1), `${kind} aims one at the player`);
    // Only the zones may hurt: park the boss and clear its shots.
    b.state = 'parked';
    for (const e of s.area.entities) if (e !== b && e.team === 'enemy') e.dead = true;
    const hp = res.hp;
    s.step(secs);
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

// ---------------------------------------------------------------- the Cinder Warden, Unbound
test('the casting hands never move inward', () => {
  for (let k = 0; k <= 10; k++) {
    const b = { ...portraitPose('cinder', 1), state: 'volley', timer: 0.55 * (1 - k / 10), view: 'side' };
    for (const h of cinderHands(b)) assert.ok(Math.abs(h.x) >= 22, `k=${k} x=${h.x}`);
  }
});
// Without the portrait's roar: the cast draws back and up, then thrusts along the aim, palms open.
test('the cast draws back and up, then thrusts along the aim in every view, never inward', () => {
  const pose = (view, q, aim = view === 'front' ? [0, 1] : view === 'back' ? [0, -1] : [1, 0]) =>
    cinderHands({ ...portraitPose('cinder', 1), roarT: 0, state: 'volley', timer: 0.55 * (1 - q), view, cdx: aim[0], cdy: aim[1] });
  for (const view of ['side', 'front', 'back']) {
    let last = null;
    for (let k = 0; k <= 20; k++) {
      const hs = pose(view, k / 20);
      for (const h of hs) assert.ok(Math.abs(h.x) >= 22, `${view} q=${k / 20} x=${h.x}`);
      if (last && (view !== 'side' || k > 12)) hs.forEach((h, i) => assert.ok(Math.abs(h.x) >= Math.abs(last[i].x) - 1e-9, `${view} moves inward at q=${k / 20}`));
      last = hs;
    }
    const back = pose(view, 0.6), out = pose(view, 1);
    for (const h of back) assert.ok(Math.abs(h.y + 44) < 1e-6, `${view} drawn up to -44 (${h.y})`);
    if (view !== 'side') for (const h of back) assert.ok(Math.abs(Math.abs(h.x) - 26) < 1e-6, `${view} drawn back to ±26 (${h.x})`);
    for (const h of out) assert.equal(h.open, 1, `${view} palms open`);
    if (view === 'side') for (const h of out) assert.ok(h.x >= 28, `side thrusts forward (${h.x})`);
    if (view === 'front') for (const h of out) assert.ok(h.y > -40, `front thrusts down at the camera (${h.y})`);
    if (view === 'back') for (const h of out) assert.ok(h.y < -46, `back thrusts up and away (${h.y})`);
  }
});
test('the embers leave from the palms, along the aim', async () => {
  for (const [view, px, py] of [['side', 90, -10], ['front', 10, 70], ['back', -10, -90]]) {
    const s = await sandbox(), p = s.game.player;
    const b = s.spawn(createBoss('cinder', p.x - px, p.y - py)), l = Math.hypot(px, py);
    Object.assign(b, { state: 'volley', volleys: 3, timer: 0, view, cdx: px / l, cdy: py / l });
    const shots = [], spawn = s.area.spawn.bind(s.area);
    s.area.spawn = (e) => { if (e.kind === 'ember') shots.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, palms: cinderPalms(b) }); return spawn(e); };
    const mid = (e) => [b.x + (e.palms[0].x + e.palms[1].x) / 2, b.y + (e.palms[0].y + e.palms[1].y) / 2];
    s.step(1 / 60);
    assert.equal(shots.length, 3, view); assert.equal(b.view, view);
    for (const e of shots) {
      assert.ok(e.palms.some((q) => Math.hypot(b.x + q.x - e.x, b.y + q.y - e.y) < 0.5), `${view}: an ember from (${e.x - b.x}, ${e.y - b.y}), palms ${JSON.stringify(e.palms)}`);
      const [mx, my] = mid(e), ax = p.x - mx, ay = p.y - my, dot = (e.vx * ax + e.vy * ay) / (Math.hypot(e.vx, e.vy) * Math.hypot(ax, ay));
      assert.ok(dot > 0.95, `${view}: fans out from the palms at the player (${dot.toFixed(2)})`);
    }
  }
});
// Thrusting up and away under a wall, its palms are in the wall: the embers leave from its body.
test('a volley thrown under a wall still flies', async () => {
  const s = await sandbox(), p = s.game.player;
  p.y = 24;
  const b = s.spawn(createBoss('cinder', p.x, 56)); Object.assign(b, { state: 'volley', volleys: 3, timer: 0, view: 'back', cdx: 0, cdy: -1 });
  assert.ok(cinderPalms(b).every((h) => b.y + h.y < 16), 'the palms are up in the wall');
  s.step(3 / 60);
  const embers = s.area.entities.filter((e) => e.kind === 'ember' && !e.dead);
  assert.equal(embers.length, 3, 'none die in the wall'); assert.ok(embers.every((e) => e.vy < 0), 'flying up at the player');
});
test('the Cinder Warden comes Unbound: phase 2 uses new attacks', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 50)); b.phase = 2; b.state = WARDEN_MOVES.cinder.first;
  const seen = new Set(); for (let t = 0; t < 30; t += 1 / 60) { s.step(1 / 60); seen.add(b.state); s.game.state.player.hp = 99; }
  for (const st of ['meteors', 'sweep', 'pools']) assert.ok(seen.has(st), st);
});
test('the Cinder Warden has its own voice', async () => {
  const names = await sfxDuringFight('cinder', 40);
  assert.ok(names.filter((n) => n.startsWith('cinder_')).length >= 4);
  for (const n of ['boss', 'spell', 'gate', 'explode']) assert.ok(!names.includes(n), n);
});
test('Cinder front and back views differ from the side, in both forms', () => {
  for (const o of [{}, { phase: 2, phaseT: 9 }]) {
    const draw = (view) => { const r = recorder(); paintCinder(r.g, { ...portraitPose('cinder', 1), ...o, view }, []); return JSON.stringify(r.calls); };
    assert.notEqual(draw('front'), draw('side')); assert.notEqual(draw('back'), draw('side')); assert.notEqual(draw('front'), draw('back'));
  }
});
// The vent is the punish window: from behind, its heat has to show too.
test('the vent shows from behind', () => {
  for (const phase of [1, 2]) {
    const lights = (state) => {
      const r = recorder(), L = [];
      r.g.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      paintCinder(r.g, { ...portraitPose('cinder', 1), roarT: 0, phase, phaseT: 9, state, timer: 1, view: 'back' }, L);
      return L.reduce((a, l) => a + l.r * l.a, 0);
    };
    assert.ok(lights('vent') > lights('volley') * 1.3, `phase ${phase}: ${lights('vent')} vs ${lights('volley')}`);
  }
});
// The Unbound attacks come by turns with the volley, each after a blink; 'ready' picks the next.
test('the Unbound attacks put down the zones they promise, each in its own voice', async () => {
  const cast = async (turn) => {
    const s = await sandbox(), p = s.game.player, heard = [];
    s.app.audio.sfx = (name) => heard.push(name);
    const b = s.spawn(createBoss('cinder', p.x, p.y - 80));
    Object.assign(b, { phase: 2, state: 'ready', timer: 0, turn });
    s.step(1 / 60);
    return { s, b, p, heard, zones: s.area.zones.filter((z) => z.owner === b) };
  };
  const close = (a, x, e = 0.05) => Math.abs(a - x) < e;
  let { s, b, p, heard, zones } = await cast(0);
  assert.equal(b.state, 'meteors');
  assert.equal(zones.length, 5);
  assert.ok(zones.every((z) => z.shape === 'circle' && z.r === 16 && z.dmg === 2), 'five r-16 circles striking for 2');
  const ts = zones.map((z) => z.t).sort((x, y) => x - y);
  assert.ok(close(ts[0], 1) && close(ts[4], 1.6) && ts.every((t, i) => !i || t > ts[i - 1]), `falling from 1.0 to 1.6 s: ${ts}`);
  assert.ok(zones.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1) && zones.every((z) => Math.hypot(z.x - p.x, z.y - p.y) < 60), 'near the player');
  assert.ok(heard.includes('cinder_meteor'));
  ({ b, heard } = await cast(1));
  assert.equal(b.state, 'volley', 'the volley between');
  ({ s, b, p, heard, zones } = await cast(2));
  assert.equal(b.state, 'sweep');
  const cone = zones.find((z) => z.shape === 'cone'), wave = zones.find((z) => z.shape === 'segment');
  assert.ok(cone && cone.r === 60 && cone.dmg > 0 && close(cone.a, Math.PI / 2), 'the greatsword arc, at the player');
  assert.ok(close(Math.hypot(wave.vx, wave.vy), 140, 1e-6) && close(wave.vy, 140), 'the wave rolls at the player at 140 px/s');
  assert.deepEqual([wave.life, wave.art, wave.effect], [1.2, 'fire', 'burn']);
  assert.ok(close(wave.t, cone.t, 1e-9), 'the wave leaves as the blade strikes');
  assert.ok(heard.includes('cinder_sweep'));
  const y0 = wave.y;
  b.state = 'parked'; s.step(cone.t + 0.5);
  assert.ok(-wave.t > 0.3 && close(wave.y - y0, -wave.t * 140, 1), `rolled ${wave.y - y0} px in ${-wave.t} s`);
  assert.ok(p.effects.burn, 'the wave set the player alight beyond the arc');
  ({ s, b, p, heard, zones } = await cast(4));
  assert.equal(b.state, 'pools');
  assert.equal(zones.length, 3);
  for (const z of zones) assert.deepEqual([z.shape, z.life, z.dmg, z.effect, z.art, z.grow], ['circle', 6, 0, 'burn', 'fire', 4]);
  assert.ok(zones.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1), 'one under the player');
  assert.ok(heard.includes('cinder_pools'));
  const r0 = zones.map((z) => z.r);
  b.state = 'parked'; s.step(Math.max(...zones.map((z) => z.t)) + 2);
  zones.forEach((z, i) => assert.ok(-z.t > 1.9 && close(z.r - r0[i], -z.t * 4, 0.1), `pool ${i} spread ${z.r - r0[i]} in ${-z.t} s`));
  assert.ok(p.effects.burn, 'standing in lava burns');
});
test('every Cinder sound is its own', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['roar', 'cast', 'blink', 'vent', 'meteor', 'sweep', 'pools', 'phase', 'death'].map((k) => `cinder_${k}`);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});
// A warden against a wall summons into open floor, never into the wall (where the bot would chase
// a foe it can never reach).
test('a warden\'s summons never stand in a wall', async () => {
  const s = await sandbox(), map = s.area.map;
  const b = s.spawn(createBoss('rime', s.center.x, (map.h - 1) * 16 - 8)); b.state = 'parked';
  b.summon(s.area.ctx, 'skirmisher', 4, 12);
  const summons = s.area.enemyList.filter((e) => !e.boss);
  assert.equal(summons.length, 12);
  for (const e of summons) assert.ok(!rectSolid(map, e.x, e.y, e.w, e.h, (x, y) => map.isSolid(x, y)), `${e.archetype} at ${e.x},${e.y}`);
});
// R23: each warden greets the player back with its own roar.
test('back in a warden\'s room, it roars in its own voice', async () => {
  for (const [id, kind] of [['verdant', 'thornmaw'], ['ashen', 'cinder'], ['frost', 'rime']]) {
    assert.ok(SFX_NAMES.includes(`${kind}_roar`), `${kind}_roar`);
    const s = await sandbox(), heard = [];
    s.game.enterDungeon(id);
    const a = s.game.area; s.game.state.quest.flags[`intro:${kind}`] = true;
    s.app.audio.sfx = (name) => heard.push(name);
    a.enterRoom(a.dungeon.bossId, 's');
    assert.ok(heard.includes(`${kind}_roar`), `${kind}: ${heard}`);
    assert.ok(!heard.includes('boss'), kind);
  }
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
test('meteors and shard drops strike on the frame their telegraph promised', async () => {
  for (const [kind, state, t] of [['cinder', 'ready', 1], ['rime', 'rain', 0.8]]) {
    const s = await sandbox();
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); Object.assign(b, { state, turn: 0, volleys: 1, phase: 2, timer: 0 });
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
// A spore cloud is wider than any step bestMove probes, and its patch lives on after it lands.
test('the bot leaves a cloud wider than its steps by the shortest way', async () => {
  const s = await sandbox(), p = s.game.player, bot = idleBot(s);
  const z = makeZone('circle', { x: p.x - 10, y: p.y, r: 40, t: 1, life: 2.5, dmg: 0, effect: 'snare', art: 'roots' });
  s.area.zones.push(z);
  assert.deepEqual(bot.zoneEscape([]), [1, 0]);
});
test('the bot won\'t chase a warden across a live patch', async () => {
  const s = await sandbox(), p = s.game.player, bot = idleBot(s);
  const b = s.spawn(createBoss('thornmaw', p.x + 160, p.y)); Object.assign(b, { state: 'stalk', timer: 9, aggro: true });
  s.area.zones.push(makeZone('circle', { x: p.x + 47, y: p.y, r: 40, t: -0.1, life: 2.5, dmg: 0, effect: 'snare', art: 'roots' })); // just short of us
  bot.want.clear(); bot.fight([b]);
  assert.ok(!bot.want.has('KeyD'), `stepped ${[...bot.want]} onto the snare`);
});
test('the bot won\'t cut a pit\'s corner on a diagonal', async () => {
  const s = await sandbox(), p = s.game.player, map = s.area.map, bot = idleBot(s);
  const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
  p.x = tx * 16 + 3; p.y = ty * 16 + 13; map.set(tx, ty + 1, T.PIT);
  const foe = s.spawn(new Enemy('brute', 0, p.x - 70, p.y + 70)); // draws it down and to the left, past the pit
  const mv = bot.bestMove([foe], foe, 40, { lv: 0 });
  assert.notDeepEqual(mv, [-1, 1]);
});
// A roll that meets a wall slides along it, round the corner into whatever lies there.
test('the bot won\'t roll round a corner into a pocket it can\'t walk out of', async () => {
  const s = await sandbox(), p = s.game.player, map = s.area.map, bot = idleBot(s);
  const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
  p.x = tx * 16 + 4.3; p.y = ty * 16 + 11.2;
  map.set(tx, ty + 1, T.DWALL); // the wall the roll meets; the pocket beyond, walled in by pits
  for (const [x, y] of [[tx - 1, ty], [tx - 2, ty + 1], [tx - 1, ty + 2]]) map.set(x, y, T.PIT);
  bot.reach = { area: s.area, t: 0, map: reachMap(map, tileOf(p.x, p.y)) };
  assert.equal(bot.safeRoll([-0.31, 0.95]), false);
  assert.equal(bot.safeRoll([1, 0]), true);
});
