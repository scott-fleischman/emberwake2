import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld } from '../src/world/overworld.js';
import { newGameState } from '../src/game/state.js';
import { advanceMain, mainObjective, generateSideQuests, recordKill, grantReward, MAIN_STAGES } from '../src/game/quests.js';
import { serialize, deserialize } from '../src/game/state.js';
import { T, TILE } from '../src/world/tiles.js';
import { sandbox, botDo } from './helpers/sandbox.js';

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
  assert.deepEqual(ev({ type: 'boss', kind: 'rime' }).notes, ['Received the Rime Charm!']);
  assert.ok(s.artifacts.includes('charm'));
  assert.equal(ev({ type: 'talk', role: 'keeper', settlementId: 'swamp' }).advanced, false);
  assert.equal(ev({ type: 'talk', role: 'elder', settlementId: 'home' }).stage, 'fenkeep');
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

test('the fourth ward chain runs from the Hearth to the kindling', () => {
  const W = generateOverworld('quests'), s = newGameState('quests', 'swordsman');
  s.quest.main = 'sanctuary';
  advanceMain(s, W, { type: 'boss', kind: 'rime' }); assert.equal(s.quest.main, 'hearth'); assert.ok(s.tools.charm);
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' }); assert.equal(s.quest.main, 'fenkeep');
  advanceMain(s, W, { type: 'talk', role: 'keeper', settlementId: 'swamp' }); assert.equal(s.quest.main, 'belfry');
  advanceMain(s, W, { type: 'reach', id: 'belfry' }); assert.equal(s.quest.main, 'bells');
  for (const b of W.pois.relics.bells) { s.progress.relics.push(b.id); advanceMain(s, W, { type: 'relic', id: b.id }); }
  assert.equal(s.quest.main, 'bogking');
  s.progress.seals.push('drowned'); advanceMain(s, W, { type: 'elite', id: 'bogking' }); assert.equal(s.quest.main, 'fane');
  advanceMain(s, W, { type: 'boss', kind: 'tide' }); assert.equal(s.quest.main, 'kindle');
  advanceMain(s, W, { type: 'boss', kind: 'vesper' }); assert.equal(s.quest.main, 'kindle', 'not before the kindling');
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' }); assert.equal(s.quest.main, 'spire');
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' }); assert.equal(s.quest.main, 'spire', 'only Vesper ends it');
  advanceMain(s, W, { type: 'boss', kind: 'tide' }); assert.equal(s.quest.main, 'spire');
  advanceMain(s, W, { type: 'boss', kind: 'vesper' }); assert.equal(s.quest.main, 'end');
  assert.deepEqual(MAIN_STAGES.slice(-3), ['kindle', 'spire', 'end']);
});

// The game closed during Vesper's fall scene: he is beaten and saved so, but the quest event never fired.
test('a Vesper already beaten still ends the quest', () => {
  const W = generateOverworld('quests'), s = newGameState('quests', 'swordsman');
  s.quest.main = 'spire';
  assert.equal(advanceMain(s, W, { type: 'load' }).stage, 'spire', 'not before he falls');
  s.progress.bosses.push('spire');
  assert.equal(advanceMain(s, W, { type: 'load' }).stage, 'end');
});

test('bells rung before anyone asks still count', () => {
  const W = generateOverworld('quests'), s = newGameState('quests', 'swordsman');
  s.quest.main = 'hearth';
  for (const b of W.pois.relics.bells) s.progress.relics.push(b.id);
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' });
  advanceMain(s, W, { type: 'talk', role: 'keeper', settlementId: 'swamp' });
  advanceMain(s, W, { type: 'reach', id: 'belfry' });
  assert.equal(s.quest.main, 'bogking');
});

test('fourth ward state survives save and load', async () => {
  const { GameScene } = await import('../src/scenes/game.js');
  const s = await sandbox(), g = s.game, W = g.world, bell = W.pois.relics.bells[0];
  g.exitToOverworld(W.pois.homeDoor.x, W.pois.homeDoor.y + 1, true);
  g.freezePool(bell.id); g.state.progress.rung.push(bell.id);
  g.state.progress.seals.push('drowned'); g.state.progress.tides['drowned:3'] = 'b';
  const g2 = new GameScene(s.app, deserialize(serialize(g.state))); g2.exitToOverworld(W.pois.homeDoor.x, W.pois.homeDoor.y + 1, true);
  assert.equal(g2.area.map.get(bell.pool[0].x, bell.pool[0].y), T.ICE);
  const t = W.pois.seals.drowned.tiles[0]; assert.notEqual(g2.area.map.get(t.x, t.y), T.SEAL);
  assert.deepEqual(g2.state.progress.rung, [bell.id]); assert.equal(g2.state.progress.tides['drowned:3'], 'b');
});

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FACING = (dx, dy) => (dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down');
// Stand on tile t, face (dx, dy) and press interact.
const useFrom = (g, t, dx, dy) => { g.uiStack.length = 0; g.placePlayer(t.x * TILE + 8, t.y * TILE + 8, FACING(dx, dy)); return g.area.interact(); };

test('the Rime Charm freezes a pool from its edge, and a bell rings only from the tile in front of it', async () => {
  const s = await sandbox(), g = s.game, W = g.world, pr = g.state.progress, bell = W.pois.relics.bells[0];
  g.state.quest.main = 'bells';
  g.exitToOverworld(W.pois.homeDoor.x, W.pois.homeDoor.y + 1, true);
  const map = g.area.map;
  let edge = null;
  for (const p of bell.pool) for (const [dx, dy] of N4) if (!edge && !map.isSolid(p.x - dx, p.y - dy)) edge = { x: p.x - dx, y: p.y - dy, dx, dy };
  useFrom(g, edge, edge.dx, edge.dy);
  assert.equal(map.get(edge.x + edge.dx, edge.y + edge.dy), T.FLOOD, 'no charm, no ice');
  assert.equal(g.uiStack.length, 1, 'the pool is described');
  g.state.tools.charm = true;
  useFrom(g, edge, edge.dx, edge.dy);
  assert.ok(bell.pool.every((p) => map.get(p.x, p.y) === T.ICE));
  assert.deepEqual(pr.frozen, [bell.id]);
  // From a diagonal the bell is never in front: a bell rings from its own row or column only.
  const diag = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ x: bell.x + dx, y: bell.y + dy, dy: -dy })).find((t) => !map.isSolid(t.x, t.y));
  useFrom(g, diag, 0, diag.dy);
  assert.deepEqual(pr.rung, []);
  useFrom(g, { x: bell.x, y: bell.y + 1 }, 0, -1);
  assert.deepEqual(pr.rung, [bell.id]);
  assert.ok(pr.relics.includes(bell.id));
  useFrom(g, { x: bell.x, y: bell.y + 1 }, 0, -1);
  assert.deepEqual(pr.rung, [bell.id], 'a bell rings once');
});

test('the bot freezes a pool from its edge and rings the bell from the ice', async () => {
  const s = await sandbox(), g = s.game, W = g.world, bell = W.pois.relics.bells[0];
  g.state.tools.charm = true;
  g.exitToOverworld(W.pois.homeDoor.x, W.pois.homeDoor.y + 1, true);
  const map = g.area.map;
  let edge = null;
  for (const p of bell.pool) for (const [dx, dy] of N4) if (!edge && !map.isSolid(p.x - dx, p.y - dy)) edge = { x: p.x - dx - dx, y: p.y - dy - dy };
  g.placePlayer(edge.x * TILE + 8, edge.y * TILE + 8);
  const r = botDo(s, (bot) => (function* () { yield* bot.freezePoolAt(bell); yield* bot.useTile({ x: bell.x, y: bell.y }); })(), { maxSeconds: 60 });
  assert.ok(r.done, r.status);
  assert.deepEqual(g.state.progress.frozen, [bell.id]);
  assert.deepEqual(g.state.progress.rung, [bell.id]);
});

test('Bogmaw surfaces at the Tidewall once the bells ring, and his fall drains it', async () => {
  const s = await sandbox(), g = s.game, W = g.world, seal = W.pois.seals.drowned;
  g.state.quest.main = 'bogking';
  g.exitToOverworld(seal.arena.x, seal.arena.y, true);
  g.area.updateGroups();
  const bog = g.area.enemyList.find((e) => e.eliteId === 'bogking');
  assert.ok(bog, 'Bogmaw surfaces');
  assert.equal(bog.archetype, 'ranged');
  assert.equal(bog.biome, 1);
  bog.damage(999, g.player, g.area.ctx, {});
  for (let t = 0; t < 40 && g.state.quest.main === 'bogking'; t += 1 / 60) { g.state.player.hp = 99; s.step(1 / 60); }
  assert.equal(g.state.quest.main, 'fane');
  assert.ok(seal.tiles.every((q) => g.area.map.get(q.x, q.y) !== T.SEAL));
});

test('the elder rekindles the Hearth with three shards and opens the Spire with four', async () => {
  const s = await sandbox(), g = s.game;
  const scene = () => g.uiStack.at(-1).shots.map((sh) => sh.art);
  g.state.quest.main = 'hearth';
  g.questEvent({ type: 'talk', role: 'elder', settlementId: 'home' });
  assert.ok(scene().includes('sockets3') && !scene().includes('titlecard'));
  g.uiStack.length = 0;
  g.state.quest.main = 'kindle';
  g.questEvent({ type: 'talk', role: 'elder', settlementId: 'home' });
  assert.ok(scene().includes('sockets4') && scene().includes('spireopen'));
  assert.equal(g.state.quest.main, 'spire');
  assert.ok(!g.uiStack.some((ui) => ui.title === 'The Ember Rekindled'), 'the ending waits for Vesper');
});
