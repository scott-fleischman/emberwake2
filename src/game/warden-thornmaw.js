// Thornmaw's fight: it stalks, charges (stunning itself on walls: the punish window), then sprays
// rings of thorns. A moveset any boss body can run; see Boss.runMoves.
import { Particles, Projectile } from './entities.js';
import { moveActor } from './physics.js';
import { TAU } from '../core/math.js';

export const moves = {
  first: 'stalk',
  init(b) { b.timer = 1.4; b.cdx = 0; b.cdy = 1; b.bursts = 0; },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'stalk'; } },
    stalk(b, dt, ctx, { dx, dy, d }) {
      moveActor(ctx.map, b, (dx / d) * 30 * dt, (dy / d) * 30 * dt);
      b.touchPlayer(ctx, 2);
      if (b.timer <= 0) { b.state = 'wind'; b.timer = b.phase > 1 ? 0.55 : 0.75; b.cdx = dx / d; b.cdy = dy / d; b.showLane(ctx); ctx.game.audio.sfx('boss', { pitch: 1.6, volume: 0.4 }); }
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
        ctx.game.audio.sfx('explode', { pitch: 0.7, volume: 0.6 });
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
        ctx.game.audio.sfx('arrow', { pitch: 0.6 });
        b.bursts--;
        b.timer = 0.6;
        if (b.bursts <= 0) {
          b.state = 'stalk'; b.timer = 1.2;
          if (b.phase > 1 && ctx.area.enemyList.filter((e) => !e.boss && !e.dead).length < 2) b.summon(ctx, 'skirmisher', 0, 1);
        }
      }
    },
  },
  phase2: {},
  vulnerable: (b) => b.state === 'stunned',
  enter2(b, ctx) { b.summon(ctx, 'lunger', 0, 2); },
  clear() {},
};
