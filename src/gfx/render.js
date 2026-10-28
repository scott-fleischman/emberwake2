// Camera, tile rendering (chunk cached overworld, cached rooms), y-sorted tall props, lighting.
import { T, D, TILE } from '../world/tiles.js';
import { tileHash } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { drawOverworldTile, decoSprite, buildingSprite, landmarkSprite, makeCanvas, R, shade } from './sprites.js';

export const VIEW_W = 480;
export const VIEW_H = 270;
const CHUNK = 16;

export class Camera {
  constructor(vw = VIEW_W, vh = VIEW_H) {
    this.vw = vw; this.vh = vh; this.x = 0; this.y = 0;
    this.shakeT = 0; this.shakeMag = 0; this.ox = 0; this.oy = 0;
  }
  follow(tx, ty, mapW, mapH, dt, snap = false, bounds = null) {
    const bx = bounds ? bounds.x : 0, by = bounds ? bounds.y : 0, bw = bounds ? bounds.w : mapW, bh = bounds ? bounds.h : mapH;
    let x = tx - this.vw / 2, y = ty - this.vh / 2 - 6;
    x = bw <= this.vw ? bx + (bw - this.vw) / 2 : clamp(x, bx, bx + bw - this.vw);
    y = bh <= this.vh ? by + (bh - this.vh) / 2 : clamp(y, by, by + bh - this.vh);
    if (snap) { this.x = x; this.y = y; } else {
      const k = 1 - Math.exp(-dt * 10);
      this.x += (x - this.x) * k;
      this.y += (y - this.y) * k;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.ox = (Math.random() - 0.5) * this.shakeMag * 2;
      this.oy = (Math.random() - 0.5) * this.shakeMag * 2;
    } else { this.ox = 0; this.oy = 0; }
  }
  shake(mag, t) { if (mag >= this.shakeMag || this.shakeT <= 0) { this.shakeMag = mag; this.shakeT = t; } }
  get left() { return Math.round(this.x + this.ox); }
  get top() { return Math.round(this.y + this.oy); }
}

// ------------------------------------------------------------------ overworld
export class OverworldRenderer {
  constructor(map, world) {
    this.map = map;
    this.world = world;
    this.chunks = new Map();
    this.cols = Math.ceil(map.w / CHUNK);
    this.props = world.props;
  }

  invalidate(tx, ty) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      this.chunks.delete(`${Math.floor((tx + dx) / CHUNK)},${Math.floor((ty + dy) / CHUNK)}`);
    }
  }

  chunk(cx, cy) {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = makeCanvas(CHUNK * TILE, CHUNK * TILE);
      const g = c.getContext('2d');
      for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
        const tx = cx * CHUNK + x, ty = cy * CHUNK + y;
        if (tx < this.map.w && ty < this.map.h) drawOverworldTile(g, this.map, tx, ty, x * TILE, y * TILE);
      }
      this.chunks.set(key, c);
      if (this.chunks.size > 120) this.chunks.delete(this.chunks.keys().next().value);
    }
    return c;
  }

  drawGround(g, cam, time) {
    for (const t of this.map.dirty.splice(0)) this.invalidate(t % this.map.w, Math.floor(t / this.map.w));
    const L = cam.left, Tp = cam.top;
    const c0 = Math.floor(L / (CHUNK * TILE)), c1 = Math.floor((L + cam.vw) / (CHUNK * TILE));
    const r0 = Math.floor(Tp / (CHUNK * TILE)), r1 = Math.floor((Tp + cam.vh) / (CHUNK * TILE));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      if (cx < 0 || cy < 0 || cx >= this.cols || cy * CHUNK >= this.map.h) continue;
      g.drawImage(this.chunk(cx, cy), cx * CHUNK * TILE - L, cy * CHUNK * TILE - Tp);
    }
    // Animated liquid shimmer.
    const m = this.map;
    const x0 = Math.max(0, Math.floor(L / TILE)), x1 = Math.min(m.w - 1, Math.floor((L + cam.vw) / TILE));
    const y0 = Math.max(0, Math.floor(Tp / TILE)), y1 = Math.min(m.h - 1, Math.floor((Tp + cam.vh) / TILE));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = m.tiles[y * m.w + x];
      if (t !== T.WATER && t !== T.LAVA && t !== T.SHALLOW) continue;
      const h = tileHash(x, y, 9);
      const phase = (time * 0.8 + h * 6) % 3;
      if (phase < 1.2) {
        g.fillStyle = t === T.LAVA ? 'rgba(255,220,120,0.7)' : 'rgba(255,255,255,0.45)';
        g.fillRect(x * TILE - L + Math.floor(h * 10) + Math.floor(phase * 3), y * TILE - Tp + 4 + Math.floor(h * 8), 3, 1);
      }
    }
  }

  // Push tall decoration and building/landmark props within view into the y-sorted list.
  collectTall(cam, list, time, player = null) {
    const m = this.map;
    // Props that hide the player fade so they never lose sight of themselves.
    const fadeIf = (px, py, w, h, sortY) => player && sortY > player.y + 4 && player.x - cam.left > px - 2 && player.x - cam.left < px + w + 2 && player.y - cam.top - 10 > py && player.y - cam.top - 14 < py + h;
    const L = cam.left, Tp = cam.top;
    const x0 = Math.max(0, Math.floor(L / TILE) - 1), x1 = Math.min(m.w - 1, Math.floor((L + cam.vw) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(Tp / TILE) - 1), y1 = Math.min(m.h - 1, Math.floor((Tp + cam.vh) / TILE) + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * m.w + x, d = m.deco[i];
      if (!d || d === D.FLOWER || d === D.REED) continue;
      if (d === D.FIRE) {
        const px = x * TILE - L, py = y * TILE - Tp;
        list.push({ y: y * TILE + 14, draw: (g) => drawCampfire(g, px, py, time) });
        continue;
      }
      const spr = decoSprite(d, m.biome[i], x, y, m.ground ? m.ground[i] : m.tiles[i]);
      if (!spr) continue;
      const px = x * TILE + 8 - (spr.width >> 1) - L, py = (y + 1) * TILE - spr.height - Tp;
      const fade = fadeIf(px, py, spr.width, spr.height - 8, y * TILE + 14);
      list.push({ y: y * TILE + 14, draw: (g) => { if (fade) g.globalAlpha = 0.5; g.drawImage(spr, px, py); g.globalAlpha = 1; } });
      if (d === D.SHRINE) list.push({ y: y * TILE + 15, draw: (g) => drawEmberGlow(g, x * TILE + 8 - L, y * TILE - 8 - Tp, time) });
    }
    for (const p of this.props) {
      const px = p.x * TILE - L, py = p.y * TILE - Tp;
      if (px > cam.vw + 16 || py > cam.vh + 16 || px + p.w * TILE < -16 || py + p.h * TILE < -120) continue;
      const spr = p.kind === 'building' ? buildingSprite(p) : landmarkSprite(p);
      const top = (p.y + p.h) * TILE - spr.height - Tp;
      const fade = fadeIf(px, top, spr.width, spr.height, (p.y + p.h) * TILE - 1);
      list.push({ y: (p.y + p.h) * TILE - 1, draw: (g) => { if (fade) g.globalAlpha = 0.55; g.drawImage(spr, px, top); g.globalAlpha = 1; } });
    }
  }
}

export function drawCampfire(g, px, py, time) {
  R(g, px + 3, py + 11, 10, 3, '#5a3a20');
  R(g, px + 5, py + 10, 6, 2, '#7a5030');
  const f = Math.sin(time * 14) > 0 ? 1 : 0;
  g.fillStyle = '#ff7020'; g.beginPath(); g.moveTo(px + 4, py + 11); g.lineTo(px + 8, py + 1 + f); g.lineTo(px + 12, py + 11); g.closePath(); g.fill();
  g.fillStyle = '#ffd060'; g.beginPath(); g.moveTo(px + 6, py + 11); g.lineTo(px + 8, py + 5 - f); g.lineTo(px + 10, py + 11); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,160,60,0.12)'; g.beginPath(); g.arc(px + 8, py + 8, 18, 0, Math.PI * 2); g.fill();
}

export function drawEmberGlow(g, x, y, time, color = '255,170,70') {
  const r = 4 + Math.sin(time * 4) * 0.8;
  g.fillStyle = `rgba(${color},0.25)`; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = `rgba(${color},0.9)`; g.beginPath(); g.arc(x, y, r * 0.7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff4d0'; g.fillRect(x - 1, y - 1, 2, 2);
}

// ------------------------------------------------------------------ rooms (dungeon, cave, interior)
const WALLS = new Set([T.DWALL, T.CWALL, T.WALL]);

export function drawRoomTile(g, map, x, y, px, py, th) {
  const t = map.get(x, y);
  const below = map.get(x, y + 1), above = map.get(x, y - 1);
  const hsh = tileHash(x, y, 4);
  const floor = () => {
    R(g, px, py, 16, 16, th.floor[0]);
    if (th.kind === 'interior') {
      for (let k = 0; k < 4; k++) R(g, px, py + k * 4 + 3, 16, 1, th.floor[1]);
      R(g, px + ((y * 7) % 16), py, 1, 16, th.floor[1]);
    } else if (th.kind === 'cave') {
      for (let k = 0; k < 4; k++) R(g, px + Math.floor(tileHash(x, y, 30 + k) * 14), py + Math.floor(tileHash(x, y, 40 + k) * 14), 2, 1, th.floor[k % 2 ? 1 : 2]);
    } else {
      R(g, px, py, 16, 1, th.floor[1]); R(g, px, py, 1, 16, th.floor[1]);
      R(g, px + 1, py + 1, 15, 1, th.floor[2]);
      if (hsh < 0.25) R(g, px + 5, py + 6, 4, 3, th.floor[1]);
    }
  };
  switch (t) {
    case T.DWALL: case T.CWALL: case T.WALL: {
      if (below !== -1 && !WALLS.has(below)) {
        R(g, px, py, 16, 16, th.wall[0]);
        R(g, px, py, 16, 3, shade(th.wall[0], 0.25));
        if (th.kind === 'cave') {
          for (let k = 0; k < 3; k++) R(g, px + Math.floor(tileHash(x, y, 50 + k) * 13), py + 4 + k * 3, 3, 2, th.wall[1]);
        } else {
          R(g, px, py + 8, 16, 1, th.wall[1]);
          R(g, px + (x % 2 ? 4 : 11), py + 3, 1, 5, th.wall[1]);
          R(g, px + (x % 2 ? 11 : 4), py + 9, 1, 5, th.wall[1]);
        }
        R(g, px, py + 14, 16, 2, th.wall[2]);
      } else {
        R(g, px, py, 16, 16, th.wall[2]);
        if (hsh < 0.4) R(g, px + 3, py + 4, 4, 3, th.wall[1]);
        if (!WALLS.has(above) && above !== -1) R(g, px, py, 16, 2, th.wall[1]);
      }
      return;
    }
    case T.PIT:
      R(g, px, py, 16, 16, th.pit);
      if (!WALLS.has(above) && above !== T.PIT) { R(g, px, py, 16, 4, th.wall[1]); R(g, px, py + 4, 16, 1, th.wall[2]); }
      return;
    case T.DWATER:
      R(g, px, py, 16, 16, th.water || '#3a6a9a');
      R(g, px + Math.floor(hsh * 10), py + 5, 5, 1, 'rgba(255,255,255,0.35)');
      if (above !== T.DWATER) R(g, px, py, 16, 2, 'rgba(255,255,255,0.5)');
      return;
    case T.LAVA:
      R(g, px, py, 16, 16, '#a02810'); R(g, px + Math.floor(hsh * 10), py + 6, 5, 2, '#ff8030');
      return;
    default:
      floor();
  }
  if (t === T.GATE) {
    R(g, px + 1, py, 2, 16, '#4a4a52'); R(g, px + 7, py, 2, 16, '#4a4a52'); R(g, px + 13, py, 2, 16, '#4a4a52');
    R(g, px, py + 3, 16, 2, '#5a5a64'); R(g, px, py + 11, 16, 2, '#5a5a64');
    R(g, px + 1, py, 1, 16, '#8a8a96'); R(g, px + 7, py, 1, 16, '#8a8a96'); R(g, px + 13, py, 1, 16, '#8a8a96');
  } else if (t === T.HAZARD) {
    R(g, px + 2, py + 4, 12, 2, '#ff6a20'); R(g, px + 5, py + 6, 2, 6, '#ff6a20'); R(g, px + 9, py + 9, 5, 2, '#ffa040');
  } else if (t === T.THORNS) {
    R(g, px + 1, py + 3, 14, 11, '#2e4e22'); R(g, px + 3, py + 1, 10, 3, '#3a6a2a');
    for (let k = 0; k < 6; k++) R(g, px + 1 + k * 2 + (k % 2), py + 3 + (k % 3) * 4, 1, 2, '#d8e0a0');
  } else if (t === T.EXIT) {
    g.fillStyle = 'rgba(255,240,200,0.35)'; g.fillRect(px, py, 16, 16);
    R(g, px + 2, py + 6, 12, 1, 'rgba(255,255,255,0.6)'); R(g, px + 4, py + 10, 8, 1, 'rgba(255,255,255,0.6)');
  } else if (t === T.RUG) {
    R(g, px, py, 16, 16, '#8a2a2a'); R(g, px + 2, py + 2, 12, 12, '#a83a3a'); R(g, px + 6, py + 6, 4, 4, '#e0b050');
  }
  if (WALLS.has(above) && t !== T.PIT) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, py, 16, 4); }
}

export class RoomRenderer {
  constructor(map, theme) {
    this.map = map;
    this.theme = theme;
    this.canvas = null;
    this.version = -1;
  }
  draw(g, cam) {
    if (this.version !== this.map.version || !this.canvas) {
      this.canvas = this.canvas && this.canvas.width === this.map.w * TILE ? this.canvas : makeCanvas(this.map.w * TILE, this.map.h * TILE);
      const c = this.canvas.getContext('2d');
      for (let y = 0; y < this.map.h; y++) for (let x = 0; x < this.map.w; x++) drawRoomTile(c, this.map, x, y, x * TILE, y * TILE, this.theme);
      this.version = this.map.version;
      this.map.dirty.length = 0;
    }
    g.drawImage(this.canvas, -cam.left, -cam.top);
  }
}

// Darkness with light holes (caves). lights: [{x,y,r}] in world px.
let darkCanvas = null;
export function drawDarkness(g, cam, lights, alpha = 0.82) {
  if (!darkCanvas) darkCanvas = makeCanvas(VIEW_W, VIEW_H);
  const d = darkCanvas.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, VIEW_W, VIEW_H);
  d.fillStyle = `rgba(6,4,10,${alpha})`;
  d.fillRect(0, 0, VIEW_W, VIEW_H);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const x = l.x - cam.left, y = l.y - cam.top;
    if (x < -l.r || y < -l.r || x > VIEW_W + l.r || y > VIEW_H + l.r) continue;
    const grd = d.createRadialGradient(x, y, l.r * 0.2, x, y, l.r);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = grd;
    d.beginPath(); d.arc(x, y, l.r, 0, Math.PI * 2); d.fill();
  }
  g.drawImage(darkCanvas, 0, 0);
}

export function drawShadow(g, x, y, rx = 6, ry = 2.5, a = 0.3) {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}
