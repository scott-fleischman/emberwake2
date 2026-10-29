// Enemy archetype AI. Readability rules:
//  - only a couple of enemies hold an "attack token" at once; the rest keep a ring of space;
//  - every attack is telegraphed (flash + pose) and followed by a recovery punish window;
//  - damage comes from attacks, never from merely brushing against a body.
import { Actor, Particles, Poof, Projectile, flyingSolid, walkerSolid } from './entities.js';
import { enemyStats, gloamPalette, GLOAM_TIER } from '../data/enemies.js';
import { moveActor } from './physics.js';
import { enemySprite, flashOf, tintOf } from '../gfx/sprites.js';
import { drawShadow } from '../gfx/render.js';
import { TAU } from '../core/math.js';
import { BIOME_KEYS } from '../world/tiles.js';
import { SPECIALS, firstDelay, specialCooldown } from './specials.js';

const RANGED_SHOT = ['arrow', 'shot', 'shot', 'shot', 'ice', 'ember'];

export class Enemy extends Actor {
  constructor(archetype, biome, x, y, opts = {}) {
    const st = enemyStats(archetype, biome, opts.gloam ? { tier: GLOAM_TIER } : {});
    if (opts.gloam) { st.pal = gloamPalette(st.pal); st.name = `Gloam ${st.name}`; }
    super(x, y, st.w, st.h);
    this.archetype = archetype;
    this.biome = biome;
    this.st = st;
    this.name = st.name;
    this.maxHp = this.hp = Math.max(1, Math.round(st.hp * (opts.hpMult || 1)));
    this.dmg = st.dmg;
    this.speed = st.speed;
    this.mass = st.mass;
    this.flying = !!st.flying;
    this.team = 'enemy';
    this.state = 'spawn';
    this.timer = 0.35;
    this.aggro = !!opts.aggro;
    this.home = { x, y };
    this.leash = opts.leash ?? 240;
    this.cool = 0.6 + Math.random() * 1.2;
    this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.orbitA = Math.random() * TAU;
    this.wanderT = 0;
    this.spawnId = opts.spawnId || null;
    this.group = opts.group || null;
    this.key = `${archetype}${biome}${opts.gloam ? 'g' : ''}`; // keys the sprite cache, so Gloam colours get their own
    this.dirX = 0; this.dirY = 0;
    this.hitDone = false;
    this.sig = SPECIALS[BIOME_KEYS[biome]]?.[archetype] || null; // signature move, see specials.js
    this.specialCool = firstDelay();
  }

  get pose() {
    switch (this.state) {
      case 'windup': return 'windup';
      case 'slam': return 'slam';
      case 'crouch': return 'crouch';
      case 'lunge': return 'lunge';
      case 'dart': return 'dart';
      case 'aim': return 'aim';
      case 'special': return this.sub === 'windup' ? 'special' : this.spose || 'idle';
      default: return 'idle';
    }
  }

  requestToken(ctx) {
    const t = ctx.area.tokens;
    if (t.has(this)) return true;
    if (t.size < ctx.area.tokenMax) { t.add(this); return true; }
    return false;
  }
  releaseToken(ctx) { ctx.area.tokens.delete(this); }

  solidFn(map) { return this.flying ? flyingSolid(map) : walkerSolid(map); }

  moveDir(dx, dy, speed, dt, map) {
    const l = Math.hypot(dx, dy) || 1;
    return moveActor(map, this, (dx / l) * speed * dt, (dy / l) * speed * dt, { solid: this.solidFn(map) });
  }

  update(dt, ctx) {
    this.tickTimers(dt);
    this.anim += dt;
    const map = ctx.map;
    if (this.state === 'dying') { this.timer -= dt; if (this.timer <= 0) this.finishDeath(ctx); return; }
    if (this.state === 'spawn') { this.timer -= dt; if (this.timer <= 0) this.state = 'idle'; return; }
    if (this.knockStep(dt, map, this.solidFn(map))) {
      if (this.state === 'windup' || this.state === 'crouch' || this.state === 'aim') { this.state = 'recover'; this.timer = 0.45; this.releaseToken(ctx); }
      return;
    }
    const p = ctx.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const alive = p.mode !== 'dead';
    if (!this.aggro && alive && d < this.st.sight) { this.aggro = true; this.alertT = 0.6; }
    const farHome = Math.hypot(this.x - this.home.x, this.y - this.home.y) > this.leash;
    if (this.aggro && (!alive || d > this.st.sight * 2 || (farHome && d > 90))) {
      if (this.state === 'special') this.cancelSpecial(ctx);
      this.aggro = false; this.releaseToken(ctx); this.state = 'idle';
    }
    if (this.alertT > 0) this.alertT -= dt;
    if (!this.aggro) { this.idle(dt, ctx); return; }
    if (this.pose !== 'lunge' && this.pose !== 'dart') this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    this.aim = Math.atan2(dy, dx);
    if (this.state === 'special') this.special(dt, ctx, p);
    else if (!this.trySpecial(dt, ctx, d)) this[this.archetype](dt, ctx, p, dx, dy, d);
    this.separate(dt, ctx);
  }

  // ---------------------------------------------------------------- signature move
  // Off cooldown, the player in reach, no other attack under way, and an attack token free.
  trySpecial(dt, ctx, d) {
    if (!this.sig || (this.specialCool -= dt) > 0 || this.state !== 'idle' || d > this.sig.range || !this.requestToken(ctx)) return false;
    this.state = 'special'; this.sub = 'windup'; this.timer = this.sig.windup;
    return true;
  }

  // windup (glowing) -> act (the move's start, then its update until done) -> recover.
  special(dt, ctx, p) {
    const m = this.sig;
    if (this.sub === 'windup') {
      if ((this.timer -= dt) > 0) return;
      this.sub = 'act'; this.mv = { t: 0 };
      ctx.game.audio.sfx(m.sfx);
      m.start(this, ctx, p);
    } else if (this.sub === 'act') {
      this.mv.t += dt;
      if (m.update(this, dt, ctx, p)) { this.sub = 'recover'; this.timer = 0.6; this.spose = null; }
    } else if ((this.timer -= dt) <= 0) this.endSpecial(ctx);
  }

  endSpecial(ctx) {
    this.state = 'idle'; this.sub = this.spose = null;
    this.untargetable = this.hidden = this.latched = false;
    this.lift = 0;
    this.specialCool = specialCooldown();
    this.releaseToken(ctx);
  }

  // Cut short: its strikes go with it.
  cancelSpecial(ctx) {
    ctx.area.zones = ctx.area.zones.filter((z) => z.owner !== this);
    this.endSpecial(ctx);
  }

  idle(dt, ctx) {
    const map = ctx.map;
    if (this.patrol) {
      // Walk the road back and forth.
      this.pi = this.pi ?? 0; this.pdir = this.pdir ?? 1;
      const wp = this.patrol[this.pi];
      const wx = wp.x - this.x, wy = wp.y - this.y;
      if (Math.hypot(wx, wy) < 6) {
        this.pi += this.pdir;
        if (this.pi >= this.patrol.length || this.pi < 0) { this.pdir *= -1; this.pi += this.pdir * 2; }
        this.pi = Math.max(0, Math.min(this.patrol.length - 1, this.pi));
      } else this.moveDir(wx, wy, this.speed * 0.45, dt, map);
      this.home = { x: this.x, y: this.y };
      this.moving = true;
      return;
    }
    const hx = this.home.x - this.x, hy = this.home.y - this.y, hd = Math.hypot(hx, hy);
    if (hd > 40) { this.moveDir(hx, hy, this.speed * 0.8, dt, map); this.moving = true; return; }
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 1.5 + Math.random() * 2.5; this.dirX = Math.random() - 0.5; this.dirY = Math.random() - 0.5; this.moving = Math.random() < 0.6; }
    if (this.moving) {
      const r = this.moveDir(this.dirX, this.dirY, this.speed * 0.35, dt, map);
      if (r.hitX) this.dirX *= -1;
      if (r.hitY) this.dirY *= -1;
    }
  }

  holdRing(dt, ctx, dx, dy, d, radius) {
    const map = ctx.map;
    if (d < radius - 12) this.moveDir(-dx, -dy, this.speed * 0.8, dt, map);
    else if (d > radius + 12) this.moveDir(dx, dy, this.speed, dt, map);
    else this.moveDir(-dy * this.orbitDir, dx * this.orbitDir, this.speed * 0.4, dt, map);
    if (Math.random() < dt * 0.3) this.orbitDir *= -1;
  }

  // ---------------------------------------------------------------- archetypes
  brute(dt, ctx, p, dx, dy, d) {
    const map = ctx.map;
    switch (this.state) {
      case 'windup':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'slam'; this.timer = 0.18; this.hitDone = false;
          const hx = this.x + Math.cos(this.slamA) * 15, hy = this.y + Math.sin(this.slamA) * 15;
          ctx.area.spawn(new Particles(hx, hy + 4, { count: 10, color: '#c8b898', speed: 60, life: 0.4 }));
          ctx.game.cam.shake(2, 0.15);
          ctx.game.audio.sfx('hit', { pitch: 0.6, volume: 0.6 });
          if (Math.hypot(p.x - hx, p.y - hy) < 17) ctx.game.damagePlayer(this.dmg, this);
        }
        break;
      case 'slam': this.timer -= dt; if (this.timer <= 0) { this.state = 'recover'; this.timer = 0.8; } break;
      case 'recover':
        this.timer -= dt;
        this.moveDir(-dx, -dy, this.speed * 0.5, dt, map);
        if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.1 + Math.random() * 0.6; this.releaseToken(ctx); }
        break;
      default:
        this.cool -= dt;
        if (this.cool <= 0 && this.requestToken(ctx)) {
          if (d > 30) this.moveDir(dx, dy, this.speed, dt, map);
          else { this.state = 'windup'; this.timer = 0.62; this.slamA = Math.atan2(dy, dx); }
        } else this.holdRing(dt, ctx, dx, dy, d, 64);
    }
  }

  lunger(dt, ctx, p, dx, dy, d) {
    const map = ctx.map;
    switch (this.state) {
      case 'crouch':
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'lunge'; this.timer = 0.32; this.hitDone = false; ctx.game.audio.sfx('dash', { pitch: 1.3, volume: 0.5 }); }
        break;
      case 'lunge': {
        this.timer -= dt;
        const r = moveActor(map, this, this.dirX * 235 * dt, this.dirY * 235 * dt, { solid: this.solidFn(map) });
        if (!this.hitDone && Math.abs(p.x - this.x) < (p.w + this.w) / 2 + 2 && Math.abs(p.y - this.y) < (p.h + this.h) / 2 + 2) {
          this.hitDone = true;
          ctx.game.damagePlayer(this.dmg, this);
        }
        if (r.hitX || r.hitY) this.timer = 0;
        if (this.timer <= 0) { this.state = 'recover'; this.timer = 0.8; }
        break;
      }
      case 'recover':
        this.timer -= dt;
        if (this.timer < 0.4) this.moveDir(-dx, -dy, this.speed * 0.6, dt, map);
        if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.2 + Math.random() * 0.8; this.releaseToken(ctx); }
        break;
      default:
        this.cool -= dt;
        if (this.cool <= 0 && this.requestToken(ctx)) {
          if (d > 82) this.moveDir(dx, dy, this.speed, dt, map);
          else if (d < 44) this.moveDir(-dx, -dy, this.speed, dt, map);
          else { this.state = 'crouch'; this.timer = 0.45; this.dirX = dx / d; this.dirY = dy / d; this.facing = dx < 0 ? 'left' : 'right'; }
        } else this.holdRing(dt, ctx, dx, dy, d, 86);
    }
  }

  skirmisher(dt, ctx, p, dx, dy, d) {
    const map = ctx.map;
    switch (this.state) {
      case 'dart': {
        this.timer -= dt;
        moveActor(map, this, this.dirX * 190 * dt, this.dirY * 190 * dt, { solid: this.solidFn(map) });
        if (!this.hitDone && Math.hypot(p.x - this.x, p.y - this.y) < 10) { this.hitDone = true; ctx.game.damagePlayer(this.dmg, this); }
        if (this.timer <= 0) { this.state = 'retreat'; this.timer = 0.5; }
        break;
      }
      case 'retreat':
        this.timer -= dt;
        this.moveDir(-dx, -dy, 115, dt, map);
        if (this.timer <= 0) { this.state = 'idle'; this.cool = 1.6 + Math.random(); this.releaseToken(ctx); }
        break;
      default: {
        this.cool -= dt;
        this.orbitA += this.orbitDir * 1.5 * dt;
        if (Math.random() < dt * 0.25) this.orbitDir *= -1;
        const tx = p.x + Math.cos(this.orbitA) * 56, ty = p.y + Math.sin(this.orbitA) * 44;
        const r = this.moveDir(tx - this.x, ty - this.y, this.speed, dt, map);
        if (r.hitX || r.hitY) this.orbitDir *= -1;
        if (this.cool <= 0 && d < 90 && this.requestToken(ctx)) { this.state = 'dart'; this.timer = 0.3; this.hitDone = false; this.dirX = dx / d; this.dirY = dy / d; }
      }
    }
  }

  ranged(dt, ctx, p, dx, dy, d) {
    const map = ctx.map;
    if (this.state === 'aim') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const kind = RANGED_SHOT[this.biome] || 'shot';
        ctx.area.spawn(new Projectile(kind, this.x, this.y - 3, this.shotA, 135, this.dmg, 'enemy', { life: 2.2 }));
        ctx.game.audio.sfx('arrow', { pitch: 0.8, volume: 0.5 });
        this.state = 'idle';
        this.cool = 1.8 + Math.random() * 0.8;
      }
      return;
    }
    this.cool -= dt;
    if (d < 78) {
      const r = this.moveDir(-dx, -dy, this.speed, dt, map);
      if (r.hitX && r.hitY) this.moveDir(-dy * this.orbitDir, dx * this.orbitDir, this.speed, dt, map);
    } else if (d > 150) this.moveDir(dx, dy, this.speed, dt, map);
    else this.moveDir(-dy * this.orbitDir, dx * this.orbitDir, this.speed * 0.35, dt, map);
    if (Math.random() < dt * 0.3) this.orbitDir *= -1;
    if (this.cool <= 0 && d < 190) { this.state = 'aim'; this.timer = 0.6; this.shotA = Math.atan2(dy, dx); }
  }

  separate(dt, ctx) {
    for (const o of ctx.area.enemyList) {
      if (o === this || o.dead || o.boss) continue;
      const dx = this.x - o.x, dy = this.y - o.y, d = Math.hypot(dx, dy);
      const min = (this.w + o.w) / 2 + 3;
      if (d > 0 && d < min) moveActor(ctx.map, this, (dx / d) * (min - d) * 0.5, (dy / d) * (min - d) * 0.5, { solid: this.solidFn(ctx.map) });
    }
  }

  damage(amount, src, ctx, opts = {}) {
    if (this.state === 'dying' || this.dead || this.untargetable) return false;
    this.latched = false; // any hit knocks a clinging leech off
    this.hp -= amount;
    this.flash = 0.12;
    this.aggro = true;
    if (opts.knock) this.knock(opts.knock[0], opts.knock[1], 0.15);
    if (this.hp <= 0) {
      this.state = 'dying';
      this.timer = 0.16;
      this.releaseToken(ctx);
      ctx.game.audio.sfx('kill');
    } else ctx.game.audio.sfx('hit');
    return true;
  }

  finishDeath(ctx) {
    this.dead = true;
    ctx.area.spawn(new Poof(this.x, this.y - 2, this.st.pal[0]));
    ctx.area.onEnemyKilled(this, ctx);
  }

  draw(g, cam) {
    if (this.hidden) return; // burrowed: its sand ripple zone stands in for it
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    // `lift`: how high a special has carried it (a harpy's dive); its shadow stays on the ground.
    const bob = (this.flying ? Math.sin(this.anim * 6) * 2 - 6 : 0) - (this.lift || 0);
    drawShadow(g, x, y + this.h / 2, this.w / 2 + 1, 2, this.flying ? 0.2 : 0.3);
    if (this.state === 'spawn') { g.globalAlpha = 1 - this.timer / 0.35; }
    // Calm ground foes breathe slowly, each on its own beat; once alert they move at full tempo.
    const calm = !this.aggro && !this.moving && !this.flying && this.state === 'idle';
    const frame = calm ? Math.floor((this.anim + (this.orbitA || 0)) * 2.2) % 2 : Math.floor(this.anim * 6) % 2;
    const spr = enemySprite(this.archetype, this.st.pal, this.pose, frame, this.key);
    const blink = Math.floor(this.anim * 14) % 2 === 0, glow = this.state === 'special' && this.sub === 'windup';
    const telegraph = (this.state === 'windup' || this.state === 'crouch' || this.state === 'aim') && blink;
    const sk = `${this.key}${this.pose}${frame}${this.archetype}`;
    // A special winds up glowing in its effect's colour, where a plain attack flashes white.
    if (glow) { g.fillStyle = `rgba(${this.sig.rgb},${0.3 + 0.15 * Math.sin(this.anim * 12)})`; g.beginPath(); g.ellipse(x, y + this.h / 2 + bob - spr.height / 2, spr.width * 0.55, spr.height * 0.6, 0, 0, TAU); g.fill(); }
    const img = this.flash > 0 || this.state === 'dying' || telegraph ? flashOf(spr, sk) : glow && blink ? tintOf(spr, `rgb(${this.sig.rgb})`, sk) : spr;
    const flip = this.facing === 'left';
    g.save();
    g.translate(x, Math.round(y + this.h / 2 + bob));
    if (flip) g.scale(-1, 1);
    if (this.state === 'dying') { const s = 1 + (0.16 - this.timer) * 3; g.scale(s, s); }
    g.drawImage(img, -spr.width / 2, -spr.height);
    g.restore();
    g.globalAlpha = 1;
    if (this.state === 'aim') {
      g.strokeStyle = 'rgba(255,80,60,0.55)'; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + Math.cos(this.shotA) * 60, y - 3 + Math.sin(this.shotA) * 60); g.stroke();
      g.setLineDash([]);
    }
    if (this.alertT > 0) { g.fillStyle = '#ffd040'; g.font = 'bold 8px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.fillText('!', x, y - spr.height + 2); }
    if (this.hp < this.maxHp && this.state !== 'dying') {
      const w = Math.max(10, this.w);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - w / 2, y - spr.height + bob + this.h / 2 - 4, w, 2);
      g.fillStyle = '#e04848'; g.fillRect(x - w / 2, y - spr.height + bob + this.h / 2 - 4, w * (this.hp / this.maxHp), 2);
    }
  }
}
