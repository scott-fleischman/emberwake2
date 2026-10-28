import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld } from '../src/world/overworld.js';
import { newGameState } from '../src/game/state.js';
import { advanceMain, mainObjective, generateSideQuests, recordKill, grantReward, MAIN_STAGES } from '../src/game/quests.js';

const W = generateOverworld('quests');

test('main quest advances only on the right events', () => {
  const s = newGameState('quests', 'mage');
  const ev = (e) => advanceMain(s, W, e);
  const relics = (kind) => { for (const r of W.pois.relics[kind]) { s.progress.relics.push(r.id); ev({ type: 'relic', kind, id: r.id }); } };
  assert.equal(ev({ type: 'talk', role: 'smith', settlementId: 'home' }).advanced, false);
  assert.equal(ev({ type: 'talk', role: 'elder', settlementId: 'home' }).stage, 'scout');
  assert.equal(ev({ type: 'talk', role: 'scout', settlementId: 'outpost' }).stage, 'lookout');
  assert.equal(ev({ type: 'reach', id: 'windcrest' }).advanced, false);
  assert.equal(ev({ type: 'reach', id: 'lookout' }).stage, 'camp');
  assert.equal(ev({ type: 'cleared', quest: false }).advanced, false);
  assert.equal(ev({ type: 'cleared', quest: true }).stage, 'sigil');
  assert.equal(ev({ type: 'talk', role: 'scout', settlementId: 'outpost' }).stage, 'leaves');
  // Two leaves aren't enough; the third sends you to the thornwall.
  s.progress.relics.push(W.pois.relics.leaves[0].id, W.pois.relics.leaves[1].id);
  assert.equal(ev({ type: 'relic', kind: 'leaves' }).advanced, false);
  s.progress.relics.push(W.pois.relics.leaves[2].id);
  assert.equal(ev({ type: 'relic', kind: 'leaves' }).stage, 'thornwall');
  assert.equal(ev({ type: 'seal', key: 'ashen' }).advanced, false);
  assert.ok(!s.artifacts.includes('verdantSigil'));
  assert.equal(ev({ type: 'seal', key: 'verdant' }).stage, 'vault');
  assert.ok(s.artifacts.includes('verdantSigil'));
  ev({ type: 'boss', kind: 'thornmaw' });
  ev({ type: 'talk', role: 'smith', settlementId: 'home' });
  assert.equal(s.tools.bombs, true);
  assert.ok(s.gear.items.includes('bombs'));
  assert.equal(s.quest.main, 'ashpass');
  ev({ type: 'talk', role: 'keeper', settlementId: 'desert' });
  assert.equal(ev({ type: 'gate', region: 'volcanic' }).stage, 'cinderwatch');
  assert.equal(ev({ type: 'talk', role: 'keeper', settlementId: 'mountain' }).advanced, false);
  assert.equal(ev({ type: 'talk', role: 'keeper', settlementId: 'volcanic' }).stage, 'vents');
  relics('vents');
  assert.equal(s.quest.main, 'slagheart');
  assert.equal(ev({ type: 'seal', key: 'ashen' }).stage, 'reliquary');
  ev({ type: 'boss', kind: 'cinder' });
  assert.equal(s.tools.gloves, true);
  ev({ type: 'talk', role: 'keeper', settlementId: 'mountain' });
  assert.equal(ev({ type: 'gate', region: 'snow' }).stage, 'rimewatch');
  assert.equal(ev({ type: 'talk', role: 'keeper', settlementId: 'snow' }).stage, 'windcrest');
  assert.equal(ev({ type: 'reach', id: 'windcrest' }).stage, 'beacons');
  relics('beacons');
  assert.equal(s.quest.main, 'frostfang');
  assert.equal(ev({ type: 'seal', key: 'frost' }).stage, 'sanctuary');
  ev({ type: 'boss', kind: 'rime' });
  assert.equal(ev({ type: 'talk', role: 'elder', settlementId: 'home' }).stage, 'end');
});

test('every stage has an objective with text, and a marker until the end', () => {
  const s = newGameState('quests', 'rogue');
  for (const stage of MAIN_STAGES) {
    s.quest.main = stage;
    const o = mainObjective(s, W, W.pois.home);
    assert.ok(o.text.length > 10, stage);
    assert.ok(o.marker, `${stage} has no marker`);
  }
});

test('opening a gate early does not strand the quest', () => {
  const s = newGameState('quests', 'rogue');
  s.quest.main = 'ridge';
  s.progress.gates.push('volcanic');
  advanceMain(s, W, { type: 'noop' });
  assert.equal(s.quest.main, 'cinderwatch');
});

test('vents capped and beacons lit before anyone asks still count', () => {
  const s = newGameState('quests', 'rogue');
  s.quest.main = 'cinderwatch';
  s.progress.relics.push(...W.pois.relics.vents.map((r) => r.id));
  advanceMain(s, W, { type: 'talk', role: 'keeper', settlementId: 'volcanic' });
  assert.equal(s.quest.main, 'slagheart');
  s.quest.main = 'windcrest';
  s.progress.relics.push(...W.pois.relics.beacons.map((r) => r.id));
  advanceMain(s, W, { type: 'reach', id: 'windcrest' });
  assert.equal(s.quest.main, 'frostfang');
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

test('clearing the quest camp before meeting the scout does not strand the quest', () => {
  const s = newGameState('quests', 'rogue');
  s.quest.main = 'scout';
  s.progress.cleared.push(W.pois.camps.find((c) => c.quest).id);
  advanceMain(s, W, { type: 'cleared', quest: true });
  assert.equal(s.quest.main, 'scout');
  advanceMain(s, W, { type: 'talk', role: 'scout', settlementId: 'outpost' });
  assert.equal(s.quest.main, 'lookout');
  advanceMain(s, W, { type: 'reach', id: 'lookout' });
  assert.equal(s.quest.main, 'sigil');
});
