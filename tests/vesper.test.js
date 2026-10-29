import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, sfxDuringFight, recorder } from './helpers/sandbox.js';
import { createBoss, WARDEN_MOVES } from '../src/game/bosses.js';
import { makeZone, zoneDanger } from '../src/game/zones.js';
import { Projectile } from '../src/game/entities.js';
import { paintVesper, vesperCrown, VESPER_PALS } from '../src/gfx/art-vesper.js';
import { tidePal } from '../src/gfx/art-tide.js';
import { portraitPose } from '../src/gfx/bossart.js';
import { AudioEngine, SFX_NAMES } from '../src/audio/audio.js';
import { WARDENS, bossIntroShots, vesperRiseShots, vesperFallShots } from '../src/data/story.js';
import { ART_IDS } from '../src/gfx/cinema.js';
import { generateDungeon } from '../src/world/dungeons.js';
import { serialize, deserialize } from '../src/game/state.js';
import { Bot } from '../src/bot/bot.js';

// The player can't die here, so these are about Vesper's rules.
const live = (s, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) { s.step(1 / 60); s.game.state.player.hp = 99; } };
const until = (s, cond, max = 60) => { for (let t = 0; t < max && !cond(); t += 1 / 60) live(s, 1 / 60); assert.ok(cond(), 'timed out'); };

const fight = async (difficulty = 'normal') => {
  const s = await sandbox({ difficulty });
  const v = s.spawn(createBoss('vesper', s.center.x, s.center.y - 50)); v.state = 'drift';
  const hit = (n) => v.damage(n, s.game.player, s.game.area.ctx);
  return { s, v, hit };
};
const phase3 = async (difficulty) => {
  const f = await fight(difficulty);
  f.v.phase = 3; f.v.maxHp = f.v.hp = 180; f.v.startCycle(f.s.game.area.ctx);
  return f;
};

test('the first bar has two phases and then he rises with a full second bar', async () => {
  const { s, v, hit } = await fight();
  assert.equal(v.maxHp, 220); assert.equal(v.name, 'Vesper, the Unkindled');
  hit(111); live(s, 1.6); assert.equal(v.phase, 2);
  hit(9999); live(s, 4.5);
  assert.equal(v.phase, 3); assert.equal(v.maxHp, 180); assert.equal(v.hp, 180); assert.ok(!v.dead);
});

test('phase 3 shows all four wardens before he can fall', async () => {
  const { s, v, hit } = await phase3();
  const borrowed = [];
  for (let i = 0; i < 4; i++) {
    hit(9999); assert.ok(v.hp >= [0.8, 0.6, 0.4, 0.2][i] * 180 - 1e-9 && !v.dead, `floor ${i}`);
    until(s, () => v.borrowed);
    borrowed.push(v.borrowed); hit(1); hit(1); live(s, 0.1);
    assert.equal(v.borrowed, null); assert.equal(v.breaks, i + 1);
    assert.equal(v.state, 'stunned'); assert.ok(v.vulnerable, 'the stun is a punish window');
    live(s, 2.5);
  }
  assert.deepEqual(new Set(borrowed), new Set(['thornmaw', 'cinder', 'rime', 'tide']));
  hit(9999); live(s, 4); assert.ok(v.dead || v.state === 'dying');
});

test('a borrowed form wears off after 12 seconds without counting as a break', async () => {
  const { s, v } = await phase3();
  until(s, () => v.borrowed);
  const kind = v.borrowed; live(s, 12.2);
  assert.equal(v.breaks, 0); assert.equal(v.borrowed, null);
  until(s, () => v.borrowed); assert.equal(v.borrowed, kind);
});

test('Hard needs three hits to break a form', async () => {
  const { s, v, hit } = await phase3('hard');
  until(s, () => v.borrowed);
  hit(1); hit(1); assert.ok(v.borrowed);
  hit(1); assert.equal(v.borrowed, null); assert.equal(v.breaks, 1);
});

test('Vesper has his own voice', async () => { const n = await sfxDuringFight('vesper', 40); assert.ok(n.filter((x) => x.startsWith('vesper_')).length >= 5); });

test('every Vesper sound is its own', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['laugh', 'bolt', 'step', 'pillar', 'scythe', 'ring', 'beam', 'eclipse', 'shift', 'break', 'rise', 'phase', 'death'].map((k) => `vesper_${k}`);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});

// Each move puts down what it promises: homing bolts, a step behind the player over a marked circle,
// pillars, a scythe's cone; in phase 2 a ring with three gaps, a turning beam, the eclipse's edge bolts.
test('his own moves put down what they promise', async () => {
  const { s, v } = await fight();
  const seen = new Set(), shapes = new Set();
  let homing = 0;
  for (let t = 0; t < 40; t += 1 / 60) {
    live(s, 1 / 60); seen.add(v.state);
    for (const z of s.area.zones) if (z.owner === v) shapes.add(z.shape + (z.spin ? ':spin' : '') + (z.gaps?.length ? `:${z.gaps.length}gaps` : ''));
    homing = Math.max(homing, s.area.entities.filter((e) => e instanceof Projectile && e.home > 0 && e.kind === 'gloam').length);
  }
  for (const st of ['drift', 'bolts', 'step', 'pillars', 'scythe']) assert.ok(seen.has(st), `phase 1 ${st}`);
  assert.ok(homing >= 1, 'homing bolts'); assert.ok(shapes.has('circle') && shapes.has('cone'), [...shapes].join(' '));
  const q = await fight(); q.v.phase = 2; q.v.state = 'drift';
  const seen2 = new Set(), shapes2 = new Set();
  let edge = 0, dim = false;
  for (let t = 0; t < 60; t += 1 / 60) {
    live(q.s, 1 / 60); seen2.add(q.v.state);
    for (const z of q.s.area.zones) if (z.owner === q.v) shapes2.add(z.shape + (z.spin ? ':spin' : '') + (z.gaps?.length ? `:${z.gaps.length}gaps` : ''));
    if (q.v.state === 'eclipse') { dim ||= q.s.area.entities.some((e) => e.eclipse); edge = Math.max(edge, q.s.area.entities.filter((e) => e instanceof Projectile && e.kind === 'gloam' && e.edge).length); }
  }
  for (const st of ['ring', 'beam', 'eclipse']) assert.ok(seen2.has(st), `phase 2 ${st}`);
  assert.ok(shapes2.has('ring:3gaps') && shapes2.has('segment:spin'), [...shapes2].join(' '));
  assert.ok(dim, 'the eclipse dims the room'); assert.ok(edge >= 4, `edge bolts ${edge}`);
});

test('the shadow step marks where he will land, behind the player, for 0.6 s', async () => {
  const { s, v } = await fight(), p = s.game.player;
  p.aim = 0; // facing east: behind is west
  Object.assign(v, { state: 'drift', timer: 0, own: v.ownOrder.indexOf('step') });
  live(s, 1 / 60);
  const z = s.area.zones.find((q) => q.owner === v && q.shape === 'circle');
  assert.equal(v.state, 'step'); assert.ok(v.moves.untargetable(v), 'gone while he steps');
  assert.ok(Math.abs(z.t0 - 0.6) < 0.02, `${z.t0}`); assert.ok(z.x < p.x - 10, 'behind the player');
  live(s, 0.65);
  assert.ok(Math.hypot(v.x - z.x, v.y - z.y) < 2, 'lands on the mark');
});

test('a drain beam sweeps round, and where it will be reads as danger', () => {
  const z = makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 12, t: 0, life: 2, spin: 2, dmg: 2 });
  assert.equal(zoneDanger(z, 0, 60, 0), 0, 'not yet');
  const ahead = makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 12, t: 0, life: 2, spin: 2, dmg: 2 });
  assert.ok(zoneDanger(ahead, 70, 35, 0) > 0, 'the sweep is read ahead of it');
});

// Every borrowed form begins at its `first` with its own init, and leaving it takes everything it put
// in the room with it: the Tidewarden's pool, the Rime Sovereign's pillars, a fade left half done.
test('borrowing one warden after another leaves nothing behind', async () => {
  const order = ['tide', 'cinder', 'rime', 'thornmaw'];
  const { s, v, hit } = await phase3();
  v.cycle = [...order];
  for (const kind of order) {
    until(s, () => v.borrowed);
    assert.equal(v.borrowed, kind); assert.equal(v.moves, WARDEN_MOVES[kind]);
    const seen = new Set();
    for (let t = 0; t < 3; t += 1 / 60) { live(s, 1 / 60); seen.add(v.state); }
    assert.ok(seen.size > 1, `${kind} fights`);
    until(s, () => !v.untargetable, 3);
    hit(1); hit(1); live(s, 1 / 60);
    assert.equal(v.borrowed, null, kind);
    assert.ok(!v.tideFloor || v.tideFloor.dead, `${kind}: no pool left`);
    assert.equal(v.alpha ?? 1, 1, `${kind}: whole`);
    assert.ok(!s.area.entities.some((e) => e.constructor.name === 'IcePillar' && !e.dead), `${kind}: no ice left`);
    live(s, 2.5);
  }
});

test('his borrowed forms wear his colours', async () => {
  const { s, v } = await phase3();
  assert.equal(tidePal(v), VESPER_PALS.tide);
  v.cycle = ['cinder', 'thornmaw', 'rime', 'tide'];
  until(s, () => v.borrowed);
  const shots = () => s.area.entities.filter((e) => e instanceof Projectile && e.kind === 'ember');
  until(s, () => shots().length > 0, 6);
  assert.ok(shots().every((e) => e.rgb === VESPER_PALS.cinder.shot), 'violet embers');
  for (const kind of ['thornmaw', 'cinder', 'rime', 'tide']) assert.notDeepEqual(VESPER_PALS[kind], {}, kind);
});

test('Vesper paints both forms, his borrowed crown and every view, without randomness', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('painters must not call Math.random'); };
  try {
    const draw = (o = {}) => { const r = recorder(); paintVesper(r.g, { ...portraitPose('vesper', 1), ...o }, []); return JSON.stringify(r.calls); };
    for (const phase of [1, 2, 3]) {
      assert.notEqual(draw({ view: 'front', phase }), draw({ view: 'side', phase }), `${phase}`);
      assert.notEqual(draw({ view: 'back', phase }), draw({ view: 'side', phase }), `${phase}`);
      assert.notEqual(draw({ view: 'front', phase }), draw({ view: 'back', phase }), `${phase}`);
    }
    assert.notEqual(draw({ phase: 1 }), draw({ phase: 2, phaseT: 9 }), 'phase 2 is a new form');
    for (const state of ['drift', 'bolts', 'step', 'pillars', 'scythe', 'recover', 'ring', 'beam', 'eclipse', 'spent', 'shift', 'stunned', 'transform', 'rise', 'defeated', 'dying']) for (const view of ['side', 'front', 'back']) draw({ state, view, phase: 2, phaseT: 0.4, timer: 0.3 });
    for (const kind of ['thornmaw', 'cinder', 'rime', 'tide']) for (const view of ['side', 'front', 'back']) {
      const r = recorder(); vesperCrown(r.g, { ...portraitPose('vesper', 1), borrowed: kind, view });
      assert.ok(r.calls.length > 4, `${kind} ${view} crown`);
    }
  } finally { Math.random = random; }
});

test('his story: an intro, the rise and the fall, with known art and a ghost instead of a spirit', () => {
  const intro = bossIntroShots('vesper'), rise = vesperRiseShots(), fall = vesperFallShots({ x: 10, y: 10 });
  assert.ok(WARDENS.vesper && !WARDENS.vesper.spirit);
  for (const shots of [intro, rise, fall]) {
    assert.ok(shots.length >= 2);
    for (const sh of shots) { if (sh.art) assert.ok(ART_IDS.includes(sh.art), sh.art); assert.ok(sh.text || sh.title); }
  }
  assert.ok(ART_IDS.includes('portrait_vesper'));
  assert.ok(fall.some((sh) => sh.spirit === 'vesperghost'));
  assert.ok(!WARDENS.tide.lines.some((l) => /socket.*\blit\b/i.test(l)), 'the Tide Spirit no longer runs ahead of the kindling');
});

// In his arena: the four sockets' light streams into him, going dark, while his bar fills on screen.
test('he rises on the sockets\' light, his bar refilling on screen', async () => {
  const s = await sandbox(), g = s.game;
  g.state.quest.flags['intro:vesper'] = true;
  g.enterDungeon('spire'); const a = g.area; a.enterRoom(a.dungeon.bossId, 's');
  const v = a.boss, sockets = () => a.objs.filter((o) => o.obj.type === 'socket');
  assert.equal(v.kind, 'vesper'); assert.equal(sockets().length, 4); assert.ok(sockets().every((o) => o.lit));
  v.state = 'drift'; v.phase = 2; v.hp = 1;
  const heard = []; s.app.audio.sfx = (n) => heard.push(n);
  v.damage(5, g.player, a.ctx);
  const hp = [];
  for (let t = 0; t < 4.5; t += 1 / 60) { live(s, 1 / 60); if (g.bossDeath) hp.push(v.hp); }
  assert.ok(hp.some((h) => h > 20 && h < 160), 'the bar fills where it can be seen');
  assert.ok(sockets().every((o) => !o.lit), 'their light is his now');
  assert.ok(heard.includes('vesper_laugh') && heard.includes('vesper_rise'));
  assert.equal(v.phase, 3); assert.equal(v.hp, v.maxHp);
});

test('his fall plays the ghost letting go, and only then does the quest end', async () => {
  const s = await sandbox(), g = s.game;
  g.state.quest.flags['intro:vesper'] = true; g.state.quest.main = 'spire';
  g.enterDungeon('spire'); const a = g.area; a.enterRoom(a.dungeon.bossId, 's');
  const v = a.boss;
  Object.assign(v, { phase: 3, maxHp: 180, hp: 5, breaks: 4, state: 'drift' });
  v.damage(99, g.player, a.ctx);
  until(s, () => g.uiStack.length, 10);
  const scene = g.uiStack.at(-1);
  assert.ok(scene.shots.some((sh) => sh.spirit === 'vesperghost'));
  assert.equal(g.state.quest.main, 'spire');
  scene.finish(g);
  assert.equal(g.state.quest.main, 'end');
  assert.ok(g.state.progress.bosses.includes('spire'));
  assert.ok(g.state.progress.shards <= 4, 'no fifth shard');
});

// The game closed between his fall and the end of the ghost's scene: the save holds the spire stage
// with him beaten. Loading it ends the quest and shows the ending.
test('a save made during his fall scene loads into the ending', async () => {
  const { GameScene } = await import('../src/scenes/game.js');
  const s = await sandbox(), g = s.game;
  g.state.quest.main = 'spire'; g.state.quest.flags['outro:vesper'] = true;
  g.state.progress.bosses.push('verdant', 'ashen', 'frost', 'drowned', 'spire');
  g.enterDungeon('spire'); g.area.enterRoom(g.area.dungeon.bossId, 's');
  g.state.location = g.currentLocation();
  const g2 = new GameScene(s.app, deserialize(serialize(g.state)));
  assert.equal(g2.state.quest.main, 'end');
  assert.ok(g2.uiStack.some((ui) => ui.title === 'The Ember Rekindled'), 'the ending shows');
  assert.ok(!g2.area.boss, 'and he stays beaten');
});

// R47: borrowed, the Tidewarden dives, resurfaces and rolls its tidal wave, all inside the 12 s, the
// wave ending spent (a punish window), without flooding the room, and two hits still break it.
test('the borrowed Tidewarden dives and resurfaces, rolls a tidal wave, and still breaks', async () => {
  const { s, v, hit } = await phase3();
  v.cycle = ['tide', 'cinder', 'rime', 'thornmaw'];
  until(s, () => v.borrowed === 'tide');
  const seen = [], t0 = v.formT;
  let waved = false;
  for (let t = 0; t < 11.5 && v.borrowed === 'tide' && !(seen.includes('spent') && v.state === 'jets'); t += 1 / 60) {
    live(s, 1 / 60);
    if (seen.at(-1) !== v.state) seen.push(v.state);
    waved ||= s.area.zones.some((z) => z.owner === v && z.tideWave);
  }
  assert.equal(v.borrowed, 'tide', `still borrowed (${seen.join(' ')})`);
  for (const st of ['dive', 'surface', 'wave', 'spent']) assert.ok(seen.includes(st), `${st} in ${seen.join(' ')}`);
  assert.ok(seen.indexOf('wave') < seen.indexOf('spent'), 'the wave ends spent');
  assert.ok(waved, 'a wave rolls'); assert.equal(v.state, 'jets', 'and it moves on');
  assert.ok(v.formT - t0 < 12, `inside the form's 12 s (${(v.formT - t0).toFixed(1)})`);
  assert.equal(v.tidePhase, 1, 'its floor keeps its first look: no flood');
  hit(1); hit(1);
  assert.equal(v.borrowed, null); assert.equal(v.breaks, 1);
});

test('the Spire\'s arena gives no fifth shard', () => {
  for (const seed of [1, 'ember', 'quests']) {
    const d = generateDungeon('spire', seed), boss = d.rooms[d.bossId];
    assert.ok(!boss.objects.some((o) => o.type === 'chest'), `${seed}`);
    assert.ok(boss.objects.some((o) => o.type === 'portal'));
  }
});

test('the Spire door opens at the spire stage, and not before', async () => {
  const s = await sandbox(), g = s.game, sp = g.world.pois.spire;
  g.exitToOverworld(sp.front.x, sp.front.y, true);
  g.state.quest.main = 'kindle';
  assert.equal(g.area.tryDungeonDoor(sp.door.x, sp.door.y), false);
  g.uiStack.length = 0;
  g.state.quest.main = 'spire';
  assert.equal(g.area.tryDungeonDoor(sp.door.x, sp.door.y), true);
  assert.equal(g.area.kind, 'dungeon'); assert.equal(g.area.id, 'spire');
});

test('a save inside the Spire reloads inside it', async () => {
  const { GameScene } = await import('../src/scenes/game.js');
  const s = await sandbox(), g = s.game;
  g.enterDungeon('spire');
  g.state.location = g.currentLocation();
  const g2 = new GameScene(s.app, deserialize(serialize(g.state)));
  assert.equal(g2.area.kind, 'dungeon'); assert.equal(g2.area.id, 'spire');
});

// The bot breaks a borrowed form by going for it, then punishes the stun.
test('the bot breaks borrowed forms and punishes the stun', async () => {
  const { s, v } = await phase3();
  v.aggro = true; // the arena isn't a boss room
  const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })();
  let stunHp = null, stunDealt = 0;
  for (let t = 0; t < 90 && v.breaks < 2; t += 1 / 60) {
    bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); s.game.state.player.hp = 99;
    if (v.state === 'stunned') { stunHp ??= v.hp; stunDealt = Math.max(stunDealt, stunHp - v.hp); } else stunHp = null;
  }
  assert.ok(v.breaks >= 2, `breaks ${v.breaks}`);
  assert.ok(stunDealt > 0, 'it hits him while he is stunned');
});
