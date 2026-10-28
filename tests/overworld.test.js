import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOverworld, reachableFrom } from '../src/world/overworld.js';
import { T, BIOME, TILE_INFO } from '../src/world/tiles.js';

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
    const S = Object.fromEntries(W.settlements.map((s) => [s.id, s.center]));
    for (const id of ['home', 'outpost', 'swamp', 'desert', 'mountain']) assert.ok(reach(none, S[id]), `${id} unreachable`);
    assert.ok(reach(none, W.pois.dungeons.verdant.front), 'verdant unreachable');
    assert.ok(reach(none, W.pois.dungeons.drowned.front), 'drowned unreachable');
    assert.ok(reach(none, W.pois.spire.front), 'spire unreachable');
    // Ashen region needs bombs, snow region needs gloves.
    assert.ok(!reach(none, S.volcanic), 'volcanic reachable without bombs');
    assert.ok(reach(bombs, S.volcanic), 'volcanic unreachable with bombs');
    assert.ok(reach(bombs, W.pois.dungeons.ashen.front), 'ashen unreachable with bombs');
    assert.ok(!reach(bombs, S.snow), 'snow reachable without gloves');
    assert.ok(reach(all, S.snow), 'snow unreachable with gloves');
    assert.ok(reach(all, W.pois.dungeons.frost.front), 'frost unreachable');
    for (const c of W.pois.caves) assert.ok(reach(all, c.front), `cave ${c.id} unreachable`);
    for (const c of W.pois.camps) assert.ok(reach(all, c.entry), `camp ${c.id} unreachable`);
    const quest = W.pois.camps.find((c) => c.quest);
    assert.ok(reach(none, quest.entry), 'quest camp needs tools');
  });
}

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
    const safe = (x, y) => isPassable(W, x, y, { bombs: true, gloves: true }) && W.tiles[y * W.w + x] !== T.LAVA;
    const reach = bfsDistances(W.w, W.h, safe, [W.pois.home]);
    const near = (p) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[(p.y + dy) * W.w + p.x + dx] >= 0);
    for (const c of W.pois.caves) assert.ok(near(c.front), `${seed} cave ${c.id}`);
    for (const l of W.pois.lore) assert.ok(near(l), `${seed} stone ${l.id}`);
    for (const c of W.pois.camps) assert.ok(near(c.entry), `${seed} camp ${c.id}`);
  }
});
