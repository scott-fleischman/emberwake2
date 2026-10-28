// Cave interiors (pure data, no DOM): cellular-automata caverns with a single connected floor,
// an exit at the bottom, a reward chest at the far end and a handful of encounters and pickups.
import { makeRng } from '../core/rng.js';
import { bfsDistances, components } from '../core/grid.js';
import { T, TILE_INFO, BIOME } from './tiles.js';

const W = 48, H = 36;
const BORDER = 2;
const MIN_FLOOR = 300;
const MIN_CHEST_DIST = 16;
const CHEST_CONTENTS = ['sword', 'bow', 'tome', 'shield', 'quiver', 'heart', 'coins'];
const SUPPLY_KINDS = ['coins', 'food', 'arrows', 'mana'];
const ARCHETYPES = ['brute', 'lunger', 'skirmisher', 'ranged'];
// Biome flavor: tile and cluster shape ('pool' blobs or 'crack' strips).
const FLAVOR = {
  [BIOME.SWAMP]: { tile: T.DWATER, shape: 'pool' },
  [BIOME.SNOW]: { tile: T.DWATER, shape: 'pool' },
  [BIOME.VOLCANIC]: { tile: T.HAZARD, shape: 'crack' },
};
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const idx = (x, y) => y * W + x;
const isBorder = (x, y) => x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER;
// Safe to walk without harm: not solid and not a hazard.
const walkableTile = (t) => !TILE_INFO[t].solid && t !== T.HAZARD;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function generateCave(id, seed, biome) {
  const rng = makeRng(`cave/${id}/${seed}`);
  const contents = rng.fork('chest').pick(CHEST_CONTENTS);
  for (let attempt = 0; attempt < 100; attempt++) {
    const cave = tryCave(rng.fork(`try${attempt}`), biome);
    if (cave) return { id, biome, w: W, h: H, ...cave, chest: { ...cave.chest, contents } };
  }
  throw new Error(`cave generation failed: ${id}/${seed}`);
}

function tryCave(r, biome) {
  const tiles = automaton(r);
  if (!keepLargest(tiles)) return null;

  // Exit: carve from the lowest floor tile down into the bottom border, with a small lit vestibule.
  let low = null;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.CFLOOR) low = { x: i % W, y: (i / W) | 0 }; // last = lowest row
  const lowRow = [];
  for (let x = 0; x < W; x++) if (tiles[idx(x, low.y)] === T.CFLOOR) lowRow.push(x);
  const lx = r.pick(lowRow);
  const x0 = Math.min(Math.max(lx, BORDER + 1), W - BORDER - 2);
  for (let x = Math.min(lx, x0); x <= Math.max(lx, x0); x++) tiles[idx(x, low.y)] = T.CFLOOR;
  for (let y = low.y; y <= H - BORDER - 1; y++) tiles[idx(x0, y)] = T.CFLOOR;
  for (let y = H - BORDER - 2; y <= H - BORDER - 1; y++) for (let x = x0 - 1; x <= x0 + 1; x++) tiles[idx(x, y)] = T.CFLOOR;
  const exit = { x: x0, y: H - BORDER };
  const entrance = { x: x0, y: H - BORDER - 1 };
  tiles[idx(exit.x, exit.y)] = T.EXIT;

  if (FLAVOR[biome]) addFlavor(tiles, r, FLAVOR[biome], entrance);
  let floor = 0;
  for (const t of tiles) if (t === T.CFLOOR) floor++;
  if (floor < MIN_FLOOR) return null;

  const dist = bfsDistances(W, H, (x, y) => walkableTile(tiles[idx(x, y)]), [entrance]);
  const D = (p) => dist[idx(p.x, p.y)];
  const floorTiles = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.CFLOOR && dist[i] >= 0) floorTiles.push({ x: i % W, y: (i / W) | 0 });

  // Chest at the farthest floor tile.
  let chest = floorTiles[0];
  for (const p of floorTiles) if (D(p) > D(chest)) chest = p;
  if (D(chest) < MIN_CHEST_DIST) return null;

  const used = new Set([idx(exit.x, exit.y), idx(entrance.x, entrance.y), idx(chest.x, chest.y)]);
  const free = (test) => floorTiles.filter((p) => !used.has(idx(p.x, p.y)) && test(p));
  const take = (cands, count, minGap) => {
    const out = [];
    for (const c of r.shuffle(cands)) {
      if (out.length >= count) break;
      if (out.some((o) => cheb(o, c) < minGap)) continue;
      out.push(c);
      used.add(idx(c.x, c.y));
    }
    return out;
  };
  const nearWall = (p) => N4.some(([dx, dy]) => tiles[idx(p.x + dx, p.y + dy)] === T.CWALL);

  // Two torches flank the entrance so the way out is visible, then more spread along the walls.
  const torches = [{ x: x0 - 1, y: entrance.y }, { x: x0 + 1, y: entrance.y }];
  torches.forEach((p) => used.add(idx(p.x, p.y)));
  torches.push(...take(free((p) => nearWall(p) && cheb(p, entrance) > 6), r.int(4, 7), 7));

  const enemyCount = r.int(4, 7);
  const enemySpots = take(free((p) => D(p) >= 8 && Math.hypot(p.x - entrance.x, p.y - entrance.y) >= 8), enemyCount, 4);
  if (enemySpots.length < 4) return null;
  const kinds = enemySpots.map(() => r.pick(ARCHETYPES));
  if (kinds.every((k) => k === kinds[0])) kinds[0] = r.pick(ARCHETYPES.filter((a) => a !== kinds[0]));
  const enemies = enemySpots.map((p, i) => ({ x: p.x, y: p.y, archetype: kinds[i] }));

  const supplySpots = take(free((p) => D(p) >= 4), r.int(3, 5), 4);
  if (supplySpots.length < 3) return null;
  const supplies = supplySpots.map((p) => ({ x: p.x, y: p.y, kind: r.pick(SUPPLY_KINDS) }));

  const lost = free((p) => D(p) >= 12);
  if (!lost.length) return null;
  const lostSpot = r.pick(lost);

  return { tiles, exit, entrance, chest: { x: chest.x, y: chest.y }, enemies, supplies, torches, lostSpot };
}

// ~45% random walls, then 4–5 smoothing passes (8-neighbour majority); the 2-tile border is always wall.
function automaton(r) {
  let tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) tiles[idx(x, y)] = isBorder(x, y) || r.chance(0.45) ? T.CWALL : T.CFLOOR;
  }
  const passes = r.int(4, 5);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8Array(tiles);
    for (let y = BORDER; y < H - BORDER; y++) {
      for (let x = BORDER; x < W - BORDER; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tiles[idx(x + dx, y + dy)] === T.CWALL) walls++;
        if (walls > 4) next[idx(x, y)] = T.CWALL;
        else if (walls < 4) next[idx(x, y)] = T.CFLOOR;
      }
    }
    tiles = next;
  }
  return tiles;
}

// Keep only the largest floor component; returns false if there is no floor at all.
function keepLargest(tiles) {
  const { labels, sizes } = components(W, H, (x, y) => tiles[idx(x, y)] === T.CFLOOR);
  if (!sizes.length) return false;
  const best = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.CFLOOR && labels[i] !== best) tiles[i] = T.CWALL;
  return true;
}

// Scatter a few flavor clusters away from the entrance, reverting any that would split the walkable floor.
function addFlavor(tiles, r, { tile, shape }, entrance) {
  const walk = (x, y) => walkableTile(tiles[idx(x, y)]);
  const count = () => { let n = 0; for (const t of tiles) if (walkableTile(t)) n++; return n; };
  const clusters = r.int(2, 4);
  for (let c = 0; c < clusters; c++) {
    const total = count();
    const dist = bfsDistances(W, H, walk, [entrance]);
    const seeds = [];
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.CFLOOR && dist[i] >= 6) seeds.push(i);
    if (!seeds.length) return;
    let cur = r.pick(seeds);
    const cells = [cur];
    const size = shape === 'pool' ? r.int(3, 8) : r.int(3, 6);
    const [sdx, sdy] = r.pick(N4);
    for (let tries = 0; cells.length < size && tries < 40; tries++) {
      // pools grow from any member; cracks extend from the tip, mostly straight
      const base = shape === 'pool' ? r.pick(cells) : cur;
      const [dx, dy] = shape === 'pool' || r.chance(0.3) ? r.pick(N4) : [sdx, sdy];
      const n = base + dy * W + dx;
      if (tiles[n] !== T.CFLOOR || dist[n] < 6 || cells.includes(n)) continue;
      cells.push(n);
      cur = n;
    }
    for (const i of cells) tiles[i] = tile;
    const after = bfsDistances(W, H, walk, [entrance]);
    let reached = 0;
    for (const d of after) if (d >= 0) reached++;
    if (reached !== total - cells.length) for (const i of cells) tiles[i] = T.CFLOOR;
  }
}
