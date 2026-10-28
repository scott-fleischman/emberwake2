// Regional bosses. Each has phases with distinct pressure and an explicit punish window.
import { Actor, Particles, Poof, Projectile } from './entities.js';
import { Enemy } from './enemies.js';
import { moveActor } from './physics.js';
import { drawShadow } from '../gfx/render.js';
import { R } from '../gfx/sprites.js';
import { TILE, T } from '../world/tiles.js';
import { TAU } from '../core/math.js';

export const BOSS_INFO = {
  thornmaw: { name: 'Thornmaw, Warden of the Grove', hp: 60, music: 'boss' },
  cinder: { name: 'The Cinder Warden', hp: 72, music: 'boss' },
  rime: { name: 'Rime Sovereign', hp: 84, music: 'boss' },
};

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
    this.state = 'intro';
    this.timer = 1.6;
    this.t = 0;
    this.phase = 1;
    this.vulnerable = false;
    this.summoned = 0;
  }
  get hpFrac() { return this.hp / this.maxHp; }
  updatePhase(ctx, thresholds) {
    const next = 1 + thresholds.filter((f) => this.hpFrac <= f).length;
    if (next > this.phase) {
      this.phase = next;
      ctx.game.audio.sfx('boss');
      ctx.game.cam.shake(3, 0.4);
      ctx.game.toast(`${this.name.split(',')[0]} grows furious!`);
      return true;
    }
    return false;
  }
  damage(amount, src, ctx, opts = {}) {
    if (this.dead || this.state === 'dying' || this.state === 'intro' || this.untargetable) return false;
    const dmg = this.vulnerable ? amount * 1.5 : amount;
    this.hp -= dmg;
    this.flash = 0.12;
    ctx.game.audio.sfx('hit', { pitch: 0.7 });
    if (this.vulnerable) ctx.area.spawn(new Particles(this.x, this.y - 8, { count: 6, color: '#fff0a0', speed: 50, life: 0.3 }));
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.timer = 1.4;
      ctx.game.audio.sfx('death', { pitch: 0.6 });
      ctx.game.cam.shake(4, 1.2);
    }
    return true;
  }
  dyingUpdate(dt, ctx) {
    this.timer -= dt;
    if (Math.random() < dt * 14) ctx.area.spawn(new Particles(this.x + (Math.random() - 0.5) * 30, this.y - Math.random() * 24, { count: 6, color: ['#ffffff', '#ffe0a0'], speed: 60, life: 0.4 }));
    if (this.timer <= 0) {
      this.dead = true;
      ctx.area.spawn(new Poof(this.x, this.y - 10, '#ffffff', true));
      ctx.area.onBossDefeated(this, ctx);
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
  touchPlayer(ctx, dmg, pad = 4) {
    const p = ctx.player;
    return Math.abs(p.x - this.x) < (p.w + this.w) / 2 + pad && Math.abs(p.y - this.y) < (p.h + this.h) / 2 + pad ? ctx.game.damagePlayer(dmg, this) : false;
  }
  drawBar() {}
}

// ---------------------------------------------------------------- Thornmaw: charges, stuns on walls, thorn rings.
class Thornmaw extends Boss {
  constructor(x, y, hpMult) { super('thornmaw', x, y, hpMult); this.w = 26; this.h = 18; }
  update(dt, ctx) {
    this.tickTimers(dt); this.t += dt;
    if (this.state === 'dying') return this.dyingUpdate(dt, ctx);
    const p = ctx.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (this.updatePhase(ctx, [0.5])) this.summon(ctx, 'lunger', 0, 2);
    this.timer -= dt;
    this.vulnerable = this.state === 'stunned';
    switch (this.state) {
      case 'intro': if (this.timer <= 0) { this.state = 'stalk'; this.timer = 1.4; } break;
      case 'stalk':
        moveActor(ctx.map, this, (dx / d) * 30 * dt, (dy / d) * 30 * dt);
        this.touchPlayer(ctx, 2);
        if (this.timer <= 0) { this.state = 'wind'; this.timer = this.phase > 1 ? 0.55 : 0.75; this.cdx = dx / d; this.cdy = dy / d; ctx.game.audio.sfx('boss', { pitch: 1.6, volume: 0.4 }); }
        break;
      case 'wind':
        if (this.timer <= 0) { this.state = 'charge'; this.timer = 2.2; }
        break;
      case 'charge': {
        const sp = this.phase > 1 ? 245 : 205;
        const r = moveActor(ctx.map, this, this.cdx * sp * dt, this.cdy * sp * dt);
        if (Math.random() < 0.5) ctx.area.spawn(new Particles(this.x, this.y + 8, { count: 1, color: '#7a6a4a', speed: 20, life: 0.4, layer: -1 }));
        this.touchPlayer(ctx, 2);
        if (r.hitX || r.hitY || this.timer <= 0) {
          ctx.game.cam.shake(4, 0.3);
          ctx.game.audio.sfx('explode', { pitch: 0.7, volume: 0.6 });
          this.state = 'stunned';
          this.timer = this.phase > 1 ? 1.3 : 1.6;
        }
        break;
      }
      case 'stunned':
        if (this.timer <= 0) { this.state = 'thorns'; this.timer = 0.5; this.bursts = this.phase > 1 ? 2 : 1; }
        break;
      case 'thorns':
        if (this.timer <= 0) {
          const n = this.phase > 1 ? 12 : 8, off = this.bursts % 2 ? 0 : Math.PI / n;
          for (let k = 0; k < n; k++) ctx.area.spawn(new Projectile('thorn', this.x, this.y - 6, off + (k * TAU) / n, 105, 1, 'enemy', { life: 2.5 }));
          ctx.game.audio.sfx('arrow', { pitch: 0.6 });
          this.bursts--;
          this.timer = 0.6;
          if (this.bursts <= 0) {
            this.state = 'stalk'; this.timer = 1.2;
            if (this.phase > 1 && ctx.area.enemyList.filter((e) => !e.boss && !e.dead).length < 2) this.summon(ctx, 'skirmisher', 0, 1);
          }
        }
        break;
    }
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    drawShadow(g, x, y + 8, 16, 5, 0.35);
    const shake = this.state === 'wind' ? (Math.random() - 0.5) * 3 : 0;
    const flash = this.flash > 0 || (this.state === 'wind' && Math.floor(this.t * 14) % 2 === 0);
    const sq = this.state === 'stunned' ? 3 : 0;
    const body = flash ? '#ffffff' : this.phase > 1 ? '#7a4a2a' : '#4e7a2e';
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8 + Math.sin(this.t * 2) * 0.1;
      g.fillStyle = flash ? '#fff' : '#2e5a1e';
      g.beginPath(); g.moveTo(x + shake + Math.cos(a) * 10, y - 8 + Math.sin(a) * 8); g.lineTo(x + shake + Math.cos(a) * 22, y - 8 + Math.sin(a) * 15); g.lineTo(x + shake + Math.cos(a + 0.3) * 12, y - 8 + Math.sin(a + 0.3) * 9); g.fill();
    }
    g.fillStyle = body; g.beginPath(); g.ellipse(x + shake, y - 8 + sq, 15, 13 - sq, 0, 0, TAU); g.fill();
    g.fillStyle = flash ? '#fff' : '#d04a6a'; g.beginPath(); g.ellipse(x + shake, y - 4 + sq, 9, this.state === 'charge' ? 6 : 3, 0, 0, TAU); g.fill();
    for (let k = 0; k < 5; k++) R(g, x + shake - 8 + k * 4, y - 6 + sq, 2, 2, '#f0f0d0');
    R(g, x + shake - 7, y - 14 + sq, 3, 3, '#ffe040'); R(g, x + shake + 4, y - 14 + sq, 3, 3, '#ffe040');
    if (this.state === 'stunned') for (let k = 0; k < 3; k++) { const a = this.t * 5 + (k * TAU) / 3; R(g, x + Math.cos(a) * 12, y - 26 + Math.sin(a) * 3, 3, 3, '#ffe060'); }
  }
}

// ---------------------------------------------------------------- Cinder Warden: teleports, fans of embers, vents (punish), eruptions.
class CinderWarden extends Boss {
  constructor(x, y, hpMult) {
    super('cinder', x, y, hpMult);
    this.w = 18; this.h = 14;
    this.anchors = [[6, 4], [17, 4], [6, 10], [17, 10]].map(([tx, ty]) => ({ x: tx * TILE + 8, y: ty * TILE + 8 }));
    this.alpha = 1;
    this.marks = [];
  }
  update(dt, ctx) {
    this.tickTimers(dt); this.t += dt;
    if (this.state === 'dying') return this.dyingUpdate(dt, ctx);
    const p = ctx.player;
    if (this.updatePhase(ctx, [0.5, 0.25]) && this.phase === 3) this.summon(ctx, 'skirmisher', 5, 2);
    this.timer -= dt;
    this.vulnerable = this.state === 'vent';
    this.untargetable = this.state === 'fadeout' || this.state === 'fadein';
    // eruption marks
    for (const m of this.marks) {
      m.t -= dt;
      if (m.t <= 0 && !m.done) {
        m.done = true;
        ctx.area.spawn(new Particles(m.x, m.y, { count: 14, color: ['#ff7030', '#ffd060'], speed: 70, life: 0.5, up: 40 }));
        ctx.game.audio.sfx('explode', { volume: 0.4, pitch: 1.2 });
        if (Math.hypot(p.x - m.x, p.y - m.y) < 16) ctx.game.damagePlayer(2, m);
      }
    }
    this.marks = this.marks.filter((m) => m.t > -0.3);
    switch (this.state) {
      case 'intro': if (this.timer <= 0) { this.state = 'volley'; this.timer = 0.6; this.volleys = 3; } break;
      case 'volley':
        if (this.timer <= 0) {
          const n = this.phase > 1 ? 5 : 3, spread = 0.26;
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          for (let k = 0; k < n; k++) ctx.area.spawn(new Projectile('ember', this.x, this.y - 10, a + (k - (n - 1) / 2) * spread, 120, 1, 'enemy', { life: 2.6 }));
          ctx.game.audio.sfx('spell', { pitch: 0.7 });
          this.volleys--;
          this.timer = 0.55;
          if (this.volleys <= 0) {
            if (this.phase > 1) {
              for (let k = 0; k < 3; k++) this.marks.push({ x: p.x + (Math.random() - 0.5) * 40 * k, y: p.y + (Math.random() - 0.5) * 30 * k, t: 0.9 + k * 0.25 });
            }
            this.state = 'vent'; this.timer = this.phase === 3 ? 1.4 : 1.9;
            ctx.game.audio.sfx('gate', { pitch: 0.6, volume: 0.5 });
          }
        }
        break;
      case 'vent': if (this.timer <= 0) { this.state = 'fadeout'; this.timer = 0.4; } break;
      case 'fadeout':
        this.alpha = Math.max(0, this.timer / 0.4);
        if (this.timer <= 0) {
          const choices = this.anchors.filter((a) => Math.hypot(a.x - this.x, a.y - this.y) > 20 && Math.hypot(a.x - p.x, a.y - p.y) > 50);
          const a = choices[Math.floor(Math.random() * choices.length)] || this.anchors[0];
          this.x = a.x; this.y = a.y;
          this.state = 'fadein'; this.timer = 0.4;
        }
        break;
      case 'fadein':
        this.alpha = 1 - Math.max(0, this.timer / 0.4);
        if (this.timer <= 0) { this.alpha = 1; this.state = 'volley'; this.timer = 0.35; this.volleys = this.phase === 3 ? 4 : 3; }
        break;
    }
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    for (const m of this.marks) {
      if (m.done) continue;
      const mx = m.x - cam.left, my = m.y - cam.top;
      g.strokeStyle = `rgba(255,${Math.floor(120 + 100 * Math.sin(this.t * 20))},40,0.9)`; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(mx, my, 15, 9, 0, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,90,30,0.2)'; g.beginPath(); g.ellipse(mx, my, 15 * (1 - m.t / 1.5), 9 * (1 - m.t / 1.5), 0, 0, TAU); g.fill();
    }
    g.globalAlpha = this.alpha;
    const hover = this.state === 'vent' ? 2 : -6 + Math.sin(this.t * 3) * 2;
    drawShadow(g, x, y + 7, 10, 3, 0.35);
    const flash = this.flash > 0;
    const armor = flash ? '#fff' : this.state === 'vent' ? '#6a4a40' : '#3a2e2e';
    R(g, x - 9, y - 18 + hover, 18, 18, armor);
    R(g, x - 11, y - 18 + hover, 4, 8, armor); R(g, x + 7, y - 18 + hover, 4, 8, armor);
    R(g, x - 9, y - 18 + hover, 18, 2, '#5e4a46');
    R(g, x - 6, y - 4 + hover, 12, 6, flash ? '#fff' : '#2a2020');
    const flame = this.state === 'vent' ? '#ffd060' : '#ff6a20';
    g.fillStyle = flash ? '#fff' : flame;
    g.beginPath(); g.moveTo(x - 6, y - 18 + hover); g.lineTo(x, y - 32 + hover + Math.sin(this.t * 18) * 2); g.lineTo(x + 6, y - 18 + hover); g.fill();
    R(g, x - 4, y - 14 + hover, 2, 2, '#ffe080'); R(g, x + 2, y - 14 + hover, 2, 2, '#ffe080');
    for (let k = 0; k < 2; k++) {
      const a = this.t * 3 + k * Math.PI;
      g.fillStyle = '#ff8030'; g.beginPath(); g.arc(x + Math.cos(a) * 16, y - 10 + hover + Math.sin(a) * 6, 3, 0, TAU); g.fill();
    }
    if (this.state === 'vent') { g.fillStyle = 'rgba(255,220,120,0.3)'; g.beginPath(); g.arc(x, y - 10, 18, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- Rime Sovereign: orbits, dashes (stun on walls), shard rain, ice walls.
class RimeSovereign extends Boss {
  constructor(x, y, hpMult) {
    super('rime', x, y, hpMult);
    this.w = 18; this.h = 14;
    this.orbitA = 0;
    this.drops = [];
    this.walls = [];
  }
  update(dt, ctx) {
    this.tickTimers(dt); this.t += dt;
    if (this.state === 'dying') { this.clearWalls(ctx); return this.dyingUpdate(dt, ctx); }
    const p = ctx.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (this.updatePhase(ctx, [0.6, 0.3])) {
      if (this.phase === 2) this.raiseWalls(ctx);
      if (this.phase === 3) this.summon(ctx, 'skirmisher', 4, 2);
    }
    this.timer -= dt;
    this.vulnerable = this.state === 'stunned' || this.state === 'skid';
    for (const dr of this.drops) {
      dr.t -= dt;
      if (dr.t <= 0 && !dr.done) {
        dr.done = true;
        ctx.area.spawn(new Particles(dr.x, dr.y, { count: 10, color: ['#c8f0ff', '#ffffff'], speed: 60, life: 0.4 }));
        ctx.game.audio.sfx('block', { pitch: 1.4, volume: 0.4 });
        if (Math.hypot(p.x - dr.x, p.y - dr.y) < 12) ctx.game.damagePlayer(1, dr);
      }
    }
    this.drops = this.drops.filter((dr) => dr.t > -0.2);
    for (const w of this.walls) { w.t -= dt; }
    if (this.walls.length && this.walls.every((w) => w.t <= 0)) this.clearWalls(ctx);
    switch (this.state) {
      case 'intro': if (this.timer <= 0) { this.state = 'orbit'; this.timer = 2.2; this.shotT = 0.7; } break;
      case 'orbit': {
        this.orbitA += dt * (this.phase > 1 ? 1.9 : 1.4);
        const tx = p.x + Math.cos(this.orbitA) * 70, ty = p.y + Math.sin(this.orbitA) * 52;
        const l = Math.hypot(tx - this.x, ty - this.y) || 1;
        moveActor(ctx.map, this, ((tx - this.x) / l) * 110 * dt, ((ty - this.y) / l) * 110 * dt);
        this.shotT -= dt;
        if (this.shotT <= 0) { this.shotT = this.phase > 1 ? 0.5 : 0.8; ctx.area.spawn(new Projectile('ice', this.x, this.y - 6, Math.atan2(dy, dx), 140, 1, 'enemy', { life: 2.2 })); }
        if (this.timer <= 0) { this.state = 'wind'; this.timer = 0.55; this.dashes = this.phase === 3 ? 2 : 1; this.cdx = dx / d; this.cdy = dy / d; }
        break;
      }
      case 'wind': if (this.timer <= 0) { this.state = 'dash'; this.timer = 0.6; ctx.game.audio.sfx('dash', { pitch: 0.7 }); } break;
      case 'dash': {
        const r = moveActor(ctx.map, this, this.cdx * 270 * dt, this.cdy * 270 * dt);
        if (Math.random() < 0.7) ctx.area.spawn(new Particles(this.x, this.y, { count: 1, color: '#e0f8ff', speed: 10, life: 0.5, layer: -1 }));
        this.touchPlayer(ctx, 2);
        if (r.hitX || r.hitY) { ctx.game.cam.shake(3, 0.25); ctx.game.audio.sfx('block', { pitch: 0.5 }); this.state = 'stunned'; this.timer = 1.8; break; }
        if (this.timer <= 0) {
          this.dashes--;
          if (this.dashes > 0) { this.state = 'wind'; this.timer = 0.35; this.cdx = dx / d; this.cdy = dy / d; }
          else { this.state = 'skid'; this.timer = this.phase > 1 ? 0.9 : 1.2; }
        }
        break;
      }
      case 'skid': // a missed dash leaves it sliding and winded: the everyday punish window
        moveActor(ctx.map, this, this.cdx * 40 * this.timer * dt, this.cdy * 40 * this.timer * dt);
        if (this.timer <= 0) { this.state = 'rain'; this.timer = 0.3; }
        break;
      case 'stunned': if (this.timer <= 0) { this.state = 'rain'; this.timer = 0.3; } break;
      case 'rain':
        if (this.timer <= 0) {
          const n = this.phase > 1 ? 8 : 5;
          for (let k = 0; k < n; k++) {
            const a = Math.random() * TAU, r = k === 0 ? 0 : 20 + Math.random() * 60;
            this.drops.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, t: 0.8 + k * 0.08 });
          }
          this.state = 'orbit'; this.timer = 1.8; this.shotT = 1;
        }
        break;
    }
  }
  raiseWalls(ctx) {
    const spots = [[8, 5], [15, 5], [8, 9], [15, 9], [11, 3], [12, 11]];
    for (const [tx, ty] of spots) {
      const px = tx * TILE + 8, py = ty * TILE + 8;
      if (Math.hypot(ctx.player.x - px, ctx.player.y - py) < 20 || Math.hypot(this.x - px, this.y - py) < 20) continue;
      if (ctx.map.get(tx, ty) !== T.DFLOOR) continue;
      ctx.map.set(tx, ty, T.DWALL);
      this.walls.push({ tx, ty, t: 7 });
      ctx.area.spawn(new Particles(px, py, { count: 8, color: '#e0f8ff', speed: 40, life: 0.4 }));
    }
    ctx.game.audio.sfx('gate', { pitch: 1.4 });
  }
  clearWalls(ctx) {
    for (const w of this.walls) if (ctx.map.get(w.tx, w.ty) === T.DWALL) ctx.map.set(w.tx, w.ty, T.DFLOOR);
    this.walls = [];
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    for (const dr of this.drops) {
      if (dr.done) continue;
      g.fillStyle = `rgba(20,40,80,${0.25 + (1 - dr.t) * 0.4})`;
      g.beginPath(); g.ellipse(dr.x - cam.left, dr.y - cam.top, 9, 5, 0, 0, TAU); g.fill();
      const h = dr.t * 120;
      g.fillStyle = '#d8f4ff'; g.fillRect(dr.x - cam.left - 2, dr.y - cam.top - h - 8, 4, 8);
    }
    drawShadow(g, x, y + 7, 10, 3, 0.35);
    const flash = this.flash > 0 || (this.state === 'wind' && Math.floor(this.t * 14) % 2 === 0);
    const c = flash ? '#ffffff' : '#a8d8f0', dk = flash ? '#ffffff' : '#5a8ab0';
    R(g, x - 7, y - 16, 14, 16, c); R(g, x - 7, y - 4, 14, 4, dk);
    R(g, x - 11, y - 14, 4, 10, dk); R(g, x + 7, y - 14, 4, 10, dk);
    R(g, x - 5, y - 24, 10, 8, c);
    for (let k = 0; k < 4; k++) { g.fillStyle = flash ? '#fff' : '#e8fbff'; g.beginPath(); g.moveTo(x - 6 + k * 4, y - 24); g.lineTo(x - 4 + k * 4, y - 31 - (k % 2) * 3); g.lineTo(x - 2 + k * 4, y - 24); g.fill(); }
    R(g, x - 3, y - 21, 2, 2, '#204060'); R(g, x + 1, y - 21, 2, 2, '#204060');
    if (this.state === 'dash') { g.globalAlpha = 0.3; R(g, x - 7 - this.cdx * 10, y - 16 - this.cdy * 10, 14, 16, '#e0f8ff'); g.globalAlpha = 1; }
    if (this.state === 'stunned') for (let k = 0; k < 3; k++) { const a = this.t * 5 + (k * TAU) / 3; R(g, x + Math.cos(a) * 10, y - 34 + Math.sin(a) * 3, 3, 3, '#ffe060'); }
    if (this.state === 'skid') { g.fillStyle = 'rgba(220,245,255,0.6)'; g.fillRect(x - 10, y + 2, 20, 2); R(g, x + 6, y - 20, 3, 2, '#ffffff'); }
  }
}

export function createBoss(kind, x, y, hpMult = 1) {
  if (kind === 'thornmaw') return new Thornmaw(x, y, hpMult);
  if (kind === 'cinder') return new CinderWarden(x, y, hpMult);
  return new RimeSovereign(x, y, hpMult);
}
