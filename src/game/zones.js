// Danger zones: every telegraphed attack publishes its hazard here as plain data. The area keeps
// one list, and drawing, hit checks and the bot's danger reading all read it, so a new attack
// needs no special cases anywhere else.
import { angleDiff, clamp } from '../core/math.js';
import { shapePath, drawPatch } from '../gfx/effects.js';

// The player's hitbox is 10x8; this much of it counts as inside a zone.
export const HIT_PAD = 4;

// spin: a segment turning about its first end, radians a second (a sweeping beam).
const DEFAULTS = { t: 0.8, life: 0, dmg: 1, effect: null, knock: 0, rgb: '255,80,60', art: null, owner: null, blockable: false, vx: 0, vy: 0, grow: 0, spin: 0, hit: false, blocked: false, cool: 0 };

// `t` is seconds until the strike (negative once live); `t0` remembers it for the fill-in.
export function makeZone(shape, fields) {
  const z = { shape, ...DEFAULTS, ...fields };
  z.t0 = z.t || 0.001;
  if (shape === 'ring') z.gaps ??= [];
  // A segment's midpoint, for anything that wants one place to call it (strikes use strikeFrom).
  if (shape === 'segment') Object.defineProperties(z, { x: { get() { return (this.x1 + this.x2) / 2; } }, y: { get() { return (this.y1 + this.y2) / 2; } } });
  return z;
}

// The point of segment a-b nearest p.
const nearest = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const k = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return [ax + vx * k, ay + vy * k];
};
const segDist = (px, py, ax, ay, bx, by) => { const [x, y] = nearest(px, py, ax, ay, bx, by); return Math.hypot(px - x, py - y); };

// Where a zone's blow comes from, for the knockback and the shield: a circle or ring's centre, a
// cone's apex, the nearest point of a line. Struck dead centre, it comes from the owner instead.
// The owner rides along for bookkeeping.
function strikeFrom(z, p) {
  const o = z.owner;
  let [x, y] = z.shape === 'segment' ? nearest(p.x, p.y, z.x1, z.y1, z.x2, z.y2) : [z.x, z.y];
  if (o && Math.hypot(p.x - x, p.y - y) < 1) { x = o.x; y = o.y; }
  return { x, y, owner: o, name: o?.name };
}

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

// How far ahead a moving or growing zone is read along its way, how finely (finer than any zone is
// thick, at the speeds they move), and how soon its arrival counts as about to land.
const AHEAD = 0.6, LOOK = 0.1, SOON = 0.3;

// A segment's far end turned by a about its near end.
const turned = (z, a) => {
  const c = Math.cos(a), s = Math.sin(a), ex = z.x2 - z.x1, ey = z.y2 - z.y1;
  return [z.x1 + ex * c - ey * s, z.y1 + ex * s + ey * c];
};

// The zone after k seconds of the motion move() gives it.
function moved(z, k) {
  const dx = z.vx * k, dy = z.vy * k;
  if (z.shape === 'segment') {
    const [x2, y2] = z.spin ? turned(z, z.spin * k) : [z.x2, z.y2];
    return { ...z, x1: z.x1 + dx, y1: z.y1 + dy, x2: x2 + dx, y2: y2 + dy, w: z.w + z.grow * k * 2 };
  }
  return { ...z, x: z.x + dx, y: z.y + dy, r: z.r + z.grow * k };
}

// 0 outside, 1 early warning, 2 about to land, 3 live. A live zone that neither hurts nor afflicts
// (a burrow's ripple) is nothing to avoid; a harmless telegraph still warns while it counts down, of
// the strike that follows it (an aim line). A wave, a ring or a sweeping beam on its way is read where
// it will be: it arrives live, so the sooner it gets here the nearer the strike.
export function zoneDanger(z, x, y, pad = 0) {
  const harms = z.dmg || z.effect;
  if (inZone(z, x, y, pad)) return z.t > 0 ? (z.t < 0.9 ? 2 : 1) : harms ? 3 : 0;
  if (!harms || !(z.vx || z.vy || z.grow || z.spin)) return 0;
  for (let s = LOOK; s <= AHEAD + 1e-9; s += LOOK) {
    if (s >= z.t + z.life) break; // gone by then
    const k = s - Math.max(0, z.t); // it moves only once live
    if (k > 0 && inZone(moved(z, k), x, y, pad)) return s < SOON ? 2 : 1;
  }
  return 0;
}

function move(z, dt) {
  const dx = z.vx * dt, dy = z.vy * dt;
  if (z.shape === 'segment') {
    if (z.spin) [z.x2, z.y2] = turned(z, z.spin * dt);
    z.x1 += dx; z.x2 += dx; z.y1 += dy; z.y2 += dy; z.w += z.grow * dt * 2; return;
  }
  z.x += dx; z.y += dy; z.r += z.grow * dt;
}

// Seconds between a ground patch's strikes while the player stands in it.
const PATCH_BEAT = 1;

// Counts every zone down, strikes the player once as each goes live, and returns the survivors. A
// ground patch (art and a lifetime) strikes again every PATCH_BEAT while the player stays inside.
export function tickZones(zones, dt, ctx) {
  const g = ctx.game, p = ctx.player, keep = [];
  for (const z of zones) {
    const o = z.owner;
    if (o && !z.art && (o.dead || o.hp <= 0)) continue;
    z.t -= dt;
    if (z.t <= 0) {
      move(z, Math.min(dt, -z.t));
      if (z.cool > 0) z.cool -= dt;
      // A strike the player rolls through is spent only if it lands: a lingering zone gets another
      // try once the invulnerability ends.
      if (!z.hit && z.cool <= 0 && p.mode !== 'dead' && inZone(z, p.x, p.y, HIT_PAD)) {
        let landed = false;
        const src = strikeFrom(z, p);
        if (z.dmg > 0) {
          const r = g.damagePlayer(z.dmg, src, { effect: z.effect, knock: z.knock, unblockable: !z.blockable });
          landed = r !== 'ignored'; z.blocked = r === 'blocked';
        } else if (z.effect && p.iframes <= 0) {
          // A blockable effect-only strike meets the shield as a light blow would; blocked, it carries nothing.
          z.blocked = z.blockable && g.guard(1, src);
          if (!z.blocked) g.applyEffect(z.effect, src);
          landed = true;
        }
        if (landed) { if (z.art && z.life > 0) z.cool = PATCH_BEAT; else z.hit = true; }
      }
      if (z.t <= -z.life) continue;
    }
    keep.push(z);
  }
  return keep;
}

// ---------------------------------------------------------------- drawing
// A pulsing outline that fills in as the strike nears, then glows while live.
export function drawZones(g, cam, zones, time) {
  const ox = cam.left, oy = cam.top;
  g.save();
  for (const z of zones) {
    if (z.art && z.t <= 0) { drawPatch(g, z, cam, time); continue; }
    const live = z.t <= 0, k = live ? 1 : 1 - clamp(z.t / z.t0, 0, 1);
    // Pulse phase comes from time spent telegraphing, not the area clock: it would alias into a strobe.
    const pulse = Math.sin(Math.max(0, z.t0 - z.t) * (8 + 12 * k));
    shapePath(g, z, ox, oy);
    g.fillStyle = `rgba(${z.rgb},${live ? 0.5 : 0.06 + 0.4 * k * k})`; g.fill();
    g.strokeStyle = `rgba(${z.rgb},${live ? 0.9 : 0.5 + 0.35 * pulse})`; g.lineWidth = 1; g.stroke();
  }
  g.restore();
}
