// The Cinder Warden's fight: fans of embers thrown from its palms, a vent that bares its core (the
// punish window), a blink to another anchor. Unbound (phase 2), its plates blown off and a flame
// greatsword drawn, an Unbound attack comes between volleys by turns: meteor rain, a greatsword
// sweep that sends a wave of fire, spreading lava pools. Every attack ends in the vent. A moveset
// any boss body can run; see Boss.runMoves.
import { Particles, Projectile, flyingSolid } from './entities.js';
import { makeZone } from './zones.js';
import { TILE } from '../world/tiles.js';
import { TAU } from '../core/math.js';
import { cinderPalms, cinderPoseTick, cinderPal, CAST, VENT, SWEEP, STRIKE, METEORS, POOLS } from '../gfx/art-cinder.js';

const ANCHORS = [[6, 4], [17, 4], [6, 10], [17, 10]].map(([tx, ty]) => ({ x: tx * TILE + 8, y: ty * TILE + 8 }));
const FIRST = 0.35; // a salvo's first throw comes quicker than the rest (CAST)

// The core overheats after every attack and has to cool: the punish window.
function vent(b, ctx) {
  b.state = 'vent'; b.timer = VENT;
  ctx.game.audio.sfx('cinder_vent');
}
// A throw's windup; the casting pose draws back and thrusts over exactly this long.
const windup = (b, t) => { b.timer = b.cast = t; };
const fade = (b) => { b.alpha = 1 - Math.max(0, b.timer / 0.4); };

// The Unbound attacks, each put down whole as it begins; the zones are the telegraph. + dt: this
// frame's tickZones counts them down too, and must not take a frame off.
const zone = (ctx, b, shape, fields) => ctx.area.zones.push(makeZone(shape, { owner: b, rgb: '255,120,40', ...fields }));
const UNBOUND = {
  // Its hands go up and the sky answers: five meteors round the player, the first on them.
  meteors(b, ctx, { p }, dt) {
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * TAU, r = k ? 24 + Math.random() * 26 : 0;
      zone(ctx, b, 'circle', { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.8, r: 16, t: 1 + k * 0.15 + dt, dmg: 2, meteor: true });
    }
    b.timer = METEORS;
    ctx.game.audio.sfx('cinder_meteor');
  },
  // The greatsword sweeps the ground before it, and the wave of fire it sends rolls on along the aim.
  sweep(b, ctx, { dx, dy, d }, dt) {
    const ux = dx / d, uy = dy / d, cx = b.x + ux * 30, cy = b.y + uy * 30;
    zone(ctx, b, 'cone', { x: b.x, y: b.y, a: Math.atan2(uy, ux), spread: 1, r: 60, t: STRIKE + dt, life: 0.12, dmg: 2, blockable: true });
    zone(ctx, b, 'segment', { x1: cx - uy * 36, y1: cy + ux * 36, x2: cx + uy * 36, y2: cy - ux * 36, w: 14, t: STRIKE + dt, life: 1.2, vx: ux * 140, vy: uy * 140, art: 'fire', effect: 'burn', wave: true });
    b.timer = SWEEP;
    ctx.game.audio.sfx('cinder_sweep');
  },
  // Its core spits three globs of lava, one on the player and one either side; each pool spreads.
  pools(b, ctx, { p }, dt) {
    const a = Math.random() * TAU;
    [[0, 0, 0.9], [Math.cos(a) * 52, Math.sin(a) * 40, 1], [-Math.cos(a) * 52, -Math.sin(a) * 40, 1.1]].forEach(([ox, oy, t]) => {
      const x = p.x + ox, y = p.y + oy, ga = Math.atan2(y - b.y, x - b.x), gd = Math.hypot(x - b.x, y - b.y);
      ctx.area.spawn(new Projectile('fireball', b.x, b.y, ga, gd / t, 0, 'enemy', { lob: t, height: 42 }));
      zone(ctx, b, 'circle', { x, y, r: 10, t: t + dt, life: 6, dmg: 0, effect: 'burn', art: 'fire', grow: 4, lava: true });
    });
    b.timer = POOLS;
    ctx.game.audio.sfx('cinder_pools');
  },
};
const ORDER = ['meteors', 'sweep', 'pools'];
const recover = (b, dt, ctx) => { if (b.timer <= 0) vent(b, ctx); };

export const moves = {
  first: 'volley',
  first2: 'ready',
  aim: ['volley', 'meteors', 'sweep', 'pools'],
  init(b) { b.anchors = ANCHORS; b.alpha = 1; b.volleys = 3; windup(b, 0.6); b.cdx = 0; b.cdy = 1; b.turn = 0; },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'volley'; } },
    // A fan of embers from its palms at the player, each from the hand on its side of the fan. A palm
    // raised into a wall throws from the body instead, so there is no shelter under the wall.
    volley(b, dt, ctx, { p, dx, dy, d }) {
      b.cdx = dx / d; b.cdy = dy / d;
      if (b.timer > 0) return;
      const solid = flyingSolid(ctx.map), n = b.phase > 1 ? 5 : 3, spread = 0.26;
      const [h0, h1] = cinderPalms(b).map((h) => (solid(Math.floor((b.x + h.x) / TILE), Math.floor((b.y + h.y) / TILE)) ? { x: 0, y: -10 } : h));
      const mx = b.x + (h0.x + h1.x) / 2, my = b.y + (h0.y + h1.y) / 2, a = Math.atan2(p.y - my, p.x - mx);
      const right = (h1.x - h0.x) * -Math.sin(a) + (h1.y - h0.y) * Math.cos(a) > 0; // h1 lies on the fan's + side
      for (let k = 0; k < n; k++) {
        const o = k - (n - 1) / 2, h = o === 0 ? h1 : (o > 0) === right ? h1 : h0;
        ctx.area.spawn(new Projectile('ember', b.x + h.x, b.y + h.y, a + o * spread, 120, 1, 'enemy', { life: 2.6, rgb: cinderPal(b).shot }));
      }
      ctx.game.audio.sfx('cinder_cast');
      b.volleys--;
      windup(b, CAST);
      if (b.volleys <= 0) vent(b, ctx);
    },
    vent(b, dt, ctx) {
      if (b.timer <= 0) { b.state = 'fadeout'; b.timer = 0.4; ctx.game.audio.sfx('cinder_blink'); }
    },
    fadeout(b, dt, ctx, { p }) {
      b.alpha = Math.max(0, b.timer / 0.4);
      if (b.timer <= 0) {
        const choices = b.anchors.filter((a) => Math.hypot(a.x - b.x, a.y - b.y) > 20 && Math.hypot(a.x - p.x, a.y - p.y) > 50);
        const a = choices[Math.floor(Math.random() * choices.length)] || b.anchors[0];
        b.x = a.x; b.y = a.y;
        b.state = 'fadein'; b.timer = 0.4;
      }
    },
    fadein(b) {
      fade(b);
      if (b.timer <= 0) { b.alpha = 1; b.state = 'volley'; windup(b, FIRST); b.volleys = 3; }
    },
  },
  phase2: {
    fadein(b) {
      fade(b);
      if (b.timer <= 0) { b.alpha = 1; b.state = 'ready'; b.timer = 0.15; }
    },
    // By turns: an Unbound attack, then the volley.
    ready(b, dt, ctx, me) {
      if (b.timer > 0) return;
      const next = ++b.turn % 2 ? ORDER[(b.turn >> 1) % ORDER.length] : null;
      if (!next) { b.state = 'volley'; windup(b, FIRST); b.volleys = 3; return; }
      b.state = next; b.cdx = me.dx / me.d; b.cdy = me.dy / me.d;
      UNBOUND[next](b, ctx, me, dt);
    },
    meteors: recover,
    sweep: recover,
    pools: recover,
  },
  vulnerable: (b) => b.state === 'vent',
  untargetable: (b) => b.state === 'fadeout' || b.state === 'fadein',
  // The pose's bookkeeping; a meteor's burst the frame it lands, a glob's splash, flames running
  // along the rolling wave.
  tick(b, dt, ctx) {
    cinderPoseTick(b, dt);
    for (const z of ctx.area.zones) {
      if (z.owner !== b) continue;
      if (z.wave && z.t <= 0 && Math.random() < 0.7) {
        const q = Math.random();
        ctx.area.spawn(new Particles(z.x1 + (z.x2 - z.x1) * q, z.y1 + (z.y2 - z.y1) * q, { count: 1, color: ['#ff6a18', '#ffd060'], speed: 15, life: 0.35, up: 30 }));
      }
      if (z.t <= 0 || z.t > dt) continue;
      if (z.meteor) {
        ctx.area.spawn(new Particles(z.x, z.y, { count: 16, color: ['#ff7030', '#ffd060', '#3a2a2a'], speed: 80, life: 0.55, up: 45 }));
        ctx.game.cam.shake(2.5, 0.18);
      }
      if (z.lava) ctx.area.spawn(new Particles(z.x, z.y, { count: 10, color: ['#ff5a10', '#ffb040'], speed: 45, life: 0.45, up: 25 }));
    }
  },
  // Its plates blast off, and the skirmishers come.
  enter2(b, ctx) {
    ctx.area.spawn(new Particles(b.x, b.y - 42, { count: 26, color: ['#34282c', '#64525a', '#ff8a30', '#fff2a8'], speed: 120, life: 0.9, up: 50, gravity: 120 }));
    ctx.game.cam.shake(5, 0.4);
    b.summon(ctx, 'skirmisher', 5, 2);
  },
  clear() {},
};
