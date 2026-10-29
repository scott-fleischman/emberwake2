import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld } from '../src/world/overworld.js';
import { newGameState } from '../src/game/state.js';
import { LORE_ENTRIES, STONE_LORE, BOOKS, WARDENS, learnLore, bookFor, introShots, elderShots, hearthShots, kindleShots, endingShots, bossIntroShots, bossOutroShots } from '../src/data/story.js';
import { ART_IDS } from '../src/gfx/cinema.js';
import { Cutscene } from '../src/gfx/cutscene.js';

test('lore entries are unique and every standing stone is placed in the world', () => {
  assert.equal(new Set(LORE_ENTRIES.map((e) => e.id)).size, LORE_ENTRIES.length);
  for (const e of LORE_ENTRIES) assert.ok(e.title && e.text.length > 30, e.id);
  for (const seed of ['story', 'ember123', 'fen77']) {
    const W = generateOverworld(seed);
    assert.equal(W.pois.lore.length, STONE_LORE.length, seed);
    for (const l of W.pois.lore) assert.ok(LORE_ENTRIES.some((e) => e.id === l.id), l.id);
  }
});

test('learning lore is idempotent and ignores unknown ids', () => {
  const s = newGameState('story', 'mage');
  assert.equal(learnLore(s, 'lore0'), true);
  assert.equal(learnLore(s, 'lore0'), false);
  assert.equal(learnLore(s, 'nope'), false);
  assert.deepEqual(s.progress.lore, ['lore0']);
});

test('your home holds the chronicle of your finding, and every book sits on some shelf', () => {
  for (const seed of ['story', 'ember123', 'fen77', 'a']) {
    const W = generateOverworld(seed);
    const home = W.props.find((p) => p.kind === 'building' && p.type === 'home' && p.settlementId === 'home');
    assert.match(BOOKS[bookFor(W, home)].title, /Two Fires/);
    const shelves = W.props.filter((p) => p.kind === 'building' && ['home', 'house', 'shop', 'seer'].includes(p.type));
    const found = new Set(shelves.map((b) => bookFor(W, b)));
    assert.equal(found.size, BOOKS.length, seed);
  }
});

test('every cutscene shot uses known art and has something to show', () => {
  const W = generateOverworld('story');
  const scripts = [
    introShots('Mage'),
    elderShots({ cls: 'Mage', elder: 'Odile', scout: 'Fenn', outpost: 'Elmford', dir: 'north', tip: 'mind your mana' }),
    hearthShots({ elder: 'Odile', town: 'Fenmoor' }),
    kindleShots({ elder: 'Odile' }),
    endingShots({ elder: 'Odile' }),
    ...Object.keys(WARDENS).flatMap((k) => [bossIntroShots(k), bossOutroShots(k, { x: 10, y: 10 })]),
  ];
  for (const shots of scripts) {
    assert.ok(shots.length >= 3);
    for (const s of shots) {
      if (s.art) assert.ok(ART_IDS.includes(s.art), s.art);
      assert.ok(s.text || s.title, JSON.stringify(s));
    }
  }
  assert.ok(W);
});

test('the true ending names all four spirits and reveals the spark', () => {
  const shots = endingShots({ elder: 'Old Maren' }), text = JSON.stringify(shots);
  for (const k of ['stag', 'phoenix', 'owl', 'whale']) assert.ok(text.includes(k), k);
  assert.match(text, /last spark/i);
  assert.ok(!/Chapter I/.test(text));
});

// Its five beats in order: the ghost, the spirit ring, the elder's reveal, the four wards healing, the credits.
test('the true ending runs ghost, spirits, reveal, healing, credits', () => {
  const shots = endingShots({ elder: 'Old Maren' }), arts = shots.map((s) => s.art);
  const first = (a) => arts.indexOf(a);
  assert.equal(arts[0], 'spiritsring'); assert.ok(shots[0].ghost);
  assert.ok(first('spiritsring') < first('rekindle') && first('rekindle') < first('spark'));
  assert.ok(shots.some((s) => s.speaker === 'Old Maren' && /last spark/i.test(s.text)), 'the elder says it');
  assert.deepEqual(shots.filter((s) => s.art === 'healing4').map((s) => s.region), [0, 1, 2, 3]);
  assert.ok(first('spark') < first('healing4'));
  assert.equal(arts.at(-1), 'credits'); assert.ok(shots.at(-1).title);
});

// Painters are deterministic and draw every beat (the healing at each region and stage of its turn).
test('the true ending\'s painted scenes draw without randomness', async () => {
  const { ART } = await import('../src/gfx/cinema.js');
  const { makeApp } = await import('../tools/headless.mjs');
  await makeApp();
  const g = document.createElement('canvas').getContext('2d'), rnd = Math.random;
  Math.random = () => { throw new Error('a painter called Math.random'); };
  try {
    for (const s of endingShots({ elder: 'Old Maren' })) for (const t of [0, 0.5, 1.5, 3, 6]) ART[s.art](g, t, s, {});
  } finally { Math.random = rnd; }
});

const fakeGame = () => {
  const pressed = new Set();
  return {
    pressed,
    input: { pressed: (a) => pressed.has(a), keyPressed: (k) => pressed.has(k) },
    audio: { sfx() {}, playMusic(k) { this.music = k; } },
  };
};

test('cutscenes auto-advance narration, wait on dialogue, and finish exactly once', () => {
  let done = 0;
  const cut = new Cutscene([{ text: 'Narration.', hold: 0.5 }, { text: 'Speak.', speaker: 'Elder', wait: true }], { music: 'story', onDone: () => done++ });
  const g = fakeGame();
  for (let i = 0; i < 120; i++) cut.update(1 / 60, g);
  assert.equal(g.audio.music, 'story');
  assert.equal(cut.i, 1);
  for (let i = 0; i < 600; i++) cut.update(1 / 60, g);
  assert.equal(cut.i, 1, 'dialogue waits for a key');
  g.pressed.add('confirm');
  cut.update(1 / 60, g);
  g.pressed.clear();
  assert.equal(done, 1);
  assert.equal(cut.done, true);
  cut.update(1 / 60, g);
  assert.equal(done, 1);
});

test('one Esc arms the skip, a second skips the whole scene', () => {
  let done = 0;
  const cut = new Cutscene(introShots('Rogue'), { onDone: () => done++ });
  const g = fakeGame();
  for (let i = 0; i < 30; i++) cut.update(1 / 60, g);
  g.pressed.add('Escape'); cut.update(1 / 60, g); g.pressed.clear();
  assert.equal(done, 0);
  cut.update(1 / 60, g);
  g.pressed.add('Escape'); cut.update(1 / 60, g); g.pressed.clear();
  assert.equal(done, 1);
});

test('the cutscene theater plays every scene through to the end', async () => {
  const { makeApp } = await import('../tools/headless.mjs');
  const app = await makeApp();
  const { TheaterScene } = await import('../src/scenes/theater.js');
  const theater = new TheaterScene(app);
  const g = document.createElement('canvas').getContext('2d');
  for (let f = 0; f < 60 * 60 * 15 && !app.titled; f++) { // about 13 minutes of film
    theater.update(1 / 60);
    if (f % 30 === 0) theater.drawWorld(g);
    app.input.endFrame();
  }
  assert.ok(app.titled, 'the theater should end by returning to the title');
});

test('the Theater covers the whole story in order', async () => {
  const { installHeadless } = await import('../tools/headless.mjs');
  installHeadless();
  const { theaterScenes } = await import('../src/scenes/theater.js');
  const W = generateOverworld('quests');
  assert.ok(W.pois.lookouts.some((l) => l.id === 'belfry'), 'this world has its Belfry');
  const labels = theaterScenes(W).map((s) => s.label);
  for (const l of ['Hearth', 'Drowned Belfry', 'Tidewall', 'Tidewarden', 'Kindling', 'Spire', 'Vesper', 'Ending']) assert.ok(labels.some((x) => x.includes(l)), l);
  const at = (l) => labels.findIndex((x) => x.includes(l));
  assert.ok(at('Tidewarden') < at('Vesper'));
  const story = ['Prologue', 'Thornmaw awakens', 'Cinder Warden falls', 'Rime Sovereign falls', 'Hearth', 'Chapter IV', 'Drowned Belfry', 'Tidewall',
    'Tidewarden awakens', 'Tidewarden falls', 'Kindling', 'Chapter V', 'Spire', 'Vesper awakens', 'Vesper rises', 'Vesper lets go', 'Ending'];
  for (let k = 1; k < story.length; k++) assert.ok(at(story[k - 1]) < at(story[k]), `${story[k - 1]} before ${story[k]}`);
  assert.equal(at('Ending'), labels.length - 1);
});

test('the Tidewarden has warden story data and a whale spirit', () => {
  assert.ok(bossIntroShots('tide').length > 0);
  const outro = bossOutroShots('tide', { x: 0, y: 0 });
  assert.ok(outro.length > 0);
  assert.ok(outro.some((s) => s.spirit === 'whale'));
});
