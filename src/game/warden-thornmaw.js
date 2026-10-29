// Thornmaw's fight: it stalks, charges (stunning itself on walls: the punish window), then sprays
// rings of thorns. In bloom (phase 2) a Bloom attack comes between charges: root lines racing at
// the player, a snaring spore cloud, a vine-lash sweep. A moveset any boss body can run; see
// Boss.runMoves.
import { Particles, Projectile } from './entities.js';
import { makeZone } from './zones.js';
import { moveActor } from './physics.js';
import { TAU } from '../core/math.js';

// The roar that winds up a charge, its lane shown while it does.
function windUp(b, ctx, { dx, dy, d }) {
  b.state = 'wind'; b.timer = b.phase > 1 ? 0.55 : 0.75; b.cdx = dx / d; b.cdy = dy / d;
  b.showLane(ctx);
  ctx.game.audio.sfx('thornmaw_charge', { volume: 0.7 });
}

// The Bloom attacks, each put down whole as it begins; the zones are the telegraph. + dt: this
// frame's tickZones counts them down too, and must not take a frame off.
const zone = (ctx, b, shape, fields) => ctx.area.zones.push(makeZone(shape, { owner: b, rgb: '255,70,60', ...fields }));
const BLOOM = {
  // Three root lines fanning out at the player, burrowing along them and erupting one after another.
  roots(b, ctx, { dx, dy }, dt) {
    const a = Math.atan2(dy, dx);
    [[0, 0.7], [-0.32, 0.9], [0.32, 1.1]].forEach(([o, t]) => zone(ctx, b, 'segment', {
      x1: b.x, y1: b.y, x2: b.x + Math.cos(a + o) * 210, y2: b.y + Math.sin(a + o) * 210, w: 14, t: t + dt, life: 0.5, art: 'roots', root: true,
    }));
    b.timer = 1.4;
    ctx.game.audio.sfx('thornmaw_roots');
  },
  // The flower on its back looses a cloud that settles on the player as a snare of roots.
  spores(b, ctx, { p }, dt) {
    zone(ctx, b, 'circle', { x: p.x, y: p.y, r: 40, t: 1 + dt, life: 2.5, dmg: 0, effect: 'snare', art: 'roots', rgb: '255,208,64', spore: true });
    ctx.area.spawn(new Particles(b.x, b.y - 46, { count: 16, color: ['#ffd040', '#f0e0a0', '#c4283c'], speed: 45, life: 0.8, up: 30 }));
    b.timer = 1.1;
    ctx.game.audio.sfx('thornmaw_spores');
  },
  // Its vines sweep the ground in front of it.
  lash(b, ctx, { dx, dy }, dt) {
    zone(ctx, b, 'cone', { x: b.x, y: b.y, a: Math.atan2(dy, dx), spread: 1.1, r: 70, t: 0.6 + dt, life: 0.12, dmg: 2, blockable: true });
    b.timer = 1;
    ctx.game.audio.sfx('thornmaw_lash');
  },
};
const ORDER = ['roots', 'spores', 'lash'];

export const moves = {
  first: 'stalk',
  aim: ['roots', 'spores', 'lash'],
  init(b) { b.timer = 1.4; b.cdx = 0; b.cdy = 1; b.bursts = 0; b.turn = 0; },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'stalk'; } },
    stalk(b, dt, ctx, me) {
      moveActor(ctx.map, b, (me.dx / me.d) * 30 * dt, (me.dy / me.d) * 30 * dt);
      b.touchPlayer(ctx, 2);
      if (b.timer <= 0) windUp(b, ctx, me);
    },
    wind(b) {
      if (b.timer <= 0) { b.state = 'charge'; b.timer = 2.2; }
    },
    charge(b, dt, ctx) {
      const sp = b.phase > 1 ? 245 : 205;
      const r = moveActor(ctx.map, b, b.cdx * sp * dt, b.cdy * sp * dt);
      if (Math.random() < 0.5) ctx.area.spawn(new Particles(b.x, b.y + 8, { count: 1, color: '#7a6a4a', speed: 20, life: 0.4, layer: -1 }));
      b.touchPlayer(ctx, 2);
      if (r.hitX || r.hitY || b.timer <= 0) {
        ctx.game.cam.shake(4, 0.3);
        ctx.game.audio.sfx('thornmaw_slam', { volume: r.hitX || r.hitY ? 1 : 0.5 });
        b.state = 'stunned';
        b.timer = b.phase > 1 ? 1.3 : 1.6;
      }
    },
    stunned(b) {
      if (b.timer <= 0) { b.state = 'thorns'; b.timer = 0.5; b.bursts = b.phase > 1 ? 2 : 1; }
    },
    thorns(b, dt, ctx) {
      if (b.timer <= 0) {
        const n = b.phase > 1 ? 12 : 8, off = b.bursts % 2 ? 0 : Math.PI / n;
        for (let k = 0; k < n; k++) ctx.area.spawn(new Projectile('thorn', b.x, b.y - 6, off + (k * TAU) / n, 105, 1, 'enemy', { life: 2.5 }));
        ctx.game.audio.sfx('thornmaw_roar', { volume: 0.8 });
        b.bursts--;
        b.timer = 0.6;
        if (b.bursts <= 0) {
          b.state = 'stalk'; b.timer = 1.2;
          if (b.phase > 1 && ctx.area.enemyList.filter((e) => !e.boss && !e.dead).length < 2) b.summon(ctx, 'skirmisher', 0, 1);
        }
      }
    },
  },
  phase2: {
    // A Bloom attack, then the charge, by turns. The lash reaches only so far, so it closes in first.
    stalk(b, dt, ctx, me) {
      const next = b.turn % 2 ? null : ORDER[(b.turn >> 1) % ORDER.length], closing = next === 'lash' && me.d > 56 && b.timer > -2;
      const sp = closing && b.timer <= 0 ? 60 : 30;
      moveActor(ctx.map, b, (me.dx / me.d) * sp * dt, (me.dy / me.d) * sp * dt);
      b.touchPlayer(ctx, 2);
      if (b.timer > 0 || closing) return;
      b.turn++;
      if (!next) return windUp(b, ctx, me);
      b.state = next; b.cdx = me.dx / me.d; b.cdy = me.dy / me.d;
      BLOOM[next](b, ctx, me, dt);
    },
    roots(b) { if (b.timer <= 0) { b.state = 'stalk'; b.timer = 0.9; } },
    spores(b) { if (b.timer <= 0) { b.state = 'stalk'; b.timer = 0.9; } },
    lash(b) { if (b.timer <= 0) { b.state = 'stalk'; b.timer = 0.9; } },
  },
  vulnerable: (b) => b.state === 'stunned',
  // A root burrowing down its line to arrive as it strikes, then erupting along it; spores drifting
  // down over where the cloud will settle.
  tick(b, dt, ctx) {
    for (const z of ctx.area.zones) {
      if (z.owner !== b || z.t <= 0) continue;
      if (z.spore && Math.random() < 0.6) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * z.r;
        ctx.area.spawn(new Particles(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.7 - 20, { count: 1, color: ['#ffd040', '#fff0b0'], speed: 6, life: 0.7, gravity: 30 }));
      }
      if (!z.root) continue;
      if (z.t > dt) {
        const q = 1 - z.t / z.t0;
        ctx.area.spawn(new Particles(z.x1 + (z.x2 - z.x1) * q, z.y1 + (z.y2 - z.y1) * q, { count: 2, color: ['#a07a48', '#d8bc88'], speed: 22, life: 0.4, up: 12, gravity: 60, layer: -1 }));
        continue;
      }
      for (let k = 1; k <= 6; k++) {
        const q = k / 6;
        ctx.area.spawn(new Particles(z.x1 + (z.x2 - z.x1) * q, z.y1 + (z.y2 - z.y1) * q, { count: 3, color: ['#5a4428', '#a08452', '#4e8a2e'], speed: 40, life: 0.45, up: 30 }));
      }
      ctx.game.cam.shake(1.5, 0.12);
    }
  },
  enter2(b, ctx) { b.summon(ctx, 'lunger', 0, 2); },
  clear() {},
};
