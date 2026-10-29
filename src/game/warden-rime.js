// The Rime Sovereign's fight: she orbits firing ice, dashes (a wall stuns her; a miss leaves her
// skidding: the punish windows), rains shards on the player, and in phase 2 raises ice walls. A
// moveset any boss body can run; see Boss.runMoves.
import { Particles, Projectile } from './entities.js';
import { moveActor } from './physics.js';
import { makeZone } from './zones.js';
import { TILE, T } from '../world/tiles.js';
import { TAU } from '../core/math.js';

function raiseWalls(b, ctx) {
  const spots = [[8, 5], [15, 5], [8, 9], [15, 9], [11, 3], [12, 11]];
  for (const [tx, ty] of spots) {
    const px = tx * TILE + 8, py = ty * TILE + 8;
    if (Math.hypot(ctx.player.x - px, ctx.player.y - py) < 20 || Math.hypot(b.x - px, b.y - py) < 20) continue;
    if (ctx.map.get(tx, ty) !== T.DFLOOR) continue;
    ctx.map.set(tx, ty, T.DWALL);
    b.walls.push({ tx, ty, t: 7 });
    ctx.area.spawn(new Particles(px, py, { count: 8, color: '#e0f8ff', speed: 40, life: 0.4 }));
  }
  ctx.game.audio.sfx('gate', { pitch: 1.4 });
}

function clearWalls(b, ctx) {
  for (const w of b.walls) if (ctx.map.get(w.tx, w.ty) === T.DWALL) ctx.map.set(w.tx, w.ty, T.DFLOOR);
  b.walls = [];
}

export const moves = {
  first: 'orbit',
  init(b) { b.orbitA = 0; b.walls = []; b.timer = 2.2; b.shotT = 0.7; b.dashes = 0; b.cdx = 0; b.cdy = 1; },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'orbit'; } },
    orbit(b, dt, ctx, { p, dx, dy, d }) {
      b.orbitA += dt * (b.phase > 1 ? 1.9 : 1.4);
      const tx = p.x + Math.cos(b.orbitA) * 70, ty = p.y + Math.sin(b.orbitA) * 52;
      const l = Math.hypot(tx - b.x, ty - b.y) || 1;
      moveActor(ctx.map, b, ((tx - b.x) / l) * 110 * dt, ((ty - b.y) / l) * 110 * dt);
      b.shotT -= dt;
      if (b.shotT <= 0) { b.shotT = b.phase > 1 ? 0.5 : 0.8; ctx.area.spawn(new Projectile('ice', b.x, b.y - 6, Math.atan2(dy, dx), 140, 1, 'enemy', { life: 2.2 })); }
      if (b.timer <= 0) { b.state = 'wind'; b.timer = 0.55; b.dashes = b.phase === 3 ? 2 : 1; b.cdx = dx / d; b.cdy = dy / d; b.showLane(ctx); }
    },
    wind(b, dt, ctx) { if (b.timer <= 0) { b.state = 'dash'; b.timer = 0.6; ctx.game.audio.sfx('dash', { pitch: 0.7 }); } },
    dash(b, dt, ctx, { dx, dy, d }) {
      const r = moveActor(ctx.map, b, b.cdx * 270 * dt, b.cdy * 270 * dt);
      if (Math.random() < 0.7) ctx.area.spawn(new Particles(b.x, b.y, { count: 1, color: '#e0f8ff', speed: 10, life: 0.5, layer: -1 }));
      b.touchPlayer(ctx, 2);
      if (r.hitX || r.hitY) { ctx.game.cam.shake(3, 0.25); ctx.game.audio.sfx('block', { pitch: 0.5 }); b.state = 'stunned'; b.timer = 1.8; return; }
      if (b.timer <= 0) {
        b.dashes--;
        if (b.dashes > 0) { b.state = 'wind'; b.timer = 0.35; b.cdx = dx / d; b.cdy = dy / d; b.showLane(ctx); }
        else { b.state = 'skid'; b.timer = b.phase > 1 ? 0.9 : 1.2; }
      }
    },
    skid(b, dt, ctx) { // a missed dash leaves it sliding and winded: the everyday punish window
      moveActor(ctx.map, b, b.cdx * 40 * b.timer * dt, b.cdy * 40 * b.timer * dt);
      if (b.timer <= 0) { b.state = 'rain'; b.timer = 0.3; }
    },
    stunned(b) { if (b.timer <= 0) { b.state = 'rain'; b.timer = 0.3; } },
    rain(b, dt, ctx, { p }) {
      if (b.timer <= 0) {
        const n = b.phase > 1 ? 8 : 5;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, r = k === 0 ? 0 : 20 + Math.random() * 60;
          // + dt: this frame's tickZones counts them down too, and must not take a frame off.
          ctx.area.zones.push(makeZone('circle', { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, r: 8, t: 0.8 + k * 0.08 + dt, dmg: 1, owner: b, rgb: '20,40,80', shard: true }));
        }
        b.state = 'orbit'; b.timer = 1.8; b.shotT = 1;
      }
    },
  },
  phase2: {},
  vulnerable: (b) => b.state === 'stunned' || b.state === 'skid',
  // A shard's shatter, the frame its zone strikes, and the walls melting away together.
  tick(b, dt, ctx) {
    for (const z of ctx.area.zones) {
      if (z.owner !== b || !z.shard || z.t <= 0 || z.t > dt) continue;
      ctx.area.spawn(new Particles(z.x, z.y, { count: 10, color: ['#c8f0ff', '#ffffff'], speed: 60, life: 0.4 }));
      ctx.game.audio.sfx('block', { pitch: 1.4, volume: 0.4 });
    }
    for (const w of b.walls) { w.t -= dt; }
    if (b.walls.length && b.walls.every((w) => w.t <= 0)) clearWalls(b, ctx);
  },
  enter2(b, ctx) { raiseWalls(b, ctx); b.summon(ctx, 'skirmisher', 4, 2); },
  clear: clearWalls,
};
