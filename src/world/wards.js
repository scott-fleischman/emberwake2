// Ward seals and the quest features that break them. Each ward's door sits inside a ring of living
// barrier (thorns, fire, ice) at BFS distance SEAL_R, so every path in must cross it; the quest chain
// before each ward places its lookouts, leaf-shrines, vents and beacons out in the region.
import { T, D, BIOME } from './tiles.js';
import { bfsDistances } from '../core/grid.js';

export const SEAL_R = 5;
export const WARDS = ['verdant', 'ashen', 'frost'];
export const RELICS = { leaves: 'verdant', vents: 'ashen', beacons: 'frost' };

const at = (W, x, y) => y * W.w + x;
const far = (p, list, d) => list.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= d);

// h: helpers from stageContent {rng, free, tryPlace, randomTile, keepClear, roadDist, nearSettlement}
export function stageWardFeatures(W, h) {
  const { rng, free, tryPlace, randomTile, keepClear, roadDist, nearSettlement } = h;
  const Dg = W.pois.dungeons;
  const S = (id) => W.settlements.find((s) => s.id === id);
  const awayFromWards = (x, y, d) => [...Object.values(Dg), W.pois.spire].every((q) => Math.hypot(q.front.x - x, q.front.y - y) >= d);
  W.pois.lookouts = [];
  W.pois.relics = { leaves: [], vents: [], beacons: [] };

  // Lookouts: the best-scoring open spot that blocks nothing.
  const lookout = (id, ward, cands) => {
    cands.sort((a, b) => b.sc - a.sc);
    for (const c of cands.slice(0, 40)) {
      if (!tryPlace([[c.x, c.y, null, D.LOOKOUT]])) continue;
      W.pois.lookouts.push({ id, ward, x: c.x, y: c.y });
      keepClear(c.x, c.y, 1);
      return;
    }
  };
  // The old watchtower on the road from the outpost to the Vault.
  const road = W.roads.find((p) => { const e = p[p.length - 1]; return e.x === Dg.verdant.front.x && e.y === Dg.verdant.front.y; }) || [];
  const tower = [];
  road.forEach((p, k) => {
    if (k < road.length * 0.2 || k > road.length * 0.85) return;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = p.x + dx, y = p.y + dy, d = Math.abs(dx) + Math.abs(dy);
      if (d < 2 || !free(x, y) || !free(x, y + 1) || !awayFromWards(x, y, SEAL_R + 6)) continue;
      tower.push({ x, y, sc: W.elev[at(W, x, y)] * 3 - d + rng.float(0, 1.5) });
    }
  });
  for (let k = 0; k < 400 && tower.length < 40; k++) {
    const p = randomTile((x, y) => free(x, y) && free(x, y + 1) && W.biome[at(W, x, y)] === BIOME.FOREST && roadDist[at(W, x, y)] <= 4 && awayFromWards(x, y, SEAL_R + 6) && !nearSettlement(x, y, 6), 200);
    if (p) tower.push({ ...p, sc: -100 - Math.hypot(p.x - Dg.verdant.front.x, p.y - Dg.verdant.front.y) });
  }
  lookout('lookout', 'verdant', tower);

  // The Windcrest: the highest open ground in the snows near a road.
  const crest = [];
  const snow = S('snow');
  for (let y = 4; y < W.h - 4; y++) for (let x = 4; x < W.w - 4; x++) {
    const i = at(W, x, y);
    if (W.biome[i] !== BIOME.SNOW || roadDist[i] < 1 || roadDist[i] > 9 || !free(x, y) || !free(x, y + 1)) continue;
    if (!awayFromWards(x, y, SEAL_R + 7) || nearSettlement(x, y, 5)) continue;
    const gate = W.pois.gates.find((g) => g.region === 'snow') || snow.center;
    if (Math.hypot(x - snow.center.x, y - snow.center.y) < 12 || Math.hypot(x - gate.x, y - gate.y) < 14) continue;
    crest.push({ x, y, sc: W.elev[i] * 3 - Math.abs(Math.hypot(x - snow.center.x, y - snow.center.y) - 24) * 0.4 - roadDist[i] * 0.3 + rng.float(0, 1) });
  }
  lookout('windcrest', 'frost', crest);

  // Three relics per ward, spread through its region, each a guarded stop of its own.
  const spread = (kind, biome, anchor, build) => {
    const list = W.pois.relics[kind];
    const taken = () => [...list, ...W.pois.lookouts, ...W.pois.camps];
    for (let relax = 0; relax < 3 && list.length < 3; relax++) {
      const minGap = [14, 10, 7][relax], maxRoad = [8, 12, 30][relax], maxAnchor = [44, 60, 200][relax];
      for (let tries = 0; tries < 12 && list.length < 3; tries++) {
        const spot = randomTile((x, y) => {
          const i = at(W, x, y);
          if (W.biome[i] !== biome || roadDist[i] < 1 || roadDist[i] > maxRoad || !free(x, y)) return false;
          if (!awayFromWards(x, y, SEAL_R + 7) || nearSettlement(x, y, 9) || !far({ x, y }, taken(), minGap)) return false;
          return Math.hypot(x - anchor.x, y - anchor.y) <= maxAnchor && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => free(x + dx, y + dy)).length >= 3;
        }, 20000);
        if (!spot) break;
        if (!tryPlace(build(spot))) continue;
        list.push({ id: `${kind}${list.length}`, kind, x: spot.x, y: spot.y });
        keepClear(spot.x, spot.y, 2);
      }
    }
  };
  spread('leaves', BIOME.FOREST, Dg.verdant.front, (p) => [[p.x, p.y, null, D.ALTAR]]);
  spread('vents', BIOME.VOLCANIC, Dg.ashen.front, (p) => [[p.x, p.y, T.VENT, D.NONE]]);
  spread('beacons', BIOME.SNOW, Dg.frost.front, (p) => [[p.x, p.y, null, D.BEACON]]);
}

// Ring each ward with its seal. Runs last, so nothing placed afterwards can land on the ring.
export function stageSeals(W, pass, mustReach) {
  W.pois.seals = {};
  for (const key of WARDS) {
    const d = W.pois.dungeons[key];
    const dist = bfsDistances(W.w, W.h, pass, [d.front]);
    for (let r = SEAL_R; r >= 2; r--) {
      const ring = [];
      for (let i = 0; i < dist.length; i++) if (dist[i] === r) ring.push(i);
      const saved = ring.map((i) => ({ x: i % W.w, y: (i / W.w) | 0, t: W.tiles[i], d: W.deco[i] }));
      for (const i of ring) { W.tiles[i] = T.SEAL; W.deco[i] = D.NONE; }
      const arena = arenaFor(W, d, dist, r);
      if (arena && mustReach([arena])) {
        W.pois.seals[key] = { key, r, tiles: saved, arena, center: d.front };
        break;
      }
      for (const s of saved) { W.tiles[at(W, s.x, s.y)] = s.t; W.deco[at(W, s.x, s.y)] = s.d; }
    }
    // A ward that sits on the only road somewhere else is sealed at its door instead.
    if (!W.pois.seals[key]) {
      const i = at(W, d.door.x, d.door.y);
      W.pois.seals[key] = { key, r: 0, tiles: [{ x: d.door.x, y: d.door.y, t: W.tiles[i], d: W.deco[i] }], arena: d.front, center: d.front };
      W.tiles[i] = T.SEAL;
    }
  }
}

// Where the road meets the seal from outside: the thornwall ritual and the elites happen here.
function arenaFor(W, d, dist, r) {
  const road = W.roads.find((p) => [p[0], p[p.length - 1]].some((e) => e.x === d.front.x && e.y === d.front.y));
  if (road) {
    const pts = road[0].x === d.front.x && road[0].y === d.front.y ? road : [...road].reverse();
    const hit = pts.find((p) => dist[at(W, p.x, p.y)] >= r + 3);
    if (hit) return { x: hit.x, y: hit.y };
  }
  let best = null, bd = Infinity;
  for (let i = 0; i < dist.length; i++) if (dist[i] === r + 3) {
    const x = i % W.w, y = (i / W.w) | 0, dd = Math.hypot(x - d.front.x, y - d.front.y - 4);
    if (dd < bd) { bd = dd; best = { x, y }; }
  }
  return best;
}

// Lift a seal off the live map (the tiles are shared with the world).
export function openSeal(W, map, key) {
  const seal = W.pois.seals[key];
  if (!seal) return [];
  for (const s of seal.tiles) if (map.get(s.x, s.y) === T.SEAL) { map.set(s.x, s.y, s.t); map.setDeco(s.x, s.y, s.d); }
  return seal.tiles;
}
