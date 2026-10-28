// Swept tile collision for actors. Actor: {x, y, w, h} with (x, y) at the hitbox center.
import { TILE } from '../world/tiles.js';

export const MAX_DT = 1 / 30;
export const clampDt = (dt) => Math.min(Math.max(dt || 0, 0), MAX_DT);

export function rectSolid(map, x, y, w, h, solidFn) {
  const x0 = Math.floor((x - w / 2) / TILE), x1 = Math.floor((x + w / 2 - 0.001) / TILE);
  const y0 = Math.floor((y - h / 2) / TILE), y1 = Math.floor((y + h / 2 - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidFn(tx, ty)) return true;
  return false;
}

// Moves in sub-steps of at most 4px per axis so nothing tunnels through a wall, then creeps the
// last step 1px at a time so actors end flush against what they hit. `slide` nudges around corners.
export function moveActor(map, a, dx, dy, opts = {}) {
  const solid = opts.solid || ((tx, ty) => map.isSolid(tx, ty));
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const sx = dx / steps, sy = dy / steps;
  let hitX = false, hitY = false;
  const blocked = () => rectSolid(map, a.x, a.y, a.w, a.h, solid);
  for (let k = 0; k < steps; k++) {
    if (sx && !hitX) {
      a.x += sx;
      if (blocked()) {
        a.x -= sx;
        const dir = Math.sign(sx);
        for (let n = 0; n < Math.ceil(Math.abs(sx)); n++) { a.x += dir; if (blocked()) { a.x -= dir; break; } }
        hitX = true;
      }
    }
    if (sy && !hitY) {
      a.y += sy;
      if (blocked()) {
        a.y -= sy;
        const dir = Math.sign(sy);
        for (let n = 0; n < Math.ceil(Math.abs(sy)); n++) { a.y += dir; if (blocked()) { a.y -= dir; break; } }
        hitY = true;
      }
    }
  }
  if (opts.slide) {
    // Corner correction: when pushing straight into an edge, slip sideways if a gap is close.
    const reach = opts.slide;
    if (hitX && Math.abs(dy) < 0.01) nudge(a, 'y', Math.sign(dx), 0, reach, solid, map, Math.abs(dx));
    if (hitY && Math.abs(dx) < 0.01) nudge(a, 'x', 0, Math.sign(dy), reach, solid, map, Math.abs(dy));
  }
  return { hitX, hitY };
}

function nudge(a, axis, dirX, dirY, reach, solid, map, amount) {
  for (let off = 1; off <= reach; off++) {
    for (const sgn of [-1, 1]) {
      const nx = a.x + (axis === 'x' ? off * sgn : 0) + dirX * 2;
      const ny = a.y + (axis === 'y' ? off * sgn : 0) + dirY * 2;
      if (!rectSolid(map, nx, ny, a.w, a.h, solid)) {
        const step = Math.min(off, Math.max(0.5, amount));
        if (axis === 'x') a.x += step * sgn; else a.y += step * sgn;
        if (rectSolid(map, a.x, a.y, a.w, a.h, solid)) { if (axis === 'x') a.x -= step * sgn; else a.y -= step * sgn; }
        return;
      }
    }
  }
}

// Find the nearest free spot for an actor (used after knockback into hazards, spawns, loads).
export function findFreeSpot(map, a, maxRadius = 6) {
  const solid = (tx, ty) => map.isSolid(tx, ty);
  if (!rectSolid(map, a.x, a.y, a.w, a.h, solid)) return true;
  const cx = Math.floor(a.x / TILE), cy = Math.floor(a.y / TILE);
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (cx + dx) * TILE + TILE / 2, y = (cy + dy) * TILE + TILE / 2;
      if (!rectSolid(map, x, y, a.w, a.h, solid)) { a.x = x; a.y = y; return true; }
    }
  }
  return false;
}
