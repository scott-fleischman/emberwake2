export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2;
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function normalize(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? [x / l, y / l] : [0, 0];
}

export function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Facing as unit vector from a cardinal name.
export const DIRS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

export function facingFromVector(x, y, fallback = 'down') {
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return fallback;
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}
