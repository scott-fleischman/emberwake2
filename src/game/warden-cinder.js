// The Cinder Warden's fight: fans of embers, a vent that bares its core (the punish window), a fade
// to another anchor, and in phase 2 eruptions under the player. A moveset any boss body can run;
// see Boss.runMoves.
import { Particles, Projectile } from './entities.js';
import { makeZone } from './zones.js';
import { TILE } from '../world/tiles.js';

const ANCHORS = [[6, 4], [17, 4], [6, 10], [17, 10]].map(([tx, ty]) => ({ x: tx * TILE + 8, y: ty * TILE + 8 }));

export const moves = {
  first: 'volley',
  aim: ['volley'],
  init(b) { b.anchors = ANCHORS; b.alpha = 1; b.volleys = 3; b.timer = 0.6; b.cdx = 0; b.cdy = 1; },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'volley'; } },
    volley(b, dt, ctx, { p, dx, dy, d }) {
      b.cdx = dx / d; b.cdy = dy / d; // it casts at the player
      if (b.timer <= 0) {
        const n = b.phase > 1 ? 5 : 3, spread = 0.26;
        const a = Math.atan2(p.y - b.y, p.x - b.x);
        for (let k = 0; k < n; k++) ctx.area.spawn(new Projectile('ember', b.x, b.y - 10, a + (k - (n - 1) / 2) * spread, 120, 1, 'enemy', { life: 2.6 }));
        ctx.game.audio.sfx('spell', { pitch: 0.7 });
        b.volleys--;
        b.timer = 0.55;
        if (b.volleys <= 0) {
          if (b.phase > 1) {
            // + dt: this frame's tickZones counts them down too, and must not take a frame off.
            for (let k = 0; k < 3; k++) ctx.area.zones.push(makeZone('circle', { x: p.x + (Math.random() - 0.5) * 40 * k, y: p.y + (Math.random() - 0.5) * 30 * k, r: 12, t: 0.9 + k * 0.25 + dt, dmg: 2, owner: b, rgb: '255,120,40', erupt: true }));
          }
          b.state = 'vent'; b.timer = b.phase === 3 ? 1.4 : 1.9;
          ctx.game.audio.sfx('gate', { pitch: 0.6, volume: 0.5 });
        }
      }
    },
    vent(b) { if (b.timer <= 0) { b.state = 'fadeout'; b.timer = 0.4; } },
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
      b.alpha = 1 - Math.max(0, b.timer / 0.4);
      if (b.timer <= 0) { b.alpha = 1; b.state = 'volley'; b.timer = 0.35; b.volleys = b.phase === 3 ? 4 : 3; }
    },
  },
  phase2: {},
  vulnerable: (b) => b.state === 'vent',
  untargetable: (b) => b.state === 'fadeout' || b.state === 'fadein',
  // An eruption's burst and bang, the frame its zone strikes.
  tick(b, dt, ctx) {
    for (const z of ctx.area.zones) {
      if (z.owner !== b || !z.erupt || z.t <= 0 || z.t > dt) continue;
      ctx.area.spawn(new Particles(z.x, z.y, { count: 14, color: ['#ff7030', '#ffd060'], speed: 70, life: 0.5, up: 40 }));
      ctx.game.audio.sfx('explode', { volume: 0.4, pitch: 1.2 });
    }
  },
  enter2(b, ctx) { b.summon(ctx, 'skirmisher', 5, 2); },
  clear() {},
};
