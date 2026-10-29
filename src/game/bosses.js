// Regional bosses. Each fights in two phases with distinct pressure and an explicit punish window,
// transforms at half health, and dies through the centered death flow (bossdeath.js).
import { Actor, Entity, Particles, Poof } from './entities.js';
import { Enemy } from './enemies.js';
import { makeZone } from './zones.js';
import { drawShadow } from '../gfx/render.js';
import { BOSS_RGB, stamp, roarRings, deathRays, entranceOffset } from '../gfx/bossart.js';
import { paintThornmaw, thornUnder, thornOver } from '../gfx/art-thornmaw.js';
import { paintCinder, fxCinder, emberSwirl } from '../gfx/art-cinder.js';
import { paintRime, rimeUnder, rimeOver } from '../gfx/art-rime.js';
import { moves as thornmaw } from './warden-thornmaw.js';
import { moves as cinder } from './warden-cinder.js';
import { moves as rime } from './warden-rime.js';
import { TILE } from '../world/tiles.js';
import { TAU } from '../core/math.js';

// view: the way it faces until it first moves, the way its entrance and portrait show it.
export const BOSS_INFO = {
  thornmaw: { name: 'Thornmaw, Warden of the Grove', hp: 120, music: 'boss', view: 'side' },
  cinder: { name: 'The Cinder Warden', hp: 144, music: 'boss', view: 'front' },
  rime: { name: 'Rime Sovereign', hp: 168, music: 'boss', view: 'front' },
};
export const DIE = 1.6; // seconds a warden takes to dematerialize
const TRANSFORM = 1.5; // seconds the change into phase 2 takes, unhurtable

// Each warden's fight as a moveset: a table of state handlers any boss body can run (see runMoves).
// A moveset is {
//   first, first2?   the state a body enters at (after its intro), and on reaching phase 2
//   phase1, phase2   state -> handler(b, dt, ctx, me); phase 2 falls back to phase 1's handler
//   vulnerable(b)    the punish window; untargetable?(b) states no hit can land in
//   aim?             telegraph states besides 'wind', where the body faces cdx/cdy, not its motion
//   tick?(b, dt, ctx)  every frame, whatever the state
//   init?(b)         sets every field the handlers read, so a body can start at `first`
//   enter2(b, ctx)   on reaching phase 2;  clear(b, ctx)  once, when it dies: undo what it left
// }
export const WARDEN_MOVES = { thornmaw, cinder, rime };

// Which way a boss shows itself, from where it is going: 'side', 'front' (down the screen) or
// 'back'. Slow, or on a diagonal, it keeps the view it had, so it doesn't flicker.
export function viewFrom(vx, vy, prev) {
  const ax = Math.abs(vx), ay = Math.abs(vy);
  if (Math.hypot(vx, vy) < 4) return prev;
  if (ax >= 1.25 * ay) return 'side';
  if (ay >= 1.25 * ax) return vy > 0 ? 'front' : 'back';
  return prev;
}

// A non-blocking white flash and shockwave for phase changes and deaths, drawn above everything.
export class Burst extends Entity {
  constructor(boss, big = false) { super(boss.x, boss.y - 28, 1, 1); this.rgb = BOSS_RGB[boss.kind]; this.big = big; this.t = 0; }
  get sortY() { return 2e9; }
  update(dt) { this.t += dt; if (this.t > (this.big ? 1.4 : 1)) this.dead = true; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top, t = this.t, f = Math.max(0, 1 - t / (this.big ? 0.45 : 0.28));
    if (f > 0) { g.fillStyle = `rgba(255,255,255,${0.85 * f})`; g.fillRect(0, 0, 480, 270); }
    for (let k = 0; k < (this.big ? 3 : 2); k++) {
      const q = Math.min(1, (t - k * 0.12) / (this.big ? 1 : 0.7));
      if (q <= 0 || q >= 1) continue;
      const r = 16 + q * (this.big ? 320 : 240);
      g.strokeStyle = `rgba(${k ? '255,255,255' : this.rgb},${(1 - q) * 0.9})`; g.lineWidth = 2 + (1 - q) * 5;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, TAU); g.stroke();
    }
  }
}

class Boss extends Actor {
  constructor(kind, x, y, hpMult = 1) {
    super(x, y, 22, 16);
    this.kind = kind;
    this.info = BOSS_INFO[kind];
    this.name = this.info.name;
    this.maxHp = this.hp = Math.round(this.info.hp * hpMult);
    this.boss = true;
    this.team = 'enemy';
    this.mass = 6;
    this.spawn = { x, y }; // the arena's centre: where it dies
    this.phase = 1;
    this.moves = WARDEN_MOVES[kind];
    this.moves?.init?.(this);
    this.state = 'intro';
    this.timer = 1.6;
    this.t = 0;
    this.vulnerable = false;
    this.summoned = 0;
    this.face = -1; this.view = this.info.view; this.roarT = 0; this.phaseT = 9; this.mvx = this.mvy = 0; // visual only
  }
  update(dt, ctx) {
    if (this.hp <= 0 && this.state !== 'dying') return; // killed this frame (the player updates first): the death flow has the stage
    this.tickTimers(dt); this.t += dt;
    if (this.state === 'dying') return this.dyingUpdate(dt, ctx);
    this.checkPhase(ctx);
    this.timer -= dt;
    if (this.state === 'transform') return this.transformUpdate(dt, ctx);
    this.runMoves(this.moves, dt, ctx);
  }
  // One frame of a moveset: phase 2's handler for the state if it has one, else phase 1's. me is
  // where the player is from here. The punish window (and any untargetable state) is read before
  // the handler runs, so it follows the state the frame began in.
  runMoves(m, dt, ctx) {
    const p = ctx.player, dx = p.x - this.x, dy = p.y - this.y, me = { p, dx, dy, d: Math.hypot(dx, dy) || 1 };
    this.vulnerable = m.vulnerable(this);
    this.untargetable = !!m.untargetable?.(this);
    m.tick?.(this, dt, ctx);
    ((this.phase > 1 && m.phase2[this.state]) || m.phase1[this.state])?.(this, dt, ctx, me);
  }
  // At half health a warden stops where it stands to transform. damage() holds phase 1 at half, so
  // even the biggest hit lands it here rather than past it.
  checkPhase(ctx) {
    if (this.phase > 1 || this.state === 'transform' || this.hp > this.maxHp * 0.5) return;
    this.state = 'transform'; this.timer = TRANSFORM;
    this.untargetable = true; this.vulnerable = false;
    this.roarT = 0.9;
    ctx.area.spawn(new Burst(this));
    ctx.game.audio.sfx(`${this.kind}_phase`);
    ctx.game.audio.playMusic('boss2');
    ctx.game.cam.shake(6, 0.7);
    ctx.game.toast(`${this.name.split(',')[0]} grows furious!`);
  }
  // Then phase 2 begins with fresh clocks at the moveset's phase 2 entry.
  transformUpdate(dt, ctx) {
    const m = this.moves;
    this.untargetable = true; this.vulnerable = false;
    m.tick?.(this, dt, ctx);
    if (this.timer > 0) return;
    this.phase = 2; this.phaseT = 0;
    m.init?.(this);
    m.enter2(this, ctx);
    this.state = m.first2 ?? m.first;
    this.untargetable = !!m.untargetable?.(this);
  }
  // Visual bookkeeping only: animation clock, facing and view, speed, roar and phase-change timers.
  tickTimers(dt) {
    super.tickTimers(dt);
    this.anim += dt;
    this.phaseT += dt;
    if (this.roarT > 0) this.roarT -= dt;
    const mx = this.x - (this.lx ?? this.x), my = this.y - (this.ly ?? this.y);
    this.lx = this.x; this.ly = this.y;
    if (dt > 0) { this.mvx = mx / dt; this.mvy = my / dt; }
    // A telegraph faces where the blow will go; otherwise it faces where it's going. A blink to
    // somewhere else is not a walk.
    if (this.cdx !== undefined && (this.state === 'wind' || this.moves?.aim?.includes(this.state))) {
      this.view = viewFrom(this.cdx * 60, this.cdy * 60, this.view);
      if (Math.abs(this.cdx) > 0.15) this.face = Math.sign(this.cdx);
    } else if (Math.hypot(mx, my) < 24) {
      this.view = viewFrom(this.mvx, this.mvy, this.view);
      if (Math.abs(mx) > 0.02) this.face = mx > 0 ? 1 : -1;
    }
  }
  damage(amount, src, ctx, opts = {}) {
    if (this.dead || this.hp <= 0 || this.state === 'dying' || this.state === 'intro' || this.untargetable) return false;
    const dmg = this.vulnerable ? amount * 1.5 : amount;
    this.hp = Math.max(this.phase === 1 ? this.maxHp * 0.5 : 0, this.hp - dmg);
    this.flash = 0.12;
    ctx.game.audio.sfx('hit', { pitch: 0.7 });
    if (this.vulnerable) ctx.area.spawn(new Particles(this.x, this.y - 24, { count: 6, color: '#fff0a0', speed: 50, life: 0.3 }));
    if (this.hp <= 0) ctx.game.beginBossDeath(this);
    return true;
  }
  // The dematerialize at the end of the death flow, which hands the victory to the area once it's gone.
  dyingUpdate(dt, ctx) {
    this.timer -= dt;
    if (Math.random() < dt * 14) ctx.area.spawn(new Particles(this.x + (Math.random() - 0.5) * 56, this.y - Math.random() * 50, { count: 6, color: ['#ffffff', '#ffe0a0'], speed: 60, life: 0.4 }));
    if (this.timer <= 0) {
      this.dead = true;
      ctx.area.spawn(new Poof(this.x, this.y - 24, '#ffffff', true));
      ctx.area.spawn(new Burst(this, true));
    }
  }
  summon(ctx, archetype, biome, count) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const e = new Enemy(archetype, biome, this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 24, { aggro: true, leash: 999 });
      if (ctx.map.isSolid(Math.floor(e.x / TILE), Math.floor(e.y / TILE))) { e.x = this.x; e.y = this.y + 20; }
      ctx.area.spawnEnemy(e);
    }
  }
  // The lane a charge will take, shown while it winds up; it warns, it doesn't strike.
  showLane(ctx) {
    ctx.area.zones.push(makeZone('segment', { x1: this.x, y1: this.y, x2: this.x + this.cdx * 300, y2: this.y + this.cdy * 300, w: 24, t: this.timer, dmg: 0, owner: this, rgb: BOSS_RGB[this.kind] }));
  }
  touchPlayer(ctx, dmg, pad = 4) {
    const p = ctx.player;
    return Math.abs(p.x - this.x) < (p.w + this.w) / 2 + pad && Math.abs(p.y - this.y) < (p.h + this.h) / 2 + pad ? ctx.game.damagePlayer(dmg, this) : false;
  }
  drawBar() {}
  // Shared draw: entrance placement, shadow, dying shudder, transform tremble, outlined body,
  // lights, roar rings. o: {face, alpha, tele, ghosts, shadow: [dy, rx, ry], under(g,x,y,a), over(g,x,y,a)}
  drawBoss(g, cam, paint, o = {}) {
    const e = entranceOffset(this.cine);
    if (!e) return;
    const dying = this.state === 'dying', dp = dying ? Math.max(0, Math.min(1, 1 - this.timer / DIE)) : 0;
    const tp = this.state === 'transform' ? Math.max(0, Math.min(1, 1 - this.timer / TRANSFORM)) : 0; // swelling with the change
    const x = Math.round(this.x - cam.left) + (dying ? Math.round(Math.sin(this.anim * 80) * (1 + dp * 3)) : tp ? Math.round(Math.sin(this.anim * 60) * tp * 2) : 0);
    const y = Math.round(this.y - cam.top), dy = e.dy || 0, alpha = (o.alpha ?? 1) * (e.alpha ?? 1), rgb = BOSS_RGB[this.kind];
    const [sy, rx, ry] = o.shadow || [8, 20, 5], lift = Math.max(0.2, 1 - Math.abs(dy) / 160) * (e.sink ? Math.max(0, 1 - e.sink / 60) : 1);
    if (alpha > 0) drawShadow(g, x, y + sy, rx * lift, ry * lift, 0.42 * Math.min(1, alpha + 0.3));
    if (o.under && alpha > 0) o.under(g, x, y + dy, alpha);
    const white = this.flash > 0 || o.tele ? 1 : dying ? (Math.floor(this.anim * (8 + dp * 22)) % 2 ? 0.25 + dp * 0.7 : dp * 0.35)
      : tp ? (Math.floor(this.anim * (6 + tp * 18)) % 2 ? tp * 0.7 : 0) : 0;
    if (alpha > 0) stamp(g, x, y + dy, paint, { face: o.face ?? this.face, view: this.view, alpha, white, ghosts: o.ghosts, sink: e.sink, ground: e.ground, cracks: dp > 0.15 ? (dp - 0.15) / 0.85 : 0, rgb });
    if (o.over && alpha > 0) o.over(g, x, y + dy, alpha);
    if (this.roarT > 0 && !e.sink) roarRings(g, x, y - 30, this.roarT, rgb);
    if (dying) deathRays(g, x, y - 30, dp, this.anim, rgb);
  }
}

// ---------------------------------------------------------------- the wardens
// Each fight is a moveset in its warden-*.js file; a class adds the body and the draw.

// Thornmaw: charges, stuns on walls, thorn rings.
class Thornmaw extends Boss {
  constructor(x, y, hpMult) { super('thornmaw', x, y, hpMult); this.w = 26; this.h = 18; }
  draw(g, cam) {
    const st = this.state, face = this.face;
    const tele = st === 'wind' && Math.floor(this.t * 14) % 2 === 0;
    const jx = st === 'wind' ? Math.round(Math.sin(this.anim * 70) * 1.5) : 0;
    this.drawBoss(g, { left: cam.left - jx, top: cam.top }, (b, L) => paintThornmaw(b, this, L), {
      face, tele, shadow: [8, 30, 7],
      under: (gg, x, y) => thornUnder(gg, this, x, y, face),
      over: (gg, x, y) => thornOver(gg, this, x, y, face),
    });
  }
}

// Cinder Warden: teleports, fans of embers, vents (punish), eruptions.
class CinderWarden extends Boss {
  constructor(x, y, hpMult) { super('cinder', x, y, hpMult); this.w = 18; this.h = 14; }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    const fade = this.state === 'fadeout' || this.state === 'fadein' ? 1 - this.alpha : 0;
    this.drawBoss(g, cam, (b, L) => paintCinder(b, this, L), {
      alpha: this.alpha, shadow: [7, 22, 6],
      over: (gg, x, y, a) => fxCinder(gg, this, x, y, a),
    });
    if (fade > 0) emberSwirl(g, x, y, fade, this.anim);
  }
}

// Rime Sovereign: orbits, dashes (stun on walls), shard rain, ice walls.
class RimeSovereign extends Boss {
  constructor(x, y, hpMult) { super('rime', x, y, hpMult); this.w = 18; this.h = 14; }
  draw(g, cam, ctx) {
    // Each falling shard over its landing zone.
    for (const z of ctx.area.zones) {
      if (z.owner !== this || !z.shard) continue;
      const h = z.t * 120;
      g.fillStyle = '#d8f4ff'; g.fillRect(z.x - cam.left - 2, z.y - cam.top - h - 8, 4, 8);
    }
    const st = this.state, tele = st === 'wind' && Math.floor(this.t * 14) % 2 === 0;
    const ghosts = st === 'dash' ? [[-this.cdx * 12, -this.cdy * 12, 0.35], [-this.cdx * 24, -this.cdy * 24, 0.16]] : null;
    this.drawBoss(g, cam, (b, L) => paintRime(b, this, L), {
      tele, ghosts, shadow: [7, 20, 5],
      under: (gg, x, y) => rimeUnder(gg, this, x, y),
      over: (gg, x, y) => rimeOver(gg, this, x, y),
    });
  }
}

export function createBoss(kind, x, y, hpMult = 1) {
  if (kind === 'thornmaw') return new Thornmaw(x, y, hpMult);
  if (kind === 'cinder') return new CinderWarden(x, y, hpMult);
  return new RimeSovereign(x, y, hpMult);
}
