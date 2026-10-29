import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld } from '../src/world/overworld.js';
import { newGameState, derivedStats } from '../src/game/state.js';
import { generateSideQuests, MAIN_STAGES, advanceMain } from '../src/game/quests.js';
import { conversation, chestReward, shopItems } from '../src/game/talk.js';

const W = generateOverworld('talk');
const fakeGame = (state) => {
  const g = {
    world: W, state, sideQuests: generateSideQuests(W), time: 0,
    audio: { sfx() {} }, toast() {}, refreshDerived() { g.derived = derivedStats(state); },
    onSideQuestAccepted() {}, questEvent(ev) { advanceMain(state, W, ev); },
    openShop() {}, buy: () => ({ pages: [{ text: 'ok' }] }), seerReading: () => 'smoke',
    area: { id: 'verdant' },
  };
  g.refreshDerived();
  return g;
};

test('every NPC has something to say at every main quest stage', () => {
  for (const stage of MAIN_STAGES) {
    for (const npc of W.npcs) {
      const state = newGameState('talk', 'ranger');
      state.quest.main = stage;
      const res = conversation(fakeGame(state), { data: npc });
      const pages = res.cutscene || res;
      assert.ok(pages.length > 0, `${npc.role} @ ${stage}`);
      for (const p of pages) assert.ok(typeof p.text === 'string' && p.text.length > 3, `${npc.role} @ ${stage}`);
    }
  }
});

test('side quest givers handle every status, and delivery targets pay out', () => {
  for (const status of [undefined, 'active', 'ready', 'done']) {
    const state = newGameState('talk', 'mage');
    const game = fakeGame(state);
    for (const q of game.sideQuests) {
      if (status) state.quest.side[q.id] = status;
      const giver = W.npcs.find((n) => n.id === q.giverId);
      const pages = conversation(game, { data: giver });
      assert.ok(pages[0].text.length > 3, `${q.type} ${status}`);
      if (status === undefined) assert.ok(pages[0].options?.length === 2, `${q.type} offers a choice`);
      if (q.type === 'deliver' && status === 'active') {
        const coins = state.player.coins;
        conversation(game, { data: W.npcs.find((n) => n.id === q.targetNpc) });
        assert.equal(state.quest.side[q.id], 'done');
        assert.ok(state.player.coins >= coins);
      }
    }
  }
});

test('lost wanderers in caves turn rescue quests ready', () => {
  const state = newGameState('talk', 'rogue');
  const game = fakeGame(state);
  const q = game.sideQuests.find((x) => x.type === 'rescue');
  if (!q) return;
  state.quest.side[q.id] = 'active';
  const npc = { data: { id: 'lost', name: 'Kin', role: 'villager', look: 1, lost: q.id, settlementId: q.settlementId } };
  conversation(game, npc);
  assert.equal(state.quest.side[q.id], 'ready');
  assert.equal(npc.leaving, true);
});

test('every chest content resolves to a message', () => {
  for (const c of ['home', 'camp', 'key', 'map', 'heart', 'coins', 'bombs', 'arrows', 'shard', 'sword', 'bow', 'tome', 'shield', 'quiver', 'unknown']) {
    const state = newGameState('talk', 'swordsman');
    assert.ok(chestReward(fakeGame(state), c).length > 3, c);
  }
});

test('shop items expose availability without throwing', () => {
  const state = newGameState('talk', 'swordsman');
  const game = fakeGame(state);
  for (const kind of ['merchant', 'smith']) for (const it of shopItems(game, kind)) assert.equal(typeof it.can(), 'boolean');
});

const pick = (pages, label) => pages[0].options.find((o) => o.label === label).onSelect();

test('the riddle-keeper asks three riddles; wrong answers cost nothing', async () => {
  const { RIDDLES } = await import('../src/data/sidequests.js');
  const state = newGameState('talk', 'mage');
  const game = fakeGame(state);
  const q = game.sideQuests.find((x) => x.type === 'riddle');
  const giver = { data: W.npcs.find((n) => n.id === q.giverId) };
  let res = pick(conversation(game, giver), 'I love riddles.');
  assert.equal(state.quest.side[q.id], 'active');
  const wrong = res.pages[0].options.find((o) => o.label !== RIDDLES[q.riddles[0]][1]);
  wrong.onSelect();
  assert.equal(state.quest.kills[q.id] || 0, 0);
  const coins = state.player.coins;
  for (let k = 0; k < 3; k++) {
    const pages = conversation(game, giver);
    res = pick(pages, RIDDLES[q.riddles[k]][1]);
  }
  assert.equal(state.quest.side[q.id], 'done');
  assert.ok(state.player.coins > coins);
});

test('love letters go out, a reply comes back, and the giver pays', () => {
  const state = newGameState('talk', 'rogue');
  const game = fakeGame(state);
  const q = game.sideQuests.find((x) => x.type === 'letters');
  state.quest.side[q.id] = 'active';
  conversation(game, { data: W.npcs.find((n) => n.id === q.targetNpc) });
  assert.equal(state.quest.side[q.id], 'ready');
  const pieces = state.upgrades.heartPieces + state.upgrades.hearts * 2;
  conversation(game, { data: W.npcs.find((n) => n.id === q.giverId) });
  assert.equal(state.quest.side[q.id], 'done');
  assert.ok(state.upgrades.heartPieces + state.upgrades.hearts * 2 > pieces);
});

test('the scholar is satisfied once enough standing stones are read', async () => {
  const { learnLore } = await import('../src/data/story.js');
  const state = newGameState('talk', 'swordsman');
  const game = fakeGame(state);
  const q = game.sideQuests.find((x) => x.type === 'scholar');
  const giver = { data: W.npcs.find((n) => n.id === q.giverId) };
  state.quest.side[q.id] = 'active';
  assert.match(conversation(game, giver)[0].text, /read 0 of the 3/);
  for (const l of W.pois.lore.slice(0, 3)) learnLore(state, l.id);
  conversation(game, giver);
  assert.equal(state.quest.side[q.id], 'done');
});

test('finished quest givers have an epilogue line', () => {
  const state = newGameState('talk', 'ranger');
  const game = fakeGame(state);
  for (const q of game.sideQuests.filter((x) => x.after)) {
    state.quest.side[q.id] = 'done';
    const seen = new Set();
    for (let t = 0; t < 400; t += 20) { game.time = t; seen.add(conversation(game, { data: W.npcs.find((n) => n.id === q.giverId) })[0].text); }
    assert.ok(seen.has(q.after), q.type);
  }
});

test('after the end, villagers talk about the Hearth', () => {
  const state = newGameState('talk', 'ranger');
  state.quest.main = 'end';
  const game = fakeGame(state);
  for (const q of game.sideQuests) { state.quest.side[q.id] = 'done'; delete q.after; } // past their own epilogues
  const folk = W.npcs.filter((n) => n.role === 'villager' && !game.sideQuests.some((q) => q.type === 'letters' && q.targetNpc === n.id));
  assert.ok(folk.length > 3);
  for (const npc of folk) for (let t = 0; t < 300; t += 30) { game.time = t; assert.match(conversation(game, { data: npc })[0].text, /Hearth/, npc.name); }
});

test('every NPC can call out a bark in every quest state', async () => {
  const { GameScene } = await import('../src/scenes/game.js');
  for (const status of [undefined, 'active', 'ready', 'done']) {
    const state = newGameState('talk', 'mage');
    const game = fakeGame(state);
    for (const q of game.sideQuests) if (status) state.quest.side[q.id] = status;
    for (const npc of W.npcs) assert.equal(typeof GameScene.prototype.barkFor.call(game, { data: npc }), 'string', `${npc.role} ${status}`);
  }
});
