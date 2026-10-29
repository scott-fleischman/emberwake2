// Puzzle rooms laid out from a solved plan (pure data, no DOM): the tide levers, the ember beam and the
// ember carry.
//
// Tide-lever rooms: the room has two sets of floor tiles, A and B, and a lever
// floods one set as it drains the other. It runs entry shore, A band, island, B band, exit shore. The
// bands are rings about the two doors (a cell's place is its distance to the way in against its
// distance to the way out), so they fit whichever walls the doors are on. The stored tiles keep both
// sets dry: which one is under water is the room's tide, kept at runtime ('a': A dry, B flooded).
import { astar, bfsDistances } from '../core/grid.js';
import { T, TILE_INFO } from './tiles.js';
import { ROOM_W, ROOM_H, DOOR_TILES, spread } from './dungeons.js';

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

// ---------------------------------------------------------------- the ember beam
// A brazier throws a beam of light along the floor. Mirror pedestals turn it (a mirror is '/' or '\' as
// drawn, and a strike swaps one for the other), and it must reach the receiver. Everything stands off
// the wall ring, so a beam that runs true never meets a torch or a doorway.
const STEP = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const TURN = { '/': ([dx, dy]) => [-dy, -dx], '\\': ([dx, dy]) => [dy, dx] };
const inField = (x, y) => x >= 2 && y >= 2 && x <= ROOM_W - 3 && y <= ROOM_H - 3;
const walkTile = (t) => !TILE_INFO[t].solid && t !== T.PIT && t !== T.HAZARD;

// The cells the beam lights, from the one past the source on, and whether it ends on the receiver.
// `end` is the cell that stopped it: a wall, a solid tile, the source, or the receiver itself.
export function traceBeam(room, states) {
  const { source, receiver, mirrors } = room.puzzle;
  const at = new Map(mirrors.map((m, i) => [idx(m.x, m.y), i]));
  let [dx, dy] = STEP[source.dir], x = source.x, y = source.y;
  const cells = [];
  // A beam can't loop (it would have to come back through the source), but cap it all the same.
  for (let n = 0; n < ROOM_W * ROOM_H * 2; n++) {
    x += dx; y += dy;
    if (!inRoom(x, y) || TILE_INFO[room.tiles[idx(x, y)]].solid || (x === source.x && y === source.y)) break;
    cells.push({ x, y });
    if (x === receiver.x && y === receiver.y) return { cells, hit: true, end: { x, y } };
    const m = at.get(idx(x, y));
    if (m !== undefined) [dx, dy] = TURN[states[m]]([dx, dy]);
  }
  return { cells, hit: false, end: { x, y } };
}

export const beamSolved = (room, states) => traceBeam(room, states).hit;

// With these objects solid, every door still reaches every other and each object has a side to stand on.
function roomy(L, objs) {
  const solid = new Set(objs.map((o) => idx(o.x, o.y)));
  const d = bfsDistances(ROOM_W, ROOM_H, (x, y) => !solid.has(idx(x, y)) && walkTile(L.tiles[idx(x, y)]), [L.gaps[0]]);
  return L.gaps.every((g) => d[idx(g.x, g.y)] >= 0) && objs.every((o) => N4.some(([dx, dy]) => d[idx(o.x + dx, o.y + dy)] >= 0));
}

export function setupBeam(L) {
  const runs = L.r.int(2, 4); // drawn once: retrying would favour the short paths, which fail less
  for (let t = 0; t < 500; t++) {
    const plan = planBeam(L, runs);
    if (!plan) continue;
    const { source, receiver, mirrors, plaque } = plan;
    L.put({ type: 'beamSource', x: source.x, y: source.y, dir: source.dir });
    mirrors.forEach((m, index) => L.put({ type: 'mirror', x: m.x, y: m.y, index }));
    L.put({ type: 'receiver', x: receiver.x, y: receiver.y });
    L.put({ type: 'plaque', x: plaque.x, y: plaque.y, text: 'Strike the mirrors to turn them. Lead the ember\'s light to the eye.' });
    L.puzzle = { kind: 'beam', source, receiver, mirrors };
    return;
  }
  throw new Error('beam puzzle layout failed');
}

// The solved path first: 2–4 straight runs of 3 or more cells from the source, a mirror at each turn
// and the receiver at the end. Then 1–2 decoys, set where a wrongly turned mirror throws the light if
// there's room, and the path's mirrors scrambled so the beam starts off its mark.
function planBeam(L, runs) {
  const r = L.r, used = new Set(), objs = [];
  const stop = (x, y) => L.isFree(x, y) && L.doorDist(x, y) >= 3 && objs.every((o) => cheb(o, { x, y }) >= 2);
  const src = r.pick(L.spots(3, inField));
  const source = { x: src.x, y: src.y, dir: r.pick(Object.keys(STEP)) };
  used.add(idx(src.x, src.y)); objs.push(source);
  let at = src, dir = STEP[source.dir];
  const mirrors = [];
  for (let k = 0; k < runs; k++) {
    const ends = [];
    for (let n = 1; ; n++) {
      const x = at.x + dir[0] * n, y = at.y + dir[1] * n;
      if (!inField(x, y) || used.has(idx(x, y)) || !walkTile(L.tiles[idx(x, y)])) break;
      if (n >= 3 && stop(x, y)) ends.push(n);
    }
    if (!ends.length) return null;
    const len = r.pick(ends);
    for (let n = 1; n <= len; n++) used.add(idx(at.x + dir[0] * n, at.y + dir[1] * n));
    at = { x: at.x + dir[0] * len, y: at.y + dir[1] * len };
    if (k === runs - 1) break;
    const out = r.pick(dir[0] ? [STEP.n, STEP.s] : [STEP.e, STEP.w]);
    const solution = Object.keys(TURN).find((m) => TURN[m](dir).join() === out.join());
    const m = { x: at.x, y: at.y, state: solution, solution, wrong: TURN[solution === '/' ? '\\' : '/'](dir) };
    mirrors.push(m); objs.push(m);
    dir = out;
  }
  const receiver = { x: at.x, y: at.y };
  objs.push(receiver);

  const decoys = [];
  for (let k = r.int(1, 2); k > 0; k--) {
    const free = (x, y) => inField(x, y) && !used.has(idx(x, y)) && stop(x, y);
    const thrown = [];
    for (const m of mirrors) {
      for (let n = 2; ; n++) {
        const x = m.x + m.wrong[0] * n, y = m.y + m.wrong[1] * n;
        if (!inField(x, y) || used.has(idx(x, y)) || !walkTile(L.tiles[idx(x, y)])) break;
        if (free(x, y)) thrown.push({ x, y });
      }
    }
    const c = thrown.length ? r.pick(thrown) : r.pick(L.spots(3, free));
    if (!c) return null;
    // A decoy's answer is the way it already faces: no one need touch it.
    const state = r.pick(Object.keys(TURN)), d = { x: c.x, y: c.y, state, solution: state };
    decoys.push(d); objs.push(d);
  }
  for (const m of mirrors) m.state = r.pick(Object.keys(TURN));
  if (mirrors.every((m) => m.state === m.solution)) { const m = r.pick(mirrors); m.state = m.state === '/' ? '\\' : '/'; }

  const all = [...mirrors, ...decoys].map(({ x, y, state, solution }) => ({ x, y, state, solution })).sort((p, q) => p.y - q.y || p.x - q.x);
  const room = { tiles: L.tiles, puzzle: { source, receiver, mirrors: all } };
  if (!beamSolved(room, all.map((m) => m.solution)) || beamSolved(room, all.map((m) => m.state))) return null;
  const plaque = r.pick(L.spots(3, onRing));
  if (!plaque || !roomy(L, [...objs, plaque])) return null;
  return { source, receiver, mirrors: all, plaque };
}

// ---------------------------------------------------------------- the ember carry
// Take flame at the source and light every dark brazier before it gutters. The flame lasts for the
// nearest-neighbour tour at 100 px a second, plus a second to spare.
export function setupCarry(L) {
  for (let t = 0; t < 500; t++) {
    const field = L.spots(3, inField), src = L.r.pick(field);
    const n = L.r.int(3, 5), far = field.filter((c) => cheb(c, src) >= 4);
    let braziers = [];
    for (const gap of [7, 6, 5, 4]) if ((braziers = spread(L.r, far, n, gap)).length === n) break;
    const plaque = L.r.pick(L.spots(3, onRing));
    if (braziers.length < n || !plaque || !roomy(L, [src, ...braziers, plaque])) continue;
    const source = { x: src.x, y: src.y };
    L.put({ type: 'brazier', x: source.x, y: source.y, source: true });
    braziers.forEach((b, index) => L.put({ type: 'brazier', x: b.x, y: b.y, index }));
    L.put({ type: 'plaque', x: plaque.x, y: plaque.y, text: 'Take the flame and kindle every brazier before it gutters. A roll will snuff it.' });
    const burn = Math.round((tourLength(L, source, braziers) * 16 / 100 + 1.0) * 100) / 100;
    L.puzzle = { kind: 'carry', source, braziers: braziers.map(({ x, y }) => ({ x, y })), burn };
    return;
  }
  throw new Error('carry puzzle layout failed');
}

// Walking steps from the source to the nearest brazier, on to the nearest one left, and so on through
// them all. Steps go round every solid object (all but the torches) and count from object to object,
// a little more than the walk from beside one to beside the next.
export function tourLength(room, source, braziers) {
  const solid = new Set(room.objects.filter((o) => o.type !== 'torch').map((o) => idx(o.x, o.y)));
  const open = (x, y) => !solid.has(idx(x, y)) && walkTile(room.tiles[idx(x, y)]);
  let at = source, left = braziers.slice(), total = 0;
  while (left.length) {
    const d = bfsDistances(ROOM_W, ROOM_H, open, [at]);
    const steps = left.map((c) => Math.min(...N4.map(([dx, dy]) => d[idx(c.x + dx, c.y + dy)]).filter((v) => v >= 0)) + 1);
    const k = steps.indexOf(Math.min(...steps));
    total += steps[k];
    at = left.splice(k, 1)[0];
  }
  return total;
}
