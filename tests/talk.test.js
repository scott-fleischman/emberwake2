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
      const pages = conversation(fakeGame(state), { data: npc });
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
