// Tide-lever rooms (pure data, no DOM). The room has two sets of floor tiles, A and B, and a lever
// floods one set as it drains the other. It runs entry shore, A band, island, B band, exit shore. The
// bands are rings about the two doors (a cell's place is its distance to the way in against its
// distance to the way out), so they fit whichever walls the doors are on. The stored tiles keep both
// sets dry: which one is under water is the room's tide, kept at runtime ('a': A dry, B flooded).
import { astar } from '../core/grid.js';
import { T, TILE_INFO } from './tiles.js';
import { ROOM_W, ROOM_H, DOOR_TILES } from './dungeons.js';

const SHORE = 0, BAND_A = 1, ISLAND = 2, BAND_B = 3, FAR = 4, WALL = 255;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const idx = (x, y) => y * ROOM_W + x;
const inRoom = (x, y) => x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_H;
const inInterior = (x, y) => x >= 1 && y >= 1 && x <= ROOM_W - 2 && y <= ROOM_H - 2;
const onRing = (x, y) => x === 1 || y === 1 || x === ROOM_W - 2 || y === ROOM_H - 2;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// A door's middle, in tile units.
function doorMid(dir) {
  const g = DOOR_TILES[dir];
  return { x: g.reduce((s, t) => s + t.x + 0.5, 0) / g.length, y: g[0].y + 0.5 };
}

// Lays out the room from a solved path, checks it, and retries (as `push` does) until one holds.
export function setupTide(L, spec) {
  for (let t = 0; t < 500; t++) {
    const plan = planTide(L, spec);
    if (!plan) continue;
    L.tiles.set(plan.tiles);
    for (const lv of plan.levers) L.put({ type: 'lever', x: lv.x, y: lv.y });
    L.puzzle = { kind: 'tide', a: plan.a, b: plan.b, levers: plan.levers, start: 'a' };
    return;
  }
  throw new Error('tide puzzle layout failed');
}

function planTide(L, { entryDir, exitDir }) {
  const r = L.r, E = doorMid(entryDir), X = doorMid(exitDir), span = Math.hypot(E.x - X.x, E.y - X.y);
  // Each cell's place between the doors, roughened a little so the banks aren't drawn with a compass.
  const f = new Float32Array(ROOM_W * ROOM_H);
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) {
      const dE = Math.hypot(x + 0.5 - E.x, y + 0.5 - E.y), dX = Math.hypot(x + 0.5 - X.x, y + 0.5 - X.y);
      f[idx(x, y)] = dE / (dE + dX) + (r.next() - 0.5) * 0.03;
    }
  }
  // The doorways stay on dry land: the A band starts past everything within 3 tiles of the way in,
  // the B band ends short of everything within 3 of the way out.
  const near = (dir) => {
    const out = [];
    for (let y = 1; y < ROOM_H - 1; y++) for (let x = 1; x < ROOM_W - 1; x++) if (DOOR_TILES[dir].some((g) => cheb(g, { x, y }) <= 3)) out.push(f[idx(x, y)]);
    return out;
  };
  const a0 = Math.max(...near(entryDir)) + 0.01, b1 = Math.min(...near(exitDir)) - 0.01;
  if (b1 <= a0) return null;
  const w = Math.min(r.float(1.6, 2.8) / span, (b1 - a0) * 0.36), a1 = a0 + w, b0 = b1 - w;
  const band = new Uint8Array(ROOM_W * ROOM_H).fill(WALL);
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) {
      const v = f[idx(x, y)];
      if (inInterior(x, y) || L.gaps.some((g) => g.x === x && g.y === y)) band[idx(x, y)] = v < a0 ? SHORE : v < a1 ? BAND_A : v < b0 ? ISLAND : v < b1 ? BAND_B : FAR;
    }
  }
  const bandAt = (x, y) => (inRoom(x, y) ? band[idx(x, y)] : WALL);

  // Levers stand on dry land with nothing but that land (or wall) about them, so no one throwing one
  // stands on a tide tile. A shore's lever stands at the water's edge if it can.
  const leverOn = (b, edge) => {
    const ok = [];
    for (let y = 1; y < ROOM_H - 1; y++) {
      for (let x = 1; x < ROOM_W - 1; x++) {
        if (band[idx(x, y)] !== b || L.doorDist(x, y) < 3) continue;
        let fits = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = bandAt(x + dx, y + dy); if (n !== b && n !== WALL) fits = false; }
        if (fits) ok.push({ x, y });
      }
    }
    const wet = edge === undefined ? [] : ok.filter((c) => [-2, -1, 0, 1, 2].some((dy) => [-2, -1, 0, 1, 2].some((dx) => bandAt(c.x + dx, c.y + dy) === edge)));
    return (wet.length ? r.pick(wet) : ok.length ? r.pick(ok) : null);
  };
  const isle = leverOn(ISLAND), shore = leverOn(SHORE, BAND_A), far = leverOn(FAR, BAND_B);
  if (!isle || !shore || !far) return null;
  const levers = [shore, isle, far];
  const blocked = new Set(levers.map((c) => idx(c.x, c.y)));

  // The solved path: from the way in to the island lever, then on to the way out. Each leg only ever
  // moves onward (shore, band, island, band, shore), and the crossings keep off the wall ring the
  // torches stand on.
  const cost = Float32Array.from({ length: ROOM_W * ROOM_H }, () => 1 + r.next() * 3);
  const leg = (from, to) => astar(ROOM_W, ROOM_H, (x0, y0, x1, y1) => {
    const i = idx(x1, y1), b = band[i];
    if (b === WALL || blocked.has(i) || b < band[idx(x0, y0)]) return Infinity;
    if ((b === BAND_A || b === BAND_B) && onRing(x1, y1)) return Infinity;
    return cost[i];
  }, from, to);
  const stand = r.pick(N4.map(([dx, dy]) => ({ x: isle.x + dx, y: isle.y + dy })).filter((c) => bandAt(c.x, c.y) === ISLAND));
  const p1 = stand && leg(DOOR_TILES[entryDir][0], stand), p2 = p1 && leg(stand, DOOR_TILES[exitDir][0]);
  if (!p2) return null;
  const pathA = new Set(), pathB = new Set();
  for (const c of [...p1, ...p2]) {
    const i = idx(c.x, c.y);
    if (band[i] === BAND_A) pathA.add(i); else if (band[i] === BAND_B) pathB.add(i);
  }

  // A few stones of the other tide off each crossing: what the water shows, at either tide, isn't
  // all a way across.
  const tideA = new Set(pathA), tideB = new Set(pathB);
  const decoys = (b, path, into) => {
    const free = (i) => band[i] === b && !tideA.has(i) && !tideB.has(i) && !onRing(i % ROOM_W, (i / ROOM_W) | 0);
    const around = (i) => N4.map(([dx, dy]) => idx(i % ROOM_W + dx, ((i / ROOM_W) | 0) + dy)).filter(free);
    for (let k = r.int(1, 3); k > 0; k--) {
      const from = [...path].flatMap(around);
      if (!from.length) return;
      let c = r.pick(from);
      into.add(c);
      for (let n = r.int(0, 2); n > 0; n--) { const next = around(c); if (!next.length) break; c = r.pick(next); into.add(c); }
    }
  };
  decoys(BAND_A, pathA, tideB);
  decoys(BAND_B, pathB, tideA);

  const tiles = Uint8Array.from(L.tiles);
  for (let i = 0; i < tiles.length; i++) if (band[i] === BAND_A || band[i] === BAND_B) tiles[i] = tideA.has(i) || tideB.has(i) ? T.DFLOOR : T.DWATER;
  const cells = (set) => [...set].sort((p, q) => p - q).map((i) => ({ x: i % ROOM_W, y: (i / ROOM_W) | 0 }));
  const plan = { tiles, a: cells(tideA), b: cells(tideB), levers, start: 'a' };
  // It must cross with the levers, and neither tide alone may carry anyone over.
  const from = DOOR_TILES[entryDir], to = DOOR_TILES[exitDir];
  if (!crossable(tiles, plan, from, to)) return null;
  for (const start of ['a', 'b']) if (crossable(tiles, { ...plan, start }, from, to, false)) return null;
  // Nor may anyone be shut in or out: the tide is kept when you leave, so you can come back in at tide
  // b, or in from the way on at either tide, and must still get across.
  if (!crossable(tiles, { ...plan, start: 'b' }, from, to)) return null;
  for (const start of ['a', 'b']) if (!crossable(tiles, { ...plan, start }, to, from)) return null;
  return plan;
}

// Breadth-first over (tile, tide): walk wherever the tide leaves dry land, and throw any lever within
// reach (a step away, diagonals too). True once any tile of `to` is reached.
function crossable(tiles, { a, b, levers, start }, from, to, toggles = true) {
  const side = new Map([...a.map((c) => [idx(c.x, c.y), 0]), ...b.map((c) => [idx(c.x, c.y), 1])]);
  const lever = new Set(levers.map((c) => idx(c.x, c.y))), goal = new Set(to.map((c) => idx(c.x, c.y)));
  const reach = new Set();
  for (const l of levers) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) reach.add(idx(l.x + dx, l.y + dy));
  const open = (i, s) => {
    if (lever.has(i)) return false;
    const k = side.get(i);
    if (k !== undefined) return k === s;
    const t = tiles[i];
    return !TILE_INFO[t].solid && t !== T.PIT && t !== T.HAZARD;
  };
  const s0 = start === 'a' ? 0 : 1, seen = new Uint8Array(ROOM_W * ROOM_H * 2), stack = [];
  const visit = (i, s) => { if (!seen[i * 2 + s]) { seen[i * 2 + s] = 1; stack.push(i * 2 + s); } };
  for (const c of from) visit(idx(c.x, c.y), s0);
  while (stack.length) {
    const st = stack.pop(), i = st >> 1, s = st & 1, x = i % ROOM_W, y = (i / ROOM_W) | 0;
    if (goal.has(i)) return true;
    for (const [dx, dy] of N4) if (inRoom(x + dx, y + dy) && open(idx(x + dx, y + dy), s)) visit(idx(x + dx, y + dy), s);
    if (toggles && reach.has(i) && open(i, s ^ 1)) visit(i, s ^ 1);
  }
  return false;
}

// From the way in at the starting tide, throwing levers as needed, can you reach the way on? `start`
// sets the tide to come in at, and `back` comes in from the way on and heads for the way in.
export function tideSolvable(room, { start = room.puzzle.start, back = false } = {}) {
  const dirs = Object.keys(room.doors).filter((d) => room.doors[d].to !== null);
  const entry = dirs.find((d) => room.doors[d].to < room.id);
  const onward = dirs.filter((d) => room.doors[d].to > room.id).sort((p, q) => room.doors[p].to - room.doors[q].to)[0];
  if (!entry || !onward) return false;
  const [from, to] = back ? [onward, entry] : [entry, onward];
  return crossable(room.tiles, { ...room.puzzle, start }, DOOR_TILES[from], DOOR_TILES[to]);
}
