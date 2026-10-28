// Settlement layouts and rosters. Pure: given a box and an rng, decide where buildings, plaza, shrine and people go.
import { astar } from '../core/grid.js';
import { personName } from '../data/names.js';

export const BUILDING_SIZES = {
  home: [5, 4], hall: [7, 5], smith: [5, 4], shop: [5, 4], seer: [4, 4], house: [4, 4], inn: [6, 4], lodge: [6, 4],
};

export const SETTLEMENT_SPECS = [
  { id: 'home', kind: 'village', biome: 0, w: 28, h: 20, buildings: ['hall', 'home', 'smith', 'shop', 'seer', 'house', 'house'] },
  { id: 'outpost', kind: 'outpost', biome: 0, w: 20, h: 15, buildings: ['lodge', 'house', 'house'] },
  { id: 'swamp', kind: 'town', biome: 1, w: 24, h: 17, buildings: ['hall', 'shop', 'inn', 'house', 'house'] },
  { id: 'desert', kind: 'town', biome: 2, w: 24, h: 17, buildings: ['hall', 'shop', 'inn', 'house', 'house'] },
  { id: 'mountain', kind: 'town', biome: 3, w: 24, h: 17, buildings: ['hall', 'shop', 'inn', 'smith', 'house'] },
  { id: 'volcanic', kind: 'outpost', biome: 5, w: 20, h: 15, buildings: ['hall', 'shop', 'house'] },
  { id: 'snow', kind: 'outpost', biome: 4, w: 20, h: 15, buildings: ['hall', 'inn', 'house'] },
];

// Who lives where: [role, buildingType|null(outdoors), questGiver]
const ROSTERS = {
  home: [['elder', 'hall'], ['smith', 'smith'], ['merchant', 'shop'], ['seer', 'seer'], ['villager', null, true], ['villager', 'house', true], ['villager', null, true]],
  outpost: [['scout', null], ['ranger', 'lodge', true], ['villager', 'house', true]],
  town: [['keeper', 'hall'], ['merchant', 'shop'], ['innkeeper', 'inn'], ['informant', null], ['villager', 'house', true], ['villager', null, true]],
  outpostGated: [['keeper', 'hall'], ['merchant', 'shop'], ['innkeeper', 'inn'], ['villager', 'house', true], ['villager', null, true]],
};

const ROOFS = ['#9c4a3c', '#3f5f8a', '#6b4f8f', '#4f7a4a', '#8a6a3a', '#7a3f5f', '#3f7a78'];

// box: {x0,y0,w,h} in world tiles. Returns tiles relative to world.
export function layoutSettlement(spec, box, rng) {
  const { x0, y0, w, h } = box;
  const occ = new Uint8Array(w * h); // 1 = building, 2 = reserved clearance
  const mark = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] < v) occ[y * w + x] = v; };
  const pw = spec.kind === 'outpost' ? 4 : 6, ph = spec.kind === 'outpost' ? 3 : 4;
  const plaza = { x: (w >> 1) - (pw >> 1), y: (h >> 1) - (ph >> 1), w: pw, h: ph };
  for (let y = plaza.y - 1; y < plaza.y + ph + 1; y++) for (let x = plaza.x - 1; x < plaza.x + pw + 1; x++) mark(x, y, 2);

  const buildings = [];
  const types = [...spec.buildings].sort((a, b) => BUILDING_SIZES[b][0] * BUILDING_SIZES[b][1] - BUILDING_SIZES[a][0] * BUILDING_SIZES[a][1]);
  for (const type of types) {
    const [bw, bh] = BUILDING_SIZES[type];
    let placed = null;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const bx = rng.int(1, w - bw - 1), by = rng.int(1, h - bh - 2);
      let ok = true;
      for (let y = by - 1; y <= by + bh + 1 && ok; y++) {
        for (let x = bx - 1; x <= bx + bw; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) { ok = false; break; }
          if (occ[y * w + x] === 1 || (occ[y * w + x] === 2 && y >= by && y < by + bh && x >= bx && x < bx + bw)) { ok = false; break; }
        }
      }
      if (ok) placed = { bx, by };
    }
    if (!placed) continue;
    const { bx, by } = placed;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) occ[y * w + x] = 1;
    const door = { x: bx + (bw >> 1), y: by + bh - 1 };
    mark(door.x, door.y + 1, 2);
    mark(door.x, door.y + 2, 2);
    buildings.push({ type, x: x0 + bx, y: y0 + by, w: bw, h: bh, door: { x: x0 + door.x, y: y0 + door.y }, roof: rng.pick(ROOFS) });
  }

  // Footpaths from each door to the plaza edge.
  const paths = [];
  const target = { x: plaza.x + (pw >> 1), y: plaza.y + ph - 1 };
  for (const b of buildings) {
    const start = { x: b.door.x - x0, y: b.door.y - y0 + 1 };
    const p = astar(w, h, (ax, ay, nx, ny) => (occ[ny * w + nx] === 1 ? Infinity : 1), start, target);
    if (p) paths.push(p.map((q) => ({ x: q.x + x0, y: q.y + y0 })));
  }

  const shrine = { x: x0 + plaza.x - 2, y: y0 + plaza.y + 1 };
  if (occ[(shrine.y - y0) * w + (shrine.x - x0)] === 1) { shrine.x = x0 + plaza.x + pw + 1; }
  const well = { x: x0 + plaza.x, y: y0 + plaza.y };
  const spots = [];
  for (let i = 0; i < 8; i++) spots.push({ x: x0 + plaza.x + rng.int(0, pw - 1), y: y0 + plaza.y + rng.pick([0, ph - 1]) });

  return {
    buildings,
    plaza: { x: x0 + plaza.x, y: y0 + plaza.y, w: pw, h: ph },
    center: { x: x0 + plaza.x + (pw >> 1), y: y0 + plaza.y + (ph >> 1) },
    shrine, well, spots, paths,
  };
}

export function rosterFor(settlement, rng, usedNames) {
  const key = settlement.id === 'home' ? 'home' : settlement.id === 'outpost' ? 'outpost'
    : settlement.kind === 'town' ? 'town' : 'outpostGated';
  const people = [];
  let spot = 0;
  for (const [role, btype, questGiver] of ROSTERS[key]) {
    const building = btype ? settlement.buildings.find((b) => b.type === btype && !b.taken) : null;
    if (btype && !building) {
      if (role !== 'villager') continue; // skip roles whose building failed to place
    }
    if (building && role !== 'villager') building.taken = true;
    const outdoor = !building;
    const s = settlement.spots[spot++ % settlement.spots.length];
    people.push({
      id: `${settlement.id}:${people.length}`,
      name: personName(rng, usedNames, role === 'elder' || role === 'keeper'),
      role,
      settlementId: settlement.id,
      buildingId: building ? building.id : null,
      x: outdoor ? s.x : null,
      y: outdoor ? s.y : null,
      questGiver: !!questGiver,
      look: rng.int(0, 7),
    });
  }
  return people;
}
