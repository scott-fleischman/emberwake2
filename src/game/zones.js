// Danger zones: every telegraphed attack publishes its hazard here as plain data. The area keeps
// one list, and drawing, hit checks and the bot's danger reading all read it, so a new attack
// needs no special cases anywhere else.
import { TAU, angleDiff, clamp } from '../core/math.js';

// The player's hitbox is 10x8; this much of it counts as inside a zone.
export const HIT_PAD = 4;

const DEFAULTS = { t: 0.8, life: 0, dmg: 1, effect: null, knock: 0, rgb: '255,80,60', art: null, owner: null, blockable: false, vx: 0, vy: 0, grow: 0, hit: false };

// `t` is seconds until the strike (negative once live); `t0` remembers it for the fill-in.
export function makeZone(shape, fields) {
  const z = { shape, ...DEFAULTS, ...fields };
  z.t0 = z.t || 0.001;
  if (shape === 'ring') z.gaps ??= [];
  // Ownerless segments still need a position: damagePlayer reads src.x/y for knockback and blocks.
  if (shape === 'segment') Object.defineProperties(z, { x: { get() { return (this.x1 + this.x2) / 2; } }, y: { get() { return (this.y1 + this.y2) / 2; } } });
  return z;
}

const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const k = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - ax - vx * k, py - ay - vy * k);
};

// Each shape grows by `pad` on every side. A gap in a ring shrinks by the angle that pad covers,
// so a body too wide to fit through it is still caught.
export function inZone(z, x, y, pad = 0) {
  switch (z.shape) {
    case 'circle': return Math.hypot(x - z.x, y - z.y) <= z.r + pad;
    case 'segment': return segDist(x, y, z.x1, z.y1, z.x2, z.y2) <= z.w / 2 + pad;
    case 'ring': {
      const d = Math.hypot(x - z.x, y - z.y);
      if (Math.abs(d - z.r) > z.width / 2 + pad) return false;
      const a = Math.atan2(y - z.y, x - z.x), slack = pad / Math.max(d, 1);
      return !z.gaps.some(([ga, hw]) => Math.abs(angleDiff(ga, a)) <= hw - slack);
    }
    case 'cone': {
      const d = Math.hypot(x - z.x, y - z.y);
      if (d > z.r + pad) return false;
      return d <= pad || Math.abs(angleDiff(z.a, Math.atan2(y - z.y, x - z.x))) <= z.spread + pad / d;
    }
  }
  return false;
}

// 0 outside, 1 early warning, 2 about to land, 3 live.
export function zoneDanger(z, x, y, pad = 0) {
  if (!inZone(z, x, y, pad)) return 0;
  return z.t <= 0 ? 3 : z.t < 0.9 ? 2 : 1;
}

function move(z, dt) {
  const dx = z.vx * dt, dy = z.vy * dt;
  if (z.shape === 'segment') { z.x1 += dx; z.x2 += dx; z.y1 += dy; z.y2 += dy; z.w += z.grow * dt * 2; return; }
  z.x += dx; z.y += dy; z.r += z.grow * dt;
}

// Counts every zone down, strikes the player once as each goes live, and returns the survivors.
export function tickZones(zones, dt, ctx) {
  const g = ctx.game, p = ctx.player, keep = [];
  for (const z of zones) {
    const o = z.owner;
    if (o && !z.art && (o.dead || o.hp <= 0)) continue;
    z.t -= dt;
    if (z.t <= 0) {
      move(z, Math.min(dt, -z.t));
      // A strike the player rolls through is spent only if it lands: a lingering zone gets another
      // try once the invulnerability ends.
      if (!z.hit && p.mode !== 'dead' && inZone(z, p.x, p.y, HIT_PAD)) {
        if (z.dmg > 0) { if (g.damagePlayer(z.dmg, o ?? z, { effect: z.effect, knock: z.knock }) !== 'ignored') z.hit = true; }
        else if (z.effect && p.iframes <= 0) { g.applyEffect(z.effect, o ?? z); z.hit = true; }
      }
      if (z.t <= -z.life) continue;
    }
    keep.push(z);
  }
  return keep;
}

// ---------------------------------------------------------------- drawing
// The open stretches of a ring between its gaps, as [from, to] angles within [0, TAU].
function openArcs(gaps) {
  const cuts = [];
  for (const [a, hw] of gaps) {
    if (hw >= Math.PI) return [];
    const lo = (((a - hw) % TAU) + TAU) % TAU, hi = lo + hw * 2;
    if (hi > TAU) cuts.push([lo, TAU], [0, hi - TAU]); else cuts.push([lo, hi]);
  }
  cuts.sort((m, n) => m[0] - n[0]);
  const arcs = [];
  let at = 0;
  for (const [lo, hi] of cuts) { if (lo > at) arcs.push([at, lo]); at = Math.max(at, hi); }
  if (at < TAU) arcs.push([at, TAU]);
  return arcs;
}

function shapePath(g, z, ox, oy) {
  g.beginPath();
  switch (z.shape) {
    case 'circle': g.arc(z.x - ox, z.y - oy, Math.max(0, z.r), 0, TAU); break;
    case 'segment': {
      const dx = z.x2 - z.x1, dy = z.y2 - z.y1, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * z.w / 2, ny = (dx / l) * z.w / 2;
      g.moveTo(z.x1 - ox + nx, z.y1 - oy + ny); g.lineTo(z.x2 - ox + nx, z.y2 - oy + ny);
      g.lineTo(z.x2 - ox - nx, z.y2 - oy - ny); g.lineTo(z.x1 - ox - nx, z.y1 - oy - ny); g.closePath();
      break;
    }
    case 'ring': {
      const cx = z.x - ox, cy = z.y - oy, ro = z.r + z.width / 2, ri = Math.max(0, z.r - z.width / 2);
      for (const [a0, a1] of openArcs(z.gaps)) { g.moveTo(cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro); g.arc(cx, cy, ro, a0, a1); g.arc(cx, cy, ri, a1, a0, true); g.closePath(); }
      break;
    }
    case 'cone':
      g.moveTo(z.x - ox, z.y - oy); g.arc(z.x - ox, z.y - oy, z.r, z.a - z.spread, z.a + z.spread); g.closePath();
      break;
  }
}

// Ground patches that have gone live. Plain tinted shapes until the patch art arrives.
function drawPatchFill(g, z, ox, oy, time) {
  shapePath(g, z, ox, oy);
  g.fillStyle = `rgba(${z.rgb},${0.28 + 0.06 * Math.sin(time * 3)})`; g.fill();
  g.strokeStyle = `rgba(${z.rgb},0.5)`; g.lineWidth = 1; g.stroke();
}

// A pulsing outline that fills in as the strike nears, then glows while live.
export function drawZones(g, cam, zones, time) {
  const ox = cam.left, oy = cam.top;
  g.save();
  for (const z of zones) {
    if (z.art && z.t <= 0) { drawPatchFill(g, z, ox, oy, time); continue; }
    const live = z.t <= 0, k = live ? 1 : 1 - clamp(z.t / z.t0, 0, 1);
    shapePath(g, z, ox, oy);
    g.fillStyle = `rgba(${z.rgb},${live ? 0.5 : 0.06 + 0.4 * k * k})`; g.fill();
    g.strokeStyle = `rgba(${z.rgb},${live ? 0.9 : 0.5 + 0.35 * Math.sin(time * (8 + 12 * k))})`; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}
