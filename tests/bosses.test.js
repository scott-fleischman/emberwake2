import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, recorder, sfxDuringFight } from './helpers/sandbox.js';
import { WARDEN_MOVES, createBoss, viewFrom } from '../src/game/bosses.js';
import { Enemy } from '../src/game/enemies.js';
import { MEMORIES, LORE_ENTRIES } from '../src/data/story.js';
import { Bomb, Projectile } from '../src/game/entities.js';
import { makeZone } from '../src/game/zones.js';
import { AudioEngine, SFX_NAMES, MUSIC_KEYS } from '../src/audio/audio.js';
import { paintCinder, CINDER_PAL, cinderHands, cinderPalms, cinderSword, cinderHover } from '../src/gfx/art-cinder.js';
import { paintThornmaw, THORN_PAL } from '../src/gfx/art-thornmaw.js';
import { paintRime, RIME_PAL, rimePose } from '../src/gfx/art-rime.js';
import { RimeDecoy } from '../src/game/warden-rime.js';
import { paintTide, TIDE_PAL, tidePose, drawTideWater } from '../src/gfx/art-tide.js';
import { paintVesper } from '../src/gfx/art-vesper.js';
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
  const states = ['intro', 'stalk', 'wind', 'charge', 'stunned', 'thorns', 'roots', 'spores', 'lash', 'transform', 'volley', 'vent', 'fadeout', 'ready', 'meteors', 'sweep', 'pools', 'orbit', 'dash', 'skid', 'rain', 'gust', 'pillars', 'decoys', 'spent', 'jets', 'dive', 'surface', 'wave', 'whirl', 'rings', 'defeated', 'dying'];
  const colours = (kind, paint, pal) => {
    const rec = recorder(), L = [];
    rec.g.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    for (const state of states) for (const phase of [1, 2, 3]) for (const roarT of [0, 0.2]) for (const view of ['side', 'front', 'back']) {
      paint(rec.g, { ...portraitPose(kind, 1.3), state, phase, roarT, phaseT: 0.5, timer: 0.5, cdx: 1, cdy: 0, view }, L, pal);
    }
    return [...rec.fills, ...rec.calls.filter((c) => c[0] === 'addColorStop').map((c) => c[2]), ...L.map((l) => l.rgb)].filter((c) => typeof c === 'string');
  };
  for (const [kind, paint, pal] of [['thornmaw', paintThornmaw, THORN_PAL], ['cinder', paintCinder, CINDER_PAL], ['rime', paintRime, RIME_PAL], ['tide', paintTide, TIDE_PAL]]) {
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
    for (const [kind, paint] of [['thornmaw', paintThornmaw], ['cinder', paintCinder], ['rime', paintRime], ['tide', paintTide]]) {
      const draw = (view, o = {}) => { const r = recorder(); paint(r.g, { ...portraitPose(kind, 1), view, ...o }, []); return JSON.stringify(r.calls); };
      assert.notEqual(draw('front'), draw('side'), kind); assert.notEqual(draw('back'), draw('side'), kind); assert.notEqual(draw('front'), draw('back'), kind);
      for (const state of ['charge', 'vent', 'dash', 'dive', 'surface', 'whirl', 'dying', 'transform']) for (const view of ['side', 'front', 'back']) draw(view, { state, phase: 2, phaseT: 0.4 });
    }
  } finally { Math.random = random; }
});
test('a warden entered straight at its first state fights at once (init sets what its intro did)', async () => {
  for (const kind of ['thornmaw', 'cinder', 'rime', 'tide']) {
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
test('wardens transform at half health', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.state = 'stalk';
  assert.equal(b.maxHp, 64);
  b.damage(33, s.game.player, s.game.area.ctx);
  s.step(0.05); assert.equal(b.state, 'transform'); assert.ok(b.untargetable);
  s.step(1.6); assert.equal(b.phase, 2); assert.notEqual(b.state, 'transform');
});
test('the transform roars in the warden\'s own voice, swells the music, then runs phase 2\'s entry', async () => {
  assert.deepEqual([createBoss('cinder', 0, 0).maxHp, createBoss('rime', 0, 0).maxHp, createBoss('tide', 0, 0).maxHp], [84, 104, 124]);
  const s = await sandbox(), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.state = 'stalk';
  b.damage(40, s.game.player, s.area.ctx); s.step(0.05);
  assert.ok(heard.includes('thornmaw_phase')); assert.equal(s.app.audio.cur.key, 'boss2');
  assert.equal(b.damage(5, s.game.player, s.area.ctx), false, 'no hurting it mid-transform');
  s.step(1.5);
  assert.equal(s.area.enemyList.filter((e) => e.archetype === 'lunger' && !e.dead).length, 1, 'enter2 ran: one minion, no more');
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
// Each freed spirit leaves a page in the lore journal when its outro ends, the Tide Spirit's too.
test('beating a warden leaves its memory in the journal', async () => {
  for (const [id, kind] of [['verdant', 'thornmaw'], ['ashen', 'cinder'], ['frost', 'rime'], ['drowned', 'tide']]) {
    const s = await sandbox(), toasts = [];
    s.game.enterDungeon(id);
    const a = s.game.area; s.game.state.quest.flags[`intro:${kind}`] = true; a.enterRoom(a.dungeon.bossId, 's');
    const b = a.boss; assert.equal(b.kind, kind);
    b.phase = 2; b.state = WARDEN_MOVES[kind].first;
    s.game.toast = (t) => toasts.push(t); s.game.queueCutscene = (fn) => fn(); s.game.playCutscene = (shots, o) => o.onDone();
    b.damage(9999, s.game.player, a.ctx); s.step(4);
    assert.ok(s.game.state.progress.lore.includes(`memory:${kind}`), kind);
    assert.ok(toasts.some((t) => t.includes(MEMORIES[kind].title)), `${kind}: ${toasts}`);
  }
  assert.ok(LORE_ENTRIES.some((e) => e.id === 'memory:tide' && e.kind === 'Warden\'s memory'), 'and it is a page of the journal');
});
test('each warden has its own phase and death sounds, and the fight a second theme', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['thornmaw', 'cinder', 'rime', 'tide'].flatMap((k) => [`${k}_phase`, `${k}_death`]);
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
// The hands as drawn, in the world, frame after frame: nothing snaps between poses. The sweep's
// strike itself is a fast swing and is left out.
test('the hands move continuously through a salvo, into the vent and into the Unbound attacks', async () => {
  const world = (b) => cinderHands(b).map((h) => [b.x + (b.view === 'side' && b.face < 0 ? -h.x : h.x), b.y + cinderHover(b) + h.y]);
  const watch = (s, b, view, seconds, skip = () => false, extra = () => []) => {
    let last = null, worst = 0, at = '';
    for (let t = 0; t < seconds; t += 1 / 60) {
      s.step(1 / 60); s.game.state.player.hp = 99;
      assert.equal(b.view, view, `stays ${view} (${b.state})`);
      const now = [...world(b), ...extra(b)];
      if (last && !skip(b)) now.forEach(([x, y], i) => { const d = Math.hypot(x - last[i][0], y - last[i][1]); if (d > worst) { worst = d; at = `${b.state} t=${b.timer.toFixed(3)} #${i}`; } });
      last = now;
    }
    return { worst, at };
  };
  for (const [view, px, py] of [['side', 120, 0], ['front', 0, 100], ['back', 0, -100]]) {
    const s = await sandbox(), p = s.game.player;
    const b = s.spawn(createBoss('cinder', p.x - px, p.y - py)), l = Math.hypot(px, py);
    Object.assign(b, { state: 'fadein', timer: 0.4, alpha: 0, view, cdx: px / l, cdy: py / l, face: 1 });
    // Never inward while it casts: in front and behind no hand comes in toward the body; side-on both
    // stay on the side it faces.
    const seen = new Set(), wide = [0, 0], inward = () => {
      seen.add(b.state);
      if (b.state === 'volley') cinderHands(b).forEach((h, i) => {
        if (view === 'side') assert.ok(h.x > 0, `side: hand ${i} at x ${h.x.toFixed(1)}`);
        else { assert.ok(Math.abs(h.x) >= wide[i] - 1e-9, `${view}: hand ${i} came in to ${h.x.toFixed(1)}`); wide[i] = Math.abs(h.x); }
      });
      return [];
    };
    const { worst, at } = watch(s, b, view, 0.4 + 0.35 + 2 * 0.55 + 1.9 + 0.3, () => false, inward);
    assert.ok(['volley', 'vent', 'fadeout'].every((st) => seen.has(st)), `${view}: ${[...seen]}`);
    assert.ok(worst <= 4, `${view}: a hand moved ${worst.toFixed(1)} px in a frame (${at})`);
  }
  for (const turn of [2, 4]) {
    const s = await sandbox(), p = s.game.player;
    const b = s.spawn(createBoss('cinder', p.x, p.y - 100));
    Object.assign(b, { phase: 2, phaseT: 9, state: 'ready', timer: 0.3, turn, view: 'front', cdx: 0, cdy: 1 });
    const striking = (b) => b.state === 'sweep' && b.timer < 0.55 && b.timer > 0.3;
    const grip = (b) => { const w = cinderSword(b); return [[b.x + w.x, b.y + cinderHover(b) + w.y]]; };
    const { worst, at } = watch(s, b, 'front', 0.3 + 1.2 + 0.6, striking, grip);
    assert.ok(worst <= 4, `turn ${turn}: moved ${worst.toFixed(1)} px in a frame (${at})`);
  }
});
// Most kills land in the vent, facing front (always Unbound: phase 1 holds at half health). Set back
// at the centre behind the black, it shows its own pose through the fade-in, bobbing, and carries
// straight on into the dissolve.
test('killed in the vent, its hands neither freeze through the fade-in nor jump into the dissolve', async () => {
  for (const phase of [2]) {
    const s = await sandbox(), p = s.game.player;
    const b = s.spawn(createBoss('cinder', p.x, p.y - 70)); Object.assign(b, { phase, phaseT: 9, state: 'vent', timer: 1.6, view: 'front', cdx: 0, cdy: 1 });
    s.step(0.2);
    b.damage(9999, p, s.area.ctx);
    const world = () => [...cinderHands(b).map((h) => [h.x, cinderHover(b) + h.y]), ...(phase > 1 ? [(({ x, y }) => [x, cinderHover(b) + y])(cinderSword(b))] : [])];
    const fadein = [];
    let last = null, lastStep = null, boundary = null;
    for (let t = 0; t < 2.2 && s.game.bossDeath; t += 1 / 60) {
      s.step(1 / 60);
      const step = s.game.bossDeath?.step, now = world();
      if (step === 'fadein') {
        fadein.push(cinderHands(b).map((h) => [h.x, h.y]));
        const own = cinderHands({ ...b, poseFrom: null, poseNow: null }); // the 'defeated' pose itself, no easing
        cinderHands(b).forEach((h, i) => assert.ok(Math.hypot(h.x - own[i].x, h.y - own[i].y) < 1e-9, `the fade-in draws its own pose (${h.x.toFixed(1)},${h.y.toFixed(1)})`));
      }
      if (lastStep === 'fadein' && step === 'dissolve') boundary = Math.max(...now.map(([x, y], i) => Math.hypot(x - last[i][0], y - last[i][1])));
      last = now; lastStep = step;
    }
    assert.equal(b.view, 'front');
    assert.ok(fadein.length > 20, `phase ${phase}: watched the fade-in`);
    const travel = Math.max(...fadein[0].map(([x, y], i) => Math.max(...fadein.map((f) => Math.hypot(f[i][0] - x, f[i][1] - y)))));
    assert.ok(travel > 0.5, `phase ${phase}: the hands hang frozen through the fade-in (${travel.toFixed(2)} px of their own)`);
    assert.ok(boundary !== null && boundary <= 4, `phase ${phase}: jumped ${boundary?.toFixed(1)} px into the dissolve`);
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

// ---------------------------------------------------------------- the Rime Sovereign, Shattered
// Every point a painter touches, carried through its transforms: how much of the buffer it covers.
function extent(paint, pose) {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [], box = [Infinity, Infinity, -Infinity, -Infinity], grad = { addColorStop() {} };
  const pt = (x, y) => {
    const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    box[0] = Math.min(box[0], X); box[1] = Math.min(box[1], Y); box[2] = Math.max(box[2], X); box[3] = Math.max(box[3], Y);
  };
  const mul = (a, b, c, d, e, f) => { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; };
  const ops = {
    save: () => stack.push(m), restore: () => { m = stack.pop(); },
    translate: (x, y) => mul(1, 0, 0, 1, x, y), scale: (x, y) => mul(x, 0, 0, y, 0, 0), rotate: (a) => mul(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0),
    moveTo: pt, lineTo: pt, quadraticCurveTo: (a, b, x, y) => { pt(a, b); pt(x, y); }, bezierCurveTo: (a, b, c, d, x, y) => { pt(a, b); pt(c, d); pt(x, y); },
    ellipse: (x, y, rx, ry) => { pt(x - rx, y - ry); pt(x + rx, y + ry); }, arc: (x, y, r) => { pt(x - r, y - r); pt(x + r, y + r); },
    fillRect: (x, y, w, h) => { pt(x, y); pt(x + w, y + h); },
  };
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : ops[k] || (() => grad)), set: (t, k, v) => { t[k] = v; return true; } });
  paint(g, pose, []);
  return { w: box[2] - box[0], h: box[3] - box[1], box };
}
test('the Rime Sovereign shatters: phase 2 uses new attacks', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('rime', s.center.x, s.center.y - 50)); b.phase = 2; b.state = WARDEN_MOVES.rime.first;
  const seen = new Set(); for (let t = 0; t < 30; t += 1 / 60) { s.step(1 / 60); seen.add(b.state); s.game.state.player.hp = 99; }
  for (const st of ['gust', 'pillars', 'decoys']) assert.ok(seen.has(st), st);
});
test('the Rime Sovereign has her own voice', async () => {
  const names = await sfxDuringFight('rime', 40);
  assert.ok(names.filter((n) => n.startsWith('rime_')).length >= 4);
  for (const n of ['boss', 'dash', 'block', 'gate']) assert.ok(!names.includes(n), n);
});
// From behind there is no face: the back of her crystal head, the backs of her wings, her train.
test('Rime front and back views differ from the side, in both forms, and her back shows no face', () => {
  for (const o of [{}, { phase: 2, phaseT: 9 }]) {
    const draw = (view) => { const r = recorder(); paintRime(r.g, { ...portraitPose('rime', 1), ...o, view }, []); return r; };
    const [side, front, back] = ['side', 'front', 'back'].map(draw), calls = (r) => JSON.stringify(r.calls);
    assert.notEqual(calls(front), calls(side)); assert.notEqual(calls(back), calls(side)); assert.notEqual(calls(front), calls(back));
    for (const k of ['face', 'eye', 'socket', 'mask', 'beak']) {
      assert.ok(front.fills.includes(RIME_PAL[k]) && side.fills.includes(RIME_PAL[k]), `phase ${o.phase || 1}: ${k} shows from the front and side`);
      assert.ok(!back.fills.includes(RIME_PAL[k]), `phase ${o.phase || 1}: no ${k} from behind`);
    }
  }
});
test('Shattered, she reforms larger, on frost wings under a taller crown, in every view', () => {
  for (const view of ['side', 'front', 'back']) {
    const pose = { ...portraitPose('rime', 1), roarT: 0, view };
    const one = extent(paintRime, pose), two = extent(paintRime, { ...pose, phase: 2, phaseT: 9 });
    assert.ok(two.h > one.h * 1.15, `${view}: ${two.h.toFixed(1)} tall against ${one.h.toFixed(1)}`);
    assert.ok(two.w > one.w * 1.2, `${view}: ${two.w.toFixed(1)} wide against ${one.w.toFixed(1)}`);
  }
});
// stamp() paints into a 184x150 buffer with her feet at (92, 124); past it she'd be clipped, and the
// outline takes a pixel more. (A roar comes only in phase 1: it is spent by the end of the transform.)
test('every pose she takes fits the stamp\'s buffer', () => {
  const states = ['orbit', 'wind', 'dash', 'skid', 'stunned', 'rain', 'gust', 'pillars', 'decoys', 'spent', 'defeated', 'dying'];
  for (const state of [...states, 'transform']) for (const phase of state === 'transform' ? [1] : [1, 2]) for (const view of ['side', 'front', 'back']) {
    for (const roarT of phase > 1 ? [0] : [0, 0.5]) for (let i = 0; i < 12; i++) for (const timer of [0.1, 0.5, 1.2, 2.2]) {
      const { box } = extent(paintRime, { anim: i * 0.29, state, phase, phaseT: i < 4 ? i * 0.2 : 9, view, roarT, timer, cdx: 1, cdy: 0, face: 1 });
      assert.ok(box[0] > -91 && box[2] < 91 && box[1] > -123 && box[3] < 25, `${state} phase ${phase} ${view}: ${box.map((v) => v.toFixed(1))}`);
    }
  }
});
// Each Shatter attack is the orbit's next move by turns; the dash comes between them.
test('the Shatter attacks do what they promise, each in its own voice', async () => {
  const cast = async (rimeTurn) => {
    const s = await sandbox(), p = s.game.player, heard = [];
    s.app.audio.sfx = (name) => heard.push(name);
    const b = s.spawn(createBoss('rime', p.x, p.y - 80));
    Object.assign(b, { phase: 2, phaseT: 9, state: 'orbit', timer: 0, shotT: 9, rimeTurn });
    s.step(1 / 60);
    return { s, b, p, heard, zones: s.area.zones.filter((z) => z.owner === b) };
  };
  const close = (a, x, e = 0.05) => Math.abs(a - x) < e;
  let { s, b, p, heard, zones } = await cast(0);
  const map = s.area.map, open = (e) => !rectSolid(map, e.x, e.y, e.w, e.h, (x, y) => map.isSolid(x, y));
  assert.equal(b.state, 'gust');
  assert.equal(zones.length, 1);
  const [cone] = zones;
  assert.deepEqual([cone.shape, cone.dmg, cone.life], ['cone', 0, 2]);
  assert.ok(close(cone.a, Math.PI / 2) && Math.hypot(cone.x - b.x, cone.y - b.y) < 1, 'blown from her at the player');
  assert.ok(heard.includes('rime_gust'));
  s.step(cone.t);
  const x0 = p.x, y0 = p.y;
  s.step(1);
  assert.ok(close(p.y - y0, 60, 3) && Math.abs(p.x - x0) < 3, `pushed ${(p.y - y0).toFixed(1)} px away from her in a second`);
  s.step(1.2);
  assert.ok(p.y - y0 < 115 && open(p), `the wall stops it (${(p.y - y0).toFixed(1)} px)`);
  assert.equal(b.state, 'spent'); assert.ok(b.vulnerable, 'it leaves her spent: the punish window');

  ({ b } = await cast(1));
  assert.equal(b.state, 'wind', 'the dash between');

  ({ s, b, p, heard, zones } = await cast(2));
  assert.equal(b.state, 'pillars');
  assert.equal(zones.length, 4);
  for (const z of zones) assert.deepEqual([z.shape, z.r, z.effect, z.dmg], ['circle', 12, 'freeze', 1]);
  assert.ok(zones.every((z) => close(z.t, 1.1)), `rising at 1.1 s: ${zones.map((z) => z.t)}`);
  assert.ok(zones.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1) && zones.every((z) => Math.hypot(z.x - p.x, z.y - p.y) < 40), 'on the player and round them');
  assert.ok(heard.includes('rime_pillar'));
  const states = new Set();
  for (let t = 0; t < 2.5; t += 1 / 60) { s.step(1 / 60); states.add(b.state); }
  assert.ok(p.effects.freeze, 'caught standing still: frozen');
  assert.ok(states.has('spent'), 'then spent');

  ({ s, b, p, heard } = await cast(4));
  assert.equal(b.state, 'decoys');
  const decoys = s.area.enemyList.filter((e) => e instanceof RimeDecoy);
  assert.equal(decoys.length, 1);
  assert.ok(decoys.every((d) => d.hp === 1 && d.owner === b && d.team === 'enemy'));
  assert.ok(heard.includes('rime_decoy'));
  const edge = 32;
  for (const d of decoys) assert.ok(open(d) && d.x >= edge && d.y >= edge && d.x <= map.pixelW - edge && d.y <= map.pixelH - edge, `on open floor, clear of the doorways (${d.x}, ${d.y})`);
  const shots = new Map(decoys.map((d) => [d, 0])), spawn = s.area.spawn.bind(s.area);
  s.area.spawn = (e) => {
    if (e.kind === 'ice' && e.effect === 'chill') for (const d of decoys) if (Math.hypot(e.x - d.x, e.y - d.y) < 14) shots.set(d, shots.get(d) + 1);
    return spawn(e);
  };
  const fight = (secs) => { for (let t = 0; t < secs; t += 1 / 60) { p.iframes = 9; s.step(1 / 60); } }; // no hit-stop to slow the clocks
  fight(3);
  for (const d of decoys) assert.equal(shots.get(d), 2, 'a chilling bolt every 1.4 s');
  fight(4.85);
  assert.ok(decoys.every((d) => !d.dead), 'still there before 8 s');
  fight(0.45);
  assert.ok(decoys.every((d) => d.dead) && !s.area.enemyList.some((e) => e instanceof RimeDecoy), 'shattered at 8 s');
});
test('Rime decoys break in one hit', async () => {
  const s = await sandbox(); const d = s.spawn(new RimeDecoy(s.center.x + 30, s.center.y, null));
  d.damage(1, s.game.player, s.game.area.ctx); s.step(0.3); assert.ok(d.dead);
});
// The wing pose as drawn, frame after frame, through both phases: nothing snaps between states.
// The pillars' slam is a blow, fast on purpose, and is left out.
test('her wings ease between poses through both phases', async () => {
  for (const phase of [1, 2]) {
    const s = await sandbox(), p = s.game.player;
    const b = s.spawn(createBoss('rime', p.x, p.y - 70)); Object.assign(b, { phase, phaseT: 9, state: 'orbit', timer: 0.5 });
    const seen = new Set(), slam = () => b.state === 'pillars' && Math.abs(b.timer - (1.5 - 1.1)) < 0.2;
    let last = null, worst = 0, at = '';
    for (let t = 0; t < 26; t += 1 / 60) {
      s.step(1 / 60); s.game.state.player.hp = 99; seen.add(b.state);
      const w = rimePose(b), now = [w.a0, w.a1, w.al, w.lean, w.sink / 10];
      if (last && !slam()) now.forEach((v, i) => { const d = Math.abs(v - last[i]); if (d > worst) { worst = d; at = `${b.state} #${i}`; } });
      last = now;
    }
    for (const st of phase > 1 ? ['gust', 'pillars', 'decoys', 'spent', 'dash'] : ['orbit', 'wind', 'dash', 'rain']) assert.ok(seen.has(st), `phase ${phase} saw ${st}`);
    assert.ok(worst < 0.35, `phase ${phase}: the pose jumped ${worst.toFixed(2)} in a frame (${at})`);
  }
});
// Killed while spent and set back at the centre behind the black: through the fade-in she shows her
// own pose, wings still beating, and carries straight on into the dissolve.
test('killed while spent, her wings neither freeze through the fade-in nor jump into the dissolve', async () => {
  const s = await sandbox(), p = s.game.player;
  const b = s.spawn(createBoss('rime', p.x, p.y - 70)); Object.assign(b, { phase: 2, phaseT: 9, state: 'spent', timer: 1.2, view: 'front' });
  s.step(0.2);
  b.damage(9999, p, s.area.ctx);
  const pose = (q) => { const w = rimePose(q); return [w.a0 + w.flap, w.a1, w.al, w.sink / 10]; };
  const fadein = [];
  let last = null, lastStep = null, boundary = null;
  for (let t = 0; t < 2.2 && s.game.bossDeath; t += 1 / 60) {
    s.step(1 / 60);
    const step = s.game.bossDeath?.step, now = pose(b);
    if (step === 'fadein') {
      fadein.push(now);
      const own = pose({ ...b, rimePoseFrom: null, rimePoseNow: null });
      now.forEach((v, i) => assert.ok(Math.abs(v - own[i]) < 1e-9, 'the fade-in draws its own pose'));
    }
    if (lastStep === 'fadein' && step === 'dissolve') boundary = Math.max(...now.map((v, i) => Math.abs(v - last[i])));
    last = now; lastStep = step;
  }
  assert.ok(fadein.length > 20, 'watched the fade-in');
  const travel = Math.max(...fadein[0].map((v, i) => Math.max(...fadein.map((f) => Math.abs(f[i] - v)))));
  assert.ok(travel > 0.05, `the wings hang frozen through the fade-in (${travel.toFixed(3)})`);
  assert.ok(boundary !== null && boundary <= 0.15, `jumped ${boundary?.toFixed(2)} into the dissolve`);
});
test('every Rime sound is its own', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['roar', 'dash', 'shard', 'gust', 'pillar', 'decoy', 'phase', 'death'].map((k) => `rime_${k}`);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});

// ---------------------------------------------------------------- the Tidewarden
test('the Tidewarden wails: phase 2 uses new attacks', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('tide', s.center.x, s.center.y - 50)); b.phase = 2; b.state = WARDEN_MOVES.tide.first;
  const seen = new Set(); for (let t = 0; t < 30; t += 1 / 60) { s.step(1 / 60); seen.add(b.state); s.game.state.player.hp = 99; }
  for (const st of ['wave', 'whirl', 'rings']) assert.ok(seen.has(st), st);
});
test('the Tidewarden has its own voice', async () => {
  const names = await sfxDuringFight('tide', 40);
  assert.ok(names.filter((n) => n.startsWith('tide_')).length >= 4);
  assert.ok(!names.includes('boss'));
});
test('Tide front and back views differ from the side, in both forms', () => {
  for (const o of [{}, { phase: 2, phaseT: 9 }]) {
    const draw = (view) => { const r = recorder(); paintTide(r.g, { ...portraitPose('tide', 1), ...o, view }, []); return JSON.stringify(r.calls); };
    assert.notEqual(draw('front'), draw('side')); assert.notEqual(draw('back'), draw('side')); assert.notEqual(draw('front'), draw('back'));
  }
});
test('the Tidewarden is a warden of 124 HP, punished only when it surfaces dazed or is spent after a wave', () => {
  assert.equal(createBoss('tide', 0, 0).maxHp, 124);
  assert.equal(createBoss('tide', 0, 0).name, 'The Tidewarden');
  const m = WARDEN_MOVES.tide;
  for (const state of ['jets', 'sweep', 'dive', 'surface', 'wave', 'spent', 'whirl', 'rings']) {
    assert.equal(m.vulnerable({ state }), state === 'surface' || state === 'spent', state);
    assert.equal(!!m.untargetable?.({ state }), state === 'dive', state);
  }
});
// Its eyes and face show from the front and the side, never from behind; its throat sac is in front.
test('from behind the Tidewarden shows no face, in either form', () => {
  for (const o of [{}, { phase: 2, phaseT: 9 }]) {
    const draw = (view) => { const r = recorder(); paintTide(r.g, { ...portraitPose('tide', 1), ...o, view }, []); return r.fills; };
    const [side, front, back] = ['side', 'front', 'back'].map(draw);
    for (const k of ['eye', 'maw', 'teeth', 'sac']) {
      const c = o.phase ? TIDE_PAL[`${k}2`] ?? TIDE_PAL[k] : TIDE_PAL[k];
      assert.ok(front.includes(c) && side.includes(c), `phase ${o.phase || 1}: ${k} shows from the front and side`);
      assert.ok(!back.includes(c), `phase ${o.phase || 1}: no ${k} from behind`);
    }
  }
});
// Phase 1 by turns: the jets, the tail sweep, then the dive and the dazed surfacing (the punish window).
test('the Tidewarden spits water, sweeps its tail across the room, dives and surfaces dazed', async () => {
  const s = await sandbox(), p = s.game.player, heard = [], W = s.area.map.pixelW;
  s.app.audio.sfx = (name) => heard.push(name);
  const b = s.spawn(createBoss('tide', p.x - 30, p.y - 70)); b.state = 'jets';
  const close = (a, x, e = 0.05) => Math.abs(a - x) < e, safe = (secs) => { for (let t = 0; t < secs; t += 1 / 60) { p.iframes = 9; s.step(1 / 60); } };
  const jets = [], spawn = s.area.spawn.bind(s.area);
  s.area.spawn = (e) => { if (e.kind === 'water') jets.push(e); return spawn(e); };
  while (b.state === 'jets') safe(1 / 60);
  assert.equal(jets.length, 9, 'three salvos of three');
  assert.ok(jets.every((j) => j.team === 'enemy' && j.dmg === 1 && j.vy > 0), 'at the player');
  assert.equal(heard.filter((n) => n === 'tide_jet').length, 3);

  assert.equal(b.state, 'sweep');
  const sweep = s.area.zones.find((z) => z.owner === b && z.shape === 'segment');
  assert.ok(sweep.x1 <= 17 && sweep.x2 >= W - 17 && sweep.y1 === sweep.y2 && close(sweep.y1, p.y, 1), 'wall to wall, level with the player');
  assert.ok(sweep.dmg > 0 && heard.includes('tide_sweep'));
  while (b.state === 'sweep') safe(1 / 60);

  assert.equal(b.state, 'dive');
  const ripple = s.area.zones.find((z) => z.owner === b && z.shape === 'circle'), at = { x: ripple.x, y: ripple.y };
  assert.ok(close(ripple.t, 0.9, 1e-9), `the ripple strikes in 0.9 s: ${ripple.t}`);
  assert.ok(Math.hypot(at.x - p.x, at.y - p.y) < 1, 'where the player stands');
  assert.ok(heard.includes('tide_dive'));
  safe(1 / 60);
  assert.ok(b.untargetable && b.damage(5, p, s.area.ctx) === false, 'under the water no blow lands');
  let under = 1 / 60;
  while (b.state === 'dive') { safe(1 / 60); under += 1 / 60; }
  assert.ok(close(under, 0.9, 0.02), `surfaced after ${under.toFixed(3)} s, as the ripple struck`);
  assert.deepEqual([b.state, b.x, b.y], ['surface', at.x, at.y]);
  assert.ok(heard.includes('tide_surface'));
  safe(1 / 60);
  assert.ok(b.vulnerable && !b.untargetable, 'dazed: the punish window');
  let dazed = 1 / 60;
  while (b.state === 'surface') { safe(1 / 60); dazed += 1 / 60; }
  assert.ok(close(dazed, 1.4, 0.03), `dazed for ${dazed.toFixed(3)} s`);
  safe(1 / 60);
  assert.deepEqual([b.state, b.vulnerable], ['jets', false]);
});
test('the ripple bursts up under a player who stays on it', async () => {
  const s = await sandbox(), p = s.game.player, res = s.game.state.player, hp = res.hp;
  const b = s.spawn(createBoss('tide', p.x - 30, p.y - 70)); Object.assign(b, { state: 'sweep', timer: 0, tideStep: 2 });
  s.step(1 / 60);
  assert.equal(b.state, 'dive');
  s.step(1);
  assert.ok(res.hp < hp);
});
// Phase 2's rhythm: the jets or the sweep, a Wail attack, the dive. tideStep 1 is the Wail's turn.
test('the Wail attacks do what they promise, each in its own voice', async () => {
  const cast = async (tideTurn) => {
    const s = await sandbox(), p = s.game.player, heard = [];
    s.app.audio.sfx = (name) => heard.push(name);
    const b = s.spawn(createBoss('tide', p.x, p.y - 80));
    Object.assign(b, { phase: 2, phaseT: 9, state: 'surface', timer: 0, tideStep: 1, tideTurn });
    s.step(1 / 60);
    return { s, b, p, heard, zones: s.area.zones.filter((z) => z.owner === b) };
  };
  const close = (a, x, e = 0.05) => Math.abs(a - x) < e;
  const fight = (s, secs) => { for (let t = 0; t < secs; t += 1 / 60) { s.game.player.iframes = 9; s.step(1 / 60); } };

  let { s, b, p, heard, zones } = await cast(0);
  const W = s.area.map.pixelW;
  assert.equal(b.state, 'wave');
  assert.equal(zones.length, 2, 'two lengths of wave');
  const [l, r] = zones.sort((u, v) => u.x1 - v.x1);
  assert.ok(zones.every((z) => z.shape === 'segment' && z.y1 === z.y2 && z.y1 === l.y1 && z.dmg > 0), 'one line across the room');
  assert.ok(l.x1 <= 17 && r.x2 >= W - 17, 'wall to wall');
  assert.ok(close(r.x1 - l.x2, 40, 1e-9), `one gap 40 px wide: ${r.x1 - l.x2}`);
  assert.ok(l.vy > 0 && l.vy === r.vy && !l.vx && l.y1 < b.y, 'rolling in from behind it, toward the player');
  assert.ok(heard.includes('tide_wave'));
  const y0 = l.y1;
  fight(s, l.t + 1);
  assert.ok(close(l.y1 - y0, l.vy * -l.t, 1), 'crossing the room');
  while (b.state === 'wave') fight(s, 1 / 60);
  assert.ok(!s.area.zones.includes(l), 'gone when it has crossed');
  assert.equal(b.state, 'spent');
  fight(s, 1 / 60); assert.ok(b.vulnerable, 'spent after the wave: the punish window');

  ({ s, b, p, heard, zones } = await cast(1));
  assert.equal(b.state, 'whirl');
  assert.equal(zones.length, 1);
  const [eye] = zones;
  assert.deepEqual([eye.shape, eye.dmg, eye.effect, eye.life], ['circle', 0, 'mud', 3]);
  assert.ok(Math.hypot(eye.x - b.x, eye.y - b.y) < 1, 'about the warden');
  assert.ok(heard.includes('tide_whirl'));
  fight(s, eye.t);
  const d0 = Math.hypot(p.x - b.x, p.y - b.y);
  fight(s, 1);
  assert.ok(close(d0 - Math.hypot(p.x - b.x, p.y - b.y), 45, 3), `drawn ${(d0 - Math.hypot(p.x - b.x, p.y - b.y)).toFixed(1)} px toward it in a second`);
  fight(s, 2.1);
  const d1 = Math.hypot(p.x - b.x, p.y - b.y);
  fight(s, 0.5);
  assert.ok(close(Math.hypot(p.x - b.x, p.y - b.y), d1, 0.5), 'and let go after 3 s');

  ({ s, b, p, heard, zones } = await cast(2));
  assert.equal(b.state, 'rings');
  assert.equal(zones.length, 3, 'three song rings');
  for (const z of zones) assert.deepEqual([z.shape, z.grow, z.gaps.length, Math.round(z.x), Math.round(z.y)], ['ring', 90, 2, Math.round(b.x), Math.round(b.y)]);
  assert.ok(new Set(zones.map((z) => z.t.toFixed(3))).size === 3, 'one after another');
  assert.ok(heard.includes('tide_song'));
  const [first] = zones.sort((u, v) => u.t - v.t), r0 = first.r;
  fight(s, first.t + 1);
  assert.ok(close(first.r - r0, -first.t * 90, 1), `grown ${(first.r - r0).toFixed(1)} px in ${(-first.t).toFixed(2)} s`);
});
test('the Tidewarden sheds its coral where it stands and calls a Mire Leech', async () => {
  const s = await sandbox(), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  const b = s.spawn(createBoss('tide', s.center.x, s.center.y - 40)); b.state = 'jets';
  const at = { x: b.x, y: b.y };
  b.damage(95, s.game.player, s.area.ctx); s.step(0.05);
  assert.equal(b.state, 'transform'); assert.ok(heard.includes('tide_phase'));
  s.step(1.5);
  const leeches = s.area.enemyList.filter((e) => e.archetype === 'lunger' && !e.dead);
  assert.equal(leeches.length, 1); assert.ok(leeches.every((e) => e.name === 'Mire Leech'), leeches.map((e) => e.name).join());
  assert.deepEqual([b.phase, b.state, b.x, b.y], [2, 'jets', at.x, at.y]);
});
test('every Tide sound is its own', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['roar', 'dive', 'surface', 'jet', 'sweep', 'wave', 'whirl', 'song', 'phase', 'death'].map((k) => `tide_${k}`);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});
// stamp() paints into a 184x150 buffer with the feet at (92, 124). It clips itself at the waterline,
// so nothing below it shows, however far it has sunk.
test('every pose the Tidewarden takes fits the stamp\'s buffer', () => {
  const states = ['jets', 'sweep', 'dive', 'surface', 'wave', 'spent', 'whirl', 'rings', 'defeated', 'dying'];
  for (const state of [...states, 'transform', 'intro']) for (const phase of state === 'transform' ? [1] : [1, 2]) for (const view of ['side', 'front', 'back']) {
    for (const roarT of phase > 1 ? [0] : [0, 0.5]) for (let i = 0; i < 12; i++) for (const timer of [0.05, 0.5, 1.2, 2.5]) {
      const { box } = extent(paintTide, { anim: i * 0.29, state, phase, phaseT: i < 4 ? i * 0.2 : 9, view, roarT, timer, tideShotT: i * 0.05, tideJets: i % 4, cdx: 1, cdy: 0, face: 1 });
      assert.ok(box[0] > -91 && box[2] < 91 && box[1] > -123, `${state} phase ${phase} ${view}: ${box.map((v) => v.toFixed(1))}`);
    }
  }
});
test('every pose Vesper takes fits the stamp\'s buffer', () => {
  const states = ['drift', 'bolts', 'step', 'scythe', 'recover', 'pillars', 'ring', 'beam', 'eclipse', 'spent', 'call', 'shift', 'stunned', 'rise', 'defeated', 'dying'];
  for (const state of [...states, 'transform']) for (const phase of state === 'transform' ? [1] : [1, 2]) for (const view of ['side', 'front', 'back']) {
    for (const roarT of [0, 0.5]) for (let i = 0; i < 8; i++) for (const timer of [0.05, 0.3, 0.6, 1.2]) {
      const { box } = extent(paintVesper, { anim: i * 0.37, state, phase, phaseT: i < 4 ? i * 0.2 : 9, view, roarT, timer, cdx: 1, cdy: 0, face: 1 });
      assert.ok(box[0] > -91 && box[2] < 91 && box[1] > -123, `${state} phase ${phase} ${view}: ${box.map((v) => v.toFixed(1))}`);
    }
  }
});
// A borrower's tidePhase says which look its floor wears: Vesper's borrowed Tidewarden never floods the room.
test('the Tidewarden\'s floor floods the room in the Wail, but not for a borrower of its first form', () => {
  const draw = (b) => { const r = recorder(); drawTideWater(r.g, { anim: 1, state: 'jets', phaseT: 9, x: 100, y: 100, ...b }, [], { left: 0, top: 0 }, { pixelW: 384, pixelH: 240 }); return r.calls.filter((c) => c[0] === 'fill').length; };
  assert.ok(draw({ phase: 2 }) > draw({ phase: 1 }));
  assert.equal(draw({ phase: 3, tidePhase: 1 }), draw({ phase: 1 }));
});
// The pose as drawn, frame after frame, through both phases: nothing snaps between states. The tail's
// slam and the burst up out of the water are blows, fast on purpose, and are left out.
test('the Tidewarden eases between poses through both phases', async () => {
  for (const phase of [1, 2]) {
    const s = await sandbox(), p = s.game.player;
    const b = s.spawn(createBoss('tide', p.x, p.y - 70)); Object.assign(b, { phase, phaseT: 9, state: 'jets' });
    const seen = new Set(), blow = () => (b.state === 'sweep' && b.timer < 0.5) || (b.state === 'surface' && b.timer > 1.15);
    let last = null, worst = 0, at = '';
    for (let t = 0; t < 30; t += 1 / 60) {
      s.step(1 / 60); s.game.state.player.hp = 99; seen.add(b.state);
      const w = tidePose(b), now = [w.rear, w.lean, w.jaw, w.tail, w.coil, w.sway, w.sink];
      if (last && !blow()) now.forEach((v, i) => { const d = Math.abs(v - last[i]); if (d > worst) { worst = d; at = `${b.state} #${i}`; } });
      last = now;
    }
    for (const st of phase > 1 ? ['jets', 'wave', 'spent', 'whirl', 'dive', 'surface'] : ['jets', 'sweep', 'dive', 'surface']) assert.ok(seen.has(st), `phase ${phase} saw ${st}`);
    assert.ok(worst < 0.3, `phase ${phase}: the pose jumped ${worst.toFixed(2)} in a frame (${at})`);
  }
});
// Killed while dazed and set back at the centre behind the black: through the fade-in it shows its own
// pose, still swaying, and carries straight on into the dissolve.
test('killed while dazed, it neither freezes through the fade-in nor jumps into the dissolve', async () => {
  const s = await sandbox(), p = s.game.player;
  const b = s.spawn(createBoss('tide', p.x, p.y - 70)); Object.assign(b, { phase: 2, phaseT: 9, state: 'surface', timer: 1.2, view: 'front' });
  s.step(0.2);
  b.damage(9999, p, s.area.ctx);
  const pose = (q) => { const w = tidePose(q); return [w.rear, w.lean + w.sway, w.jaw, w.sink]; };
  const fadein = [];
  let last = null, lastStep = null, boundary = null;
  for (let t = 0; t < 2.2 && s.game.bossDeath; t += 1 / 60) {
    s.step(1 / 60);
    const step = s.game.bossDeath?.step, now = pose(b);
    if (step === 'fadein') {
      fadein.push(now);
      const own = pose({ ...b, tidePoseFrom: null, tidePoseNow: null });
      now.forEach((v, i) => assert.ok(Math.abs(v - own[i]) < 1e-9, 'the fade-in draws its own pose'));
    }
    if (lastStep === 'fadein' && step === 'dissolve') boundary = Math.max(...now.map((v, i) => Math.abs(v - last[i])));
    last = now; lastStep = step;
  }
  assert.ok(fadein.length > 20, 'watched the fade-in');
  const travel = Math.max(...fadein[0].map((v, i) => Math.max(...fadein.map((f) => Math.abs(f[i] - v)))));
  assert.ok(travel > 0.02, `it hangs frozen through the fade-in (${travel.toFixed(3)})`);
  assert.ok(boundary !== null && boundary <= 0.15, `jumped ${boundary?.toFixed(2)} into the dissolve`);
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
// A decoy breaks at one blow: worth the walk, unless the warden itself is open.
test('the bot goes for a decoy in reach before the warden, and for the warden when it is open', async () => {
  const s = await sandbox(), p = s.game.player, bot = idleBot(s);
  const b = s.spawn(createBoss('rime', p.x, p.y - 90)); Object.assign(b, { state: 'orbit', timer: 9, shotT: 9, aggro: true });
  const d = s.spawn(new RimeDecoy(p.x + 100, p.y, b));
  bot.fight([b, d]); assert.equal(bot.engaged, d);
  b.vulnerable = true; bot.fight([b, d]); assert.equal(bot.engaged, b);
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
