import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, solveDungeon, ROOM_W, ROOM_H, DOOR_TILES, DUNGEON_INFO } from '../src/world/dungeons.js';
import { T, TILE_INFO } from '../src/world/tiles.js';
import { bfsDistances } from '../src/core/grid.js';

const IDS = ['verdant', 'ashen', 'frost'];
const SEEDS = [1, 2, 3, 42, 'ember', 'wake', 'hearth', 9001];
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const STEP = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const PUZZLES = new Set(['timed', 'switches', 'ordered', 'push']);

const cache = new Map();
const get = (id, seed) => {
  const k = `${id}/${seed}`;
  if (!cache.has(k)) cache.set(k, generateDungeon(id, seed));
  return cache.get(k);
};

const at = (room, x, y) => room.tiles[y * ROOM_W + x];
const passable = (room, gateOpen) => (x, y) => {
  const t = at(room, x, y);
  if (t === T.GATE) return gateOpen;
  return !TILE_INFO[t].solid && t !== T.PIT && t !== T.HAZARD;
};
const distFrom = (room, gateOpen, sources) => bfsDistances(ROOM_W, ROOM_H, passable(room, gateOpen), sources);
const gapsOf = (room, dir) => DOOR_TILES[dir];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const allGaps = (room) => Object.keys(room.doors).flatMap((d) => DOOR_TILES[d]);
const shape = (d) => JSON.stringify(d.rooms.map((r) => ({ gx: r.gx, gy: r.gy, role: r.role, doors: r.doors, objects: r.objects })));

test('exports match the room contract', () => {
  assert.equal(ROOM_W, 24);
  assert.equal(ROOM_H, 15);
  assert.deepEqual(DOOR_TILES.w, [{ x: 0, y: 7 }]);
  assert.equal(DUNGEON_INFO.ashen.boss, 'cinder');
});

test('different seeds remix the layout', () => {
  assert.notEqual(shape(get('frost', 1)), shape(get('frost', 2)));
});

for (const id of IDS) {
  for (const seed of SEEDS) {
    const label = `${id}/${seed}`;

    test(`${label}: deterministic`, () => {
      const a = get(id, seed), b = generateDungeon(id, seed);
      assert.equal(shape(a), shape(b));
      a.rooms.forEach((r, i) => assert.deepEqual(r.tiles, b.rooms[i].tiles));
    });

    test(`${label}: roles, keys and key-BFS solvability`, () => {
      const d = get(id, seed);
      assert.equal(d.id, id);
      assert.equal(d.name, DUNGEON_INFO[id].name);
      assert.equal(d.biome, DUNGEON_INFO[id].biome);
      const roles = new Set(d.rooms.map((r) => r.role));
      for (const role of ['entrance', 'timed', 'key', 'boss', 'bossdoor']) assert.ok(roles.has(role), `missing ${role}`);
      assert.ok(roles.has('switches') || roles.has('ordered'), 'missing logic puzzle');
      if (id === 'frost') assert.ok(d.rooms.length >= 12, `frost has ${d.rooms.length} rooms`);

      const locked = new Set();
      for (const r of d.rooms) for (const door of Object.values(r.doors)) if (door.type === 'locked') locked.add(door.id);
      assert.equal(d.lockedCount, locked.size);
      assert.ok(d.lockedCount >= 1);
      assert.equal(d.keyCount, d.lockedCount);
      const keyChests = d.rooms.flatMap((r) => r.objects.filter((o) => o.type === 'chest' && o.contents === 'key'));
      assert.equal(keyChests.length, d.keyCount);

      const { reachable, bossReachable } = solveDungeon(d);
      assert.equal(reachable.size, d.rooms.length, 'every room reachable');
      assert.ok(bossReachable);

      const boss = d.rooms[d.bossId];
      assert.equal(boss.role, 'boss');
      assert.ok(boss.objects.some((o) => o.type === 'portal'), 'boss portal');
      assert.ok(boss.objects.some((o) => o.type === 'chest' && o.contents === 'shard'), 'shard chest');
      assert.ok(boss.objects.some((o) => o.type === 'boss' && o.kind === DUNGEON_INFO[id].boss));
      assert.equal(Object.values(boss.doors)[0].type, 'boss');
      assert.equal(d.rooms[d.entranceId].role, 'entrance');
    });

    test(`${label}: grid embedding and door symmetry`, () => {
      const d = get(id, seed);
      const cells = new Set(d.rooms.map((r) => `${r.gx},${r.gy}`));
      assert.equal(cells.size, d.rooms.length, 'no two rooms share a cell');
      assert.equal(Math.min(...d.rooms.map((r) => r.gx)), 0);
      assert.equal(Math.min(...d.rooms.map((r) => r.gy)), 0);
      const ent = d.rooms[d.entranceId];
      assert.deepEqual(ent.doors.s, { to: null, type: 'exit', id: 'exit' });
      for (const r of d.rooms) assert.ok(r.gy <= ent.gy, `room ${r.id} lies south of the entrance`);

      for (const r of d.rooms) {
        for (const [dir, door] of Object.entries(r.doors)) {
          assert.ok(['open', 'locked', 'sealed', 'boss', 'exit'].includes(door.type));
          if (door.to === null) { assert.equal(r.id, d.entranceId); continue; }
          const o = d.rooms[door.to];
          assert.equal(o.gx, r.gx + STEP[dir][0], `door ${door.id} direction`);
          assert.equal(o.gy, r.gy + STEP[dir][1], `door ${door.id} direction`);
          assert.deepEqual(o.doors[OPP[dir]], { to: r.id, type: door.type, id: door.id }, `door ${door.id} symmetric`);
        }
        if (PUZZLES.has(r.role)) {
          // every puzzle room seals (or is followed by a locked door to) at least one onward room
          assert.ok(Object.values(r.doors).some((dr) => dr.to > r.id && (dr.type === 'sealed' || dr.type === 'locked')));
        }
      }
    });

    test(`${label}: room tiles and objects`, () => {
      const d = get(id, seed);
      let treasures = 0;
      for (const r of d.rooms) {
        const where = `room ${r.id} (${r.role})`;
        assert.equal(r.tiles.length, ROOM_W * ROOM_H);
        const gaps = allGaps(r);
        // ring walls except door gaps
        for (let y = 0; y < ROOM_H; y++) {
          for (let x = 0; x < ROOM_W; x++) {
            if (x > 0 && y > 0 && x < ROOM_W - 1 && y < ROOM_H - 1) continue;
            const isGap = gaps.some((g) => g.x === x && g.y === y);
            assert.equal(at(r, x, y), isGap ? T.DFLOOR : T.DWALL, `${where} edge ${x},${y}`);
          }
        }
        // every door gap and object tile mutually reachable (gates count as open)
        const pts = [...gaps, ...r.objects];
        const dist = distFrom(r, true, [pts[0]]);
        for (const p of pts) {
          assert.ok(p.x > 0 && p.y > 0 && p.x < ROOM_W - 1 && p.y < ROOM_H - 1 || gaps.includes(p), `${where} object inside`);
          assert.ok(dist[p.y * ROOM_W + p.x] >= 0, `${where}: ${p.type ?? 'door'} at ${p.x},${p.y} unreachable`);
        }
        // nothing but floor right around door gaps
        for (const g of gaps) {
          for (let y = 1; y < ROOM_H - 1; y++) {
            for (let x = 1; x < ROOM_W - 1; x++) {
              if (cheb(g, { x, y }) <= 3 && r.role !== 'timed') assert.equal(at(r, x, y), T.DFLOOR, `${where} obstacle near door`);
            }
          }
        }

        const enemies = r.objects.filter((o) => o.type === 'enemy');
        if (r.role === 'combat') assert.ok(enemies.length >= 3 && enemies.length <= 5, `${where} has ${enemies.length} enemies`);
        else if (r.role === 'key') assert.ok(enemies.length >= 2 && enemies.length <= 3, `${where} has ${enemies.length} enemies`);
        else assert.equal(enemies.length, 0);
        if (enemies.length) assert.ok(new Set(enemies.map((e) => e.archetype)).size >= 2, `${where} enemy mix`);
        for (const e of enemies) {
          assert.ok(['brute', 'lunger', 'skirmisher', 'ranged'].includes(e.archetype));
          assert.ok(gaps.every((g) => cheb(g, e) >= 4), `${where} enemy too close to a door`);
        }
        assert.equal(r.clearToOpen, enemies.length > 0 || r.role === 'boss');
        assert.ok(r.objects.filter((o) => o.type === 'torch').length >= 2, `${where} torches`);
        const occupied = r.objects.map((o) => `${o.x},${o.y}`);
        assert.equal(new Set(occupied).size, occupied.length, `${where} overlapping objects`);

        const chests = r.objects.filter((o) => o.type === 'chest');
        if (r.role === 'key') assert.deepEqual(chests.map((c) => c.contents), ['key']);
        if (r.role === 'treasure') {
          assert.equal(chests.length, 1);
          if (treasures++ === 0) assert.equal(chests[0].contents, 'map');
          else assert.ok(['heart', 'coins'].includes(chests[0].contents));
        }
        if (r.role === 'boss') {
          for (let y = 2; y < ROOM_H - 2; y++) for (let x = 2; x < ROOM_W - 2; x++) assert.equal(at(r, x, y), T.DFLOOR, `${where} interior clear`);
        }
        if (r.role === 'entrance') assert.ok(r.objects.some((o) => o.type === 'plaque' && o.x === 12 && o.y === 3 && o.text.includes(d.name)));
        if (r.role === 'bossdoor') assert.ok(r.objects.some((o) => o.type === 'fountain'));
      }
    });

    test(`${label}: puzzles are well formed`, () => {
      const d = get(id, seed);
      for (const r of d.rooms) {
        const where = `room ${r.id} (${r.role})`;
        if (!PUZZLES.has(r.role)) { assert.equal(r.puzzle, null); continue; }
        assert.equal(r.puzzle.kind, r.role);
        if (r.role === 'timed') checkTimed(r, where);
        if (r.role === 'switches') {
          const plates = r.objects.filter((o) => o.type === 'plate');
          assert.equal(plates.length, 4);
          assert.equal(new Set(plates.map((p) => p.y)).size, 1, 'plates in a row');
          assert.deepEqual(plates.map((p) => p.index), [0, 1, 2, 3]);
          assert.deepEqual(r.puzzle.links, [[0, 1], [0, 1, 2], [1, 2, 3], [2, 3]]);
          assert.equal(r.puzzle.initial.length, 4);
          assert.ok(!r.puzzle.initial.every(Boolean), 'not already solved');
        }
        if (r.role === 'ordered') {
          const crystals = r.objects.filter((o) => o.type === 'crystal');
          assert.ok(crystals.length >= 3 && crystals.length <= 4);
          assert.equal(r.puzzle.count, crystals.length);
          assert.deepEqual(crystals.map((c) => c.order).sort(), crystals.map((_, i) => i + 1));
          assert.ok(r.objects.some((o) => o.type === 'plaque'));
        }
        if (r.role === 'push') {
          const block = r.objects.find((o) => o.type === 'block'), target = r.objects.find((o) => o.type === 'blockTarget');
          assert.ok(block && target);
          const dx = Math.sign(target.x - block.x), dy = Math.sign(target.y - block.y);
          assert.ok(dx === 0 || dy === 0, 'block and target share a row or column');
          const span = Math.abs(target.x - block.x) + Math.abs(target.y - block.y);
          assert.ok(span >= 3 && span <= 5, `push distance ${span}`);
          for (let i = -1; i <= span; i++) assert.equal(at(r, block.x + dx * i, block.y + dy * i), T.DFLOOR, 'push lane open');
        }
      }
    });
  }
}

// With the gate closed, the exit door (sealed or locked) is cut off from the switch and every other door;
// the switch sits 12–18 walking tiles from the gate and the duration follows from that distance.
function checkTimed(r, where) {
  const { gate, duration } = r.puzzle;
  assert.ok(gate.length > 0, `${where} gate`);
  for (const g of gate) assert.equal(at(r, g.x, g.y), T.GATE);
  const xs = new Set(gate.map((g) => g.x)), ys = new Set(gate.map((g) => g.y));
  assert.ok((xs.size === 1 && gate.length === ROOM_H - 2) || (ys.size === 1 && gate.length === ROOM_W - 2), 'gate spans wall to wall');

  const sw = r.objects.find((o) => o.type === 'timedSwitch');
  assert.ok(sw, `${where} switch`);
  const closed = distFrom(r, false, [sw]);
  const cut = Object.keys(r.doors).filter((dir) => gapsOf(r, dir).some((g) => closed[g.y * ROOM_W + g.x] < 0));
  assert.equal(cut.length, 1, `${where}: exactly one door behind the gate (got ${cut})`);
  assert.ok(['sealed', 'locked'].includes(r.doors[cut[0]].type), `${where} exit door type`);
  assert.ok(r.doors[cut[0]].to > r.id, `${where} exit leads onward`);
  for (const dir of Object.keys(r.doors)) {
    if (dir === cut[0]) continue;
    for (const g of gapsOf(r, dir)) assert.ok(closed[g.y * ROOM_W + g.x] >= 0, `${where} door ${dir} reachable from switch`);
  }

  const fromGate = distFrom(r, false, gate)[sw.y * ROOM_W + sw.x];
  assert.ok(fromGate >= 12 && fromGate <= 18, `${where} switch distance ${fromGate}`);
  assert.ok(Math.abs(duration - (fromGate * 16 / 100 + 0.5)) < 0.01, `${where} duration ${duration}`);
}

test('every dungeon can be walked to its warden under the runtime door rules', async () => {
  const { makeApp } = await import('../tools/headless.mjs');
  const { GameScene } = await import('../src/scenes/game.js');
  const { newGameState } = await import('../src/game/state.js');
  const app = await makeApp();
  for (const seed of ['d1', 'ember123', 'fen77', 'quests', 'zz9']) {
    const game = new GameScene(app, newGameState(seed, 'swordsman'));
    for (const id of ['verdant', 'ashen', 'frost']) {
      game.enterDungeon(id);
      const a = game.area, pr = game.state.progress;
      // Explore like a player: rooms you stand in get their puzzle solved and chests looted,
      // locked doors take a key, sealed doors open only once their puzzle is solved.
      const seen = new Set([a.dungeon.entranceId]);
      for (let changed = true; changed;) {
        changed = false;
        for (const rid of [...seen]) {
          const room = a.byId.get(rid);
          if (room.puzzle && !pr.solved.includes(`${id}:${rid}`)) { pr.solved.push(`${id}:${rid}`); changed = true; }
          for (const o of room.objects) if (o.type === 'chest' && o.contents === 'key' && !pr.opened.includes(`d:${id}:${rid}:chest`)) { pr.opened.push(`d:${id}:${rid}:chest`); pr.keys[id] = (pr.keys[id] || 0) + 1; changed = true; }
          for (const door of Object.values(room.doors)) {
            if (door.to === null || seen.has(door.to) || a.isDoorSealed(door)) continue;
            if (door.type === 'locked' && !pr.unlocked.includes(`${id}:${door.id}`)) {
              if (!pr.keys[id]) continue;
              pr.keys[id]--; pr.unlocked.push(`${id}:${door.id}`);
            }
            seen.add(door.to); changed = true;
          }
        }
      }
      assert.ok(seen.has(a.dungeon.bossId), `${seed}/${id}`);
    }
  }
});
