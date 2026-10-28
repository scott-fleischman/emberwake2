// Staged overworld generation:
//   1. terrain & geology   2. water   3. regional growth   4. settlements & landmarks
//   5. road routing        6. encounters & quest content
// Key rule: elevation changes are solid cliffs, crossable only at carved stairs. Gated regions are
// additionally ringed by a ridge whose single road crossing is a tool-gated blocker.
import { makeRng, valueNoise2D, fbm, tileHash } from '../core/rng.js';
import { astar, bfsDistances, components } from '../core/grid.js';
import { T, D, BIOME, GROUND, TILE_INFO, DECO_SOLID } from './tiles.js';
import { placeName } from '../data/names.js';
import { SETTLEMENT_SPECS, layoutSettlement, rosterFor } from './settlements.js';

export const WORLD_W = 192;
export const WORLD_H = 160;
const BORDER_W = 3;
const BORDER_ELEV = 7;
const GATED = new Set([BIOME.VOLCANIC, BIOME.SNOW]);

const PROVINCES = [
  [BIOME.FOREST, 0.5, 0.7], [BIOME.FOREST, 0.36, 0.55], [BIOME.FOREST, 0.6, 0.88],
  [BIOME.SWAMP, 0.13, 0.62], [BIOME.SWAMP, 0.2, 0.87],
  [BIOME.DESERT, 0.85, 0.7], [BIOME.DESERT, 0.76, 0.88],
  [BIOME.MOUNTAIN, 0.53, 0.38], [BIOME.MOUNTAIN, 0.27, 0.36],
  [BIOME.SNOW, 0.26, 0.12], [BIOME.SNOW, 0.46, 0.11],
  [BIOME.VOLCANIC, 0.86, 0.24], [BIOME.VOLCANIC, 0.74, 0.12],
];
const ELEV_BIAS = [-0.03, -0.16, -0.02, 0.15, 0.24, 0.1];
const LEVELS = [0.47, 0.57, 0.67];
const LAKE_T = [0.66, 0.53, 0.75, 0.68, 0.7, 0.7];
const LIQUID = new Set([T.WATER, T.SHALLOW, T.LAVA]);

const REGION_SUFFIX = ['Woods', 'Fens', 'Expanse', 'Heights', 'Peaks', 'Wastes'];

export function generateOverworld(seed) {
  const W = createWorld(seed);
  stageTerrain(W);
  stageWater(W);
  stageRegions(W);
  stageSettlements(W);
  stageRoads(W);
  stageContent(W);
  delete W.distWater;
  delete W.reserved;
  return W;
}

export function createWorld(seed) {
  const w = WORLD_W, h = WORLD_H, N = w * h;
  return {
    seed: String(seed), w, h,
    tiles: new Uint8Array(N), ground: new Uint8Array(N), deco: new Uint8Array(N),
    elev: new Uint8Array(N), elevF: new Float32Array(N),
    biome: new Uint8Array(N), biome2: new Uint8Array(N), margin: new Uint8Array(N), province: new Uint8Array(N),
    reserved: new Uint8Array(N),
    provinces: [], regions: [], settlements: [], props: [], npcs: [], roads: [], oases: [],
    pois: { home: null, dungeons: {}, caves: [], camps: [], shrines: [], caches: [], gates: [], signs: [], lore: [], spawns: [], patrols: [], spire: null },
    usedNames: new Set(),
  };
}

const at = (W, x, y) => y * W.w + x;
const inside = (W, x, y) => x >= 0 && y >= 0 && x < W.w && y < W.h;
const isBorder = (W, x, y) => x < BORDER_W || y < BORDER_W || x >= W.w - BORDER_W || y >= W.h - BORDER_W;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------------------------------------------------------------- 1. terrain & geology
export function stageTerrain(W) {
  const { w, h } = W;
  const rng = makeRng(W.seed).fork('terrain');
  W.provinces = PROVINCES.map(([biome, px, py]) => ({
    biome, x: (px + rng.float(-0.045, 0.045)) * w, y: (py + rng.float(-0.045, 0.045)) * h,
  }));
  const warpA = valueNoise2D(W.seed + ':wa'), warpB = valueNoise2D(W.seed + ':wb'), hn = valueNoise2D(W.seed + ':h');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const wx = x + (fbm(warpA, x / 22, y / 22, 3) - 0.5) * 36;
      const wy = y + (fbm(warpB, x / 22, y / 22, 3) - 0.5) * 36;
      let k1 = 0, d1 = Infinity;
      W.provinces.forEach((p, k) => {
        const d = Math.hypot(wx - p.x, (wy - p.y) * 1.1);
        if (d < d1) { d1 = d; k1 = k; }
      });
      const b1 = W.provinces[k1].biome;
      let k2 = k1, d2 = Infinity;
      W.provinces.forEach((p, k) => {
        if (p.biome === b1) return;
        const d = Math.hypot(wx - p.x, (wy - p.y) * 1.1);
        if (d < d2) { d2 = d; k2 = k; }
      });
      const b2 = W.provinces[k2].biome;
      W.province[i] = k1;
      W.biome[i] = b1;
      W.biome2[i] = b2;
      W.margin[i] = Math.min(255, Math.round(d2 - d1));
      const t = Math.min(1, (d2 - d1) / 12);
      const bias = ELEV_BIAS[b1] * (0.5 + 0.5 * t) + ELEV_BIAS[b2] * (0.5 - 0.5 * t);
      const e = fbm(hn, x / 26, y / 26, 4) + bias;
      W.elevF[i] = e;
      W.elev[i] = e < LEVELS[0] ? 0 : e < LEVELS[1] ? 1 : e < LEVELS[2] ? 2 : 3;
      W.tiles[i] = GROUND[b1];
      if (isBorder(W, x, y)) { W.elev[i] = BORDER_ELEV; W.tiles[i] = T.BORDER; }
    }
  }
  for (let pass = 0; pass < 2; pass++) majorityFilter(W);
  for (let pass = 0; pass < 2; pass++) mergeSmallPlateaus(W, 45);
}

function majorityFilter(W) {
  const { w, h } = W;
  const out = W.elev.slice();
  const counts = [0, 0, 0, 0];
  for (let y = BORDER_W; y < h - BORDER_W; y++) {
    for (let x = BORDER_W; x < w - BORDER_W; x++) {
      counts.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const e = W.elev[(y + dy) * w + x + dx];
        if (e < 4) counts[e]++;
      }
      let best = W.elev[y * w + x], bc = 0;
      for (let l = 0; l < 4; l++) if (counts[l] > bc) { bc = counts[l]; best = l; }
      if (bc >= 5) out[y * w + x] = best;
    }
  }
  W.elev = out;
}

function mergeSmallPlateaus(W, minSize) {
  const { w, h } = W;
  const seen = new Uint8Array(w * h);
  const q = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || W.elev[s] === BORDER_ELEV) continue;
    const lvl = W.elev[s];
    q.length = 0; q.push(s); seen[s] = 1;
    const nb = [0, 0, 0, 0];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy;
        if (!inside(W, nx, ny)) continue;
        const n = ny * w + nx, e = W.elev[n];
        if (e === lvl) { if (!seen[n]) { seen[n] = 1; q.push(n); } } else if (e < 4) nb[e]++;
      }
    }
    if (q.length < minSize) {
      let best = -1, bc = 0;
      for (let l = 0; l < 4; l++) if (nb[l] > bc) { bc = nb[l]; best = l; }
      if (best >= 0) for (const c of q) W.elev[c] = best;
    }
  }
}

// ---------------------------------------------------------------- 2. water
export function stageWater(W) {
  const { w, h } = W;
  const rng = makeRng(W.seed).fork('water');
  const wn = valueNoise2D(W.seed + ':water');
  for (let y = BORDER_W; y < h - BORDER_W; y++) {
    for (let x = BORDER_W; x < w - BORDER_W; x++) {
      const i = y * w + x, b = W.biome[i];
      const v = fbm(wn, x / 13, y / 13, 3);
      if (b === BIOME.VOLCANIC && v > 0.66) W.tiles[i] = T.LAVA;
      else if (b === BIOME.SNOW && v > LAKE_T[b]) W.tiles[i] = T.ICE;
      else if (W.elev[i] === 0 && v > LAKE_T[b]) W.tiles[i] = T.WATER;
    }
  }
  // Rivers run downhill from the highlands.
  for (let r = 0; r < 3; r++) {
    let src = null;
    for (let tries = 0; tries < 300 && !src; tries++) {
      const x = rng.int(10, w - 11), y = rng.int(10, h - 11), i = y * w + x;
      if ((W.biome[i] === BIOME.MOUNTAIN || W.biome[i] === BIOME.SNOW) && W.elev[i] >= 2) src = { x, y };
    }
    if (!src) continue;
    carveRiver(W, src, rng);
  }
  // Desert oases: the survivable anchors desert settlements cluster around.
  for (let o = 0; o < 2; o++) {
    for (let tries = 0; tries < 400; tries++) {
      const x = rng.int(12, w - 13), y = rng.int(12, h - 13), i = y * w + x;
      if (W.biome[i] !== BIOME.DESERT || W.margin[i] < 10 || W.oases.some((p) => Math.hypot(p.x - x, p.y - y) < 30)) continue;
      const r = rng.float(1.8, 2.8);
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const d = Math.hypot(dx, dy), j = at(W, x + dx, y + dy);
        if (d <= r) { W.tiles[j] = T.WATER; W.elev[j] = W.elev[i]; } else if (d <= r + 3.5 && W.tiles[j] !== T.WATER) { W.tiles[j] = T.GRASS; W.elev[j] = W.elev[i]; }
      }
      W.oases.push({ x, y });
      break;
    }
  }
  // Swamp water is mostly wadeable at the edges.
  for (let y = BORDER_W; y < h - BORDER_W; y++) for (let x = BORDER_W; x < w - BORDER_W; x++) {
    const i = y * w + x;
    if (W.tiles[i] !== T.WATER || W.biome[i] !== BIOME.SWAMP) continue;
    if (N4.some(([dx, dy]) => !LIQUID.has(W.tiles[at(W, x + dx, y + dy)]))) W.tiles[i] = T.SHALLOW;
  }
}

function carveRiver(W, src, rng) {
  const visited = new Set();
  let cur = src, dir = null;
  for (let step = 0; step < 420; step++) {
    const i = at(W, cur.x, cur.y);
    if (step > 6 && (W.tiles[i] === T.WATER || W.tiles[i] === T.LAVA) && !visited.has(i)) break;
    visited.add(i);
    W.tiles[i] = W.biome[i] === BIOME.VOLCANIC ? T.LAVA : T.WATER;
    let best = null, bv = Infinity;
    for (const [dx, dy] of N4) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (isBorder(W, nx, ny)) continue;
      const n = at(W, nx, ny);
      if (visited.has(n)) continue;
      const keep = dir && dir[0] === dx && dir[1] === dy ? -0.012 : 0;
      const v = W.elevF[n] + rng.float(0, 0.035) + keep;
      if (v < bv) { bv = v; best = { x: nx, y: ny, dx, dy }; }
    }
    if (!best) break;
    if (bv > W.elevF[i] + 0.06) { // local basin: pool and stop
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.hypot(dx, dy) <= 2.2 && !isBorder(W, cur.x + dx, cur.y + dy)) W.tiles[at(W, cur.x + dx, cur.y + dy)] = T.WATER;
      }
      break;
    }
    dir = [best.dx, best.dy];
    cur = best;
  }
}

// ---------------------------------------------------------------- 3. regional growth
export function stageRegions(W) {
  const { w, h } = W;
  const rng = makeRng(W.seed).fork('regions');
  const gn = valueNoise2D(W.seed + ':ground'), tn = valueNoise2D(W.seed + ':trees');
  // Region names (one per biome).
  for (let b = 0; b < 6; b++) W.regions.push({ biome: b, name: `${placeName(rng, b, W.usedNames)} ${REGION_SUFFIX[b]}` });

  for (let y = BORDER_W; y < h - BORDER_W; y++) {
    for (let x = BORDER_W; x < w - BORDER_W; x++) {
      const i = y * w + x;
      const t = W.tiles[i];
      if (LIQUID.has(t) || t === T.ICE) { W.ground[i] = GROUND[W.biome[i]]; continue; }
      let b = W.biome[i];
      const m = W.margin[i], b2 = W.biome2[i];
      // Soft blending on most borders; desert/swamp and volcanic borders stay sharp.
      const sharp = (b === BIOME.DESERT && b2 === BIOME.SWAMP) || b === BIOME.VOLCANIC || b2 === BIOME.VOLCANIC;
      if (!sharp && m < 6 && tileHash(x, y, 7) < (1 - m / 6) * 0.55) b = b2;
      let g = t === T.GRASS && W.biome[i] === BIOME.DESERT ? T.GRASS : GROUND[b]; // keep oasis grass
      const gv = fbm(gn, x / 10, y / 10, 2);
      if (b === BIOME.SWAMP && gv > 0.56) g = T.GRASS;
      if (b === BIOME.FOREST && gv > 0.63) g = T.TALLGRASS;
      W.tiles[i] = g;
      W.ground[i] = g;
    }
  }
  // Ridges: a two-tile rock ring around each gated region.
  const sources = [];
  for (let y = BORDER_W; y < h - BORDER_W; y++) for (let x = BORDER_W; x < w - BORDER_W; x++) {
    const i = y * w + x, b = W.biome[i];
    if (!GATED.has(b)) continue;
    if (N4.some(([dx, dy]) => !isBorder(W, x + dx, y + dy) && W.biome[at(W, x + dx, y + dy)] !== b)) sources.push({ x, y });
  }
  const ringDist = bfsDistances(w, h, (x, y) => GATED.has(W.biome[y * w + x]) && !isBorder(W, x, y), sources);
  for (let i = 0; i < w * h; i++) if (ringDist[i] >= 0 && ringDist[i] <= 1) { W.tiles[i] = T.RIDGE; W.ground[i] = T.RIDGE; }

  // Decoration by biome identity.
  for (let y = BORDER_W; y < h - BORDER_W; y++) {
    for (let x = BORDER_W; x < w - BORDER_W; x++) {
      const i = y * w + x, t = W.tiles[i];
      if (TILE_INFO[t].solid || LIQUID.has(t) || t === T.ICE) continue;
      const v = fbm(tn, x / 8, y / 8, 3), r = tileHash(x, y, 11), b = W.biome[i];
      const nearWater = N4.some(([dx, dy]) => LIQUID.has(W.tiles[at(W, x + dx, y + dy)]) && W.tiles[at(W, x + dx, y + dy)] !== T.LAVA);
      let d = D.NONE;
      switch (b) {
        case BIOME.FOREST: d = v > 0.56 && r < 0.7 ? D.TREE : r < 0.03 ? D.BUSH : r < 0.08 ? D.FLOWER : D.NONE; break;
        case BIOME.SWAMP: d = v > 0.6 && r < 0.45 ? D.TREE : nearWater && r < 0.35 ? D.REED : r < 0.03 ? D.BUSH : D.NONE; break;
        case BIOME.DESERT: d = t === T.GRASS && r < 0.22 ? D.TREE : r < 0.016 ? D.TREE : r < 0.04 ? D.ROCK : D.NONE; break;
        case BIOME.MOUNTAIN: d = v > 0.6 && r < 0.55 ? D.TREE : r < 0.05 ? D.ROCK : r < 0.07 ? D.BUSH : D.NONE; break;
        case BIOME.SNOW: d = v > 0.62 && r < 0.45 ? D.TREE : r < 0.04 ? D.ROCK : D.NONE; break;
        case BIOME.VOLCANIC: d = r < 0.03 ? D.TREE : r < 0.07 ? D.ROCK : D.NONE; break;
      }
      W.deco[i] = d;
    }
  }
  markCliffs(W);
}

const NEVER_CLIFF = new Set([T.BORDER, T.RIDGE, T.WATER, T.SHALLOW, T.LAVA, T.BUILDING, T.DOOR, T.DUNGEON, T.CAVE, T.STAIRS, T.BRIDGE, T.ROAD, T.PLAZA, T.CRACKED, T.BOULDER]);

export function markCliffs(W) {
  const { w, h } = W;
  for (let i = 0; i < w * h; i++) if (W.tiles[i] === T.CLIFF) W.tiles[i] = W.ground[i];
  for (let y = BORDER_W; y < h - BORDER_W; y++) {
    for (let x = BORDER_W; x < w - BORDER_W; x++) {
      const i = y * w + x;
      if (NEVER_CLIFF.has(W.tiles[i])) continue;
      const e = W.elev[i];
      for (const [dx, dy] of N4) {
        const n = at(W, x + dx, y + dy);
        if (W.elev[n] < e) { W.tiles[i] = T.CLIFF; W.deco[i] = D.NONE; break; }
      }
    }
  }
}

// ---------------------------------------------------------------- 4. settlements & landmarks
function computeDistWater(W) {
  const src = [];
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    const t = W.tiles[y * W.w + x];
    if (t === T.WATER || t === T.SHALLOW) src.push({ x, y });
  }
  W.distWater = bfsDistances(W.w, W.h, () => true, src);
}

function findSite(W, opts, rng) {
  const { w: bw, h: bh, biomes, target = null, targetWeight = 0.1, wantWater = false, avoid = [], minAvoid = 22, prefer = null, maxLiquid = 4 } = opts;
  let best = null, bestScore = -Infinity;
  for (let relax = 0; relax < 3 && !best; relax++) {
    const liquidCap = relax === 0 ? maxLiquid : relax === 1 ? (bw * bh) >> 2 : bw * bh;
    for (let cy = BORDER_W + 2 + (bh >> 1); cy < W.h - BORDER_W - 2 - (bh >> 1); cy += 3) {
      for (let cx = BORDER_W + 2 + (bw >> 1); cx < W.w - BORDER_W - 2 - (bw >> 1); cx += 3) {
        if (!biomes.includes(W.biome[cy * W.w + cx])) continue;
        if (avoid.some((p) => Math.hypot(p.x - cx, p.y - cy) < minAvoid)) continue;
        const x0 = cx - (bw >> 1), y0 = cy - (bh >> 1);
        let ok = true, liquid = 0;
        const counts = [0, 0, 0, 0];
        for (let y = y0; y < y0 + bh && ok; y++) {
          for (let x = x0; x < x0 + bw; x++) {
            const i = y * W.w + x, t = W.tiles[i];
            if ((relax < 2 && !biomes.includes(W.biome[i])) || t === T.RIDGE || t === T.BORDER || W.reserved[i]) { ok = false; break; }
            if (LIQUID.has(t)) liquid++;
            if (W.elev[i] < 4) counts[W.elev[i]]++;
          }
        }
        if (!ok || liquid > liquidCap) continue;
        let mode = 0;
        for (let l = 1; l < 4; l++) if (counts[l] > counts[mode]) mode = l;
        let score = (counts[mode] / (bw * bh)) * 12 - liquid * 0.6;
        if (wantWater) {
          const dw = W.distWater[cy * W.w + cx];
          score -= dw < 0 ? 12 : Math.abs(dw - (Math.max(bw, bh) / 2 + 3)) * 0.35;
        }
        if (target) score -= Math.hypot(target.x - cx, target.y - cy) * targetWeight;
        if (prefer) score += prefer(cx, cy);
        score += rng.float(0, 1.5);
        if (score > bestScore) { bestScore = score; best = { x0, y0, w: bw, h: bh, cx, cy, level: mode }; }
      }
    }
  }
  return best;
}

function claimSite(W, site, margin = 3) {
  const { x0, y0, w: bw, h: bh, level } = site;
  for (let y = y0 - margin; y < y0 + bh + margin; y++) for (let x = x0 - margin; x < x0 + bw + margin; x++) {
    if (!inside(W, x, y) || isBorder(W, x, y)) continue;
    const i = y * W.w + x;
    W.reserved[i] = 1;
    if (x >= x0 && x < x0 + bw && y >= y0 && y < y0 + bh) {
      W.elev[i] = level;
      if (W.ground[i] === T.RIDGE || LIQUID.has(W.ground[i])) W.ground[i] = GROUND[W.biome[i]];
      W.tiles[i] = W.ground[i];
      W.deco[i] = D.NONE;
    }
  }
}

function provinceCenter(W, biome) {
  const p = W.provinces.find((q) => q.biome === biome);
  return { x: p.x, y: p.y };
}

function stampFootprint(W, x0, y0, bw, bh, doorX, doorY, doorTile) {
  for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) {
    const i = y * W.w + x;
    W.tiles[i] = T.BUILDING;
    W.deco[i] = D.NONE;
  }
  W.tiles[doorY * W.w + doorX] = doorTile;
}

export function stageSettlements(W) {
  const rng = makeRng(W.seed).fork('settlements');
  computeDistWater(W);
  const placed = [];
  const specs = Object.fromEntries(SETTLEMENT_SPECS.map((s) => [s.id, s]));

  const placeSettlement = (spec, opts) => {
    const site = findSite(W, { w: spec.w, h: spec.h, biomes: [spec.biome], avoid: placed, wantWater: true, ...opts }, rng);
    claimSite(W, site);
    const name = spec.id === 'home' ? placeName(rng, 0, W.usedNames) : placeName(rng, spec.biome, W.usedNames);
    const layout = layoutSettlement(spec, site, rng);
    const s = { id: spec.id, kind: spec.kind, biome: spec.biome, name, x0: site.x0, y0: site.y0, w: site.w, h: site.h, ...layout };
    s.buildings.forEach((b, k) => { b.id = `${spec.id}:b${k}`; b.settlementId = spec.id; });
    // Stamp plaza, footpaths and buildings.
    for (let y = s.plaza.y; y < s.plaza.y + s.plaza.h; y++) for (let x = s.plaza.x; x < s.plaza.x + s.plaza.w; x++) W.tiles[at(W, x, y)] = T.PLAZA;
    for (const p of s.paths) for (const q of p) if (W.tiles[at(W, q.x, q.y)] !== T.PLAZA) W.tiles[at(W, q.x, q.y)] = T.ROAD;
    for (const b of s.buildings) {
      stampFootprint(W, b.x, b.y, b.w, b.h, b.door.x, b.door.y, T.DOOR);
      W.props.push({ kind: 'building', ...b });
    }
    W.deco[at(W, s.well.x, s.well.y)] = D.WELL;
    W.pois.shrines.push({ id: `shrine:${spec.id}`, x: s.shrine.x, y: s.shrine.y, settlementId: spec.id });
    W.deco[at(W, s.shrine.x, s.shrine.y)] = D.SHRINE;
    // Survivable anchor: dig a pond beside settlements that have no water nearby.
    const dw = W.distWater[s.center.y * W.w + s.center.x];
    if (dw < 0 || dw > Math.max(s.w, s.h)) digPond(W, s, rng);
    W.settlements.push(s);
    placed.push({ x: site.cx, y: site.cy });
    return s;
  };

  const placeLandmark = (id, biome, bw, bh, opts) => {
    const site = findSite(W, { w: bw + 4, h: bh + 4, biomes: [biome], avoid: placed, maxLiquid: 2, ...opts }, rng);
    claimSite(W, site, 2);
    const x0 = site.x0 + 2, y0 = site.y0 + 1;
    const door = { x: x0 + (bw >> 1), y: y0 + bh - 1 };
    stampFootprint(W, x0, y0, bw, bh, door.x, door.y, T.DUNGEON);
    const lm = { id, biome, x: x0, y: y0, w: bw, h: bh, door, front: { x: door.x, y: door.y + 1 } };
    W.props.push({ kind: id === 'spire' ? 'spire' : 'dungeon', ...lm });
    placed.push({ x: site.cx, y: site.cy });
    return lm;
  };

  const home = placeSettlement(specs.home, { target: provinceCenter(W, BIOME.FOREST), targetWeight: 0.2 });
  W.pois.home = home.center;
  const homeDoor = home.buildings.find((b) => b.type === 'home');
  W.pois.homeDoor = homeDoor ? { x: homeDoor.door.x, y: homeDoor.door.y + 1 } : home.center;

  W.pois.dungeons.verdant = placeLandmark('verdant', BIOME.FOREST, 5, 4, {
    prefer: (cx, cy) => -Math.abs(Math.hypot(cx - home.center.x, cy - home.center.y) - 60) * 0.3,
    minAvoid: 30,
  });
  const v = W.pois.dungeons.verdant;
  placeSettlement(specs.outpost, {
    target: { x: home.center.x + (v.x - home.center.x) * 0.55, y: home.center.y + (v.y - home.center.y) * 0.55 },
    targetWeight: 0.35, minAvoid: 16,
  });
  placeSettlement(specs.swamp, { target: provinceCenter(W, BIOME.SWAMP), targetWeight: 0.12 });
  placeSettlement(specs.desert, { target: W.oases[0] || provinceCenter(W, BIOME.DESERT), targetWeight: 0.25 });
  placeSettlement(specs.mountain, { target: provinceCenter(W, BIOME.MOUNTAIN), targetWeight: 0.12 });
  const vol = placeSettlement(specs.volcanic, { target: provinceCenter(W, BIOME.VOLCANIC), targetWeight: 0.1, minAvoid: 16 });
  const snow = placeSettlement(specs.snow, { target: provinceCenter(W, BIOME.SNOW), targetWeight: 0.1, minAvoid: 16 });

  const far = (s, ideal) => (cx, cy) => -Math.abs(Math.hypot(cx - s.center.x, cy - s.center.y) - ideal) * 0.25;
  W.pois.dungeons.ashen = placeLandmark('ashen', BIOME.VOLCANIC, 5, 4, { prefer: far(vol, 26), minAvoid: 16 });
  W.pois.dungeons.frost = placeLandmark('frost', BIOME.SNOW, 5, 4, { prefer: far(snow, 26), minAvoid: 16 });
  const sw = W.settlements.find((s) => s.id === 'swamp');
  W.pois.dungeons.drowned = placeLandmark('drowned', BIOME.SWAMP, 5, 4, { prefer: far(sw, 32) });
  const mt = W.settlements.find((s) => s.id === 'mountain');
  W.pois.spire = placeLandmark('spire', BIOME.MOUNTAIN, 5, 5, { prefer: far(mt, 24) });

  // People.
  for (const s of W.settlements) {
    const people = rosterFor(s, rng, W.usedNames);
    s.npcIds = people.map((p) => p.id);
    W.npcs.push(...people);
  }
  markCliffs(W);
}

function digPond(W, s, rng) {
  const side = rng.chance(0.5) ? -1 : 1;
  const cx = side < 0 ? s.x0 - 4 : s.x0 + s.w + 3, cy = s.y0 + (s.h >> 1);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, y = cy + dy;
    if (!inside(W, x, y) || isBorder(W, x, y) || Math.hypot(dx, dy) > 2.3) continue;
    const i = at(W, x, y);
    if (W.tiles[i] === T.RIDGE || W.tiles[i] === T.BUILDING || W.reserved[i] === 2) continue;
    W.tiles[i] = T.WATER; W.ground[i] = GROUND[W.biome[i]]; W.deco[i] = D.NONE; W.elev[i] = W.elev[at(W, s.center.x, s.center.y)];
  }
}

// ---------------------------------------------------------------- 5. roads
// ridgeBiome: the one gated region whose ridge this road may cross (null = none).
function roadCost(W, ridgeBiome) {
  return (x0, y0, x1, y1) => {
    const i = y1 * W.w + x1, t = W.tiles[i];
    if (t === T.BORDER || t === T.BUILDING || t === T.DOOR || t === T.DUNGEON || t === T.LAVA) return Infinity;
    if (t === T.RIDGE) return W.biome[i] === ridgeBiome ? 60 : Infinity;
    if (t === T.CRACKED || t === T.BOULDER) return Infinity;
    let c = t === T.ROAD || t === T.PLAZA || t === T.STAIRS || t === T.BRIDGE ? 0.3 : 1;
    if (t === T.WATER || t === T.SHALLOW) c += 7;
    const de = Math.abs(W.elev[i] - W.elev[y0 * W.w + x0]);
    if (de === 1) c += 6; else if (de > 1) c += 18;
    if (t === T.CLIFF) c += 3;
    const d = W.deco[i];
    if (d === D.TREE || d === D.ROCK || d === D.BUSH) c += 0.5;
    else if (DECO_SOLID.has(d)) return Infinity; // wells, signs, tents stay put
    return c;
  };
}

function laySegment(W, from, to, opts = {}) {
  const ridgeBiome = opts.gate ? (opts.region === 'volcanic' ? BIOME.VOLCANIC : BIOME.SNOW) : null;
  const path = astar(W.w, W.h, roadCost(W, ridgeBiome), from, to, 0.6);
  if (!path) return null;
  let gatePlaced = false;
  for (let k = 0; k < path.length; k++) {
    const { x, y } = path[k], i = at(W, x, y), t = W.tiles[i];
    if (t === T.PLAZA || t === T.CRACKED || t === T.BOULDER) continue;
    if (t === T.RIDGE) {
      if (opts.gate && !gatePlaced) {
        W.tiles[i] = opts.gate === 'bombs' ? T.CRACKED : T.BOULDER;
        W.pois.gates.push({ x, y, type: opts.gate, region: opts.region });
        gatePlaced = true;
      } else W.tiles[i] = T.ROAD;
      W.deco[i] = D.NONE;
      continue;
    }
    if (t === T.WATER || t === T.SHALLOW) W.tiles[i] = T.BRIDGE;
    else if (t === T.CLIFF || isCliffAt(W, x, y)) W.tiles[i] = T.STAIRS;
    else if (t !== T.STAIRS && t !== T.BRIDGE) W.tiles[i] = T.ROAD;
    W.deco[i] = D.NONE;
    // Widen flat stretches to two tiles.
    const prev = path[k - 1] || path[k + 1];
    if (prev && W.tiles[i] === T.ROAD) {
      const vertical = prev.x === x;
      const wx = vertical ? x + 1 : x, wy = vertical ? y : y + 1, j = at(W, wx, wy);
      if (inside(W, wx, wy) && W.elev[j] === W.elev[i] && !TILE_INFO[W.tiles[j]].solid && !LIQUID.has(W.tiles[j]) && W.tiles[j] !== T.PLAZA && W.tiles[j] !== T.DOOR && W.tiles[j] !== T.DUNGEON && W.tiles[j] !== T.CAVE) {
        W.tiles[j] = T.ROAD;
        W.deco[j] = D.NONE;
      }
    }
  }
  W.roads.push(path);
  return path;
}

function isCliffAt(W, x, y) {
  const e = W.elev[at(W, x, y)];
  return N4.some(([dx, dy]) => inside(W, x + dx, y + dy) && W.elev[at(W, x + dx, y + dy)] < e);
}

export function stageRoads(W) {
  const S = Object.fromEntries(W.settlements.map((s) => [s.id, s.center]));
  const Dg = W.pois.dungeons;
  laySegment(W, S.home, S.outpost);
  laySegment(W, S.outpost, Dg.verdant.front);
  laySegment(W, S.home, S.swamp);
  laySegment(W, S.home, S.desert);
  laySegment(W, S.home, S.mountain);
  laySegment(W, S.mountain, W.pois.spire.front);
  laySegment(W, S.swamp, Dg.drowned.front);
  laySegment(W, S.desert, S.volcanic, { gate: 'bombs', region: 'volcanic' });
  laySegment(W, S.volcanic, Dg.ashen.front);
  laySegment(W, S.mountain, S.snow, { gate: 'gloves', region: 'snow' });
  laySegment(W, S.snow, Dg.frost.front);
  laySegment(W, S.swamp, S.mountain);
  connectComponents(W);
}

export function isPassable(W, x, y, tools = {}) {
  if (!inside(W, x, y)) return false;
  const i = y * W.w + x, t = W.tiles[i];
  if (t === T.CRACKED) return !!tools.bombs;
  if (t === T.BOULDER) return !!tools.gloves;
  if (TILE_INFO[t].solid) return false;
  const d = W.deco[i];
  return !(DECO_SOLID.has(d) && d !== D.BUSH);
}

export function reachableFrom(W, start, tools = {}) {
  return bfsDistances(W.w, W.h, (x, y) => isPassable(W, x, y, tools), [start]);
}

// Carve natural stairs/fords so pockets separated by cliffs or rivers join the road network.
function connectComponents(W) {
  const rng = makeRng(W.seed).fork('stairs');
  const pass = (x, y) => isPassable(W, x, y, { bombs: true, gloves: true });
  const { labels, sizes } = components(W.w, W.h, pass);
  const parent = sizes.map((_, k) => k);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const cands = [];
  for (let y = BORDER_W + 1; y < W.h - BORDER_W - 1; y++) for (let x = BORDER_W + 1; x < W.w - BORDER_W - 1; x++) {
    const i = at(W, x, y), t = W.tiles[i];
    if (t !== T.CLIFF && t !== T.WATER) continue;
    if (W.reserved[i]) continue;
    for (const [ax, ay, bx, by] of [[0, -1, 0, 1], [-1, 0, 1, 0]]) {
      const a = labels[at(W, x + ax, y + ay)], b = labels[at(W, x + bx, y + by)];
      if (a >= 0 && b >= 0 && a !== b) cands.push({ x, y, a, b, t });
    }
  }
  rng.shuffle(cands);
  const used = [];
  for (const c of cands) {
    const ra = find(c.a), rb = find(c.b);
    const big = Math.max(sizes[c.a], sizes[c.b]) >= 30 && Math.min(sizes[c.a], sizes[c.b]) >= 12;
    let make = false;
    if (ra !== rb && big) { parent[ra] = rb; make = true; }
    else if (ra === rb && big && rng.chance(0.05) && !used.some((u) => Math.abs(u.x - c.x) + Math.abs(u.y - c.y) < 14)) make = true; // extra loops
    if (!make) continue;
    W.tiles[at(W, c.x, c.y)] = c.t === T.CLIFF ? T.STAIRS : T.BRIDGE;
    used.push(c);
  }
}

// ---------------------------------------------------------------- 6. encounters & quest content
const LORE = [
  'Carved in old script: "Four wards to bind the restless deep. One Ember to keep them warm."',
  'A weathered plaque: "When the Hearth Ember gutters, the wards turn upon their keepers."',
  'Scratched beneath moss: "The Warden of thorns was a gardener once. It still tends something."',
  'Etched in soot: "Ash falls upward near the Reliquary. The Cinder Warden counts every flame."',
  'Frost-rimed runes: "The Sovereign of rime keeps a sanctuary no living hand has warmed."',
  'Half-drowned stone: "The fourth ward sank with the western fane. The water remembers."',
  'A cracked obelisk: "Bring back the shards, and the Spire will open for the one who carries them."',
];

export function stageContent(W) {
  const rng = makeRng(W.seed).fork('content');
  const pass = (x, y) => isPassable(W, x, y, { bombs: true, gloves: true });
  const reach = bfsDistances(W.w, W.h, pass, [W.pois.home]);
  const roadSrc = [];
  for (let i = 0; i < W.w * W.h; i++) if (W.tiles[i] === T.ROAD || W.tiles[i] === T.STAIRS || W.tiles[i] === T.BRIDGE) roadSrc.push({ x: i % W.w, y: (i / W.w) | 0 });
  const roadDist = bfsDistances(W.w, W.h, () => true, roadSrc);
  const nearSettlement = (x, y, r) => W.settlements.some((s) => x > s.x0 - r && x < s.x0 + s.w + r && y > s.y0 - r && y < s.y0 + s.h + r);
  const nearLandmark = (x, y, r) => Object.values(W.pois.dungeons).concat([W.pois.spire]).some((d) => Math.hypot(d.front.x - x, d.front.y - y) < r);
  const keep = new Uint8Array(W.w * W.h); // approaches that later content must not cover
  const keepClear = (x, y, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inside(W, x + dx, y + dy)) keep[at(W, x + dx, y + dy)] = 1; };
  for (const d of Object.values(W.pois.dungeons).concat([W.pois.spire])) keepClear(d.front.x, d.front.y + 1, 2);
  for (const g of W.pois.gates) keepClear(g.x, g.y, 2);
  const free = (x, y) => {
    const i = at(W, x, y);
    return reach[i] >= 0 && !keep[i] && !TILE_INFO[W.tiles[i]].solid && !W.deco[i] && W.tiles[i] !== T.ROAD && W.tiles[i] !== T.STAIRS && W.tiles[i] !== T.BRIDGE && !LIQUID.has(W.tiles[i]) && W.tiles[i] !== T.DOOR && W.tiles[i] !== T.DUNGEON && W.tiles[i] !== T.CAVE && W.tiles[i] !== T.PLAZA;
  };
  const randomTile = (pred, tries = 3000) => {
    for (let k = 0; k < tries; k++) {
      const x = rng.int(BORDER_W + 2, W.w - BORDER_W - 3), y = rng.int(BORDER_W + 2, W.h - BORDER_W - 3);
      if (pred(x, y)) return { x, y };
    }
    return null;
  };

  // Caves: mouths cut into south-facing cliff faces.
  const caveQuota = [2, 1, 1, 2, 1, 1];
  let caveN = 0;
  for (let b = 0; b < 6; b++) {
    for (let q = 0; q < caveQuota[b]; q++) {
      const caveSpot = (strict) => (x, y) => {
        const i = at(W, x, y);
        if (W.tiles[i] !== T.CLIFF || (strict && W.biome[i] !== b)) return false;
        const s = at(W, x, y + 1), n = at(W, x, y - 1);
        if (!free(x, y + 1) || W.elev[s] >= W.elev[i] || W.tiles[n] === T.RIDGE) return false;
        if (strict && (W.elev[n] !== W.elev[i] || W.tiles[at(W, x - 1, y)] !== T.CLIFF || W.tiles[at(W, x + 1, y)] !== T.CLIFF)) return false;
        if (nearSettlement(x, y, 8) || W.pois.caves.some((c) => Math.hypot(c.x - x, c.y - y) < (strict ? 20 : 12))) return false;
        return roadDist[s] >= 2 && roadDist[s] <= (strict ? 18 : 40);
      };
      const spot = randomTile(caveSpot(true), 20000) || randomTile(caveSpot(false), 40000);
      if (!spot) continue;
      W.tiles[at(W, spot.x, spot.y)] = T.CAVE;
      keepClear(spot.x, spot.y + 2, 1);
      W.pois.caves.push({ id: `cave${caveN++}`, x: spot.x, y: spot.y, biome: W.biome[at(W, spot.x, spot.y)], front: { x: spot.x, y: spot.y + 1 } });
    }
  }

  // Every blocking placement is verified: if it would cut anything off from home, it is reverted.
  const countReach = () => { let n = 0; const d = bfsDistances(W.w, W.h, pass, [W.pois.home]); for (let i = 0; i < d.length; i++) if (d[i] >= 0) n++; return n; };
  let reachCount = countReach();
  const tryPlace = (changes) => {
    const saved = changes.map(([x, y]) => [at(W, x, y), W.tiles[at(W, x, y)], W.deco[at(W, x, y)]]);
    for (const [x, y, tile, deco] of changes) {
      const i = at(W, x, y);
      if (tile !== undefined && tile !== null) W.tiles[i] = tile;
      if (deco !== undefined) W.deco[i] = deco;
    }
    const n = countReach();
    if (n < reachCount - changes.length) {
      for (const [i, t, d] of saved) { W.tiles[i] = t; W.deco[i] = d; }
      return false;
    }
    reachCount = n;
    return true;
  };
  const place = (pred, build, tries = 6) => {
    for (let k = 0; k < tries; k++) {
      const spot = pred();
      if (!spot) return null;
      if (tryPlace(build(spot))) return spot;
    }
    return null;
  };

  // Camps beside roads, in resource-rich open ground.
  const campQuota = [3, 1, 2, 1, 1, 1];
  let campN = 0;
  for (let b = 0; b < 6; b++) {
    for (let q = 0; q < campQuota[b]; q++) {
      const spot = place(() => randomTile((x, y) => {
        if (W.biome[at(W, x, y)] !== b || roadDist[at(W, x, y)] < 3 || roadDist[at(W, x, y)] > 7) return false;
        if (nearSettlement(x, y, 12) || nearLandmark(x, y, 10) || W.pois.camps.some((c) => Math.hypot(c.x - x, c.y - y) < 18)) return false;
        const e = W.elev[at(W, x, y)];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const i = at(W, x + dx, y + dy);
          if (W.elev[i] !== e || TILE_INFO[W.tiles[i]].solid || LIQUID.has(W.tiles[i]) || reach[i] < 0 || keep[i]) return false;
        }
        return true;
      }, 20000), (p) => {
        const ch = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) ch.push([p.x + dx, p.y + dy, null, D.NONE]);
        ch.push([p.x, p.y, null, D.FIRE], [p.x - 2, p.y - 1, null, D.TENT], [p.x + 2, p.y - 1, null, D.TENT]);
        if (rng.chance(0.6)) ch.push([p.x + 1, p.y + 2, null, D.RUIN]);
        return ch;
      });
      if (!spot) continue;
      keepClear(spot.x, spot.y, 3);
      W.pois.camps.push({ id: `camp${campN++}`, x: spot.x, y: spot.y, biome: b, size: rng.int(3, 4) + (GATED.has(b) ? 1 : 0), entry: { x: spot.x, y: spot.y + 1 } });
    }
  }
  // The scout's quest camp: the forest camp nearest the outpost.
  const outpost = W.settlements.find((s) => s.id === 'outpost');
  const forestCamps = W.pois.camps.filter((c) => c.biome === BIOME.FOREST);
  if (forestCamps.length) {
    forestCamps.sort((a, b) => Math.hypot(a.x - outpost.center.x, a.y - outpost.center.y) - Math.hypot(b.x - outpost.center.x, b.y - outpost.center.y));
    forestCamps[0].quest = true;
  }

  // Wild shrines beside each dungeon and at two road waypoints.
  for (const key of ['verdant', 'ashen', 'frost']) {
    const d = W.pois.dungeons[key];
    const options = [[-4, 2], [4, 2], [-3, 3], [3, 3], [-5, 1], [5, 1], [-4, 4], [4, 4]].map(([dx, dy]) => ({ x: d.front.x + dx, y: d.front.y + dy })).filter((p) => free(p.x, p.y));
    const spot = options.find((p) => tryPlace([[p.x, p.y, null, D.SHRINE]]));
    if (spot) { W.pois.shrines.push({ id: `shrine:${key}`, x: spot.x, y: spot.y }); keepClear(spot.x, spot.y, 1); }
  }
  for (let k = 0; k < 2; k++) {
    const spot = place(() => randomTile((x, y) => free(x, y) && roadDist[at(W, x, y)] === 2 && !nearSettlement(x, y, 20) && !GATED.has(W.biome[at(W, x, y)]) && !W.pois.shrines.some((s) => Math.hypot(s.x - x, s.y - y) < 30)), (p) => [[p.x, p.y, null, D.SHRINE]]);
    if (spot) { W.pois.shrines.push({ id: `shrine:wild${k}`, x: spot.x, y: spot.y }); keepClear(spot.x, spot.y, 1); }
  }

  // Hidden supply caches: glints in the open, and alcoves sealed by cracked rock or boulders.
  let cacheN = 0;
  for (let k = 0; k < 7; k++) {
    const spot = randomTile((x, y) => free(x, y) && roadDist[at(W, x, y)] >= 4 && !nearSettlement(x, y, 6) && W.deco[at(W, x - 1, y)] === D.TREE);
    if (spot) W.pois.caches.push({ id: `cache${cacheN++}`, x: spot.x, y: spot.y, kind: 'glint', biome: W.biome[at(W, spot.x, spot.y)] });
  }
  for (const kind of ['cracked', 'cracked', 'cracked', 'boulder', 'boulder', 'boulder']) {
    const spot = place(() => randomTile((x, y) => {
      if (!free(x, y) || nearSettlement(x, y, 8) || nearLandmark(x, y, 8) || roadDist[at(W, x, y)] < 3) return false;
      if (W.tiles[at(W, x, y - 1)] !== T.CLIFF) return false; // tucked under a cliff
      return free(x - 1, y) && free(x + 1, y) && free(x, y + 1) && free(x, y + 2);
    }, 20000), (p) => [[p.x - 1, p.y, null, D.ROCK], [p.x + 1, p.y, null, D.ROCK], [p.x, p.y + 1, kind === 'cracked' ? T.CRACKED : T.BOULDER, D.NONE]]);
    if (!spot) continue;
    keepClear(spot.x, spot.y + 1, 1);
    W.pois.caches.push({ id: `cache${cacheN++}`, x: spot.x, y: spot.y, kind, biome: W.biome[at(W, spot.x, spot.y)] });
  }

  // Lore stones near roads and ruins.
  LORE.forEach((text, k) => {
    const spot = place(() => randomTile((x, y) => free(x, y) && roadDist[at(W, x, y)] >= 2 && roadDist[at(W, x, y)] <= 5 && !nearSettlement(x, y, 10) && !W.pois.lore.some((l) => Math.hypot(l.x - x, l.y - y) < 22)), (p) => [[p.x, p.y, null, D.LORE]]);
    if (spot) W.pois.lore.push({ id: `lore${k}`, x: spot.x, y: spot.y, text });
  });

  // Signposts at each settlement's southern approach.
  for (const st of W.settlements) {
    const others = W.settlements.filter((o) => o !== st).sort((a, b) => Math.hypot(a.center.x - st.center.x, a.center.y - st.center.y) - Math.hypot(b.center.x - st.center.x, b.center.y - st.center.y));
    const sx = st.x0 + (st.w >> 1) - 3, sy = st.y0 + st.h - 1;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, -1], [2, 0], [-2, 0], [0, 1]]) {
      const x = sx + dx, y = sy + dy, i = at(W, x, y);
      if (W.tiles[i] !== W.ground[i] || TILE_INFO[W.tiles[i]].solid || W.deco[i]) continue;
      if (!tryPlace([[x, y, null, D.SIGN]])) continue;
      W.pois.signs.push({ x, y, text: `${st.name}. The nearest roads lead to ${others.slice(0, 2).map((o) => o.name).join(' and ')}.` });
      break;
    }
  }

  // Wild encounters and road patrols.
  let spawnN = 0;
  for (let k = 0; k < 70; k++) {
    const spot = randomTile((x, y) => free(x, y) && !nearSettlement(x, y, 14) && !nearLandmark(x, y, 6) && Math.hypot(x - W.pois.home.x, y - W.pois.home.y) > 22 && !W.pois.spawns.some((s) => Math.hypot(s.x - x, s.y - y) < 9));
    if (!spot) continue;
    W.pois.spawns.push({ id: `sp${spawnN++}`, x: spot.x, y: spot.y, biome: W.biome[at(W, spot.x, spot.y)], count: rng.int(1, 3) });
  }
  for (const path of W.roads) {
    if (path.length < 40 || W.pois.patrols.length >= 7) continue;
    const s = rng.int(10, path.length - 30), len = rng.int(14, 24);
    const pts = path.slice(s, s + len);
    if (pts.some((p) => nearSettlement(p.x, p.y, 10))) continue;
    W.pois.patrols.push({ id: `pt${W.pois.patrols.length}`, path: pts, biome: W.biome[at(W, pts[0].x, pts[0].y)] });
  }
  // Clear decoration from anything solid it ended up on.
  for (let i = 0; i < W.w * W.h; i++) if (TILE_INFO[W.tiles[i]].solid && W.deco[i]) W.deco[i] = D.NONE;
}
