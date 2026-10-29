import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld } from '../src/world/overworld.js';
import { newGameState } from '../src/game/state.js';
import { LORE_ENTRIES, STONE_LORE, BOOKS, WARDENS, learnLore, bookFor, introShots, elderShots, endingShots, bossIntroShots, bossOutroShots } from '../src/data/story.js';
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
  for (let f = 0; f < 60 * 60 * 10 && !app.titled; f++) {
    theater.update(1 / 60);
    if (f % 30 === 0) theater.drawWorld(g);
    app.input.endFrame();
  }
  assert.ok(app.titled, 'the theater should end by returning to the title');
});

test('the Tidewarden has warden story data and a whale spirit', () => {
  assert.ok(bossIntroShots('tide').length > 0);
  const outro = bossOutroShots('tide', { x: 0, y: 0 });
  assert.ok(outro.length > 0);
  assert.ok(outro.some((s) => s.spirit === 'whale'));
});
