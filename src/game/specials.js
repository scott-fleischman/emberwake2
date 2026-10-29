// Signature moves: each monster's one telegraphed special, on its own cooldown, carrying its region's
// status effect. The Enemy runs the timing (a windup glowing in the effect's colour, then `start`,
// then `update` until it reports done, then a short recovery); a move only moves its body and puts
// its danger down as zones, so drawing, hits and the bot all read it like any other hazard.
// Per-run state lives in `e.mv`, which starts as { t: 0 } and counts the seconds since `start`.
import { makeZone } from './zones.js';
import { Projectile, Particles } from './entities.js';
import { EFFECTS } from './effects.js';
import { moveActor } from './physics.js';
import { clamp, TAU } from '../core/math.js';

export const specialCooldown = () => 8 + Math.random() * 4;
// Random, so a group that spots you together doesn't fire all at once.
export const firstDelay = () => 3 + Math.random() * 6;

const size = (e) => (e.elite ? 1.6 : 1);
const toward = (e, p) => Math.atan2(p.y - e.y, p.x - e.x);

function put(ctx, e, shape, fields) {
  const z = makeZone(shape, { owner: e, rgb: e.sig.rgb, ...fields });
  ctx.area.zones.push(z);
  return z;
}
const drop = (ctx, z) => { ctx.area.zones = ctx.area.zones.filter((q) => q !== z); };
const puff = (ctx, x, y, color, opts = {}) => ctx.area.spawn(new Particles(x, y, { count: 8, color, speed: 45, life: 0.4, ...opts }));

// A lobbed shot. The ground it will strike is a zone published with it, counting down the flight.
function lob(ctx, e, kind, x, y, flight, land) {
  const a = Math.atan2(y - e.y, x - e.x), d = Math.hypot(x - e.x, y - e.y);
  ctx.area.spawn(new Projectile(kind, e.x, e.y, a, d / flight, 0, 'enemy', { lob: flight, land }));
}

// The aim line a lunge or shot will take, shown for `t` seconds; it warns, it doesn't strike.
function aimLine(ctx, e, a, len, w, t) {
  return put(ctx, e, 'segment', { x1: e.x, y1: e.y, x2: e.x + Math.cos(a) * len, y2: e.y + Math.sin(a) * len, w, t, dmg: 0 });
}

// Crouch while the aim line shows, then spring along it with a strike zone riding on the body.
function lunge(e, dt, ctx, wait, speed, time, strike) {
  const m = e.mv;
  if (m.t < wait) return false;
  if (!m.z) { m.z = put(ctx, e, 'circle', { x: e.x, y: e.y, r: 8 * size(e), t: 0, life: time, ...strike }); e.spose = 'lunge'; ctx.game.audio.sfx('dash', { pitch: 1.3, volume: 0.5 }); }
  const r = moveActor(ctx.map, e, m.dx * speed * dt, m.dy * speed * dt, { solid: e.solidFn(ctx.map) });
  m.z.x = e.x; m.z.y = e.y;
  return r.hitX || r.hitY || m.t >= wait + time;
}
function crouchAt(e, ctx, p, len, wait) {
  const a = toward(e, p);
  e.mv.dx = Math.cos(a); e.mv.dy = Math.sin(a);
  e.facing = e.mv.dx < 0 ? 'left' : 'right';
  e.spose = 'crouch';
  aimLine(ctx, e, a, len, 12 * size(e), wait);
}

// A blob that lands as an impact and a puddle, both on the player's spot.
function splat(e, ctx, p, { kind, flight, r, puddle, art, life, color }) {
  const k = size(e), effect = e.sig.effect;
  put(ctx, e, 'circle', { x: p.x, y: p.y, r: r * k, t: flight, life: 0.1, dmg: e.dmg, effect });
  put(ctx, e, 'circle', { x: p.x, y: p.y, r: puddle * k, t: flight, life, dmg: 0, effect, art });
  lob(ctx, e, kind, p.x, p.y, flight, (pr, c) => { puff(c, pr.x, pr.y, color, { count: 12, speed: 60 }); c.game.audio.sfx('splash', { pitch: 0.7, volume: 0.6 }); });
}

const move = (effect, def) => ({ effect, rgb: EFFECTS[effect].rgb, ...def });

export const SPECIALS = {
  forest: {
    // The slam's ring of thorns runs through where the player stands: step inside it or out past it.
    brute: move('snare', {
      name: 'Thorn Ring', windup: 0.75, range: 64, sfx: 'mv_forest_brute',
      start(e, ctx, p) {
        const k = size(e), a = toward(e, p), x = e.x + Math.cos(a) * 14, y = e.y + Math.sin(a) * 14;
        const ring = { x, y, r: clamp(Math.hypot(p.x - x, p.y - y), 14 * k, 50 * k), width: 12 * k, t: 0.5, effect: 'snare' };
        put(ctx, e, 'ring', { ...ring, life: 0.15, dmg: e.dmg });
        put(ctx, e, 'ring', { ...ring, life: 3, dmg: 0, art: 'thorns' });
        e.mv.ring = ring; e.spose = 'slam';
        puff(ctx, x, y + 4, ['#c8b898', '#5f7d3a'], { count: 10, speed: 60 });
        ctx.game.cam.shake(2, 0.15);
      },
      update(e, dt, ctx) {
        if (e.mv.t < 0.5) return false;
        const { x, y, r } = e.mv.ring;
        for (let i = 0; i < 8; i++) puff(ctx, x + Math.cos(i * TAU / 8) * r, y + Math.sin(i * TAU / 8) * r, ['#3d5424', '#d8e8a0'], { count: 3, speed: 25, up: 20 });
        return true;
      },
    }),
    // The lunge, glowing, with a bite that roots.
    lunger: move('snare', {
      name: 'Briar Bite', windup: 0.6, range: 90, sfx: 'mv_forest_lunger',
      start(e, ctx, p) { crouchAt(e, ctx, p, 92, 0.3); },
      update(e, dt, ctx) { return lunge(e, dt, ctx, 0.3, 270, 0.34, { dmg: e.dmg, effect: 'snare', blockable: true }); },
    }),
    // Three pods, one on the player and one to either side, each sprouting a patch of roots.
    skirmisher: move('snare', {
      name: 'Seed Pods', windup: 0.6, range: 110, sfx: 'mv_forest_skirmisher',
      start(e, ctx, p) {
        const k = size(e), a = toward(e, p), ox = -Math.sin(a) * 22 * k, oy = Math.cos(a) * 22 * k;
        [[0, 0], [ox, oy], [-ox, -oy]].forEach(([dx, dy], i) => {
          const x = p.x + dx, y = p.y + dy, flight = 0.7 + i * 0.12;
          put(ctx, e, 'circle', { x, y, r: 11 * k, t: flight, life: 4, dmg: 0, effect: 'snare', art: 'roots' });
          lob(ctx, e, 'seed', x, y, flight, (pr, c) => puff(c, pr.x, pr.y, ['#6a4a2a', '#7ab048'], { count: 6, speed: 35 }));
        });
      },
      update(e) { return e.mv.t >= 0.3; },
    }),
    // A vine-tipped arrow down a shown line; it roots what it hits.
    ranged: move('snare', {
      name: 'Vine Arrow', windup: 0.6, range: 170, sfx: 'mv_forest_ranged',
      start(e, ctx, p) { e.mv.a = toward(e, p); aimLine(ctx, e, e.mv.a, 170, 6, 0.3); e.spose = 'aim'; },
      update(e, dt, ctx) {
        if (e.mv.t < 0.3) return false;
        ctx.area.spawn(new Projectile('vine', e.x, e.y - 3, e.mv.a, 150, e.dmg, 'enemy', { life: 2.2, effect: 'snare' }));
        ctx.game.audio.sfx('arrow', { pitch: 0.7, volume: 0.5 });
        return true;
      },
    }),
  },
  swamp: {
    brute: move('mud', {
      name: 'Mud Ball', windup: 0.7, range: 150, sfx: 'mv_swamp_brute',
      start(e, ctx, p) { splat(e, ctx, p, { kind: 'mud', flight: 0.85, r: 12, puddle: 24, art: 'mud', life: 5, color: ['#46301a', '#7a5a34', '#9a7a4c'] }); e.spose = 'slam'; },
      update(e) { return e.mv.t >= 0.35; },
    }),
    // Leaps on and clings, keeping the poison going until a roll throws it or a hit knocks it off.
    lunger: move('poison', {
      name: 'Latch', windup: 0.6, range: 80, sfx: 'mv_swamp_lunger',
      start(e, ctx, p) { crouchAt(e, ctx, p, 88, 0.25); },
      update(e, dt, ctx, p) {
        const m = e.mv;
        if (e.latched) {
          if (p.mode === 'dodge' || p.mode === 'dead' || Math.hypot(p.x - e.x, p.y - e.y) > 24) {
            e.latched = false;
            if (p.mode === 'dodge') e.knock(-p.dodgeX * 150, -p.dodgeY * 150, 0.2);
            puff(ctx, e.x, e.y, ['#5a3f50', '#d090a0'], { count: 6 });
            return true;
          }
          e.x = p.x + 2; e.y = p.y + 1;
          if ((m.drip -= dt) <= 0) { m.drip = 1.5; ctx.game.applyEffect('poison', e); }
          return false;
        }
        if (m.held) return true; // knocked off by a hit
        if (m.z?.hit) { e.latched = m.held = true; m.drip = 1.5; e.spose = 'crouch'; drop(ctx, m.z); return false; }
        return lunge(e, dt, ctx, 0.25, 220, 0.4, { dmg: 0, effect: 'poison' });
      },
    }),
    // Dives onto the player's spot as the mark lands, in a cloud of biting gnats.
    skirmisher: move('poison', {
      name: 'Swarm Dive', windup: 0.55, range: 110, sfx: 'mv_swamp_skirmisher',
      start(e, ctx, p) {
        e.mv.z = put(ctx, e, 'circle', { x: p.x, y: p.y, r: 14 * size(e), t: 0.5, life: 0.25, dmg: e.dmg, effect: 'poison' });
        e.mv.vx = (p.x - e.x) / 0.5; e.mv.vy = (p.y - e.y) / 0.5;
        e.spose = 'dart';
      },
      update(e, dt, ctx) {
        const m = e.mv;
        if (m.t <= 0.5) { moveActor(ctx.map, e, m.vx * dt, m.vy * dt, { solid: e.solidFn(ctx.map) }); return false; }
        if (!m.swarm) { m.swarm = true; puff(ctx, m.z.x, m.z.y, ['#2a2a1a', '#8aa070', '#f0f0a0'], { count: 16, speed: 50, life: 0.6 }); }
        return m.t >= 0.75;
      },
    }),
    ranged: move('poison', {
      name: 'Poison Glob', windup: 0.6, range: 160, sfx: 'mv_swamp_ranged',
      start(e, ctx, p) { splat(e, ctx, p, { kind: 'poison', flight: 0.7, r: 10, puddle: 18, art: 'poison', life: 4.5, color: ['#2e5a1c', '#9ad044', '#c8f090'] }); e.spose = 'aim'; },
      update(e) { return e.mv.t >= 0.3; },
    }),
  },
  desert: {
    // A ring of sand rolls out from the pound; a roll carries you through it.
    brute: move('blind', {
      name: 'Sand Shockwave', windup: 0.8, range: 70, sfx: 'mv_desert_brute',
      start(e, ctx) {
        const k = size(e);
        e.mv.z = put(ctx, e, 'ring', { x: e.x, y: e.y + 2, r: 12 * k, width: 10 * k, t: 0.3, life: 0.6, grow: 110 * k, dmg: e.dmg, effect: 'blind' });
        e.spose = 'slam';
        ctx.game.cam.shake(2.5, 0.25);
      },
      update(e, dt, ctx) {
        const m = e.mv, z = m.z;
        if (z.t <= 0 && (m.dust = (m.dust ?? 0) - dt) <= 0) {
          m.dust = 0.06;
          for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + m.t * 3; puff(ctx, z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r, ['#c9a060', '#f0e0b8'], { count: 1, speed: 20 }); }
        }
        return m.t >= 0.9;
      },
    }),
    // Burrows out of reach as a moving ripple, then bursts up where the player stood after a mark.
    lunger: move('blind', {
      name: 'Burrow', windup: 0.6, range: 120, sfx: 'mv_desert_lunger',
      start(e, ctx) {
        e.untargetable = e.hidden = true;
        e.mv.ripple = put(ctx, e, 'circle', { x: e.x, y: e.y, r: 8 * size(e), t: 0, life: 4, dmg: 0, art: 'dust' });
        puff(ctx, e.x, e.y, ['#b07a3a', '#f0d080'], { count: 10 });
      },
      update(e, dt, ctx, p) {
        const m = e.mv, solid = e.solidFn(ctx.map);
        const dig = (x, y, speed) => {
          const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy), s = Math.min(d, speed * dt);
          if (d > 0.5) moveActor(ctx.map, e, (dx / d) * s, (dy / d) * s, { solid });
          m.ripple.x = e.x; m.ripple.y = e.y;
          return d;
        };
        if (!m.mark) {
          if (dig(p.x, p.y, 115) > 6 && m.t < 1.6) return false;
          m.mark = put(ctx, e, 'circle', { x: p.x, y: p.y, r: 14 * size(e), t: 0.8, life: 0.15, dmg: e.dmg, effect: 'blind' });
          return false;
        }
        if (m.mark.t > 0) { dig(m.mark.x, m.mark.y, 140); return false; }
        e.untargetable = e.hidden = false;
        e.spose = 'lunge';
        drop(ctx, m.ripple);
        puff(ctx, e.x, e.y, ['#b07a3a', '#f0d080', '#8a6a3a'], { count: 18, speed: 70, up: 30 });
        ctx.game.cam.shake(1.5, 0.15);
        return true;
      },
    }),
    // A dust devil that wanders after the player for four seconds while the imp spins it.
    skirmisher: move('blind', {
      name: 'Dust Devil', windup: 0.6, range: 120, sfx: 'mv_desert_skirmisher',
      start(e, ctx) { e.mv.z = put(ctx, e, 'circle', { x: e.x, y: e.y + 4, r: 13 * size(e), t: 0.5, life: 4, dmg: 0, effect: 'blind', art: 'dust' }); },
      update(e, dt, ctx, p) {
        const m = e.mv, z = m.z;
        if (z.t > 0) return false;
        const dx = p.x - z.x, dy = p.y - z.y, l = Math.hypot(dx, dy) || 1;
        z.vx = (dx / l) * 30; z.vy = (dy / l) * 30;
        if ((m.swirl = (m.swirl ?? 0) - dt) <= 0) {
          m.swirl = 0.07;
          const a = m.t * 9;
          puff(ctx, z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r * 0.6, ['#e0c090', '#f0e0b8'], { count: 2, speed: 40, angle: a + Math.PI / 2, spread: 0.5, up: 25, life: 0.5 });
        }
        return z.t <= -z.life;
      },
    }),
    // A pouch of sand that bursts into a blinding cloud on the player's spot.
    ranged: move('blind', {
      name: 'Sand Pouch', windup: 0.6, range: 170, sfx: 'mv_desert_ranged',
      start(e, ctx, p) {
        const flight = 0.65;
        put(ctx, e, 'circle', { x: p.x, y: p.y, r: 24 * size(e), t: flight, life: 2.5, dmg: 0, effect: 'blind', art: 'dust' });
        lob(ctx, e, 'sand', p.x, p.y, flight, (pr, c) => { puff(c, pr.x, pr.y, ['#c8a868', '#e8d0a0', '#f0e0b8'], { count: 18, speed: 70, life: 0.7 }); c.game.audio.sfx('poof', { volume: 0.6 }); });
        e.spose = 'aim';
      },
      update(e) { return e.mv.t >= 0.3; },
    }),
  },
};
