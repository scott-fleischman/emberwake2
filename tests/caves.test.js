import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCave } from '../src/world/caves.js';
import { T, TILE_INFO, BIOME } from '../src/world/tiles.js';
import { bfsDistances, components } from '../src/core/grid.js';

const SEEDS = [1, 2, 3, 7, 42, 'ember', 'moss', 'flint', 'hollow', 9001];
const BIOMES = Object.values(BIOME);
const FLAVOR = { [BIOME.SWAMP]: T.DWATER, [BIOME.SNOW]: T.DWATER, [BIOME.VOLCANIC]: T.HAZARD };

const walkable = (t) => !TILE_INFO[t].solid && t !== T.HAZARD;

test('cave generation is deterministic', () => {
  for (const biome of BIOMES) assert.deepEqual(generateCave('c', 'det', biome), generateCave('c', 'det', biome));
  assert.notDeepEqual(generateCave('c', 1, 0).tiles, generateCave('c', 2, 0).tiles);
});

for (const biome of BIOMES) {
  for (const seed of SEEDS) {
    test(`biome ${biome} seed ${seed}: one connected cave with everything reachable`, () => {
      const c = generateCave(`cave-${seed}`, seed, biome);
      const { w, h, tiles } = c;
      assert.equal(w, 48);
      assert.equal(h, 36);
      assert.equal(c.biome, biome);
      const at = (p) => tiles[p.y * w + p.x];

      // only expected tiles; 2-tile solid border apart from the exit
      const allowed = new Set([T.CFLOOR, T.CWALL, T.EXIT, ...(FLAVOR[biome] !== undefined ? [FLAVOR[biome]] : [])]);
      let floor = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = tiles[y * w + x];
          assert.ok(allowed.has(t), `unexpected tile ${t} at ${x},${y}`);
          if (t === T.CFLOOR) floor++;
          const border = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
          if (border && !(x === c.exit.x && y === c.exit.y)) assert.equal(t, T.CWALL, `border ${x},${y}`);
        }
      }
      assert.ok(floor >= 300, `floor ${floor}`);

      const { sizes } = components(w, h, (x, y) => walkable(tiles[y * w + x]));
      assert.equal(sizes.length, 1, `walkable regions: ${sizes}`);

      assert.equal(at(c.exit), T.EXIT);
      assert.ok(c.exit.y >= h - 3, 'exit at the bottom');
      assert.deepEqual(c.entrance, { x: c.exit.x, y: c.exit.y - 1 });

      const dist = bfsDistances(w, h, (x, y) => walkable(tiles[y * w + x]), [c.entrance]);
      const D = (p) => dist[p.y * w + p.x];
      const points = [c.exit, c.entrance, c.chest, c.lostSpot, ...c.enemies, ...c.supplies, ...c.torches];
      for (const p of points) {
        assert.ok(D(p) >= 0, `unreachable point ${JSON.stringify(p)}`);
        assert.ok(walkable(at(p)));
      }
      const keys = points.map((p) => `${p.x},${p.y}`);
      assert.equal(new Set(keys).size, keys.length, 'points do not overlap');

      assert.ok(D(c.chest) >= 15, `chest distance ${D(c.chest)}`);
      assert.ok(['sword', 'bow', 'tome', 'shield', 'quiver', 'heart', 'coins'].includes(c.chest.contents));
      assert.ok(c.enemies.length >= 4 && c.enemies.length <= 7, `enemies ${c.enemies.length}`);
      for (const e of c.enemies) {
        assert.ok(Math.hypot(e.x - c.entrance.x, e.y - c.entrance.y) >= 8 && D(e) >= 8, 'enemy too close to entrance');
        assert.ok(['brute', 'lunger', 'skirmisher', 'ranged'].includes(e.archetype));
      }
      assert.ok(c.supplies.length >= 3 && c.supplies.length <= 5);
      for (const s of c.supplies) assert.ok(['coins', 'food', 'arrows', 'mana'].includes(s.kind));
      assert.ok(D(c.lostSpot) >= 12, 'lost spot far enough');

      const nearWall = (p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[(p.y + dy) * w + p.x + dx] === T.CWALL);
      for (const t of c.torches) assert.ok(nearWall(t), 'torch against a wall');
      const byExit = c.torches.filter((t) => Math.max(Math.abs(t.x - c.exit.x), Math.abs(t.y - c.exit.y)) === 1);
      assert.ok(byExit.length >= 2, 'two torches beside the exit');
    });
  }
}
