// Shared entity types: actors, projectiles, bombs, pickups, effects, NPCs, chests.
import { TILE, T, TILE_INFO, D, DECO_SOLID } from '../world/tiles.js';
import { moveActor } from './physics.js';
import { humanSprite, npcLook, R } from '../gfx/sprites.js';
import { drawShadow } from '../gfx/render.js';
import { TAU } from '../core/math.js';

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
  shot: { w: 5, h: 5 }, thorn: { w: 5, h: 5 }, ember: { w: 6, h: 6 }, ice: { w: 5, h: 5 },
};

export class Projectile extends Entity {
  constructor(kind, x, y, angle, speed, dmg, team, opts = {}) {
    const st = PROJ_STYLE[kind] || PROJ_STYLE.shot;
    super(x, y, st.w, st.h);
    this.kind = kind; this.angle = angle; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.dmg = dmg; this.team = team; this.life = opts.life ?? 1.6; this.pierce = opts.pierce ?? 0;
    this.hitSet = new Set(); this.t = 0; this.reflected = false;
  }
  get sortY() { return this.y + 6; }
  update(dt, ctx) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const solid = flyingSolid(ctx.map);
    if (solid(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      this.dead = true;
      ctx.area.spawn(new Particles(this.x, this.y, { count: 5, color: this.kind === 'firebolt' || this.kind === 'ember' ? '#ffa040' : '#d0d0d0', speed: 50, life: 0.25 }));
      ctx.area.onProjectileWall?.(this, Math.floor(nx / TILE), Math.floor(ny / TILE));
      return;
    }
    this.x = nx; this.y = ny;
    ctx.area.resolveProjectile(this, ctx);
  }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(this.angle);
    switch (this.kind) {
      case 'arrow': R(g, -6, -0.5, 10, 1, '#d8c8a0'); R(g, 3, -1.5, 3, 3, '#e0e0e0'); R(g, -7, -1.5, 2, 3, '#c04040'); break;
      case 'knife': R(g, -3, -1, 7, 2, '#d8dce4'); R(g, -5, -1, 2, 2, '#5a3a20'); break;
      case 'firebolt': case 'ember':
        g.fillStyle = 'rgba(255,140,40,0.4)'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
        g.fillStyle = '#ff8030'; g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
        g.fillStyle = '#fff0b0'; g.fillRect(-1, -1, 2, 2);
        R(g, -8, -1, 4, 2, 'rgba(255,120,40,0.6)');
        break;
      case 'thorn': g.fillStyle = '#6ab040'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-3, -3); g.lineTo(-3, 3); g.closePath(); g.fill(); break;
      case 'ice': g.fillStyle = '#c8f0ff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(-3, -2.5); g.lineTo(-3, 2.5); g.closePath(); g.fill(); R(g, -1, -1, 3, 1, '#fff'); break;
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
  }
  update(dt, ctx) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.vz || this.z < 0) { this.vz += 240 * dt; this.z += this.vz * dt; if (this.z > 0) { this.z = 0; this.vz = 0; } }
    const p = ctx.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d < 26 && this.kind !== 'key') { this.x += (p.x - this.x) * Math.min(1, dt * 8); this.y += (p.y - this.y) * Math.min(1, dt * 8); }
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
      case 'key': R(g, x - 1, y - 5, 3, 3, '#f0d050'); R(g, x, y - 2, 1, 6, '#f0d050'); R(g, x + 1, y + 1, 2, 1, '#f0d050'); R(g, x + 1, y + 3, 2, 1, '#f0d050'); g.fillStyle = 'rgba(255,230,120,0.3)'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); break;
    }
  }
}

// ------------------------------------------------------------------ NPCs & props
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
  }
  update(dt, ctx) {
    this.anim += dt;
    const p = ctx.player;
    const near = Math.hypot(p.x - this.x, p.y - this.y) < 40;
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
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    drawShadow(g, x, y + 4, 5, 2);
    const frame = this.moving ? Math.floor(this.anim * 6) % 4 : 0;
    g.drawImage(humanSprite(this.look, this.facing, frame, `npc${this.data.role}${this.data.look}`), x - 8, y + 5 - 20);
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

export { walkerSolid as walkSolid };
