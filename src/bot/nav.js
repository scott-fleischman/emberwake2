// Pathfinding helpers for the autoplay bot: walkable tiles, A* paths and reachability.
import { astar, bfsDistances } from '../core/grid.js';
import { TILE, T, TILE_INFO, D } from '../world/tiles.js';

const AVOID = new Set([T.PIT, T.LAVA, T.HAZARD, T.THORNS]);

// A bush the sword can clear (the overworld assumes you will).
export const isBush = (map, x, y) => map.inBounds(x, y) && map.deco[y * map.w + x] === D.BUSH && !TILE_INFO[map.tiles[y * map.w + x]].solid && !map.extraSolid[y * map.w + x];

// Can the player stand on this tile? `avoid` is an optional set of tile indices to treat as blocked.
export function walkable(map, x, y, avoid, bush = false) {
  if (!map.inBounds(x, y)) return false;
  if (map.isSolid(x, y) && !(bush && isBush(map, x, y))) return false;
  const t = map.tiles[y * map.w + x];
  if (AVOID.has(t) || TILE_INFO[t]?.damage) return false;
  return !(avoid && avoid.has(y * map.w + x));
}

export function stepCost(map, x, y) {
  if (isBush(map, x, y)) return 5;
  const t = map.tiles[y * map.w + x];
  return t === T.SHALLOW || t === T.TALLGRASS ? 1.6 : 1;
}

const cutsBushes = (map) => !!map.ground; // only the overworld has bushes

export function findPath(map, from, to, avoid) {
  if (from.x === to.x && from.y === to.y) return [from];
  const bush = cutsBushes(map);
  return astar(map.w, map.h, (ax, ay, nx, ny) => {
    if (nx === to.x && ny === to.y && !map.isSolid(nx, ny)) return 1;
    return walkable(map, nx, ny, avoid, bush) ? stepCost(map, nx, ny) : Infinity;
  }, from, to);
}

export function reachMap(map, from, avoid) {
  const bush = cutsBushes(map);
  return bfsDistances(map.w, map.h, (x, y) => walkable(map, x, y, avoid, bush) || (x === from.x && y === from.y), [from]);
}

export const tileOf = (px, py) => ({ x: Math.floor(px / TILE), y: Math.floor(py / TILE) });
export const center = (t) => ({ x: t.x * TILE + 8, y: t.y * TILE + 8 });

// The nearest walkable tile beside `t` (4-neighbours), as seen from `from` (shortest straight line).
export function besideTile(map, t, from, reach) {
  let best = null, bd = Infinity;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = t.x + dx, y = t.y + dy;
    if (!walkable(map, x, y, null, cutsBushes(map))) continue;
    if (reach && reach[y * map.w + x] < 0) continue;
    const d = Math.hypot(x - from.x, y - from.y);
    if (d < bd) { bd = d; best = { x, y, face: [-dx, -dy] }; }
  }
  return best;
}

// The closest tile to `goal` that the player can stand on and reach from `from`.
export function standableNear(map, goal, from, maxR = 6, reach = reachMap(map, from)) {
  const ok = (x, y) => map.inBounds(x, y) && walkable(map, x, y) && reach[y * map.w + x] >= 0;
  if (ok(goal.x, goal.y)) return goal;
  for (let r = 1; r <= maxR; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(goal.x + dx, goal.y + dy)) continue;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = { x: goal.x + dx, y: goal.y + dy }; }
    }
    if (best) return best;
  }
  return null;
}
