import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld, reachableFrom } from '../src/world/overworld.js';
import { T, D, BIOME, TILE_INFO } from '../src/world/tiles.js';
import { generateSideQuests } from '../src/game/quests.js';

const SEEDS = ['ember', 'alpha', 'beta', 'gamma', 1, 2, 3, 42, 'hearth', 'ward', 'spire', 'thorn'];
const worlds = new Map();
const get = (s) => { if (!worlds.has(s)) worlds.set(s, generateOverworld(s)); return worlds.get(s); };

test('generation is deterministic', () => {
  const a = generateOverworld('det'), b = generateOverworld('det');
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.deco, b.deco);
  assert.deepEqual(a.settlements.map((s) => s.name), b.settlements.map((s) => s.name));
});

for (const seed of SEEDS) {
  test(`seed ${seed}: border solid, biomes present, content placed`, () => {
    const W = get(seed);
    for (let x = 0; x < W.w; x++) {
      assert.ok(TILE_INFO[W.tiles[x]].solid);
      assert.ok(TILE_INFO[W.tiles[(W.h - 1) * W.w + x]].solid);
    }
    const seen = new Set(W.biome);
    for (const b of Object.values(BIOME)) assert.ok(seen.has(b), `biome ${b} missing`);
    assert.equal(W.settlements.length, 7);
    for (const s of W.settlements) {
      assert.ok(s.buildings.length >= 2, `${s.id} has ${s.buildings.length} buildings`);
      assert.ok(W.npcs.filter((n) => n.settlementId === s.id).length >= 3, `${s.id} npcs`);
    }
    assert.ok(W.pois.caves.length >= 6, `caves ${W.pois.caves.length}`);
    assert.ok(W.pois.camps.length >= 6, `camps ${W.pois.camps.length}`);
    assert.ok(W.pois.camps.some((c) => c.quest), 'quest camp');
    assert.equal(W.pois.gates.length, 2);
    assert.ok(W.pois.shrines.length >= 9);
  });

  test(`seed ${seed}: progression reachability respects gates`, () => {
    const W = get(seed);
    const start = W.pois.homeDoor;
    const reach = (tools, p) => reachableFrom(W, start, tools)[p.y * W.w + p.x] >= 0;
    const none = {}, bombs = { bombs: true }, all = { bombs: true, gloves: true };
    const open = (t) => ({ ...t, seals: true });
    const S = Object.fromEntries(W.settlements.map((s) => [s.id, s.center]));
    for (const id of ['home', 'outpost', 'swamp', 'desert', 'mountain']) assert.ok(reach(none, S[id]), `${id} unreachable`);
    // Each ward's door is sealed until its quest chain breaks the seal.
    assert.ok(!reach(all, W.pois.dungeons.verdant.front) || W.pois.seals.verdant.r === 0, 'verdant reachable through its seal');
    assert.ok(reach(open(none), W.pois.dungeons.verdant.front), 'verdant unreachable');
    assert.ok(reach(none, W.pois.seals.verdant.arena), 'thornwall unreachable');
    assert.ok(reach(none, W.pois.spire.front), 'spire unreachable');
    // Ashen region needs bombs, snow region needs gloves.
    assert.ok(!reach(none, S.volcanic), 'volcanic reachable without bombs');
    assert.ok(reach(bombs, S.volcanic), 'volcanic unreachable with bombs');
    assert.ok(reach(bombs, W.pois.seals.ashen.arena), 'firewall unreachable with bombs');
    assert.ok(reach(open(bombs), W.pois.dungeons.ashen.front), 'ashen unreachable with bombs');
    assert.ok(!reach(bombs, S.snow), 'snow reachable without gloves');
    assert.ok(reach(all, S.snow), 'snow unreachable with gloves');
    assert.ok(reach(all, W.pois.seals.frost.arena), 'ice wall unreachable');
    assert.ok(reach(open(all), W.pois.dungeons.frost.front), 'frost unreachable');
    // The Fane sits inside the Tidewall; the Tide Bells stand in flooded pools only the Rime Charm crosses.
    const charm = { ...all, charm: true };
    assert.ok(!reach(charm, W.pois.dungeons.drowned.front) || W.pois.seals.drowned.r === 0, 'drowned reachable through its seal');
    assert.ok(reach(open(charm), W.pois.dungeons.drowned.front), 'drowned unreachable');
    assert.ok(reach(all, W.pois.seals.drowned.arena), 'Tidewall unreachable');
    // Lookouts and bells are solid; you stand beside them.
    const beside = (p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
    const belfry = W.pois.lookouts.find((l) => l.id === 'belfry');
    assert.ok(belfry && beside(belfry).some((p) => reach(all, p)), 'belfry unreachable');
    assert.equal(W.pois.relics.bells.length, 3);
    for (const b of W.pois.relics.bells) {
      assert.ok(!beside(b).some((p) => reach(all, p)), `bell ${b.id} reachable without the charm`);
      assert.ok(beside(b).some((p) => reach(charm, p)), `bell ${b.id} unreachable with the charm`);
    }
    for (const c of W.pois.caves) assert.ok(reach(open(all), c.front), `cave ${c.id} unreachable`);
    for (const c of W.pois.camps) assert.ok(reach(open(all), c.entry), `camp ${c.id} unreachable`);
    // Nothing a pool could drown: caches, and the spawn points fetch quests leave their items on.
    for (const c of W.pois.caches) assert.ok(reach(open(all), c), `cache ${c.id} unreachable`);
    for (const q of generateSideQuests(W).filter((x) => x.type === 'fetch')) assert.ok(reach(open(all), q.target), `${q.id} fetch target unreachable`);
    const quest = W.pois.camps.find((c) => c.quest);
    assert.ok(reach(none, quest.entry), 'quest camp needs tools');
  });
}

test('each Tide Bell stands ringed by its pool, which the Rime Charm freezes into a path and back', async () => {
  const { TileMap } = await import('../src/world/tilemap.js');
  const { freezePool, thawPool } = await import('../src/world/wards.js');
  const W = generateOverworld('pools'), map = TileMap.fromWorld(W), all = { bombs: true, gloves: true };
  const reach = (p) => reachableFrom(W, W.pois.homeDoor, all)[p.y * W.w + p.x] >= 0;
  for (const b of W.pois.relics.bells) {
    assert.equal(map.getDeco(b.x, b.y), D.BELL);
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) assert.ok(b.pool.some((p) => p.x === b.x + dx && p.y === b.y + dy), `${b.id} ring has a gap`);
    assert.ok(b.pool.every((p) => Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y)) <= 2 && map.get(p.x, p.y) === T.FLOOD), `${b.id} pool`);
    assert.ok(!reach({ x: b.x, y: b.y + 1 }), `${b.id} open water is a path`);
    freezePool(W, map, b.id);
    assert.ok(b.pool.every((p) => map.get(p.x, p.y) === T.ICE), `${b.id} not frozen`);
    assert.ok(reach({ x: b.x, y: b.y + 1 }), `${b.id} frozen pool is no path`);
    thawPool(W, map, b.id);
    assert.ok(b.pool.every((p) => map.get(p.x, p.y) === T.FLOOD), `${b.id} not thawed`);
    assert.ok(!reach({ x: b.x, y: b.y + 1 }), `${b.id} thawed pool is still a path`);
  }
});

// World generation only, spread over worker threads: the cramped fens that need the fallbacks are rare.
test('every world gets three Tide Bells, out of reach without the charm and in reach from every side with it, drowning no cache or spawn point', async () => {
  const { Worker } = await import('node:worker_threads');
  const { cpus } = await import('node:os');
  const seeds = [...Array.from({ length: 250 }, (_, k) => `s${k}`), 's359', 's360', 's433', 's480', 's976', 's995'];
  const code = `const { parentPort, workerData } = require('node:worker_threads');
import(workerData.url).then(({ generateOverworld, reachableFrom }) => parentPort.postMessage(workerData.seeds.map((seed) => {
  const W = generateOverworld(seed), tools = { bombs: true, gloves: true, seals: true };
  const dry = reachableFrom(W, W.pois.homeDoor, tools), wet = reachableFrom(W, W.pois.homeDoor, { ...tools, charm: true });
  const sides = (b) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (b.y + dy) * W.w + b.x + dx);
  const flooded = new Set(W.pois.relics.bells.flatMap((b) => [b, ...b.pool]).map((p) => p.y * W.w + p.x));
  return [seed, W.pois.relics.bells.length, W.pois.relics.bells.every((b) => sides(b).every((i) => dry[i] < 0 && wet[i] >= 0)), [...W.pois.caches, ...W.pois.spawns].every((p) => !flooded.has(p.y * W.w + p.x))];
})));`;
  const n = Math.max(1, Math.min(8, cpus().length - 1));
  const url = new URL('../src/world/overworld.js', import.meta.url).href;
  const runs = Array.from({ length: n }, (_, w) => new Promise((resolve, reject) => {
    const worker = new Worker(code, { eval: true, workerData: { url, seeds: seeds.filter((_, k) => k % n === w) } });
    worker.once('message', resolve);
    worker.once('error', reject);
  }));
  const bad = (await Promise.all(runs)).flat().filter(([, count, reached, dry]) => count !== 3 || !reached || !dry);
  assert.deepEqual(bad, []);
});

test('gate tiles are cracked walls and boulders on ridges', () => {
  const W = get('ember');
  const types = W.pois.gates.map((g) => W.tiles[g.y * W.w + g.x]).sort();
  assert.deepEqual(types, [T.CRACKED, T.BOULDER].sort());
});

test('nothing worth visiting sits behind lava', async () => {
  const { T } = await import('../src/world/tiles.js');
  const { isPassable } = await import('../src/world/overworld.js');
  const { bfsDistances } = await import('../src/core/grid.js');
  for (const seed of ['quests', 'ember123', 'lava1', 'lava2', 'ash9']) {
    const W = generateOverworld(seed);
    const safe = (x, y) => isPassable(W, x, y, { bombs: true, gloves: true, seals: true }) && W.tiles[y * W.w + x] !== T.LAVA;
    const reach = bfsDistances(W.w, W.h, safe, [W.pois.home]);
    const near = (p) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[(p.y + dy) * W.w + p.x + dx] >= 0);
    for (const c of W.pois.caves) assert.ok(near(c.front), `${seed} cave ${c.id}`);
    for (const l of W.pois.lore) assert.ok(near(l), `${seed} stone ${l.id}`);
    for (const c of W.pois.camps) assert.ok(near(c.entry), `${seed} camp ${c.id}`);
  }
});

test('no two outdoor villagers start on the same tile', () => {
  for (const seed of ['hollow404', 'quests', 'ember9', 's1', 's2']) {
    const W = generateOverworld(seed);
    const seen = new Set();
    for (const n of W.npcs.filter((x) => x.x !== null)) {
      const k = `${n.x},${n.y}`;
      assert.ok(!seen.has(k), `${seed}: ${n.name} shares ${k}`);
      seen.add(k);
    }
  }
});
