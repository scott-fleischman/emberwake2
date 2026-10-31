import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, solveDungeon, ROOM_W, ROOM_H, DOOR_TILES, DUNGEON_INFO, ECHO } from '../src/world/dungeons.js';
import { T, TILE_INFO } from '../src/world/tiles.js';
import { bfsDistances } from '../src/core/grid.js';
import { tideSolvable, traceBeam, tourLength } from '../src/world/puzzles.js';
import { enemyStats } from '../src/data/enemies.js';
import { AudioEngine, SFX_NAMES } from '../src/audio/audio.js';
import { rectSolid } from '../src/game/physics.js';
import { Projectile } from '../src/game/entities.js';
import { serialize, deserialize } from '../src/game/state.js';
import { THEMES as PALETTES } from '../src/gfx/palette.js';
import { sandbox, botDo, recorder } from './helpers/sandbox.js';
import { Bot } from '../src/bot/bot.js';

const IDS = ['verdant', 'ashen', 'frost', 'drowned', 'spire'];
const WINGS = ['verdant', 'ashen', 'frost', 'drowned'];
const SEEDS = [1, 2, 3, 42, 'ember', 'wake', 'hearth', 9001];
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const STEP = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const PUZZLES = new Set(['timed', 'switches', 'ordered', 'push', 'tide', 'beam', 'carry']);

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
const key = (c) => `${c.x},${c.y}`;
// The Spire's descent: the main-path rooms past the inner door. Door ids run parent-child, and the main
// path takes the lowest ids, up to the boss.
const descentOf = (d) => {
  const inner = d.rooms.flatMap((r) => Object.values(r.doors)).find((x) => x.type === 'inner');
  if (!inner) return new Set();
  const below = Number(inner.id.split('-')[1]);
  return new Set(d.rooms.filter((r) => r.id >= below && r.id <= d.bossId).map((r) => r.id));
};

test('exports match the room contract', () => {
  assert.equal(ROOM_W, 24);
  assert.equal(ROOM_H, 15);
  assert.deepEqual(DOOR_TILES.w, [{ x: 0, y: 7 }]);
  assert.equal(DUNGEON_INFO.ashen.boss, 'cinder');
});

test('different seeds remix the layout', () => {
  assert.notEqual(shape(get('frost', 1)), shape(get('frost', 2)));
});

// 's0' is a Spire the random walk can't place: it takes the fixed layout.
for (const id of IDS) {
  for (const seed of id === 'spire' ? [...SEEDS, 's0'] : SEEDS) {
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
      assert.equal(boss.objects.some((o) => o.type === 'chest' && o.contents === 'shard'), id !== 'spire', 'a shard chest for each ward, none for Vesper');
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
          assert.ok(['open', 'locked', 'sealed', 'boss', 'exit', 'inner'].includes(door.type));
          if (door.to === null) { assert.equal(r.id, d.entranceId); continue; }
          const o = d.rooms[door.to];
          assert.equal(o.gx, r.gx + STEP[dir][0], `door ${door.id} direction`);
          assert.equal(o.gy, r.gy + STEP[dir][1], `door ${door.id} direction`);
          assert.deepEqual(o.doors[OPP[dir]], { to: r.id, type: door.type, id: door.id }, `door ${door.id} symmetric`);
        }
        if (PUZZLES.has(r.role) && r.role !== 'tide') {
          // every puzzle room seals (or is followed by a locked door to) at least one onward room; a
          // tide room's water is its gate
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
        if (r.role === 'combat' && descentOf(d).has(r.id)) {
          // The descent's fights: 6–7 Gloam kin from all four wards, and one champion brute.
          assert.ok(enemies.length >= 7 && enemies.length <= 8, `${where} has ${enemies.length} enemies`);
          assert.deepEqual(enemies.filter((e) => e.champion).map((e) => e.archetype), ['brute'], `${where} champion`);
          assert.deepEqual(new Set(enemies.map((e) => e.ward)), new Set(WINGS), `${where} wards`);
        } else if (r.role === 'combat') assert.ok(enemies.length >= 3 && enemies.length <= 5, `${where} has ${enemies.length} enemies`);
        else if (r.role === 'key') assert.ok(enemies.length >= 2 && enemies.length <= 3, `${where} has ${enemies.length} enemies`);
        else assert.equal(enemies.length, 0);
        if (enemies.length) assert.ok(new Set(enemies.map((e) => e.archetype)).size >= 2, `${where} enemy mix`);
        for (const e of enemies) {
          assert.ok(['brute', 'lunger', 'skirmisher', 'ranged'].includes(e.archetype));
          assert.ok(gaps.every((g) => cheb(g, e) >= 4), `${where} enemy too close to a door`);
        }
        assert.equal(r.clearToOpen, enemies.length > 0 || r.role === 'boss' || r.role === 'echo');
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
        if (r.role === 'tide') checkTide(r, where);
        if (r.role === 'beam') checkBeam(r, where);
        if (r.role === 'carry') checkCarry(r, where);
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

// The doors a tide room joins: the way in (from its parent) and the way on (to the next room).
const entryOf = (r) => Object.keys(r.doors).find((d) => r.doors[d].to < r.id);
const onwardOf = (r) => Object.keys(r.doors).filter((d) => r.doors[d].to > r.id).sort((x, y) => r.doors[x].to - r.doors[y].to)[0];

// Two disjoint sets of tide tiles, both dry in the stored tiles, and a lever on each shore and the
// island. Under either tide alone the far door can't be reached: crossing takes a lever.
function checkTide(r, where) {
  const { a, b, levers, start } = r.puzzle;
  assert.equal(start, 'a');
  assert.ok(a.length && b.length, `${where} tide tiles`);
  const key = (c) => `${c.x},${c.y}`, inA = new Set(a.map(key)), inB = new Set(b.map(key));
  assert.ok(b.every((c) => !inA.has(key(c))), `${where} A and B overlap`);
  for (const c of [...a, ...b]) assert.equal(at(r, c.x, c.y), T.DFLOOR, `${where} tide tile ${key(c)} stored dry`);
  assert.equal(levers.length, 3);
  assert.deepEqual(levers.map(key).sort(), r.objects.filter((o) => o.type === 'lever').map(key).sort());
  const lever = new Set(levers.map(key)), dry = passable(r, false);
  for (const tide of ['a', 'b']) {
    const wet = tide === 'a' ? inB : inA;
    const d = bfsDistances(ROOM_W, ROOM_H, (x, y) => !wet.has(`${x},${y}`) && !lever.has(`${x},${y}`) && dry(x, y), DOOR_TILES[entryOf(r)]);
    assert.ok(DOOR_TILES[onwardOf(r)].every((g) => d[g.y * ROOM_W + g.x] < 0), `${where} crossable at tide ${tide} without a lever`);
  }
  // Nor is anyone shut in: back in at the way in at tide b (progress keeps the tide), or in from the
  // way on at either tide, there's still a way across.
  assert.ok(tideSolvable(r, { start: 'b' }), `${where} entry at tide b`);
  for (const start of ['a', 'b']) assert.ok(tideSolvable(r, { start, back: true }), `${where} exit at tide ${start}`);
}

// The ember beam: dark at the start, on the receiver once every mirror shows its solution. The solved
// beam runs 2–4 straight legs, turning only at mirrors, and 1–2 decoy mirrors stand off it.
function checkBeam(r, where) {
  const { source, receiver, mirrors } = r.puzzle;
  assert.ok(['n', 's', 'e', 'w'].includes(source.dir), `${where} source dir`);
  for (const m of mirrors) for (const v of [m.state, m.solution]) assert.ok(v === '/' || v === '\\', `${where} mirror ${v}`);
  const start = traceBeam(r, mirrors.map((m) => m.state)), solved = traceBeam(r, mirrors.map((m) => m.solution));
  assert.ok(!start.hit && solved.hit, `${where} beam`);
  const lit = new Set(solved.cells.map(key)), path = mirrors.filter((m) => lit.has(key(m)));
  assert.ok(path.length >= 1 && path.length <= 3, `${where}: ${path.length + 1} legs`);
  assert.ok(mirrors.length - path.length >= 1 && mirrors.length - path.length <= 2, `${where} decoys`);
  assert.ok(path.some((m) => m.state !== m.solution), `${where} scrambled`);
  const objs = (type) => r.objects.filter((o) => o.type === type).map(key).sort();
  assert.deepEqual(objs('mirror'), mirrors.map(key).sort());
  assert.deepEqual(objs('beamSource'), [key(source)]);
  assert.deepEqual(objs('receiver'), [key(receiver)]);
  checkRoomy(r, [source, receiver, ...mirrors], where);
}

// The ember carry: a source, 3–5 dark braziers and enough flame for the nearest-neighbour tour.
function checkCarry(r, where) {
  const { source, braziers, burn } = r.puzzle;
  assert.ok(braziers.length >= 3 && braziers.length <= 5, `${where} braziers`);
  assert.equal(burn, Math.round((tourLength(r, source, braziers) * 16 / 100 + 1) * 100) / 100, `${where} burn`);
  const objs = r.objects.filter((o) => o.type === 'brazier');
  assert.deepEqual(objs.filter((o) => o.source).map(key), [key(source)]);
  assert.deepEqual(objs.filter((o) => !o.source).map(key).sort(), braziers.map(key).sort());
  checkRoomy(r, [source, ...braziers], where);
}

// Puzzle objects are solid: they keep off the wall ring and out of doorways, every door still reaches
// every other with them (and the plaque) in the way, and each can be stood beside.
function checkRoomy(r, list, where) {
  const solid = new Set(r.objects.filter((o) => o.type !== 'torch').map((o) => o.y * ROOM_W + o.x)), open = passable(r, true);
  const d = bfsDistances(ROOM_W, ROOM_H, (x, y) => !solid.has(y * ROOM_W + x) && open(x, y), [allGaps(r)[0]]);
  for (const g of allGaps(r)) assert.ok(d[g.y * ROOM_W + g.x] >= 0, `${where}: door at ${key(g)} cut off`);
  for (const o of list) {
    assert.ok(o.x >= 2 && o.y >= 2 && o.x <= ROOM_W - 3 && o.y <= ROOM_H - 3, `${where}: ${key(o)} on the wall ring`);
    assert.ok(allGaps(r).every((g) => cheb(g, o) >= 3), `${where}: ${key(o)} in a doorway`);
    assert.ok(Object.values(STEP).some(([dx, dy]) => d[(o.y + dy) * ROOM_W + o.x + dx] >= 0), `${where}: nowhere to stand by ${key(o)}`);
  }
}

test('beam rooms solve with their solution and are scrambled at start', () => {
  for (const seed of SEEDS) for (const r of get('spire', seed).rooms.filter((r) => r.puzzle?.kind === 'beam')) {
    const pz = r.puzzle;
    assert.ok(!traceBeam(r, pz.mirrors.map((m) => m.state)).hit, `${seed}/${r.id} starts solved`);
    assert.ok(traceBeam(r, pz.mirrors.map((m) => m.solution)).hit, `${seed}/${r.id} unsolvable`);
  }
});
test('carry rooms give enough flame for the tour', () => {
  for (const seed of SEEDS) for (const r of get('spire', seed).rooms.filter((r) => r.puzzle?.kind === 'carry')) {
    const { source, braziers, burn } = r.puzzle;
    assert.ok(braziers.length >= 3 && braziers.length <= 5);
    assert.ok(burn >= tourLength(r, source, braziers) * 16 / 100 + 0.99);   // export tourLength from src/world/puzzles.js
  }
});
test('the bot solves beam and carry rooms', async () => {
  for (const kind of ['beam', 'carry']) {
    const s = await sandbox({ seed: kind }); s.game.enterDungeon('spire');
    const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === kind); a.enterRoom(room.id, 's');
    const r = botDo(s, (bot) => bot.solvePuzzle(), { maxSeconds: 90 });
    assert.ok(r.done && s.game.state.progress.solved.includes(`spire:${room.id}`), `${kind}: ${r.status}`);
  }
});
test('a roll puts out the carried flame', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'carry'); a.enterRoom(room.id, 's');
  const p = s.game.player; p.flame = room.puzzle.burn;
  s.app.input.press('KeyD'); s.app.input.press('Space'); s.step(0.1);
  assert.equal(p.flame, 0);
});

test('the descent\'s puzzles are the tide, the beam, the carry and the plates, in that order', () => {
  for (const seed of [...SEEDS, 's0']) {
    const d = get('spire', seed), deep = descentOf(d);
    assert.deepEqual(d.rooms.filter((r) => deep.has(r.id) && r.puzzle).map((r) => r.puzzle.kind), ['tide', 'beam', 'carry', 'switches'], String(seed));
    assert.ok(d.rooms.every((r) => deep.has(r.id) || !['beam', 'carry'].includes(r.role)), `${seed}: the new puzzles stay on the descent`);
  }
});

// Stand the player on a free tile beside `c`, facing it.
const standBy = (s, c) => {
  const a = s.game.area, p = s.game.player;
  const [dx, dy] = Object.values(STEP).find(([sx, sy]) => !a.map.isSolid(c.x + sx, c.y + sy));
  p.x = (c.x + dx) * 16 + 8; p.y = (c.y + dy) * 16 + 8;
  p.aim = Math.atan2(-dy, -dx); p.facing = dx > 0 ? 'left' : dx < 0 ? 'right' : dy > 0 ? 'up' : 'down';
};

test('a struck mirror turns a quarter, and the beam on the receiver opens the sealed door', async () => {
  const s = await sandbox(), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  s.game.enterDungeon('spire');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'beam'), pz = room.puzzle, p = s.game.player;
  a.enterRoom(room.id, OPP[entryOf(room)]);
  const on = onwardOf(room);
  assert.equal(a.doorState[on], 'sealed');
  assert.ok(pz.mirrors.every((m) => a.map.isSolid(m.x, m.y)) && a.map.isSolid(pz.source.x, pz.source.y) && a.map.isSolid(pz.receiver.x, pz.receiver.y), 'solid');
  assert.ok(!a.beam.hit);
  const wrong = pz.mirrors.map((m, i) => i).filter((i) => pz.mirrors[i].state !== pz.mirrors[i].solution);
  // A real swing from beside each wrong mirror.
  for (const i of wrong) {
    standBy(s, pz.mirrors[i]); p.cool = 0;
    s.app.input.press('KeyJ'); s.step(1 / 60); s.app.input.release('KeyJ'); s.step(0.4);
    assert.equal(a.mirrorState()[i], pz.mirrors[i].solution, `mirror ${i} turned`);
  }
  assert.ok(a.beam.hit && a.solved);
  assert.equal(a.doorState[on], 'open');
  for (const n of ['beam_turn', 'beam_hum', 'beam_lit']) assert.ok(heard.includes(n), n);
  // Solved, it stays solved: the mirrors keep their answer when you come back.
  a.enterRoom(a.dungeon.entranceId, 'n'); a.enterRoom(room.id, OPP[entryOf(room)]);
  assert.ok(a.beam.hit);
  assert.deepEqual(a.mirrorState(), pz.mirrors.map((m) => m.solution));
});

test('an arrow turns a mirror too', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'beam'), m = room.puzzle.mirrors[0];
  a.enterRoom(room.id, OPP[entryOf(room)]);
  const [dx, dy] = Object.values(STEP).find(([sx, sy]) => [1, 2, 3].every((k) => !a.map.isSolid(m.x + sx * k, m.y + sy * k)));
  a.spawn(new Projectile('arrow', (m.x + dx * 3) * 16 + 8, (m.y + dy * 3) * 16 + 8, Math.atan2(-dy, -dx), 220, 1, 'player'));
  s.step(0.5);
  assert.notEqual(a.mirrorState()[0], m.state);
});

test('one flame must light them all: when it gutters, is rolled out or is retaken, its braziers go dark', async () => {
  const s = await sandbox(), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  s.game.enterDungeon('spire');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'carry'), pz = room.puzzle, p = s.game.player;
  a.enterRoom(room.id, OPP[entryOf(room)]);
  const on = onwardOf(room), lit = () => a.brazierState().filter(Boolean).length;
  assert.ok([pz.source, ...pz.braziers].every((c) => a.map.isSolid(c.x, c.y)), 'solid');
  standBy(s, pz.braziers[0]); s.step(0.1);
  assert.equal(lit(), 0, 'no flame, no fire');
  // Gutters mid-tour: the braziers it lit go dark, and it lights nothing more.
  standBy(s, pz.source); assert.ok(a.interact());
  assert.equal(p.flame, pz.burn);
  standBy(s, pz.braziers[0]); s.step(0.1);
  standBy(s, pz.braziers[1]); s.step(0.1);
  assert.equal(lit(), 2);
  heard.length = 0;
  s.step(pz.burn);
  assert.equal(p.flame, 0, 'guttered');
  assert.equal(lit(), 0, 'its braziers go dark');
  assert.ok(heard.includes('flame_out') && heard.includes('brazier_douse'), heard.join());
  standBy(s, pz.braziers[2]); s.step(0.1);
  assert.equal(lit(), 0, 'a guttered flame lights nothing');
  // Rolled out: the same.
  standBy(s, pz.source); a.interact(); standBy(s, pz.braziers[0]); s.step(0.1);
  assert.equal(lit(), 1);
  s.app.input.press('Space'); s.step(0.1); s.app.input.release('Space');
  assert.equal(p.flame, 0); assert.equal(lit(), 0, 'rolled out');
  // Retaken: a fresh run.
  standBy(s, pz.source); a.interact(); standBy(s, pz.braziers[0]); s.step(0.1);
  standBy(s, pz.source); a.interact();
  assert.equal(lit(), 0, 'retaken');
  assert.equal(p.flame, pz.burn);
  // Walked out on: none of them wait for you to come back.
  standBy(s, pz.braziers[0]); s.step(0.1);
  a.enterRoom(a.dungeon.entranceId, 'n'); a.enterRoom(room.id, OPP[entryOf(room)]);
  assert.equal(p.flame, 0); assert.equal(lit(), 0, 'reset on leaving');
  assert.equal(a.doorState[on], 'sealed');
  // The whole tour on one flame solves it, and a solved room keeps its fire.
  standBy(s, pz.source); a.interact();
  for (const b of pz.braziers) { standBy(s, b); s.step(0.1); }
  assert.ok(a.solved);
  assert.equal(a.doorState[on], 'open');
  s.step(pz.burn);
  assert.equal(p.flame, 0);
  assert.equal(lit(), pz.braziers.length, 'solved stays lit');
  for (const n of ['flame_take', 'flame_light', 'flame_out']) assert.ok(heard.includes(n), n);
  // The flame never leaves the room.
  standBy(s, pz.source); a.interact();
  a.enterRoom(a.dungeon.entranceId, 'n');
  assert.equal(p.flame, 0);
});

test('a carried flame never survives a jump between areas, or a fall', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const p = s.game.player;
  p.flame = 5; s.game.exitDungeon();
  assert.equal(s.game.area.kind, 'overworld');
  assert.equal(p.flame, 0, 'out of the dungeon');
  s.game.enterDungeon('spire');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'carry');
  a.enterRoom(room.id, OPP[entryOf(room)]);
  p.flame = 5; s.game.die();
  for (let t = 0; t < 8 && (s.game.deathT > 0 || s.game.uiStack.length); t += 0.1) { s.app.input.press('Enter'); s.step(0.05); s.app.input.release('Enter'); s.step(0.05); }
  assert.equal(p.mode, 'normal', 'back on its feet');
  assert.equal(p.flame, 0, 'after a fall');
});

test('the beam stops at the room\'s edge, never out through a doorway', () => {
  for (const seed of SEEDS) for (const r of get('spire', seed).rooms.filter((q) => q.puzzle?.kind === 'beam')) {
    const n = r.puzzle.mirrors.length;
    for (let m = 0; m < 1 << n; m++) {
      const b = traceBeam(r, r.puzzle.mirrors.map((_, i) => ((m >> i) & 1 ? '/' : '\\')));
      assert.ok(b.cells.every((c) => c.x >= 1 && c.y >= 1 && c.x <= ROOM_W - 2 && c.y <= ROOM_H - 2), `${seed}/${r.id} mirrors ${m}`);
    }
  }
  // Aimed straight at each door, it ends at the doorway.
  const r = get('spire', 1).rooms.find((q) => q.puzzle?.kind === 'beam');
  for (const dir of Object.keys(r.doors)) {
    const g = DOOR_TILES[dir][0], [dx, dy] = STEP[dir], source = { x: g.x - dx * 5, y: g.y - dy * 5, dir };
    const b = traceBeam({ tiles: r.tiles, puzzle: { source, receiver: { x: -1, y: -1 }, mirrors: [] } }, []);
    assert.deepEqual(b.end, g, dir);
    assert.equal(b.cells.length, 4, dir);
  }
});

test('the beam and the carried flame have sounds of their own', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = ['beam_turn', 'beam_hum', 'beam_lit', 'flame_take', 'flame_light', 'flame_out', 'brazier_douse'];
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  assert.equal(new Set(names.map(recipe)).size, names.length);
});

test('beam and carry rooms, and the flame in hand, draw without randomness', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, p = s.game.player;
  const draw = () => {
    const { g, calls } = recorder(), rnd = Math.random;
    Math.random = () => { throw new Error('drawing used Math.random'); };
    try { a.draw(g, s.game.cam); } finally { Math.random = rnd; }
    return calls;
  };
  for (const kind of ['beam', 'carry']) {
    const room = a.dungeon.rooms.find((r) => r.puzzle?.kind === kind);
    a.enterRoom(room.id, OPP[entryOf(room)]); s.step(0.2);
    assert.ok(draw().length > 0);
    if (kind === 'carry') { p.flame = 1; assert.ok(draw().length > 0); }
    s.game.state.progress.solved.push(`spire:${room.id}`);
    a.enterRoom(room.id, OPP[entryOf(room)]); s.step(0.2);
    assert.ok(draw().length > 0);
  }
});

test('the descent fights hardest: more Gloam kin than any other fight, of every ward, and a champion', async () => {
  for (const seed of ['d1', 'quests', 'fen77']) {
    const s = await sandbox({ seed }); s.game.enterDungeon('spire');
    const a = s.game.area, deep = descentOf(a.dungeon), diff = s.game.diff.enemyHp;
    const fights = a.dungeon.rooms.filter((r) => r.role === 'combat').map((room) => {
      a.enterRoom(room.id, OPP[entryOf(room)]);
      return { room, list: a.enemyList.slice(), n: a.enemyList.length, hp: a.enemyList.reduce((t, e) => t + e.maxHp, 0) };
    });
    const hard = fights.filter((f) => deep.has(f.room.id)), others = fights.filter((f) => !deep.has(f.room.id));
    assert.equal(hard.length, 3, seed);
    assert.ok(others.length >= 5 && others.some((f) => f.room.theme === 'spire'), seed);
    for (const f of hard) {
      const champs = f.list.filter((e) => e.champion);
      assert.equal(champs.length, 1, `${seed}/${f.room.id} champion`);
      assert.ok(f.n - 1 >= 6 && f.n - 1 <= 7, `${seed}/${f.room.id}: ${f.n} foes`);
      assert.ok(f.list.every((e) => e.gloam), 'Gloam-touched');
      assert.deepEqual(new Set(f.list.map((e) => e.biome)), new Set([0, 5, 4, 1]), `${seed}/${f.room.id}: every ward's kin`);
      const c = champs[0];
      assert.equal(c.scale, 1.6);
      assert.equal(c.maxHp, Math.round(enemyStats(c.archetype, c.biome, { tier: 2.2 }).hp * 1.6 * diff));
      for (const w of others) assert.ok(f.n > w.n && f.hp > w.hp, `${seed}: descent room ${f.room.id} (${f.n} foes, ${f.hp} hp) vs room ${w.room.id} (${w.n}, ${w.hp})`);
    }
  }
});

test('Fane and Spire tide rooms can always be crossed', () => {
  for (const id of ['drowned', 'spire']) {
    for (const seed of SEEDS) for (const r of get(id, seed).rooms.filter((r) => r.puzzle?.kind === 'tide')) assert.ok(tideSolvable(r), `${id}/${seed}/${r.id}`);
  }
});

test('the tide checks catch a room that traps whoever comes back into it', () => {
  const room = get('drowned', 1).rooms.find((r) => r.puzzle?.kind === 'tide'), pz = room.puzzle;
  const without = (i) => ({ ...room, puzzle: { ...pz, levers: pz.levers.filter((_, k) => k !== i) } });
  // The levers run shore, island, far. With no shore lever, tide b at the way in is a dead end.
  assert.ok(tideSolvable(without(0)) && !tideSolvable(without(0), { start: 'b' }));
  // With no far lever, the way on at tide a is.
  assert.ok(tideSolvable(without(2)) && !tideSolvable(without(2), { start: 'a', back: true }));
});

test('the Fane is about the size of the Sanctuary and uses swamp hazards', () => {
  for (const seed of SEEDS) {
    const d = get('drowned', seed);
    assert.ok(d.rooms.length >= 15 && d.rooms.length <= 19);
    assert.ok(d.rooms.some((r) => r.tiles.includes(T.BOG)));
    assert.equal(d.rooms.filter((r) => r.role === 'tide').length, 2);
    assert.ok(d.rooms[d.bossId].tiles.includes(T.DWATER), `${seed}: pools in the Tidewarden's arena`);
  }
});

test('the Tidewarden\'s arena always has a pool in at least one corner', () => {
  const corners = [[1, 1], [22, 1], [1, 13], [22, 13]];
  for (let i = 0; i < 600; i++) {
    const d = generateDungeon('drowned', `pool${i}`), r = d.rooms[d.bossId];
    assert.ok(corners.some(([x, y]) => at(r, x, y) === T.DWATER), `pool${i}: no corner pool`);
  }
});

test('the bot crosses a tide room', async () => {
  const s = await sandbox(); s.game.enterDungeon('drowned');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'tide');
  a.enterRoom(room.id, OPP[entryOf(room)]);
  const r = botDo(s, (bot) => bot.solveTide(), { maxSeconds: 90 });
  assert.ok(r.done, r.status);
  // It ends on the far shore, a walk from just inside the onward door (which may still be locked).
  const p = s.game.player, d = bfsDistances(ROOM_W, ROOM_H, (x, y) => !a.map.isSolid(x, y), [{ x: Math.floor(p.x / 16), y: Math.floor(p.y / 16) }]);
  const on = onwardOf(room), [ix, iy] = STEP[OPP[on]];
  assert.ok(DOOR_TILES[on].some((g) => d[(g.y + iy) * ROOM_W + g.x + ix] >= 0), 'on the far shore');
});

test('a lever turns the tide, and the room remembers it', async () => {
  const s = await sandbox(), heard = [];
  s.app.audio.sfx = (name) => heard.push(name);
  s.game.enterDungeon('drowned');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'tide'), pz = room.puzzle;
  const from = OPP[entryOf(room)];
  a.enterRoom(room.id, from);
  const tiles = () => [pz.a.map((c) => a.map.get(c.x, c.y)), pz.b.map((c) => a.map.get(c.x, c.y))];
  const all = (list, t) => list.every((v) => v === t);
  assert.equal(a.tide, 'a');
  let [ta, tb] = tiles();
  assert.ok(all(ta, T.DFLOOR) && all(tb, T.DWATER), 'A dry, B flooded');
  // Stand beside a lever and use it.
  const lv = pz.levers[0], beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: lv.x + dx, y: lv.y + dy })).find((c) => !a.map.isSolid(c.x, c.y));
  s.game.player.x = beside.x * 16 + 8; s.game.player.y = beside.y * 16 + 8;
  assert.ok(a.interact());
  assert.equal(a.tide, 'b');
  [ta, tb] = tiles();
  assert.ok(all(ta, T.DWATER) && all(tb, T.DFLOOR), 'A flooded, B dry');
  assert.ok(heard.includes('lever') && heard.includes('splash'));
  assert.ok(SFX_NAMES.includes('lever'));
  assert.equal(s.game.state.progress.tides[`drowned:${room.id}`], 'b');
  a.enterRoom(a.dungeon.entranceId, 'n');
  a.enterRoom(room.id, from);
  assert.equal(a.tide, 'b');
  [ta, tb] = tiles();
  assert.ok(all(ta, T.DWATER) && all(tb, T.DFLOOR), 'the tide is as it was left');
});

test('a lever thrown from the edge of its reach sets the player down on the stone they stand on', async () => {
  // At 22px the hitbox can lap onto a tide stone two tiles from the lever, and the throw may flood it.
  let found = null;
  for (const seed of SEEDS) {
    for (const room of get('drowned', seed).rooms.filter((r) => r.puzzle?.kind === 'tide')) {
      const { a, b, levers } = room.puzzle;
      for (const lv of levers) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const at2 = (set) => set.some((c) => c.x === lv.x + dx * 2 && c.y === lv.y + dy * 2);
          if (!found && (at2(a) || at2(b))) found = { seed, room, lv, dx, dy, tide: at2(a) ? 'a' : 'b' };
        }
      }
    }
  }
  assert.ok(found, 'a lever with a tide stone two tiles off');
  const { seed, room, lv, dx, dy, tide } = found;
  const s = await sandbox({ seed }); s.game.enterDungeon('drowned');
  const a = s.game.area, p = s.game.player;
  s.game.state.progress.tides[`drowned:${room.id}`] = tide;
  a.enterRoom(room.id, OPP[entryOf(room)]);
  assert.equal(a.tide, tide);
  p.x = lv.x * 16 + 8 + dx * 21.5; p.y = lv.y * 16 + 8 + dy * 21.5;
  const solid = (x, y) => a.map.isSolid(x, y), from = { x: p.x, y: p.y }, tile = [Math.floor(p.x / 16), Math.floor(p.y / 16)];
  assert.ok(!rectSolid(a.map, p.x, p.y, p.w, p.h, solid));
  assert.ok(rectSolid(a.map, p.x, p.y, p.w, p.h, (x, y) => x === lv.x + dx * 2 && y === lv.y + dy * 2), 'over the stone that will flood');
  assert.ok(a.interact());
  assert.notEqual(a.tide, tide);
  assert.ok(!rectSolid(a.map, p.x, p.y, p.w, p.h, solid), 'not left in the water');
  assert.deepEqual([Math.floor(p.x / 16), Math.floor(p.y / 16)], tile, 'still on the same tile');
  assert.ok(Math.hypot(p.x - from.x, p.y - from.y) < 8, 'nudged, not snapped a tile away');
});

test('bog mires and mire poisons whoever wades in', async () => {
  const s = await sandbox(); s.game.enterDungeon('drowned');
  const a = s.game.area, p = s.game.player;
  for (const [tile, effect] of [[T.BOG, 'mud'], [T.MIRE, 'poison']]) {
    p.effects = {};
    a.map.set(10, 12, tile);
    p.x = 10 * 16 + 8; p.y = 12 * 16 + 6;
    s.step(0.1);
    assert.ok(p.effects[effect], `${effect} from the ${effect === 'mud' ? 'bog' : 'mire'}`);
    a.map.set(10, 12, T.DFLOOR);
  }
});

test('the Fane\'s monsters are swamp kin as tough as the Sanctuary\'s', async () => {
  const s = await sandbox(); s.game.enterDungeon('drowned');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.role === 'combat');
  a.enterRoom(room.id, OPP[entryOf(room)]);
  assert.ok(a.enemyList.length >= 3);
  for (const e of a.enemyList) {
    assert.equal(e.biome, 1);
    assert.equal(e.maxHp, Math.max(1, Math.round(enemyStats(e.archetype, 1, { tier: 1.9 }).hp * s.game.diff.enemyHp)), e.archetype);
  }
});

test('the Tidewarden\'s leech fights at the Fane\'s tier', async () => {
  const s = await sandbox(); s.game.enterDungeon('drowned');
  s.game.state.quest.flags['intro:tide'] = true;
  const a = s.game.area, boss = a.dungeon.rooms[a.dungeon.bossId];
  a.enterRoom(boss.id, OPP[Object.keys(boss.doors)[0]]);
  const b = a.boss; b.state = 'stalk';
  b.damage(9999, s.game.player, a.ctx); s.step(2);
  assert.equal(b.phase, 2);
  const leeches = a.enemyList.filter((e) => e.archetype === 'lunger' && !e.boss);
  assert.equal(leeches.length, 1);
  const tough = enemyStats('lunger', 1, { tier: 1.9 }).hp;
  assert.notEqual(tough, enemyStats('lunger', 1).hp);
  for (const e of leeches) assert.equal(e.maxHp, tough);
});

test('every dungeon can be walked to its warden under the runtime door rules', async () => {
  const { makeApp } = await import('../tools/headless.mjs');
  const { GameScene } = await import('../src/scenes/game.js');
  const { newGameState } = await import('../src/game/state.js');
  const app = await makeApp();
  for (const seed of ['d1', 'ember123', 'fen77', 'quests', 'zz9']) {
    const game = new GameScene(app, newGameState(seed, 'swordsman'));
    for (const id of IDS) {
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
          // An echo reached is an echo beaten.
          if (room.role === 'echo' && !pr.solved.includes(`spire:echo:${room.theme}`)) { pr.solved.push(`spire:echo:${room.theme}`); changed = true; }
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

test('the Spire is about twice the Sanctuary, with four wings and an inner seal', () => {
  for (const seed of SEEDS) {
    const d = get('spire', seed);
    assert.ok(d.rooms.length >= 30 && d.rooms.length <= 34, `${seed}: ${d.rooms.length}`);
    assert.deepEqual(new Set(d.rooms.filter((r) => r.role === 'echo').map((r) => r.theme)), new Set(['verdant', 'ashen', 'frost', 'drowned']));
    assert.ok(d.rooms.some((r) => Object.values(r.doors).some((x) => x.type === 'inner')));
    assert.ok(solveDungeon(d).bossReachable, seed);
    for (const r of d.rooms) assert.ok(Object.keys(r.doors).length <= 4);
  }
});

test('a Spire the walk can\'t place takes the fixed layout: a hub column north, a wing west and east of each hub', () => {
  const d = get('spire', 's0'), main = d.rooms.filter((r) => r.theme === 'spire' && r.role !== 'treasure');
  const ent = d.rooms[d.entranceId];
  assert.ok(main.every((r) => r.gx === ent.gx), 'the main path runs straight north');
  assert.deepEqual(main.map((r) => ent.gy - r.gy), main.map((_, i) => i));
  for (const hub of d.rooms.filter((r) => r.role === 'hub')) {
    const wings = ['w', 'e'].map((k) => d.rooms[hub.doors[k].to].theme);
    assert.ok(wings.every((w) => WINGS.includes(w)), `hub ${hub.id}: ${wings}`);
    for (const w of wings) assert.ok(d.rooms.filter((r) => r.theme === w && r.role !== 'key').every((r) => r.gy === hub.gy), `the ${w} wing runs along its hub's row`);
  }
});

test('the inner seal needs every echo', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire'); const a = s.game.area, pr = s.game.state.progress;
  const inner = a.dungeon.rooms.flatMap((r) => Object.values(r.doors)).find((d) => d.type === 'inner');
  const room = a.dungeon.rooms.find((r) => Object.values(r.doors).includes(inner));
  for (const w of ['verdant', 'ashen', 'frost']) pr.solved.push(`spire:echo:${w}`);
  assert.ok(!a.isDoorOpen(room, inner));
  pr.solved.push('spire:echo:drowned'); assert.ok(a.isDoorOpen(room, inner));
});

test('spire inner seals survive save and load', async () => {
  const { GameScene } = await import('../src/scenes/game.js');
  const s = await sandbox(); s.game.state.progress.solved.push('spire:echo:verdant', 'spire:echo:frost');
  const g2 = new GameScene(s.app, deserialize(serialize(s.game.state))); g2.enterDungeon('spire');
  assert.equal(g2.area.litSeals(), 2); // the hub's socket count, also used for drawing
});

test('the key-BFS keeps the descent shut until every echo can be reached', () => {
  const d = get('spire', 1), echo = d.rooms.find((r) => r.role === 'echo');
  const inner = d.rooms.flatMap((r) => Object.values(r.doors)).find((x) => x.type === 'inner');
  const below = Number(inner.id.split('-')[1]); // door ids run parent-child
  assert.ok(solveDungeon(d).reachable.has(below));
  // Brick up one echo's doorway: the descent and the warden are out of reach.
  const rooms = d.rooms.map((r) => ({ ...r, doors: Object.fromEntries(Object.entries(r.doors).filter(([, x]) => x.to !== echo.id)) }));
  const { reachable, bossReachable } = solveDungeon({ ...d, rooms });
  assert.ok(!reachable.has(below) && !bossReachable);
});

test('Spire rooms: themed wings, echoes of the ward elites, sockets in the hub and the arena', () => {
  for (const seed of SEEDS) {
    const d = get('spire', seed);
    const wings = new Map(WINGS.map((w) => [w, d.rooms.filter((r) => r.theme === w)]));
    for (const [w, rooms] of wings) {
      assert.ok(rooms.length >= 4 && rooms.length <= 7, `${seed}/${w}: ${rooms.length} rooms`);
      assert.equal(rooms.filter((r) => r.role === 'key').length, 1, `${seed}/${w}: one key`);
      const echo = rooms.find((r) => r.role === 'echo');
      assert.deepEqual(echo.objects.filter((o) => o.type === 'echo').map((o) => o.elite), [ECHO[w]]);
      assert.equal(Object.keys(echo.doors).length, 1, 'an echo ends its wing');
      // The wing's lock is inside the wing, behind its key.
      const locks = rooms.flatMap((r) => Object.values(r.doors)).filter((x) => x.type === 'locked');
      assert.equal(new Set(locks.map((x) => x.id)).size, 1, `${seed}/${w}: one lock`);
    }
    for (const r of d.rooms) if (!WINGS.includes(r.theme)) assert.equal(r.theme, 'spire');
    const hub = d.rooms.find((r) => r.role === 'hub' && Object.values(r.doors).some((x) => x.type === 'inner'));
    assert.deepEqual(hub.objects.filter((o) => o.type === 'socket').map((o) => o.wing).sort(), [...WINGS].sort());
    for (const h of d.rooms.filter((r) => r.role === 'hub')) assert.equal(Object.keys(h.doors).length, 4, 'two wings branch off each hub');
    const boss = d.rooms[d.bossId];
    assert.equal(boss.theme, 'spire');
    assert.equal(boss.objects.filter((o) => o.type === 'socket').length, 4);
  }
});

test('an echo is its ward\'s elite steeped in Gloam, and beating it lights a seal for good', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, pr = s.game.state.progress, room = a.dungeon.rooms.find((r) => r.role === 'echo' && r.theme === 'frost');
  a.enterRoom(room.id, OPP[Object.keys(room.doors)[0]]);
  assert.equal(a.litSeals(), 0);
  const e = a.enemyList.find((q) => q.elite);
  assert.equal(e.eliteId, 'frostfang');
  assert.ok(e.gloam && e.key.endsWith('g'), 'Gloam colours');
  assert.equal(e.maxHp, Math.max(1, Math.round(enemyStats('lunger', 4, { tier: 2.2 }).hp * 5.5 * s.game.diff.enemyHp)));
  s.step(0.5);
  e.damage(9999, s.game.player, a.ctx); s.step(1);
  assert.ok(pr.solved.includes('spire:echo:frost'));
  assert.equal(a.litSeals(), 1);
  a.enterRoom(a.dungeon.entranceId, 'n'); a.enterRoom(room.id, OPP[Object.keys(room.doors)[0]]);
  assert.ok(!a.enemyList.some((q) => q.elite), 'a beaten echo stays beaten');
});

test('Spire monsters are Gloam kin, and each room wears its own colours', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, rooms = a.dungeon.rooms.filter((r) => r.role === 'combat');
  const fam = { verdant: 0, ashen: 5, frost: 4, drowned: 1 };
  for (const room of rooms) {
    a.enterRoom(room.id, OPP[entryOf(room)]);
    assert.deepEqual(a.theme.floor, PALETTES[room.theme].floor, `room ${room.id} palette`);
    for (const e of a.enemyList) {
      assert.ok(e.gloam && e.name.startsWith('Gloam '), e.name);
      if (room.theme !== 'spire') assert.equal(e.biome, fam[room.theme], `room ${room.id}: the ${room.theme} wing's kin`);
      else assert.ok(Object.values(fam).includes(e.biome), 'a ward\'s kin');
      assert.equal(e.maxHp, Math.max(1, Math.round(enemyStats(e.archetype, e.biome, { tier: 2.2 }).hp * (e.champion ? 1.6 : 1) * s.game.diff.enemyHp)));
    }
  }
  assert.ok(new Set(rooms.map((r) => r.theme)).size >= 4, 'combat in the wings and in the Spire proper');
});

test('the Spire\'s hazard burns violet', async () => {
  const { drawRoomTile } = await import('../src/gfx/render.js');
  const { TileMap } = await import('../src/world/tilemap.js');
  const m = new TileMap(3, 3); m.tiles.fill(T.HAZARD);
  const paint = (th) => { const r = recorder(); drawRoomTile(r.g, m, 1, 1, 0, 0, { ...th, kind: 'dungeon' }); return r.fills; };
  assert.ok(paint(PALETTES.ashen).includes('#ff6a20'));
  const spire = paint(PALETTES.spire);
  assert.ok(!spire.includes('#ff6a20'));
  assert.ok(PALETTES.spire.hazard.every((c) => spire.includes(c)));
});

test('the dungeon minimap and map fit the screen, even for the Spire', async () => {
  const { drawMinimap } = await import('../src/gfx/hud.js');
  const s = await sandbox();
  s.game.state.progress.dungeonMaps.push('spire');
  // The widest walks found, and a grid bigger than any walk makes.
  const huge = { id: 'spire', name: 'Emberwake Spire', rooms: [{ id: 0, gx: 0, gy: 0, role: 'entrance', doors: {} }, { id: 1, gx: 17, gy: 15, role: 'boss', doors: {} }] };
  for (const seed of [...SEEDS, 's37', 's119', 'huge']) {
    const d = seed === 'huge' ? huge : get('spire', seed), area = { dungeon: d, roomId: 0, isDoorSealed: () => false };
    for (const big of [false, true]) {
      const r = recorder();
      drawMinimap(r.g, area, s.game, big);
      const rects = r.calls.filter((c) => c[0] === 'fillRect');
      assert.ok(rects.length >= d.rooms.length);
      for (const [, x, y, w, h] of rects) assert.ok(x >= 0 && y >= 0 && x + w <= 480 && y + h <= 270, `${seed} ${big ? 'map' : 'minimap'}: ${x},${y} ${w}x${h}`);
      // The small one keeps clear of the item box in the top corner.
      if (!big) for (const [, x, y] of rects) assert.ok(y >= 22, `${seed}: minimap at ${x},${y}`);
    }
  }
});

test('the bot hunts the echoes, and takes the descent only once all four are beaten', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, pr = s.game.state.progress, bot = new Bot(s.game, 'any');
  // Everything else done: every room seen, every puzzle solved, every chest open and lock turned.
  for (const r of a.dungeon.rooms) {
    (pr.visited.spire ||= []).push(r.id);
    if (r.puzzle) pr.solved.push(`spire:${r.id}`);
    if (r.objects.some((o) => o.type === 'chest')) pr.opened.push(`d:spire:${r.id}:chest`);
    for (const d of Object.values(r.doors)) if (d.type === 'locked') pr.unlocked.push(`spire:${d.id}`);
  }
  const hub = a.dungeon.rooms.find((r) => Object.values(r.doors).some((d) => d.type === 'inner'));
  const inner = Object.keys(hub.doors).find((d) => hub.doors[d].type === 'inner');
  a.enterRoom(hub.id, 's');
  for (const w of ['verdant', 'ashen', 'frost']) pr.solved.push(`spire:echo:${w}`);
  const plan = bot.planDungeon(false);
  assert.ok(plan && plan.dir !== inner, 'not through the inner seal');
  assert.equal(a.byId.get(plan.to).theme, 'drowned', 'into the wing whose echo still stands');
  pr.solved.push('spire:echo:drowned');
  assert.equal(bot.planDungeon(false).dir, inner);
});

test('walking out of the Spire\'s entrance sets you down at its door', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  s.game.exitDungeon();
  const f = s.game.world.pois.spire.front;
  assert.equal(s.game.area.kind, 'overworld');
  assert.deepEqual([Math.floor(s.game.player.x / 16), Math.floor(s.game.player.y / 16)], [f.x, f.y]);
});
