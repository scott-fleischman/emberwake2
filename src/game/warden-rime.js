// The Rime Sovereign's fight: she orbits firing ice, dashes (a wall stuns her; a miss leaves her
// skidding: the punish windows) and rains shards on the player. Shattered (phase 2), reformed larger
// on frost wings, a Shatter attack comes between dashes by turns: a blizzard gust that drives the
// player off, ice-pillar prisons that freeze, two ice decoys that fire bolts and break at a blow.
// Each leaves her spent: the punish window. As she reforms her ice walls rise and skirmishers come.
// A moveset any boss body can run; see Boss.runMoves. Her own scratch fields carry a `rime` prefix,
// since one body may come to run several movesets.
import { Actor, Entity, Particles, Projectile } from './entities.js';
import { findFreeSpot, moveActor } from './physics.js';
import { makeZone, inZone, HIT_PAD } from './zones.js';
import { TILE, T } from '../world/tiles.js';
import { TAU } from '../core/math.js';
import { drawShadow } from '../gfx/render.js';
import { stamp } from '../gfx/bossart.js';
import { paintDecoy, rimePoseTick, drawPillar, GUST, BLOW, PILLARS, RISE, DECOYS, SPENT, PILLAR_LIFE } from '../gfx/art-rime.js';

const PUSH = 60; // px/s the gust drives the player off
const DECOY_LIFE = 8, DECOY_SHOT = 1.4;

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
  ctx.game.audio.sfx('rime_shard', { pitch: 0.5 });
}

function clearWalls(b, ctx) {
  for (const w of b.walls) if (ctx.map.get(w.tx, w.ty) === T.DWALL) ctx.map.set(w.tx, w.ty, T.DFLOOR);
  b.walls = [];
}

// An ice pillar bursting up where a prison struck, standing a moment, then shattering: a sight only.
class IcePillar extends Entity {
  constructor(x, y) { super(x, y, 1, 1); this.t = 0; }
  get sortY() { return this.y + 5; }
  update(dt, ctx) {
    this.t += dt;
    if (this.t < PILLAR_LIFE) return;
    this.dead = true;
    ctx.area.spawn(new Particles(this.x, this.y - 12, { count: 12, color: ['#ffffff', '#c8ecff', '#7ab4e0'], speed: 60, life: 0.45, up: 20, gravity: 90 }));
  }
  draw(g, cam) { drawPillar(g, this.x - cam.left, this.y - cam.top, this.t); }
}

// One of her decoys: a hollow ice copy of her, smaller, that hovers where it formed, looses a
// chilling bolt at the player every 1.4 s and shatters at a single blow, after 8 s, or when she
// falls. A foe like any other to every blow, so the player (and the bot) may break it.
export class RimeDecoy extends Actor {
  constructor(x, y, owner) {
    super(x, y, 12, 10);
    Object.assign(this, { owner, team: 'enemy', decoy: true, flying: true, aggro: true, name: 'Ice Decoy', archetype: 'decoy' });
    this.state = 'hover'; this.life = DECOY_LIFE; this.shotT = DECOY_SHOT; this.age = 0;
    // what the painter reads: her Shattered form, facing the player
    Object.assign(this, { view: 'front', face: 1, phase: 2, phaseT: 9, roarT: 0, cdx: 0, cdy: 1 });
  }
  update(dt, ctx) {
    this.tickTimers(dt); this.anim += dt; this.age += dt;
    if (this.state === 'dying') { if ((this.timer -= dt) <= 0) this.dead = true; return; }
    const p = ctx.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1, ax = Math.abs(dx), ay = Math.abs(dy);
    this.cdx = dx / d; this.cdy = dy / d;
    // It turns to face the player, holding its view on a diagonal so it doesn't flicker.
    if (ax >= 1.25 * ay) { this.view = 'side'; this.face = Math.sign(dx) || 1; } else if (ay >= 1.25 * ax) this.view = dy > 0 ? 'front' : 'back';
    if ((this.shotT -= dt) <= 0) {
      this.shotT = DECOY_SHOT;
      ctx.area.spawn(new Projectile('ice', this.x, this.y - 10, Math.atan2(p.y - (this.y - 10), p.x - this.x), 130, 1, 'enemy', { life: 2.2, effect: 'chill' }));
    }
    const o = this.owner;
    if ((this.life -= dt) <= 0 || (o && (o.dead || o.hp <= 0))) this.shatter(ctx);
  }
  damage(amount, src, ctx) {
    if (this.dead || this.state === 'dying') return false;
    this.shatter(ctx);
    return true;
  }
  shatter(ctx) {
    this.hp = 0; this.state = 'dying'; this.timer = 0.15; this.flash = 0.15;
    ctx.area.spawn(new Particles(this.x, this.y - 18, { count: 16, color: ['#ffffff', '#d8f4ff', '#8ec6ea'], speed: 80, life: 0.5, up: 20, gravity: 80 }));
    ctx.game.audio.sfx('rime_shard', { pitch: 1.3, volume: 0.7 });
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top), k = Math.min(1, this.age / 0.4);
    drawShadow(g, x, y + 6, 8 * k, 2.5 * k, 0.25);
    // a white flicker as it readies a bolt, and as it breaks
    const white = this.flash > 0 ? 1 : this.shotT < 0.3 && Math.floor(this.anim * 16) % 2 ? 0.55 : 0;
    stamp(g, x, y, (gg, L) => paintDecoy(gg, this, L, k), { face: this.face, view: this.view, alpha: 0.82, white });
  }
}

// On open floor, two tiles in from the room's edge: never in a wall or over a doorway.
function placeDecoy(ctx, e, b) {
  const m = ctx.map, lo = 2 * TILE + 8, inside = () => e.x >= lo - 8 && e.y >= lo - 8 && e.x <= m.pixelW - lo + 8 && e.y <= m.pixelH - lo + 8;
  e.x = Math.max(lo, Math.min(m.pixelW - lo, e.x)); e.y = Math.max(lo, Math.min(m.pixelH - lo, e.y));
  if (!findFreeSpot(m, e, 3) || !inside()) { e.x = b.x; e.y = b.y; }
}

// While the gust blows it drives the player off along the line from her, through the same
// collision a step takes: walls stop it, and it blows no one out through a door.
function blow(b, dt, ctx, p) {
  const z = b.rimeGust;
  if (!z || z.t > 0 || z.t <= -z.life || p.mode === 'dead' || !inZone(z, p.x, p.y, HIT_PAD)) return;
  const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1, x = p.x, y = p.y;
  moveActor(ctx.map, p, (dx / d) * PUSH * dt, (dy / d) * PUSH * dt);
  if (ctx.area.exitsAt(p.x, p.y)) { p.x = x; p.y = y; }
}

// The Shatter attacks, each put down whole as it begins; the zones are the telegraph. + dt: this
// frame's tickZones counts them down too, and must not take a frame off.
const zone = (ctx, b, shape, fields) => { const z = makeZone(shape, { owner: b, rgb: '160,220,255', ...fields }); ctx.area.zones.push(z); return z; };
const SHATTER = {
  // Her wings draw back as the gust gathers, then beat a blizzard down the cone at the player.
  gust(b, ctx, { dx, dy }, dt) {
    b.rimeGust = zone(ctx, b, 'cone', { x: b.x, y: b.y, a: Math.atan2(dy, dx), spread: 0.5, r: 220, t: GUST + dt, life: BLOW, dmg: 0, rgb: '220,240,255', gust: true });
    b.timer = GUST + BLOW;
    ctx.game.audio.sfx('rime_gust');
  },
  // Ice-pillar prisons, one where the player stands and three round it, all rising together.
  pillars(b, ctx, { p }, dt) {
    const a = Math.random() * TAU;
    for (let k = 0; k < 4; k++) {
      const r = k ? 28 : 0, q = a + (k * TAU) / 3;
      zone(ctx, b, 'circle', { x: p.x + Math.cos(q) * r, y: p.y + Math.sin(q) * r * 0.8, r: 12, t: RISE + dt, dmg: 1, effect: 'freeze', pillar: true });
    }
    b.timer = PILLARS;
    ctx.game.audio.sfx('rime_pillar');
  },
  // Two shards fly off her and stand as decoys either side of the player.
  decoys(b, ctx, { p, dx, dy, d }) {
    for (const s of [-1, 1]) {
      const e = new RimeDecoy(p.x - (dy / d) * s * 72, p.y + (dx / d) * s * 72, b);
      placeDecoy(ctx, e, b);
      ctx.area.spawnEnemy(e);
      ctx.area.spawn(new Particles(e.x, e.y - 18, { count: 12, color: ['#ffffff', '#c8ecff'], speed: 50, life: 0.5 }));
    }
    ctx.area.spawn(new Particles(b.x, b.y - 44, { count: 16, color: ['#ffffff', '#d8f4ff', '#8ec6ea'], speed: 90, life: 0.5 }));
    b.timer = DECOYS;
    ctx.game.audio.sfx('rime_decoy');
  },
};
const ORDER = ['gust', 'pillars', 'decoys'];
const recover = (b) => { if (b.timer <= 0) { b.state = 'spent'; b.timer = SPENT; } };

// Circling the player at a distance, an ice bolt every so often.
function circle(b, dt, ctx, { p, dx, dy }) {
  b.orbitA += dt * (b.phase > 1 ? 1.9 : 1.4);
  const tx = p.x + Math.cos(b.orbitA) * 70, ty = p.y + Math.sin(b.orbitA) * 52;
  const l = Math.hypot(tx - b.x, ty - b.y) || 1;
  moveActor(ctx.map, b, ((tx - b.x) / l) * 110 * dt, ((ty - b.y) / l) * 110 * dt);
  b.shotT -= dt;
  if (b.shotT <= 0) { b.shotT = b.phase > 1 ? 0.5 : 0.8; ctx.area.spawn(new Projectile('ice', b.x, b.y - 6, Math.atan2(dy, dx), 140, 1, 'enemy', { life: 2.2 })); }
}
// The dash winds up, its lane shown while it does.
function windUp(b, ctx, { dx, dy, d }) { b.state = 'wind'; b.timer = 0.55; b.cdx = dx / d; b.cdy = dy / d; b.showLane(ctx); }

export const moves = {
  first: 'orbit',
  aim: ['gust', 'pillars', 'decoys'],
  init(b) { b.orbitA = 0; b.walls = []; b.timer = 2.2; b.shotT = 0.7; b.cdx = 0; b.cdy = 1; b.rimeTurn = 0; b.rimeGust = null; },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'orbit'; } },
    orbit(b, dt, ctx, me) { circle(b, dt, ctx, me); if (b.timer <= 0) windUp(b, ctx, me); },
    wind(b, dt, ctx) { if (b.timer <= 0) { b.state = 'dash'; b.timer = 0.6; ctx.game.audio.sfx('rime_dash'); } },
    dash(b, dt, ctx) {
      const r = moveActor(ctx.map, b, b.cdx * 270 * dt, b.cdy * 270 * dt);
      if (Math.random() < 0.7) ctx.area.spawn(new Particles(b.x, b.y, { count: 1, color: '#e0f8ff', speed: 10, life: 0.5, layer: -1 }));
      b.touchPlayer(ctx, 2);
      if (r.hitX || r.hitY) { ctx.game.cam.shake(3, 0.25); ctx.game.audio.sfx('rime_shard', { pitch: 0.55 }); b.state = 'stunned'; b.timer = 1.8; return; }
      if (b.timer <= 0) { b.state = 'skid'; b.timer = b.phase > 1 ? 0.9 : 1.2; }
    },
    skid(b, dt, ctx) { // a missed dash leaves it sliding and winded: the everyday punish window
      moveActor(ctx.map, b, b.cdx * 40 * b.timer * dt, b.cdy * 40 * b.timer * dt);
      if (b.timer <= 0) { b.state = 'rain'; b.timer = 0.3; }
    },
    stunned(b) { if (b.timer <= 0) { b.state = 'rain'; b.timer = 0.3; } },
    // She shrieks to the sky and the shards come down round the player, the first on them.
    rain(b, dt, ctx, { p }) {
      if (b.timer <= 0) {
        const n = b.phase > 1 ? 8 : 5;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, r = k === 0 ? 0 : 20 + Math.random() * 60;
          zone(ctx, b, 'circle', { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, r: 8, t: 0.8 + k * 0.08 + dt, dmg: 1, rgb: '20,40,80', shard: true });
        }
        ctx.game.audio.sfx('rime_roar', { volume: 0.6 });
        b.state = 'orbit'; b.timer = 1.8; b.shotT = 1;
      }
    },
  },
  phase2: {
    // By turns: a Shatter attack, then the dash.
    orbit(b, dt, ctx, me) {
      circle(b, dt, ctx, me);
      if (b.timer > 0) return;
      const turn = b.rimeTurn++, next = turn % 2 ? null : ORDER[(turn >> 1) % ORDER.length];
      if (!next) return windUp(b, ctx, me);
      b.state = next; b.cdx = me.dx / me.d; b.cdy = me.dy / me.d;
      SHATTER[next](b, ctx, me, dt);
    },
    gust(b, dt, ctx, { p }) { blow(b, dt, ctx, p); recover(b); },
    pillars: recover,
    decoys: recover,
    spent(b) { if (b.timer <= 0) { b.state = 'orbit'; b.timer = 1.6; b.shotT = 0.8; } },
  },
  vulnerable: (b) => b.state === 'stunned' || b.state === 'skid' || b.state === 'spent',
  // The pose's bookkeeping; snow streaming down a live gust, frost rising where a prison will stand;
  // a shard's shatter and a pillar's burst the frame their zones strike; the walls melting away.
  tick(b, dt, ctx) {
    rimePoseTick(b, dt);
    for (const z of ctx.area.zones) {
      if (z.owner !== b) continue;
      if (z.gust && z.t <= 0 && Math.random() < 0.8) {
        const a = z.a + (Math.random() - 0.5) * z.spread * 1.6;
        ctx.area.spawn(new Particles(z.x + Math.cos(a) * 16, z.y - 20 + Math.sin(a) * 12, { count: 1, color: ['#ffffff', '#d8f2ff'], speed: 220, life: 0.8, angle: a, spread: 0.15 }));
      }
      if (z.pillar && z.t > dt && Math.random() < 0.35) {
        const a = Math.random() * TAU, r = Math.random() * z.r;
        ctx.area.spawn(new Particles(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.6, { count: 1, color: ['#ffffff', '#c8ecff'], speed: 6, life: 0.5, up: 20 }));
      }
      if (z.t <= 0 || z.t > dt) continue;
      if (z.shard) {
        ctx.area.spawn(new Particles(z.x, z.y, { count: 10, color: ['#c8f0ff', '#ffffff'], speed: 60, life: 0.4 }));
        ctx.game.audio.sfx('rime_shard', { volume: 0.4 });
      }
      if (z.pillar) {
        ctx.area.spawn(new IcePillar(z.x, z.y));
        ctx.area.spawn(new Particles(z.x, z.y - 6, { count: 10, color: ['#ffffff', '#c8ecff', '#7ab4e0'], speed: 70, life: 0.4, up: 30 }));
        ctx.game.cam.shake(1.5, 0.12);
      }
    }
    for (const w of b.walls) { w.t -= dt; }
    if (b.walls.length && b.walls.every((w) => w.t <= 0)) clearWalls(b, ctx);
  },
  // She bursts into shards and reforms larger; her walls rise and the skirmishers come.
  enter2(b, ctx) {
    ctx.area.spawn(new Particles(b.x, b.y - 40, { count: 30, color: ['#ffffff', '#d8f4ff', '#8ec6ea', '#40c8ff'], speed: 140, life: 0.8, up: 20, gravity: 60 }));
    ctx.game.cam.shake(5, 0.4);
    raiseWalls(b, ctx);
    b.summon(ctx, 'skirmisher', 4, 2);
  },
  clear(b, ctx) {
    clearWalls(b, ctx);
    for (const e of ctx.area.entities) if (e instanceof IcePillar) e.dead = true;
  },
};
