// Dungeon generation (pure data, no DOM).
// Each dungeon id has a fixed narrative template: a main-path chain plus side branches. A seed remixes it —
// branch embedding order, grid directions, obstacle layouts, enemy mixes and puzzle parameters all vary —
// while the key/lock order and puzzle gating stay intact, so every seed is solvable.
import { makeRng } from '../core/rng.js';
import { bfsDistances } from '../core/grid.js';
import { T, TILE_INFO } from './tiles.js';

export const ROOM_W = 24, ROOM_H = 15;
export const DOOR_TILES = {
  n: [{ x: 11, y: 0 }, { x: 12, y: 0 }],
  s: [{ x: 11, y: 14 }, { x: 12, y: 14 }],
  w: [{ x: 0, y: 7 }],
  e: [{ x: 23, y: 7 }],
};
export const DUNGEON_INFO = {
  verdant: { name: 'Verdant Vault', biome: 0, boss: 'thornmaw' },
  ashen: { name: 'Ashen Reliquary', biome: 5, boss: 'cinder' },
  frost: { name: 'Frostbound Sanctuary', biome: 4, boss: 'rime' },
};

const TEMPLATES = {
  verdant: {
    main: ['entrance', 'combat', 'timed', { role: 'combat', entry: 'locked' }, 'ordered', 'bossdoor', 'boss'],
    branches: [{ at: 1, roles: ['key'] }, { at: 4, roles: ['push', 'treasure'] }],
  },
  ashen: {
    main: ['entrance', 'combat', 'switches', { role: 'combat', entry: 'locked' }, 'timed',
      { role: 'ordered', entry: 'locked' }, 'combat', 'bossdoor', 'boss'],
    branches: [{ at: 1, roles: ['key'] }, { at: 4, roles: ['combat', 'key'] }, { at: 2, roles: ['treasure'] }],
  },
  frost: {
    main: ['entrance', 'combat', 'ordered', { role: 'switches', entry: 'locked' }, 'timed', 'combat',
      { role: 'push', entry: 'locked' }, 'combat', 'bossdoor', 'boss'],
    branches: [{ at: 1, roles: ['key'] }, { at: 2, roles: ['combat', 'treasure'] },
      { at: 4, roles: ['timed', 'key'] }, { at: 5, roles: ['treasure'] }],
  },
};

const ENTRANCE_LINES = {
  verdant: 'The old roots remember every trespass.',
  ashen: 'The embers here have never gone out.',
  frost: 'Silence is the oldest guardian.',
};

const THEMES = {
  verdant: { hazard: T.THORNS, ringHazard: T.THORNS, enemies: [['brute', 2], ['lunger', 3], ['skirmisher', 2], ['ranged', 1]] },
  ashen: { hazard: T.HAZARD, ringHazard: T.HAZARD, enemies: [['brute', 3], ['lunger', 1], ['skirmisher', 2], ['ranged', 2]] },
  frost: { hazard: T.DWATER, ringHazard: null, enemies: [['brute', 1], ['lunger', 2], ['skirmisher', 3], ['ranged', 2]] },
};

const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const PUZZLE_ROLES = new Set(['timed', 'switches', 'ordered', 'push']);
const ARCHETYPES = ['brute', 'lunger', 'skirmisher', 'ranged'];
// Theme-obstacle density per role (puzzle and boss rooms get none), and the fallback multipliers tried
// in turn when a layout fails the connectivity check.
const OBSTACLE_SCALE = { entrance: 0.4, combat: 1, key: 0.8, treasure: 0.7, bossdoor: 0.5 };
const DENSITY_LEVELS = [1, 0.6, 0.3, 0];
// Mirrored 2x2 pillar arrangements (top-left corners).
const PILLAR_LAYOUTS = [
  [[5, 3], [17, 3], [5, 10], [17, 10]],
  [[8, 6], [14, 6]],
  [[5, 6], [11, 6], [17, 6]],
  [[7, 4], [15, 4], [7, 9], [15, 9]],
  [[11, 3], [11, 10]],
];
const SWITCH_LINKS = [[0, 1], [0, 1, 2], [1, 2, 3], [2, 3]];

const idx = (x, y) => y * ROOM_W + x;
const inInterior = (x, y) => x >= 1 && y >= 1 && x <= ROOM_W - 2 && y <= ROOM_H - 2;
const onRing = (x, y) => x === 1 || y === 1 || x === ROOM_W - 2 || y === ROOM_H - 2;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const gapsOf = (doors) => Object.keys(doors).flatMap((d) => DOOR_TILES[d]);

// Player-walkable for validation: not solid, not a pit, not damaging floor. Gates count as open if asked.
function walkable(tiles, gateOpen) {
  return (x, y) => {
    const t = tiles[idx(x, y)];
    if (t === T.GATE) return gateOpen;
    return !TILE_INFO[t].solid && t !== T.PIT && t !== T.HAZARD;
  };
}

export function generateDungeon(id, seed) {
  const info = DUNGEON_INFO[id];
  if (!info) throw new Error(`unknown dungeon: ${id}`);
  const rng = makeRng(`dungeon/${id}/${seed}`);
  const graph = buildGraph(TEMPLATES[id]);
  const pos = embed(graph, rng.fork('embed'));
  const minX = Math.min(...pos.map((p) => p.x)), minY = Math.min(...pos.map((p) => p.y));

  const rooms = graph.nodes.map((n) => ({
    id: n.id, gx: pos[n.id].x - minX, gy: pos[n.id].y - minY, role: n.role,
    doors: {}, tiles: null, objects: [], puzzle: null, clearToOpen: false,
  }));
  rooms[0].doors.s = { to: null, type: 'exit', id: 'exit' };
  for (const n of graph.nodes) {
    if (n.parent === null) continue;
    const p = graph.nodes[n.parent];
    const dx = pos[n.id].x - pos[p.id].x, dy = pos[n.id].y - pos[p.id].y;
    const dir = Object.keys(DIRS).find((d) => DIRS[d][0] === dx && DIRS[d][1] === dy);
    const type = n.entry === 'locked' ? 'locked'
      : p.role === 'bossdoor' && n.role === 'boss' ? 'boss'
        : PUZZLE_ROLES.has(p.role) && p.next === n.id ? 'sealed' : 'open';
    const doorId = `${p.id}-${n.id}`;
    rooms[p.id].doors[dir] = { to: n.id, type, id: doorId };
    rooms[n.id].doors[OPP[dir]] = { to: p.id, type, id: doorId };
  }

  const firstTreasure = rooms.find((r) => r.role === 'treasure')?.id;
  for (const room of rooms) {
    const next = graph.nodes[room.id].next;
    const r = rng.fork(`room${room.id}`);
    const spec = {
      theme: id, info, role: room.role, doors: room.doors, r,
      exitDir: next === null ? null : Object.keys(room.doors).find((d) => room.doors[d].to === next),
      treasure: room.id === firstTreasure ? 'map' : r.pick(['heart', 'coins']),
    };
    Object.assign(room, buildRoom(spec));
  }

  const lockedIds = new Set();
  for (const room of rooms) for (const door of Object.values(room.doors)) if (door.type === 'locked') lockedIds.add(door.id);
  const keyCount = rooms.reduce((n, r) => n + r.objects.filter((o) => o.type === 'chest' && o.contents === 'key').length, 0);

  return {
    id, name: info.name, theme: id, biome: info.biome, rooms,
    entranceId: 0, bossId: graph.mainIds[graph.mainIds.length - 1],
    keyCount, lockedCount: lockedIds.size,
  };
}

// Key-collecting BFS over the room graph: sealed doors pass (puzzles are solvable in-room); a locked door
// passes only when an unspent key is in hand, spending one key per distinct door id.
export function solveDungeon(dungeon) {
  const byId = new Map(dungeon.rooms.map((r) => [r.id, r]));
  const reachable = new Set([dungeon.entranceId]);
  const looted = new Set(), opened = new Set();
  let keys = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...reachable]) {
      const room = byId.get(id);
      if (!looted.has(id)) {
        looted.add(id);
        const found = room.objects.filter((o) => o.type === 'chest' && o.contents === 'key').length;
        if (found) { keys += found; changed = true; }
      }
      for (const door of Object.values(room.doors)) {
        if (door.to === null || reachable.has(door.to)) continue;
        if (door.type === 'locked' && !opened.has(door.id)) {
          if (keys <= opened.size) continue;
          opened.add(door.id);
        }
        reachable.add(door.to);
        changed = true;
      }
    }
  }
  return { reachable, bossReachable: reachable.has(dungeon.bossId) };
}

// ---------------------------------------------------------------- graph & grid embedding

// Nodes get ids in template order (main path first). `next` is the following node in the same chain:
// it is what a puzzle room seals and what a timed gate guards. A branch's first node is not its anchor's next.
function buildGraph({ main, branches }) {
  const nodes = [];
  const chain = (specs, anchor) => specs.map((spec, i) => {
    const { role, entry = 'open' } = typeof spec === 'string' ? { role: spec } : spec;
    const parent = i === 0 ? anchor : nodes.length - 1;
    const node = { id: nodes.length, role, entry, parent, next: null };
    if (i > 0) nodes[parent].next = node.id;
    nodes.push(node);
    return node.id;
  });
  const mainIds = chain(main, null);
  const groups = branches.map(({ at, roles }) => chain(roles, mainIds[at]));
  return { nodes, mainIds, groups };
}

// Random-walk placement on a grid: entrance at the origin, nothing south of row 0 (the entrance's south
// side is the way out). Branch embedding order is shuffled; a stuck attempt restarts with a fresh fork.
function embed({ nodes, mainIds, groups }, rng) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const r = rng.fork(`try${attempt}`);
    const order = [...mainIds.slice(1), ...r.shuffle(groups.slice()).flat()];
    const pos = [{ x: 0, y: 0 }];
    const taken = new Set(['0,0']);
    let ok = true;
    for (const id of order) {
      const p = pos[nodes[id].parent];
      const cell = r.shuffle(Object.values(DIRS).slice())
        .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
        .find((c) => c.y <= 0 && !taken.has(`${c.x},${c.y}`));
      if (!cell) { ok = false; break; }
      pos[id] = cell;
      taken.add(`${cell.x},${cell.y}`);
    }
    if (ok) return pos;
  }
  throw new Error('dungeon grid embedding failed');
}

// ---------------------------------------------------------------- room layout

class Layout {
  constructor(doors, r) {
    this.r = r;
    this.gaps = gapsOf(doors);
    this.tiles = new Uint8Array(ROOM_W * ROOM_H);
    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) this.tiles[idx(x, y)] = inInterior(x, y) ? T.DFLOOR : T.DWALL;
    }
    for (const g of this.gaps) this.tiles[idx(g.x, g.y)] = T.DFLOOR;
    this.objects = [];
    this.reserved = new Set();
    this.puzzle = null;
  }
  doorDist(x, y) { return Math.min(...this.gaps.map((g) => cheb(g, { x, y }))); }
  isFree(x, y) {
    return inInterior(x, y) && this.tiles[idx(x, y)] === T.DFLOOR && !this.objects.some((o) => o.x === x && o.y === y);
  }
  // Free floor tiles at least `minDoor` (Chebyshev) from every door gap, passing `test`.
  spots(minDoor, test = () => true) {
    const out = [];
    for (let y = 1; y < ROOM_H - 1; y++) {
      for (let x = 1; x < ROOM_W - 1; x++) if (this.isFree(x, y) && this.doorDist(x, y) >= minDoor && test(x, y)) out.push({ x, y });
    }
    return out;
  }
  // Place a fixed object and keep obstacles off it and its neighbours.
  put(obj) {
    this.objects.push(obj);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.reserved.add(idx(obj.x + dx, obj.y + dy));
    return obj;
  }
  // Stamp an obstacle shape only if every cell is free floor, unreserved and >3 tiles from any door gap.
  stamp(cells, tile) {
    const ok = cells.length && cells.every(({ x, y }) =>
      inInterior(x, y) && this.tiles[idx(x, y)] === T.DFLOOR && !this.reserved.has(idx(x, y)) && this.doorDist(x, y) > 3);
    if (ok) for (const { x, y } of cells) this.tiles[idx(x, y)] = tile;
    return ok;
  }
}

// Greedy spaced selection from shuffled candidates.
function spread(r, cands, count, minGap) {
  const out = [];
  for (const c of r.shuffle(cands.slice())) {
    if (out.length >= count) break;
    if (!out.some((o) => cheb(o, c) < minGap)) out.push(c);
  }
  return out;
}

function buildRoom(spec) {
  const gaps = gapsOf(spec.doors);
  for (let level = 0; level < DENSITY_LEVELS.length; level++) {
    const L = layoutRoom(spec, DENSITY_LEVELS[level], spec.r.fork(`v${level}`));
    const pts = [...gaps, ...L.objects];
    const d = bfsDistances(ROOM_W, ROOM_H, walkable(L.tiles, true), [pts[0]]);
    if (pts.every((p) => d[idx(p.x, p.y)] >= 0)) {
      const hasEnemies = L.objects.some((o) => o.type === 'enemy' || o.type === 'boss');
      return { tiles: L.tiles, objects: L.objects, puzzle: L.puzzle, clearToOpen: hasEnemies };
    }
  }
  throw new Error(`room layout failed for ${spec.theme}/${spec.role}`);
}

function layoutRoom(spec, density, r) {
  const L = new Layout(spec.doors, r);
  const theme = THEMES[spec.theme];
  SETUP[spec.role]?.(L, spec, density);
  const scale = (OBSTACLE_SCALE[spec.role] ?? 0) * density;
  if (scale > 0) addObstacles(L, theme.hazard, scale);

  const reach = bfsDistances(ROOM_W, ROOM_H, walkable(L.tiles, true), [L.gaps[0]]);
  const reachable = (x, y) => reach[idx(x, y)] >= 0;
  for (const p of spread(r, L.spots(3, (x, y) => onRing(x, y) && reachable(x, y)), r.int(4, 6), 6)) {
    L.objects.push({ type: 'torch', x: p.x, y: p.y });
  }
  const enemyCount = spec.role === 'combat' ? r.int(3, 5) : spec.role === 'key' ? r.int(2, 3) : 0;
  if (enemyCount) placeEnemies(L, L.spots(4, reachable), enemyCount, theme.enemies);
  return L;
}

function placeEnemies(L, cands, count, weights) {
  const picks = spread(L.r, cands, count, 3);
  const kinds = picks.map(() => L.r.weighted(weights));
  if (kinds.length > 1 && kinds.every((k) => k === kinds[0])) {
    kinds[kinds.length - 1] = L.r.pick(ARCHETYPES.filter((a) => a !== kinds[0]));
  }
  picks.forEach((p, i) => L.objects.push({ type: 'enemy', archetype: kinds[i], x: p.x, y: p.y }));
}

function addObstacles(L, hazard, amount) {
  const r = L.r;
  if (r.chance(0.35 + 0.55 * amount)) {
    for (const [x, y] of r.pick(PILLAR_LAYOUTS)) {
      L.stamp([{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }], T.DWALL);
    }
  }
  const tryShape = (make, tile) => { for (let t = 0; t < 10 && !L.stamp(make(), tile); t++); };
  const pits = Math.round(r.int(0, 2) * amount);
  for (let i = 0; i < pits; i++) tryShape(() => rect(r.int(2, 19), r.int(2, 11), r.int(1, 3), r.int(1, 2)), T.PIT);
  const hazards = Math.round(r.int(1, 3) * amount);
  for (let i = 0; i < hazards; i++) tryShape(() => hazardShape(r, hazard), hazard);
}

function rect(x0, y0, w, h) {
  const cells = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push({ x, y });
  return cells;
}

function hazardShape(r, tile) {
  const cx = r.int(3, 20), cy = r.int(3, 11);
  if (tile === T.THORNS) { // clump: a centre plus a few neighbours
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    return [{ x: cx, y: cy }, ...r.shuffle(around).slice(0, r.int(2, 4)).map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }))];
  }
  if (tile === T.HAZARD) { // lava crack: a jagged strip
    const horiz = r.chance(0.5), len = r.int(3, 6);
    const cells = [];
    let x = cx, y = cy;
    for (let i = 0; i < len; i++) {
      cells.push({ x, y });
      if (r.chance(0.3)) { if (horiz) y += r.pick([-1, 1]); else x += r.pick([-1, 1]); cells.push({ x, y }); }
      if (horiz) x++; else y++;
    }
    return cells;
  }
  // water pool: a rectangle with some corners rounded off
  const w = r.int(2, 3), h = r.int(2, 3);
  const corners = new Set([`${cx},${cy}`, `${cx + w - 1},${cy}`, `${cx},${cy + h - 1}`, `${cx + w - 1},${cy + h - 1}`]);
  return rect(cx, cy, w, h).filter((c) => w * h < 6 || !corners.has(`${c.x},${c.y}`) || r.chance(0.5));
}

// Hazard runs along the floor ring hugging the walls (boss arenas keep their interior clear).
function ringHazards(L, tile, density) {
  const ring = [];
  for (let x = 1; x <= 22; x++) ring.push({ x, y: 1 });
  for (let y = 2; y <= 13; y++) ring.push({ x: 22, y });
  for (let x = 21; x >= 1; x--) ring.push({ x, y: 13 });
  for (let y = 12; y >= 2; y--) ring.push({ x: 1, y });
  for (let i = L.r.int(0, 3); i < ring.length;) {
    const len = L.r.int(2, 4);
    if (L.r.chance(density)) for (let j = i; j < Math.min(i + len, ring.length); j++) L.stamp([ring[j]], tile);
    i += len + L.r.int(2, 4);
  }
}

// Role-specific fixed objects, puzzles and structure.
const SETUP = {
  entrance(L, s) {
    L.put({ type: 'plaque', x: 12, y: 3, text: `${s.info.name}. ${ENTRANCE_LINES[s.theme]}` });
  },
  key(L) {
    const c = L.r.pick(L.spots(4, (x, y) => x >= 5 && x <= 18 && y >= 3 && y <= 11));
    L.put({ type: 'chest', x: c.x, y: c.y, contents: 'key' });
  },
  treasure(L, s) {
    const c = L.r.pick(L.spots(4, (x, y) => x >= 9 && x <= 14 && y >= 5 && y <= 9));
    L.put({ type: 'chest', x: c.x, y: c.y, contents: s.treasure });
  },
  bossdoor(L) {
    L.put({ type: 'fountain', x: L.r.int(11, 12), y: L.r.int(6, 8) });
  },
  boss(L, s, density) {
    L.put({ type: 'boss', kind: s.info.boss, x: 12, y: 7 });
    L.put({ type: 'chest', x: 12, y: 9, contents: 'shard' });
    L.put({ type: 'portal', x: 12, y: 5 });
    const tile = THEMES[s.theme].ringHazard;
    if (tile !== null && density > 0) ringHazards(L, tile, density);
  },
  // A full gate line 3 tiles in front of the exit door; the switch sits 12–18 tiles of walking away.
  // For n/s exits a baffle wall forces the run around its ends so that distance is achievable.
  timed(L, s) {
    const gate = [];
    const ex = s.exitDir;
    if (ex === 'n' || ex === 's') {
      const gy = ex === 'n' ? 3 : 11, by = ex === 'n' ? 5 : 9;
      for (let x = 1; x <= 22; x++) gate.push({ x, y: gy });
      for (let x = 4; x <= 19; x++) L.tiles[idx(x, by)] = T.DWALL;
    } else if (ex) {
      const gx = ex === 'e' ? 20 : 3;
      for (let y = 1; y <= 13; y++) gate.push({ x: gx, y });
    }
    for (const g of gate) L.tiles[idx(g.x, g.y)] = T.GATE;
    let sw, dist = 15;
    if (gate.length) {
      const d = bfsDistances(ROOM_W, ROOM_H, walkable(L.tiles, false), gate);
      sw = L.r.pick(L.spots(3, (x, y) => d[idx(x, y)] >= 12 && d[idx(x, y)] <= 18));
      dist = d[idx(sw.x, sw.y)];
    } else {
      sw = L.r.pick(L.spots(4));
    }
    L.put({ type: 'timedSwitch', x: sw.x, y: sw.y });
    L.puzzle = { kind: 'timed', duration: Math.round((dist * 16 / 100 + 0.5) * 100) / 100, gate };
  },
  switches(L) {
    const y = L.r.int(6, 8), step = L.r.pick([2, 3]), x0 = step === 2 ? 9 : 7;
    for (let i = 0; i < 4; i++) L.put({ type: 'plate', x: x0 + i * step, y, index: i });
    let initial;
    do {
      initial = [true, true, true, true];
      for (const p of L.r.shuffle([0, 1, 2, 3]).slice(0, L.r.int(2, 3))) {
        for (const i of SWITCH_LINKS[p]) initial[i] = !initial[i];
      }
    } while (initial.every(Boolean));
    L.puzzle = { kind: 'switches', links: SWITCH_LINKS.map((l) => l.slice()), initial };
  },
  ordered(L) {
    const n = L.r.int(3, 4);
    const area = L.spots(4, (x, y) => x >= 3 && x <= 20 && y >= 3 && y <= 11);
    let picks = [];
    for (const gap of [6, 5, 4, 3]) if ((picks = spread(L.r, area, n, gap)).length === n) break;
    const orders = L.r.shuffle(Array.from({ length: n }, (_, i) => i + 1));
    picks.forEach((p, i) => L.put({ type: 'crystal', x: p.x, y: p.y, order: orders[i] }));
    const plaque = L.r.pick(L.spots(3, onRing));
    L.put({ type: 'plaque', x: plaque.x, y: plaque.y, text: 'Strike the crystals from fewest marks to most.' });
    L.puzzle = { kind: 'ordered', count: n };
  },
  // Block and target on one line 3–5 apart; the line (plus the tile behind the block) stays open floor.
  push(L) {
    for (let t = 0; t < 500; t++) {
      const vertical = L.r.chance(0.5), k = L.r.int(3, 5), d = L.r.pick([1, -1]);
      const [ax, ay] = vertical ? [0, d] : [d, 0];
      const bx = L.r.int(2, 21), by = L.r.int(2, 12);
      const line = [];
      for (let i = -1; i <= k; i++) line.push({ x: bx + ax * i, y: by + ay * i });
      const ok = line.every((c) => c.x >= 2 && c.x <= 21 && c.y >= 2 && c.y <= 12 && L.isFree(c.x, c.y) && L.doorDist(c.x, c.y) >= 3);
      if (!ok) continue;
      L.put({ type: 'block', x: bx, y: by });
      L.put({ type: 'blockTarget', x: line[k + 1].x, y: line[k + 1].y });
      L.puzzle = { kind: 'push' };
      return;
    }
    throw new Error('push puzzle placement failed');
  },
};
