import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox } from './helpers/sandbox.js';
import { AudioEngine, SFX_NAMES, MUSIC_KEYS } from '../src/audio/audio.js';
import { VOICES, voiceFor, babble, cryOf, cry, AMBIENCE } from '../src/audio/voices.js';
import { Cutscene } from '../src/gfx/cutscene.js';
import { Dialog } from '../src/gfx/ui.js';
import { Enemy } from '../src/game/enemies.js';
import { createBoss } from '../src/game/bosses.js';
import { Bot } from '../src/bot/bot.js';
import { introShots, elderShots, bossIntroShots, bossOutroShots, vesperRiseShots, vesperFallShots, hearthShots, kindleShots, endingShots } from '../src/data/story.js';
import { lookoutShots, sealShots } from '../src/data/wards.js';
import { generateOverworld } from '../src/world/overworld.js';
import { FAMILIES } from '../src/data/enemies.js';

// An engine whose voices write down what they would play.
const recording = () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise', 'syllable']) engine[k] = (t, o) => calls.push([k, t, o]);
  return { engine, calls };
};
const fakeGame = () => {
  const pressed = new Set(), heard = [];
  return {
    pressed, heard,
    input: { pressed: (a) => pressed.has(a), keyPressed: (k) => pressed.has(k) },
    audio: { sfx(n, o) { heard.push([n, o]); }, playMusic(k) { this.music = k; }, ambience(k) { this.amb = k; heard.push(['amb', k]); } },
  };
};

// ---------------------------------------------------------------- voices
test('every voice speaks, greets, and sounds like itself', () => {
  const { engine, calls } = recording();
  const sound = (o) => { calls.length = 0; engine._last = {}; engine.sfx('voice', o); return JSON.stringify(calls.map((c) => [c[0], c[2].type, c[2].form, c[2].growl])); };
  for (const v of Object.keys(VOICES)) {
    assert.ok(sound({ v }).length > 2, `${v} says nothing`);
    assert.ok(sound({ v, greet: true }).length > 2, `${v} has no greeting`);
  }
  assert.notEqual(sound({ v: 'elder' }), sound({ v: 'unkindled' }));
});
test('a villager calls out in their own voice as you pass', () => {
  const { engine, calls } = recording();
  engine.sfx('voice', { v: voiceFor('Maren', 'villager'), phrase: 3 });
  assert.equal(calls.filter((c) => c[0] === 'syllable').length, 3);
});
test('a villager keeps one voice, and the village has many', () => {
  assert.deepEqual(voiceFor('Maren', 'villager'), voiceFor('Maren', 'villager'));
  assert.ok(voiceFor('Maren', 'villager').f > voiceFor('Tobin', 'villager').f, 'her voice sits higher than his');
  assert.equal(voiceFor('Aldric the Elder', 'elder').slow, VOICES.elder.slow);
  const pitches = new Set(['Maren', 'Tobin', 'Ilsa', 'Corwin', 'Petra', 'Bram'].map((n) => voiceFor(n, 'villager').f.toFixed(1)));
  assert.equal(pitches.size, 6);
});
test('a line is voiced a syllable at a time, pausing between words', () => {
  const heard = [], audio = { sfx: (n, o) => heard.push(o) }, text = 'Hello there, child. Come in?';
  for (let c = 0; c < text.length; c += 0.7) babble(audio, 'man', text, c, Math.min(text.length, c + 0.7));
  assert.ok(heard.length >= 4 && heard.length <= 8, `${heard.length} syllables`);
  assert.ok(heard.every((o) => /[A-Za-z]/.test(text[Math.round(o.q * text.length)])), 'never on a space or a stop');
  assert.ok(heard.every((o) => o.ask), 'the line is a question');
  heard.length = 0;
  babble(audio, 'man', text, 0, text.length);
  assert.equal(heard.length, 0, 'a line filled in at a keypress makes no burst');
});

// ---------------------------------------------------------------- creatures
test('every monster has a cry for every mood', () => {
  const { engine, calls } = recording();
  FAMILIES.forEach((_, biome) => {
    for (const arch of ['brute', 'lunger', 'skirmisher', 'ranged']) {
      const c = cryOf(arch, biome);
      assert.ok(c, `${arch} of ${biome}`);
      for (const mood of ['alert', 'attack', 'hurt', 'die', 'idle']) {
        calls.length = 0; cry(engine, 0, c[0], mood);
        assert.ok(calls.length, `${c[0]} ${mood}`);
      }
    }
  });
});
test('a monster cries out when it sees you, when it is hit and when it falls', async () => {
  const s = await sandbox(), heard = [];
  s.game.audio.sfx = (n, o) => heard.push([n, o?.mood]);
  const e = s.spawn(new Enemy('lunger', 0, s.center.x + 60, s.center.y));
  s.step(0.6);
  assert.ok(heard.some(([n, m]) => n === 'cry' && m === 'alert'), 'it saw you');
  e.damage(1, s.game.player, s.area.ctx);
  assert.ok(heard.some(([n, m]) => n === 'cry' && m === 'hurt'));
  e.damage(99, s.game.player, s.area.ctx);
  assert.ok(heard.some(([n, m]) => n === 'cry' && m === 'die'));
});

// ---------------------------------------------------------------- wardens
test('every warden growls and grunts in its own voice', () => {
  const { engine, calls } = recording();
  const recipe = (n) => { calls.length = 0; engine._last = {}; engine.sfx(n); return JSON.stringify(calls); };
  const names = ['thornmaw', 'cinder', 'rime', 'tide', 'vesper'].flatMap((k) => [`${k}_growl`, `${k}_hurt`]);
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});
test('a warden grunts when struck, growls into its moves, and calls only one minion', async () => {
  const s = await sandbox(), heard = [];
  s.game.audio.sfx = (n) => heard.push(n);
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 50));
  for (let t = 0; t < 20; t += 1 / 60) { s.step(1 / 60); s.game.state.player.hp = 99; }
  assert.ok(heard.filter((n) => n === 'cinder_growl').length >= 2, 'growls into its moves');
  b.state = 'ready'; b.untargetable = false;
  heard.length = 0; b.damage(1, s.game.player, s.area.ctx);
  assert.ok(heard.includes('cinder_hurt'));
  b.damage(9, s.game.player, s.area.ctx); s.step(0.05);
  assert.deepEqual(heard.filter((n) => n === 'cinder_hurt').length, 1, 'not a grunt on every blow');
  b.hp = b.maxHp * 0.5; s.step(1.7);
  assert.equal(b.phase, 2);
  assert.equal(s.area.enemyList.filter((e) => !e.boss && !e.dead).length, 1);
});
test('the wardens are lighter: Thornmaw in the sixties, up to Vesper at 150', () => {
  const hp = ['thornmaw', 'cinder', 'rime', 'tide', 'vesper'].map((k) => createBoss(k, 0, 0).maxHp);
  assert.ok(hp[0] >= 50 && hp[0] <= 75, `Thornmaw ${hp[0]}`);
  assert.equal(hp[4], 150);
  for (let i = 1; i < hp.length; i++) assert.ok(hp[i] > hp[i - 1], 'each warden tougher than the last');
});

// ---------------------------------------------------------------- scenes
test('story scenes have sound under them: the meteor lands with a boom, fire crackles after', () => {
  const g = fakeGame(), cut = new Cutscene(introShots('Rogue'));
  for (let i = 0; i < 60 * 4; i++) cut.update(1 / 60, g);
  const names = g.heard.map(([n]) => n);
  assert.ok(names.indexOf('meteor_fall') < names.indexOf('meteor_boom'));
  assert.equal(g.audio.amb, 'fire');
  for (let i = 0; i < 60 * 120 && !cut.done; i++) cut.update(1 / 60, g);
  assert.ok(cut.done);
  assert.equal(g.audio.music, 'title', 'the adventure theme comes in at the title card');
  assert.equal(g.audio.amb, null, 'and the bed of sound goes with the scene');
});
test('every sound, bed and voice a story scene asks for exists', () => {
  const W = generateOverworld('quests'), c = { cls: 'Rogue', elder: 'Aldric', scout: 'Wynn', outpost: 'Fernwatch', dir: 'north', tip: 'eat when hurt', town: 'Reedwater' }, f = { x: 0, y: 0 };
  const scenes = [introShots('Rogue'), elderShots(c), hearthShots(c), kindleShots(c), endingShots(c), vesperRiseShots(), vesperFallShots(f),
    ...['thornmaw', 'cinder', 'rime', 'tide', 'vesper'].flatMap((k) => [bossIntroShots(k), bossOutroShots(k, f)]),
    ...['lookout', 'belfry', 'windcrest'].map((id) => lookoutShots(W, id)), ...['verdant', 'ashen', 'frost', 'drowned'].map((k) => sealShots(W, k, () => {}))];
  for (const s of scenes.flat()) {
    for (const x of [...[].concat(s.sfx || []), ...(s.cues || []).map((q) => q[1])]) {
      const n = [].concat(x)[0];
      if (n.startsWith('amb:')) assert.ok(!n.slice(4) || AMBIENCE[n.slice(4)], n); else assert.ok(SFX_NAMES.includes(n), `${n} (in "${s.text}")`);
    }
    if (s.amb) assert.ok(AMBIENCE[s.amb], s.amb);
    if (typeof s.voice === 'string') assert.ok(VOICES[s.voice], s.voice);
    if (s.music) assert.ok(MUSIC_KEYS.includes(s.music), s.music);
  }
});
test('people, spirits and wardens speak in their own voices in scenes', () => {
  const voices = (shots) => new Set(shots.filter((s) => s.speaker).map((s) => typeof s.voice === 'string' ? s.voice : 'person'));
  assert.ok(voices(bossIntroShots('rime')).has('warden_rime'));
  assert.ok(voices(bossOutroShots('tide', { x: 0, y: 0 })).has('spirit_whale'));
  assert.ok(voices(bossOutroShots('tide', { x: 0, y: 0 })).has('unkindled'));
  assert.ok(voices(endingShots({ elder: 'Aldric' })).has('elder'));
  const g = fakeGame(), cut = new Cutscene([{ speaker: 'Rime Sovereign', voice: 'warden_rime', text: 'STILL. STAY STILL.', wait: true }]);
  for (let i = 0; i < 60; i++) cut.update(1 / 60, g);
  assert.ok(g.heard.some(([n, o]) => n === 'voice' && o.v === 'warden_rime'));
  const sounds = (shots) => shots.flatMap((s) => [...[].concat(s.sfx || []), ...(s.cues || []).map((c) => c[1])]).map((x) => [].concat(x)[0]);
  assert.ok(sounds(bossIntroShots('thornmaw')).includes('thornmaw_roar'), 'it roars in its entrance');
  for (const k of ['thornmaw', 'cinder', 'rime', 'tide', 'vesper']) for (const n of sounds(bossIntroShots(k))) assert.ok(SFX_NAMES.includes(n), `${k}'s entrance asks for ${n}`);
});
test('a villager talks back in their own voice; signs and books just tick', () => {
  const g = fakeGame(), voice = voiceFor('Maren', 'villager');
  const d = new Dialog([{ speaker: 'Maren', text: 'Good morning! The well is dry again.' }], { voice });
  for (let i = 0; i < 60; i++) d.update(1 / 60, g);
  assert.ok(g.heard.some(([n, o]) => n === 'voice' && o.v === voice));
  const book = fakeGame(), page = new Dialog([{ speaker: 'An old book', text: 'In the year of the long frost...' }]);
  for (let i = 0; i < 60; i++) page.update(1 / 60, book);
  assert.ok(book.heard.every(([n]) => n === 'talk') && book.heard.length > 0);
});
test('every music track and ambience is defined, and the title theme is composed', () => {
  for (const k of ['title', 'hearth', 'story', 'boss', 'boss2']) assert.ok(MUSIC_KEYS.includes(k), k);
  for (const [k, def] of Object.entries(AMBIENCE)) {
    const calls = [], a = { tone: () => calls.push(1), noise: () => calls.push(1), syllable: () => calls.push(1), notes: () => calls.push(1) }, st = {};
    for (let t = 0; t < 6; t += def.step) def.tick(a, t, st);
    assert.ok(calls.length > 3, `${k} is silent`);
  }
  // The title's score: horn melody, strings, galloping low strings and drums from its first verse.
  const engine = new AudioEngine(), played = {};
  engine.ctx = { currentTime: 0 };
  engine._wire = (st) => { st.out = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; };
  for (const k of ['_horn', '_strings', '_low', '_timp', '_snare', '_swell', '_piano']) engine[k] = () => { played[k] = (played[k] || 0) + 1; };
  engine.playMusic('title');
  for (let t = 0; t < 30; t += 0.05) { engine.ctx.currentTime = t; engine._schedule(); }
  for (const k of ['_horn', '_strings', '_low', '_timp', '_snare', '_piano']) assert.ok(played[k] > 4, `${k}: ${played[k]}`);
  assert.equal(engine.cur.sec > 1 || engine.cur.sec === 1, true, 'past the intro into the verses');
});

// ---------------------------------------------------------------- the 100% bot watches
test('a 100% run watches every scene and lets every line type out, then reads straight on; Any% skips', async () => {
  const s = await sandbox();
  const full = new Bot(s.game, 'full'), any = new Bot(s.game, 'any');
  assert.ok(full.watch && !any.watch);
  const frame = () => { full.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); };
  const line = 'And a line to read, which types out in full before it goes.';
  const cut = s.game.playCutscene([{ text: 'A line of narration, held as long as it asks.', hold: 1 }, { speaker: 'Elder', text: line, wait: true }]);
  let t = 0, typed = null;
  for (; t < 12 && !cut.done; t += 1 / 60) { frame(); if (cut.i === 1 && typed === null && cut.typed) typed = t; if (cut.i === 0) assert.ok(t < 3.2, 'narration keeps its hold'); }
  assert.ok(cut.done, 'it plays to its end');
  assert.ok(t - typed < 0.5, `a spoken line goes on a beat after its last word (${(t - typed).toFixed(2)} s)`);
  const text = 'This is a page of a book, with quite a few words on it to read before turning over.';
  s.game.message(text, 'A book');
  let closed = null; typed = null;
  for (t = 0; t < 8 && s.game.uiStack.length; t += 1 / 60) {
    frame();
    const d = s.game.uiStack[0];
    if (d && typed === null && d.chars >= text.length) typed = t;
    if (!s.game.uiStack.length) closed = t;
  }
  assert.ok(typed > 1, 'the text types out on its own, never filled in');
  assert.ok(closed - typed < 0.6, `and closes right after (${(closed - typed).toFixed(2)} s)`);
});

// ---------------------------------------------------------------- the view on a phone
test('zoomed in, the camera sees less and follows the player through a dungeon room', async () => {
  const s = await sandbox();
  s.app.zoom = 1.8;
  s.game.enterDungeon('verdant');
  s.step(0.1);
  assert.deepEqual([s.game.cam.vw, s.game.cam.vh], [267, 150]);
  const p = s.game.player, x0 = s.game.cam.x;
  p.x += 60; s.step(1);
  assert.ok(s.game.cam.x > x0, 'the room scrolls with the player');
  assert.equal(s.game.viewZoom(), 1.8);
  s.game.playCutscene([{ art: 'hearth', text: 'A painted scene.' }]);
  assert.equal(s.game.viewZoom(), 1, 'a painted scene fills the screen');
  s.app.zoom = 1; s.game.uiStack = []; s.step(0.1);
  assert.deepEqual([s.game.cam.vw, s.game.cam.vh], [480, 270], 'unzoomed, a room fits and sits still');
});
