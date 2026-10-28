import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld } from '../src/world/overworld.js';
import { newGameState } from '../src/game/state.js';
import { advanceMain, mainObjective, generateSideQuests, recordKill, grantReward } from '../src/game/quests.js';

const W = generateOverworld('quests');

test('main quest advances only on the right events', () => {
  const s = newGameState('quests', 'mage');
  assert.equal(advanceMain(s, W, { type: 'talk', role: 'smith', settlementId: 'home' }).advanced, false);
  assert.equal(advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' }).stage, 'scout');
  assert.equal(advanceMain(s, W, { type: 'talk', role: 'scout', settlementId: 'outpost' }).stage, 'camp');
  assert.equal(advanceMain(s, W, { type: 'cleared', quest: false }).advanced, false);
  assert.equal(advanceMain(s, W, { type: 'cleared', quest: true }).stage, 'sigil');
  advanceMain(s, W, { type: 'talk', role: 'scout', settlementId: 'outpost' });
  assert.ok(s.artifacts.includes('verdantSigil'));
  assert.equal(s.quest.main, 'vault');
  advanceMain(s, W, { type: 'boss', kind: 'thornmaw' });
  advanceMain(s, W, { type: 'talk', role: 'smith', settlementId: 'home' });
  assert.equal(s.tools.bombs, true);
  assert.ok(s.gear.items.includes('bombs'));
  assert.equal(s.quest.main, 'ashpass');
});

test('every stage has an objective with text', () => {
  const s = newGameState('quests', 'rogue');
  for (const stage of ['wake', 'scout', 'camp', 'sigil', 'vault', 'smith', 'ashpass', 'ridge', 'reliquary', 'frostpass', 'boulder', 'sanctuary', 'drowned', 'end']) {
    s.quest.main = stage;
    const o = mainObjective(s, W);
    assert.ok(o.text.length > 10, stage);
  }
});

test('opening a gate early does not strand the quest', () => {
  const s = newGameState('quests', 'rogue');
  s.quest.main = 'ridge';
  s.progress.gates.push('volcanic');
  advanceMain(s, W, { type: 'noop' });
  assert.equal(s.quest.main, 'reliquary');
});

test('side quests vary across seeds and cover every settlement', () => {
  const qs = generateSideQuests(W);
  for (const st of W.settlements) assert.ok(qs.some((q) => q.settlementId === st.id), st.id);
  const sig = (w) => generateSideQuests(w).map((q) => `${q.type}:${q.item || q.parcel || q.kin || q.archetype}`).join('|');
  const other = generateOverworld('quests-2');
  assert.notEqual(sig(W), sig(other));
  assert.ok(new Set(qs.map((q) => q.type)).size >= 3);
});

test('hunt quests count matching kills and become ready', () => {
  const s = newGameState('quests', 'swordsman');
  const q = { id: 'h', type: 'hunt', biome: 0, archetype: 'lunger', count: 2 };
  s.quest.side.h = 'active';
  recordKill(s, [q], { biome: 0, archetype: 'brute' });
  assert.equal(s.quest.side.h, 'active');
  recordKill(s, [q], { biome: 0, archetype: 'lunger' });
  assert.deepEqual(recordKill(s, [q], { biome: 0, archetype: 'lunger' }), [q]);
  assert.equal(s.quest.side.h, 'ready');
});

test('two heart pieces make a heart', () => {
  const s = newGameState('q', 'ranger');
  grantReward(s, { heartPiece: 1 });
  grantReward(s, { heartPiece: 1 });
  assert.equal(s.upgrades.hearts, 1);
  assert.equal(s.upgrades.heartPieces, 0);
});

test('tracking defaults to the main quest and follows the selected side quest', async () => {
  const { trackedObjective, cycleTracked, trackableQuests } = await import('../src/game/quests.js');
  const s = newGameState('quests', 'ranger');
  const sq = generateSideQuests(W);
  assert.equal(trackedObjective(s, W, sq).id, 'main');
  assert.deepEqual(trackableQuests(s, sq), ['main']);
  const fetch = sq.find((q) => q.type === 'fetch');
  s.quest.side[fetch.id] = 'active';
  assert.equal(cycleTracked(s, sq), fetch.id);
  const o = trackedObjective(s, W, sq);
  assert.equal(o.id, fetch.id);
  assert.deepEqual(o.marker, fetch.target);
  assert.equal(cycleTracked(s, sq), 'main');
});

test('every trackable side quest stage has a map marker; finished ones fall back to main', async () => {
  const { trackedObjective, npcMarker } = await import('../src/game/quests.js');
  const sq = generateSideQuests(W);
  for (const q of sq) {
    for (const st of ['active', 'ready']) {
      const s = newGameState('quests', 'mage');
      s.quest.side[q.id] = st;
      s.quest.tracked = q.id;
      const o = trackedObjective(s, W, sq);
      assert.equal(o.id, q.id);
      assert.ok(o.marker && Number.isFinite(o.marker.x) && Number.isFinite(o.marker.y), `${q.type} ${st}`);
      if (st === 'ready') assert.deepEqual(o.marker, npcMarker(W, q.giverId));
    }
    const done = newGameState('quests', 'mage');
    done.quest.side[q.id] = 'done';
    done.quest.tracked = q.id;
    assert.equal(trackedObjective(done, W, sq).id, 'main');
  }
});

test('dungeon stages of the main quest name their dungeon', async () => {
  const { trackedObjective } = await import('../src/game/quests.js');
  const s = newGameState('quests', 'rogue');
  s.quest.main = 'reliquary';
  assert.equal(trackedObjective(s, W, []).dungeon, 'ashen');
  s.quest.main = 'smith';
  assert.equal(trackedObjective(s, W, []).dungeon, null);
});

test('each world gets the handwritten quests, and their spots are reachable', async () => {
  const { reachableFrom } = await import('../src/world/overworld.js');
  for (const seed of ['quests', 'ember123', 'fen77', 'hollow404', 'b']) {
    const w = generateOverworld(seed);
    const qs = generateSideQuests(w);
    for (const type of ['scholar', 'letters', 'pet', 'treasure', 'riddle', 'gather']) assert.ok(qs.some((q) => q.type === type), `${seed} ${type}`);
    assert.ok(qs.length >= 14, seed);
    const reach = reachableFrom(w, w.pois.home, { bombs: true, gloves: true });
    const ok = (p) => reach[p.y * w.w + p.x] >= 0;
    for (const q of qs) {
      if (q.spot) assert.ok(ok(q.spot), `${seed} ${q.type} spot`);
      if (q.spots) for (const p of q.spots) assert.ok(ok(p), `${seed} herb`);
      if (q.type === 'riddle') assert.equal(new Set(q.riddles).size, 3);
    }
  }
});
