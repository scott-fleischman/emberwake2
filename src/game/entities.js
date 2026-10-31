// Shared entity types: actors, projectiles, bombs, pickups, effects, NPCs, chests.
import { TILE, T, TILE_INFO, D, DECO_SOLID } from '../world/tiles.js';
import { moveActor } from './physics.js';
import { humanSprite, npcLook, drawHeld, idleLife, R } from '../gfx/sprites.js';
import { drawShadow } from '../gfx/render.js';
import { TAU } from '../core/math.js';
import { hashSeed, tileHash } from '../core/rng.js';
import { makeZone } from './zones.js';
import { voiceFor } from '../audio/voices.js';

export class Entity {
  constructor(x, y, w = 8, h = 8) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.dead = false;
  }
  get sortY() { return this.y + this.h / 2; }
  update() {}
  draw() {}
}

export class Actor extends Entity {
  constructor(x, y, w, h) {
    super(x, y, w, h);
    this.vx = 0; this.vy = 0; this.kbT = 0;
    this.hp = 1; this.maxHp = 1;
    this.flash = 0; this.iframes = 0;
    this.facing = 'down'; this.aim = Math.PI / 2;
    this.mass = 1;
    this.anim = 0;
  }
  knock(vx, vy, t = 0.16) {
    this.vx = vx / this.mass; this.vy = vy / this.mass; this.kbT = t;
  }
  // Moves along knockback velocity, decaying it. Returns true while knockback is active.
  knockStep(dt, map, solid) {
    if (this.kbT <= 0) return false;
    this.kbT -= dt;
    moveActor(map, this, this.vx * dt, this.vy * dt, { solid });
    this.vx *= 0.86; this.vy *= 0.86;
    return true;
  }
  tickTimers(dt) {
    if (this.flash > 0) this.flash -= dt;
    if (this.iframes > 0) this.iframes -= dt;
  }
}

// Solid test for things that fly over water and pits (projectiles, skirmishers).
export function flyingSolid(map) {
  return (tx, ty) => {
    if (!map.inBounds(tx, ty)) return true;
    const t = map.tiles[ty * map.w + tx];
    const info = TILE_INFO[t];
    if (info.water || t === T.LAVA || t === T.PIT) return false;
    if (info.solid) return true;
    const d = map.deco[ty * map.w + tx];
    return (DECO_SOLID.has(d) && d !== D.FLOWER) || map.extraSolid[ty * map.w + tx] > 0;
  };
}

// Walkers treat pits and lava as solid so AI never wanders into them.
export function walkerSolid(map, avoidHazards = true) {
  return (tx, ty) => {
    if (map.isSolid(tx, ty)) return true;
    if (!avoidHazards) return false;
    const t = map.tiles[ty * map.w + tx];
    return t === T.PIT || t === T.LAVA || t === T.HAZARD || t === T.SHALLOW;
  };
}

// ------------------------------------------------------------------ effects
export class Particles extends Entity {
  constructor(x, y, opts) {
    super(x, y, 1, 1);
    this.ps = [];
    const { count = 8, color = '#ffffff', speed = 40, life = 0.5, size = 2, gravity = 0, up = 0, spread = TAU, angle = 0 } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life: life * (0.6 + Math.random() * 0.6), max: life, size, color: Array.isArray(color) ? color[i % color.length] : color });
    }
    this.gravity = gravity;
    this.layer = opts.layer ?? 1;
  }
  get sortY() { return this.layer > 0 ? 1e9 : -1e9; }
  update(dt) {
    let alive = 0;
    for (const p of this.ps) {
      if (p.life <= 0) continue;
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += this.gravity * dt;
      p.vx *= 0.94; p.vy *= this.gravity ? 1 : 0.94;
      alive++;
    }
    if (!alive) this.dead = true;
  }
  draw(g, cam) {
    for (const p of this.ps) {
      if (p.life <= 0) continue;
      g.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x - cam.left - p.size / 2), Math.round(p.y - cam.top - p.size / 2), p.size, p.size);
    }
    g.globalAlpha = 1;
  }
}

// Defeat reads clearly: a puff ring plus a spirit wisp that rises and fades.
export class Poof extends Entity {
  constructor(x, y, color = '#e8e0f0', big = false) {
    super(x, y, 1, 1);
    this.t = 0; this.color = color; this.big = big;
  }
  get sortY() { return 1e9; }
  update(dt) { this.t += dt; if (this.t > (this.big ? 1.4 : 0.9)) this.dead = true; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top, t = this.t, s = this.big ? 2 : 1;
    if (t < 0.4) {
      const r = (4 + t * 40) * s;
      g.globalAlpha = 1 - t / 0.4;
      g.fillStyle = this.color;
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6 + t * 2;
        g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, (3.5 - t * 6) * s, 0, TAU); g.fill();
      }
    }
    // spirit
    const st = Math.max(0, t - 0.1);
    g.globalAlpha = Math.max(0, 0.85 - st * 1.1);
    const sy = y - st * 28 * s, sx = x + Math.sin(st * 9) * 3;
    g.fillStyle = 'rgba(200,230,255,0.9)';
    g.beginPath(); g.arc(sx, sy, 3 * s, 0, TAU); g.fill();
    g.fillRect(sx - 1 * s, sy, 2 * s, 5 * s);
    g.fillStyle = '#ffffff'; g.fillRect(sx - 1, sy - 1, 2, 2);
    g.globalAlpha = 1;
  }
}

export class FloatText extends Entity {
  constructor(x, y, text, color = '#fff') { super(x, y, 1, 1); this.text = text; this.color = color; this.t = 0; }
  get sortY() { return 1e9 + 1; }
  update(dt) { this.t += dt; this.y -= 18 * dt; if (this.t > 0.9) this.dead = true; }
  draw(g, cam) {
    g.globalAlpha = Math.max(0, 1 - this.t / 0.9);
    g.font = 'bold 7px "Trebuchet MS", Verdana, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText(this.text, this.x - cam.left + 1, this.y - cam.top + 1);
    g.fillStyle = this.color; g.fillText(this.text, this.x - cam.left, this.y - cam.top);
    g.globalAlpha = 1;
  }
}

export class Explosion extends Entity {
  constructor(x, y, r) { super(x, y, 1, 1); this.r = r; this.t = 0; }
  get sortY() { return 1e9; }
  update(dt) { this.t += dt; if (this.t > 0.45) this.dead = true; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top, k = this.t / 0.45;
    g.globalAlpha = 1 - k;
    g.fillStyle = '#ffb040'; g.beginPath(); g.arc(x, y, this.r * (0.4 + k * 0.7), 0, TAU); g.fill();
    g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(x, y, this.r * 0.4 * (1 - k), 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ projectiles
const PROJ_STYLE = {
  arrow: { w: 4, h: 4 }, knife: { w: 4, h: 4 }, firebolt: { w: 6, h: 6 },
  shot: { w: 5, h: 5 }, thorn: { w: 5, h: 5 }, ember: { w: 6, h: 6 }, ice: { w: 5, h: 5 }, gloam: { w: 6, h: 6 },
  vine: { w: 4, h: 4 }, mud: { w: 7, h: 7 }, poison: { w: 6, h: 6 }, sand: { w: 6, h: 6 }, seed: { w: 5, h: 5 },
  boulder: { w: 10, h: 10 }, snowball: { w: 12, h: 12 }, fireball: { w: 8, h: 8 }, water: { w: 6, h: 6 },
};

const ROLL_DUST = { boulder: ['#8a8278', '#5a544c'], snowball: ['#ffffff', '#c8dcf0'] };
const DROP = 0.25;

export class Projectile extends Entity {
  constructor(kind, x, y, angle, speed, dmg, team, opts = {}) {
    const st = PROJ_STYLE[kind] || PROJ_STYLE.shot;
    super(x, y, st.w, st.h);
    this.kind = kind; this.angle = angle; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.team = team; this.life = opts.life ?? 1.6; this.pierce = opts.pierce ?? 0;
    this.hitSet = new Set(); this.t = 0; this.reflected = false;
    this.effect = opts.effect || null; // a status effect it carries onto the player, on a hit only
    this.rgb = opts.rgb || null; // a jet of water takes its warden's colour, and a borrowed shot its borrower's
    this.home = opts.home || 0; // radians a second it turns toward the player while it's theirs to dodge
    this.drop = opts.drop || 0; // spat from this high, it falls to the floor over its first DROP seconds
    // opts.lob: seconds of flight in an arc that comes down at the aim point, calling opts.land. It
    // leaves from opts.height above the ground (a hand's height) and peaks opts.arc above that line.
    this.lob = opts.lob || 0; this.land = opts.land || null;
    if (this.lob) { this.life = this.lob; this.arc = opts.arc ?? Math.min(36, 8 + speed * this.lob * 0.2); this.z0 = opts.height ?? 6; }
    // opts.roll: { speed, time, ...zone fields }: once down, it rolls on the way it was flying.
    this.roll = opts.roll || null; this.rolling = false;
  }
  get sortY() { return this.y + (this.lob ? 12 : 6); }
  update(dt, ctx) {
    this.t += dt;
    this.life -= dt;
    if (this.lob) {
      // Up over walls and heads alike; what it does where it comes down is a zone's job.
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.life <= 0) {
        this.land?.(this, ctx);
        if (this.roll) this.startRoll(ctx); else this.dead = true;
      }
      return;
    }
    if (this.rolling) {
      // Along the ground: the zone riding with it does the hitting, so the bot sees it as a hazard.
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      if (this.life <= 0 || walkerSolid(ctx.map)(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
        this.dead = true;
        ctx.area.zones = ctx.area.zones.filter((z) => z !== this.zone);
        ctx.area.spawn(new Particles(this.x, this.y, { count: 10, color: ROLL_DUST[this.kind] || '#b0a090', speed: 55, life: 0.4 }));
        return;
      }
      this.x = nx; this.y = ny;
      return;
    }
    if (this.life <= 0) { this.dead = true; return; }
    if (this.home && this.team === 'enemy') this.steer(dt, ctx.player);
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const solid = flyingSolid(ctx.map);
    if (solid(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      this.dead = true;
      ctx.area.spawn(new Particles(this.x, this.y, { count: 5, color: this.rgb ? `rgb(${this.rgb})` : this.kind === 'firebolt' || this.kind === 'ember' ? '#ffa040' : this.kind === 'water' ? 'rgb(140,224,244)' : this.kind === 'gloam' ? '#c8a0ff' : '#d0d0d0', speed: 50, life: 0.25 }));
      ctx.area.onProjectileWall?.(this, Math.floor(nx / TILE), Math.floor(ny / TILE));
      return;
    }
    this.x = nx; this.y = ny;
    ctx.area.resolveProjectile(this, ctx);
  }
  // A homing shot bends toward the player, no faster than its turn rate.
  steer(dt, p) {
    const sp = Math.hypot(this.vx, this.vy), want = Math.atan2(p.y - this.y, p.x - this.x);
    const d = Math.atan2(Math.sin(want - this.angle), Math.cos(want - this.angle));
    this.angle += Math.max(-this.home * dt, Math.min(this.home * dt, d));
    this.vx = Math.cos(this.angle) * sp; this.vy = Math.sin(this.angle) * sp;
  }
  // Its body becomes a moving segment zone, published for the length of the roll.
  startRoll(ctx) {
    const { speed, time, ...zone } = this.roll, c = Math.cos(this.angle), s = Math.sin(this.angle);
    this.lob = 0; this.rolling = true; this.life = time; this.t = 0;
    this.vx = c * speed; this.vy = s * speed;
    this.zone = makeZone('segment', { x1: this.x - c * 3, y1: this.y - s * 3, x2: this.x + c * 3, y2: this.y + s * 3, w: this.w, t: 0, life: time, vx: this.vx, vy: this.vy, ...zone });
    ctx.area.zones.push(this.zone);
  }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    if (this.lob || this.rolling) {
      // Starts at hand height, peaks mid-flight, lands on its shadow; a rolling one turns as it goes.
      const k = this.rolling ? 1 : Math.min(1, this.t / this.lob), z = this.rolling ? 0 : Math.sin(Math.PI * k) * this.arc + (1 - k) * this.z0;
      drawShadow(g, x, y + 2, Math.max(3, this.w / 2), 1.5, 0.25);
      g.save();
      g.translate(Math.round(x), Math.round(y - z));
      g.rotate(this.rolling ? (this.t * Math.hypot(this.vx, this.vy) / (this.w / 2)) * Math.sign(this.vx || 1) : this.t * 7);
      switch (this.kind) {
        case 'mud': g.fillStyle = '#5a4024'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill(); R(g, -2, -2, 2, 2, '#8a6a44'); R(g, 2, 1, 1, 2, '#3a2814'); break;
        case 'poison':
          g.fillStyle = 'rgba(130,210,70,0.35)'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
          g.fillStyle = '#5aa030'; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); R(g, -1, -2, 2, 1, '#c8f090');
          break;
        case 'sand': R(g, -3, -2, 6, 5, '#c8a868'); R(g, -3, -2, 6, 1, '#e8d0a0'); R(g, -1, -4, 2, 2, '#8a6a3a'); break;
        case 'boulder':
          g.fillStyle = '#6a625a'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
          R(g, -3, -3, 3, 2, '#9a928a'); R(g, -1, 0, 4, 1, '#3a342e'); R(g, 2, 1, 1, 3, '#3a342e'); R(g, -4, 2, 2, 1, '#4a443e');
          break;
        case 'snowball':
          g.fillStyle = '#b8c8dc'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
          g.fillStyle = '#eef4fa'; g.beginPath(); g.arc(-1, -1, 4.5, 0, TAU); g.fill();
          R(g, -3, -3, 2, 2, '#ffffff'); R(g, 2, 1, 2, 1, '#d0dcea'); R(g, -2, 3, 2, 1, '#d0dcea');
          break;
        case 'fireball':
          g.fillStyle = 'rgba(255,140,40,0.4)'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
          g.fillStyle = '#ff6a18'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill();
          R(g, -2, -2, 3, 3, '#ffb040'); R(g, -1, -1, 1, 1, '#fff0b0');
          break;
        default: g.fillStyle = '#7a5a30'; g.beginPath(); g.ellipse(0, 0, 2.5, 3.5, 0, 0, TAU); g.fill(); R(g, -1, -4, 2, 2, '#7ab048');
      }
      g.restore();
      return;
    }
    g.save();
    g.translate(Math.round(x), Math.round(y - this.drop * Math.max(0, 1 - this.t / DROP) ** 2));
    g.rotate(this.angle);
    switch (this.kind) {
      case 'arrow': R(g, -6, -0.5, 10, 1, '#d8c8a0'); R(g, 3, -1.5, 3, 3, '#e0e0e0'); R(g, -7, -1.5, 2, 3, '#c04040'); break;
      case 'knife': R(g, -3, -1, 7, 2, '#d8dce4'); R(g, -5, -1, 2, 2, '#5a3a20'); break;
      case 'firebolt': case 'ember': {
        const c = this.rgb || '255,128,48';
        g.fillStyle = `rgba(${this.rgb || '255,140,40'},0.4)`; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
        g.fillStyle = `rgb(${c})`; g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
        g.fillStyle = this.rgb ? '#ffffff' : '#fff0b0'; g.fillRect(-1, -1, 2, 2);
        R(g, -8, -1, 4, 2, `rgba(${this.rgb || '255,120,40'},0.6)`);
        break;
      }
      case 'thorn': g.fillStyle = this.rgb ? `rgb(${this.rgb})` : '#6ab040'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-3, -3); g.lineTo(-3, 3); g.closePath(); g.fill(); break;
      case 'ice':
        if (this.effect || this.rgb) { g.fillStyle = `rgba(${this.rgb || '140,208,255'},0.45)`; g.beginPath(); g.arc(1, 0, 5, 0, TAU); g.fill(); } // a frost arrow's glow
        g.fillStyle = this.rgb ? `rgb(${this.rgb})` : '#c8f0ff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(-3, -2.5); g.lineTo(-3, 2.5); g.closePath(); g.fill(); R(g, -1, -1, 3, 1, '#fff'); break;
      case 'gloam': { // a mote of cold violet fire, its tail of shadow streaming behind
        const f = Math.sin(this.t * 18) * 0.6;
        g.fillStyle = 'rgba(40,10,60,0.55)'; g.beginPath(); g.ellipse(-4, 0, 7, 3.5, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(200,160,255,0.35)'; g.beginPath(); g.arc(0, 0, 6 + f, 0, TAU); g.fill();
        g.fillStyle = '#a070e0'; g.beginPath(); g.arc(0, 0, 3.6, 0, TAU); g.fill();
        g.fillStyle = '#e8d8ff'; g.fillRect(-1, -1, 2, 2);
        R(g, -10, -0.5, 4, 1, 'rgba(160,110,230,0.6)');
        break;
      }
      case 'water': { // a gout of water, its spray trailing behind
        const c = this.rgb || '140,224,244';
        g.fillStyle = `rgba(${c},0.35)`; g.beginPath(); g.ellipse(-2, 0, 7, 4, 0, 0, TAU); g.fill();
        R(g, -9, -1, 4, 1, `rgba(${c},0.6)`); R(g, -12, 1, 2, 1, `rgba(${c},0.45)`);
        g.fillStyle = `rgb(${c})`; g.beginPath(); g.ellipse(0, 0, 4, 2.6, 0, 0, TAU); g.fill();
        R(g, 0, -1, 2, 1, '#ffffff');
        break;
      }
      case 'vine': R(g, -6, -0.5, 10, 1, '#5a7a30'); R(g, 3, -1.5, 3, 3, '#8ac050'); R(g, -2, -2, 2, 1, '#7ab048'); R(g, 0, 1, 2, 1, '#7ab048'); R(g, -7, -1.5, 2, 3, '#4a6a2a'); break;
      default:
        g.fillStyle = this.team === 'player' ? '#a0e0ff' : '#ff5a6a';
        g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.fillRect(-1, -1, 2, 2);
    }
    g.restore();
  }
}

export class Bomb extends Entity {
  constructor(x, y, owner) {
    super(x, y, 8, 8);
    this.fuse = 1.5; this.owner = owner; this.t = 0;
  }
  update(dt, ctx) {
    this.t += dt;
    this.fuse -= dt;
    if (this.fuse <= 0) { this.dead = true; ctx.area.explode(this.x, this.y, 30, 4, ctx); }
  }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    drawShadow(g, x, y + 4, 5, 2);
    const blink = this.fuse < 0.6 ? Math.sin(this.t * 40) > 0 : Math.sin(this.t * 12) > 0.6;
    g.fillStyle = blink ? '#ff5040' : '#24242c';
    g.beginPath(); g.arc(x, y - 1, 5, 0, TAU); g.fill();
    R(g, x - 3, y - 4, 2, 2, '#6a6a7a');
    R(g, x, y - 8, 1, 3, '#a08050');
    if (Math.sin(this.t * 30) > 0) R(g, x - 1, y - 10, 3, 2, '#ffd040');
  }
}

// ------------------------------------------------------------------ pickups
export const PICKUP_COLORS = { heart: '#e04848', coin: '#f0c850', arrows: '#d8c8a0', knives: '#c8ccd4', mana: '#4a8ae8', food: '#e07a3a', bombs: '#33333c', key: '#f0d050' };

export class Pickup extends Entity {
  constructor(kind, x, y, value = 1, opts = {}) {
    super(x, y, 8, 8);
    this.kind = kind; this.value = value; this.t = Math.random() * 3;
    this.life = opts.permanent ? Infinity : 14;
    this.vz = opts.pop ? -60 : 0; this.z = 0; this.id = opts.id || null;
    this.color = opts.color || null; this.questId = opts.questId || null;
  }
  update(dt, ctx) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.vz || this.z < 0) { this.vz += 240 * dt; this.z += this.vz * dt; if (this.z > 0) { this.z = 0; this.vz = 0; } }
    const p = ctx.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d < 40 && this.kind !== 'key') { this.x += (p.x - this.x) * Math.min(1, dt * 8); this.y += (p.y - this.y) * Math.min(1, dt * 8); }
    if (d < 9 && !p.dead) {
      if (ctx.game.collect(this)) this.dead = true;
    }
  }
  draw(g, cam) {
    if (this.life < 3 && Math.sin(this.t * 20) > 0) return;
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top + this.z + Math.sin(this.t * 4) * 1.5);
    drawShadow(g, x, Math.round(this.y - cam.top) + 4, 4, 1.5, 0.25);
    switch (this.kind) {
      case 'heart': R(g, x - 3, y - 3, 2, 2, '#e04848'); R(g, x + 1, y - 3, 2, 2, '#e04848'); R(g, x - 4, y - 2, 8, 2, '#e04848'); R(g, x - 3, y, 6, 1, '#e04848'); R(g, x - 2, y + 1, 4, 1, '#e04848'); R(g, x - 1, y + 2, 2, 1, '#e04848'); R(g, x - 3, y - 3, 1, 1, '#ffb0b0'); break;
      case 'coin': { const w = Math.max(1, Math.round(Math.abs(Math.cos(this.t * 4)) * 5)); R(g, x - (w >> 1), y - 3, w, 6, this.value >= 5 ? '#ff9a40' : '#f0c850'); R(g, x - (w >> 1), y - 3, Math.max(1, w >> 1), 1, '#fff0a0'); break; }
      case 'arrows': R(g, x - 4, y - 1, 8, 1, '#d8c8a0'); R(g, x - 4, y + 1, 8, 1, '#d8c8a0'); R(g, x + 3, y - 2, 2, 5, '#e0e0e0'); R(g, x - 5, y - 2, 1, 5, '#c04040'); break;
      case 'knives': R(g, x - 3, y - 2, 6, 1, '#d8dce4'); R(g, x - 3, y + 1, 6, 1, '#d8dce4'); R(g, x - 5, y - 2, 2, 4, '#5a3a20'); break;
      case 'mana': g.fillStyle = '#4a8ae8'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); R(g, x - 1, y - 2, 2, 2, '#c0e0ff'); break;
      case 'food': R(g, x - 3, y - 2, 6, 5, '#d0603a'); R(g, x - 2, y - 3, 4, 1, '#d0603a'); R(g, x - 2, y - 2, 2, 1, '#ffa080'); R(g, x, y - 5, 1, 2, '#5a3a20'); R(g, x + 1, y - 5, 2, 1, '#4a9a3a'); break;
      case 'bombs': g.fillStyle = '#24242c'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); R(g, x, y - 6, 1, 3, '#a08050'); break;
      case 'quest': R(g, x - 3, y - 2, 6, 5, '#8a6a3a'); R(g, x - 2, y - 4, 4, 2, '#a08050'); R(g, x - 1, y, 2, 1, '#f0c850'); g.fillStyle = 'rgba(255,240,180,0.35)'; g.beginPath(); g.arc(x, y, 8 + Math.sin(this.t * 5), 0, TAU); g.fill(); break;
      case 'herb': {
        const c = this.color || '#c8b0ff';
        g.fillStyle = c; g.globalAlpha = 0.25 + 0.15 * Math.sin(this.t * 4); g.beginPath(); g.arc(x, y - 2, 7, 0, TAU); g.fill(); g.globalAlpha = 1;
        R(g, x, y - 1, 1, 5, '#4a8a3a'); R(g, x - 2, y + 1, 2, 1, '#4a8a3a');
        R(g, x - 2, y - 4, 2, 2, c); R(g, x + 1, y - 4, 2, 2, c); R(g, x - 1, y - 6, 2, 2, c); R(g, x - 1, y - 3, 2, 2, '#fff6c0');
        break;
      }
      case 'key': R(g, x - 1, y - 5, 3, 3, '#f0d050'); R(g, x, y - 2, 1, 6, '#f0d050'); R(g, x + 1, y + 1, 2, 1, '#f0d050'); R(g, x + 1, y + 3, 2, 1, '#f0d050'); g.fillStyle = 'rgba(255,230,120,0.3)'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); break;
    }
  }
}

// ------------------------------------------------------------------ NPCs & props
// Idle actions by role: [seconds per cycle, kinds]; each cycle may play one kind for its length.
const ROLE_IDLE = { smith: [4.5, ['hammer']], merchant: [7, ['beckon', 'beckon', 'wave']], elder: [8, ['lean']], scout: [7.5, ['scan']], ranger: [7.5, ['scan']], keeper: [6, ['guard']], innkeeper: [6, ['wipe']], seer: [7.5, ['orb']], villager: [7, ['shift', 'look']] };
const IDLE_LEN = { hammer: 2.4, beckon: 1.8, wave: 1.5, lean: 3.2, scan: 3.2, guard: 1.6, wipe: 2.6, orb: 3.6, shift: 2.6, look: 2.4 };
const WAVERS = new Set(['villager', 'informant', 'merchant']);
const TALK_ARMS = 'ocdodrcd';

export class NPC extends Actor {
  constructor(data, x, y, opts = {}) {
    super(x, y, 10, 8);
    this.data = data;
    this.look = npcLook(data.role, data.look);
    this.homeX = x; this.homeY = y;
    this.wander = opts.wander ?? false;
    this.wt = Math.random() * 3; this.tx = x; this.ty = y;
    this.talking = false;
    this.solidForPlayer = true;
    this.seed = hashSeed(data.id ?? data.name ?? 'npc'); this.life = (this.seed % 997) / 997;
  }
  update(dt, ctx) {
    this.anim += dt;
    const p = ctx.player;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.bark) this.bark.t -= dt;
    this.barkCool = (this.barkCool ?? 1 + Math.random() * 3) - dt;
    if (this.barkCool <= 0 && dist < 90 && dist > 24 && !this.talking && ctx.game.barkFor) {
      this.barkCool = 8 + Math.random() * 8;
      const line = Math.random() < 0.65 ? ctx.game.barkFor(this) : null;
      if (line) {
        this.bark = { text: line, t: 3.2 };
        ctx.game.audio?.sfx('voice', { v: voiceFor(this.data.name, this.data.role), phrase: 3, volume: 0.7 }); // calling out as you pass
      }
    }
    const near = dist < 40, now = ctx.game.time ?? this.anim;
    // Townsfolk sometimes wave as you walk up.
    if (dist < 56 && !this.wasClose && !this.talking && WAVERS.has(this.data.role) && now - (this.waveAt ?? -99) > 10 && tileHash(this.seed & 1023, Math.floor(now), 12) < 0.7) this.waveAt = now;
    this.wasClose = dist < 56; this.near = near;
    if (near || this.talking) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) < 0 ? 'left' : 'right') : (Math.sin(a) < 0 ? 'up' : 'down');
      this.moving = false;
      return;
    }
    if (!this.wander) { this.moving = false; return; }
    this.wt -= dt;
    if (this.wt <= 0) {
      this.wt = 2 + Math.random() * 3;
      this.tx = this.homeX + (Math.random() - 0.5) * 48;
      this.ty = this.homeY + (Math.random() - 0.5) * 32;
    }
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    this.moving = d > 2;
    if (this.moving) {
      const s = 22 * dt;
      const r = moveActor(ctx.map, this, (dx / d) * s, (dy / d) * s, { solid: walkerSolid(ctx.map) });
      if (r.hitX || r.hitY) this.tx = this.x, this.ty = this.y;
      this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    }
  }
  // What the body is doing at scene time t: breathing and blinking always, plus talk gestures, a wave,
  // or the role's idle action now and then. Purely visual; on the scene clock so it runs during dialogue.
  idlePose(t) {
    const s = this.seed & 1023, life = idleLife(t, this.life);
    let by = life[0], arm = 'd', free = 'd', face = this.facing, dx = 0, fx = null;
    if (this.talking) {
      // gesture with the front hand, unless it holds a staff, spear or hammer
      by = Math.floor(t * 4 + this.life * 4) % 2 ? '1' : '0';
      const gest = TALK_ARMS[Math.floor(t * 3 + this.life * 8) % TALK_ARMS.length];
      if (['staff', 'spear', 'hammer'].includes(this.look.tool)) free = gest; else arm = gest;
    } else if (this.waveAt !== undefined && t >= this.waveAt && t - this.waveAt < IDLE_LEN.wave) {
      arm = Math.floor((t - this.waveAt) * 6) % 2 ? 'w' : 'r';
    } else if (!this.near) {
      const [every, kinds] = ROLE_IDLE[this.data.role] || ROLE_IDLE.villager;
      const n = Math.floor(t / every), kind = kinds[Math.floor(tileHash(s, n, 8) * kinds.length)], len = IDLE_LEN[kind];
      const u = t - n * every - tileHash(s, n, 6) * (every - len), side = tileHash(s, n, 9) < 0.5;
      if (u >= 0 && u < len && tileHash(s, n, 7) < 0.85) {
        switch (kind) {
          case 'hammer': { const c = (u % 0.6) / 0.6; arm = c < 0.45 ? 'r' : c < 0.58 ? 'o' : 'x'; by = c >= 0.58 && c < 0.8 ? '1' : '0'; if (this.anvil) { face = this.anvil < 0 ? 'left' : 'right'; if (c >= 0.58 && c < 0.72) fx = 'spark'; } break; }
          case 'beckon': arm = Math.floor(u * 3.5) % 2 ? 'c' : 'o'; break;
          case 'wave': arm = Math.floor(u * 6) % 2 ? 'w' : 'r'; break;
          case 'lean': arm = 'l'; by = '1'; break;
          case 'scan': { const q = Math.floor(u / 0.8) % 4; arm = 'h'; face = q === 0 ? 'left' : q === 2 ? 'right' : 'down'; break; }
          case 'guard': { const c = u % 0.8; arm = c < 0.4 ? 'c' : 'd'; if (c >= 0.4 && c < 0.52) fx = 'dust'; break; }
          case 'wipe': arm = Math.floor(u * 4) % 2 ? 'n' : 'm'; break;
          case 'orb': arm = 'o'; dx = Math.round(Math.sin(u * 2.4)); break;
          case 'shift': dx = side ? -1 : 1; break;
          case 'look': face = (u < len / 2) === side ? 'left' : 'right'; break;
        }
      }
    }
    return { pose: `${by}${life[1]}${arm}${free}`, face, dx, fx };
  }
  draw(g, cam, ctx) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    drawShadow(g, x, y + 4, 5, 2);
    const t = ctx?.game?.time ?? this.anim, sx = x - 8, sy = y + 5 - 20;
    if (this.anvil === undefined) {
      const a = ctx?.area?.layout?.props?.find((q) => q.type === 'anvil'), ax = a ? (a.x + a.w / 2) * TILE - this.x : 0;
      this.anvil = a && Math.abs(ax) < 56 && Math.abs((a.y + 0.5) * TILE - this.y) < 40 ? Math.sign(ax) || 1 : 0;
    }
    const frame = this.moving ? Math.floor(this.anim * 6) % 4 : 0;
    const p = this.moving ? { pose: '', face: this.facing, dx: 0, fx: null } : this.idlePose(t);
    drawHeld(g, sx, sy, this.look, p.face, p.pose, 'back', t);
    g.drawImage(humanSprite(this.look, p.face, frame, `npc${this.data.role}${this.data.look}`, p.pose), sx + p.dx, sy);
    drawHeld(g, sx + p.dx, sy, this.look, p.face, p.pose, 'front', t);
    if (p.fx) {
      const o = p.face === 'left' ? -1 : 1, X = sx + (o < 0 ? 3 : 12) + o;
      if (p.fx === 'spark') {
        const hy = sy + 14 + (p.pose[0] === '1' ? 1 : 0), f = Math.floor(t * 30) % 2;
        R(g, X + 5 * o, hy + 1, 1, 1, '#fff2a0'); R(g, X + (4 + f) * o, hy - 2, 1, 1, '#ffc840'); R(g, X + (6 - f) * o, hy - 1 + f, 1, 1, '#ff9a30');
      } else { R(g, X - 2, sy + 19, 1, 1, '#d8cdb8'); R(g, X + 2, sy + 19, 1, 1, '#d8cdb8'); R(g, X - 1, sy + 18, 1, 1, '#c8bca8'); }
    }
    if (this.marker) {
      const bob = Math.sin(this.anim * 4) * 1.5;
      g.fillStyle = this.marker === '!' ? '#ffd040' : '#a0e0ff';
      g.font = 'bold 9px "Trebuchet MS", Verdana, sans-serif';
      g.textAlign = 'center';
      g.fillText(this.marker, x, y - 18 + bob);
    }
  }
}

export class Chest extends Entity {
  constructor(id, x, y, contents, opts = {}) {
    super(x, y, 14, 10);
    this.id = id; this.contents = contents; this.opened = !!opts.opened; this.hidden = !!opts.hidden;
    this.big = !!opts.big; this.t = 0;
  }
  update(dt) { this.t += dt; }
  draw(g, cam) {
    if (this.hidden) return;
    const x = Math.round(this.x - cam.left) - 7, y = Math.round(this.y - cam.top) - 6;
    drawShadow(g, x + 7, y + 11, 7, 2);
    const wood = this.big ? '#7a3a8a' : '#8a5a2a', trim = this.big ? '#f0c850' : '#d0a040';
    if (this.opened) {
      R(g, x, y + 3, 14, 8, wood); R(g, x + 1, y + 4, 12, 3, '#2a1a10'); R(g, x, y - 1, 14, 4, shadeHex(wood)); R(g, x, y + 7, 14, 1, trim);
    } else {
      R(g, x, y, 14, 11, wood); R(g, x, y, 14, 2, shadeHex(wood, true)); R(g, x, y + 4, 14, 1, trim); R(g, x + 6, y + 3, 2, 3, trim);
      if (Math.sin(this.t * 3) > 0.7) R(g, x + 2, y + 1, 2, 1, '#ffffff');
    }
  }
}

function shadeHex(hex, light = false) {
  return light ? hex.replace(/^#(..)(..)(..)$/, (m, r, gg, b) => '#' + [r, gg, b].map((c) => Math.min(255, parseInt(c, 16) + 40).toString(16).padStart(2, '0')).join('')) : hex.replace(/^#(..)(..)(..)$/, (m, r, gg, b) => '#' + [r, gg, b].map((c) => Math.max(0, parseInt(c, 16) - 40).toString(16).padStart(2, '0')).join(''));
}

// A hidden supply cache: a faint glint that sharper eyes notice from farther away.
export class Cache extends Entity {
  constructor(data) {
    super(data.x * TILE + 8, data.y * TILE + 8, 12, 12);
    this.data = data; this.t = Math.random() * 5;
  }
  update(dt) { this.t += dt; }
  draw(g, cam, ctx) {
    const d = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y);
    const sense = ctx.game.derived.cacheSense;
    if (d > sense + 40) return;
    const vis = Math.max(0.15, Math.min(1, 1 - (d - sense) / 40));
    const x = this.x - cam.left, y = this.y - cam.top;
    const tw = (Math.sin(this.t * 5) + 1) / 2;
    g.globalAlpha = vis * (0.4 + tw * 0.6);
    R(g, x - 0.5, y - 4, 1, 8, '#fff8d0'); R(g, x - 4, y - 0.5, 8, 1, '#fff8d0');
    R(g, x - 1, y - 1, 2, 2, '#ffffff');
    g.globalAlpha = 1;
  }
}

// A runaway pet from a side quest. Bolts a few times when you get close, then tires and sits.
export class Critter extends Actor {
  constructor(q, x, y) {
    super(x, y, 8, 6);
    this.q = q; this.id = q.id; this.kind = q.pet.kind;
    this.homeX = x; this.homeY = y;
    this.flees = 3; this.hopT = 0; this.alert = 0; this.dir = 1;
  }
  update(dt, ctx) {
    this.anim += dt;
    const g = ctx.game, p = ctx.player;
    if (g.state.quest.side[this.q.id] !== 'active') { this.dead = true; return; }
    if (this.alert > 0) this.alert -= dt;
    if (this.hopT > 0) {
      this.hopT -= dt;
      const r = moveActor(ctx.map, this, this.vx * dt, this.vy * dt, { solid: walkerSolid(ctx.map) });
      if (r.hitX) this.vx *= -1;
      if (r.hitY) this.vy *= -1;
      this.moving = true;
      return;
    }
    this.moving = false;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d < 13) {
      ctx.area.spawn(new Particles(this.x, this.y - 6, { count: 10, color: ['#ff8090', '#ffffff'], speed: 40, life: 0.6, up: 30 }));
      g.catchPet(this.q);
      this.dead = true;
      return;
    }
    if (this.flees > 0 && d < 40) {
      this.flees--;
      let a = Math.atan2(this.y - p.y, this.x - p.x) + (Math.random() - 0.5) * 0.9;
      if (Math.hypot(this.homeX - this.x, this.homeY - this.y) > 70) a = Math.atan2(this.homeY - this.y, this.homeX - this.x) + (Math.random() - 0.5) * 1.4;
      this.vx = Math.cos(a) * 115; this.vy = Math.sin(a) * 115;
      this.hopT = 0.5;
      this.alert = 0.7;
      this.dir = this.vx < 0 ? -1 : 1;
      g.audio.sfx('dash', { pitch: 1.7, volume: 0.5 });
    } else if (d < 90) this.dir = p.x < this.x ? -1 : 1;
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    drawShadow(g, x, y + 3, 5, 1.5);
    const hop = this.moving ? -Math.abs(Math.sin(this.anim * 18)) * 3 : 0;
    g.save(); g.translate(x, y + hop); g.scale(this.dir, 1);
    const k = this.kind;
    const body = k === 'cat' ? '#e0a050' : k === 'dog' ? '#9a6a3a' : '#f0ece0';
    const dark = k === 'cat' ? '#a86a2a' : k === 'dog' ? '#6a4422' : '#c8c0b0';
    if (k === 'hen') {
      R(g, -4, -6, 7, 6, body); R(g, 1, -9, 4, 4, body); R(g, 5, -8, 2, 1, '#f0b030'); R(g, 2, -10, 2, 1, '#e03030');
      R(g, 3, -8, 1, 1, '#202020'); R(g, -5, -6, 2, 3, dark); R(g, -2, 0, 1, 2, '#f0b030'); R(g, 1, 0, 1, 2, '#f0b030');
    } else {
      R(g, -5, -5, 10, 5, body); R(g, -5, -1, 10, 1, dark);
      R(g, -4, 0, 2, 2, dark); R(g, 2, 0, 2, 2, dark);
      R(g, 3, -9, 5, 5, body); R(g, 6, -7, 1, 1, '#202020');
      if (k === 'cat') { R(g, 3, -11, 2, 2, body); R(g, 6, -11, 2, 2, body); R(g, -7, -9 + Math.round(Math.sin(this.anim * 4)), 2, 5, body); }
      if (k === 'dog') { R(g, 2, -9, 2, 4, dark); R(g, 8, -6, 1, 1, '#202020'); R(g, -7, -6 + Math.round(Math.sin(this.anim * 12)), 2, 2, body); }
      if (k === 'goat') { R(g, 3, -11, 1, 2, '#8a8070'); R(g, 6, -11, 1, 2, '#8a8070'); R(g, 6, -4, 2, 2, '#d8d0c0'); R(g, -6, -5, 2, 2, body); }
    }
    g.restore();
    if (this.alert > 0) { R(g, x - 1, y - 20, 2, 5, '#ffd040'); R(g, x - 1, y - 14, 2, 2, '#ffd040'); }
    else if (this.flees === 0) { const b = Math.sin(this.anim * 3) * 1.5; R(g, x - 2, y - 18 + b, 2, 2, '#ff8090'); R(g, x + 1, y - 18 + b, 2, 2, '#ff8090'); R(g, x - 2, y - 17 + b, 5, 2, '#ff8090'); R(g, x - 1, y - 15 + b, 3, 1, '#ff8090'); }
  }
}

// The X on a treasure map, drawn on the ground.
export class DigSpot extends Entity {
  constructor(q, x, y) { super(x, y, 12, 12); this.q = q; this.id = `dig:${q.id}`; this.t = 0; }
  get sortY() { return this.y - 10; }
  update(dt, ctx) { this.t += dt; if (ctx.game.state.quest.side[this.q.id] !== 'active') this.dead = true; }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    g.fillStyle = 'rgba(90,60,30,0.45)'; g.beginPath(); g.ellipse(x, y + 2, 7, 4, 0, 0, TAU); g.fill();
    for (let k = -3; k <= 3; k++) { R(g, x + k - 1, y + k * 0.6 + 1, 2, 1, '#9a2a1a'); R(g, x - k - 1, y + k * 0.6 + 1, 2, 1, '#9a2a1a'); }
    if (Math.sin(this.t * 3) > 0.8) R(g, x + 4, y - 3, 1, 1, '#ffffff');
  }
}

export { walkerSolid as walkSolid };
