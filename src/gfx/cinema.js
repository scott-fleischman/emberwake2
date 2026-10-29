// Procedural cutscene art. Each ART function paints a full 480x270 panel onto the pixel canvas.
// Signature: (g, t, shot, ctx) where t is seconds since the shot began and ctx carries
// {look, world} for panels that show the hero or the real map of this seed.
import { R, humanSprite, LOOKS } from './sprites.js';
import { worldImage } from './hud.js';
import { portraitPose, drawLights } from './bossart.js';
import { paintThornmaw } from './art-thornmaw.js';
import { paintCinder, fxCinder } from './art-cinder.js';
import { paintRime, rimeUnder, rimeOver } from './art-rime.js';
import { paintTide, tideOver } from './art-tide.js';
import { paintVesper, vesperOver } from './art-vesper.js';

const W = 480, H = 270;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

function sky(g, stops) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  stops.forEach((c, k) => grd.addColorStop(k / (stops.length - 1), c));
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
}

function stars(g, t, n = 140, maxY = H, alpha = 1, seed = 1) {
  for (let i = 0; i < n; i++) {
    const x = hash(i, seed) * W, y = hash(i, seed + 1) * maxY;
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(i, seed + 2) * 3) + i);
    g.globalAlpha = alpha * (0.25 + tw * 0.75) * (1 - y / maxY * 0.6);
    R(g, x, y, hash(i, seed + 3) < 0.12 ? 2 : 1, 1, hash(i, seed + 4) < 0.2 ? '#ffe0b0' : '#e8ecff');
  }
  g.globalAlpha = 1;
}

function hills(g, base, amp, freq, color, phase = 0) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase * 2) * amp * 0.3);
  g.lineTo(W, H); g.closePath(); g.fill();
}

export function glow(g, x, y, r, rgb, a = 0.6) {
  if (r <= 0) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(${rgb},${a})`); grd.addColorStop(1, `rgba(${rgb},0)`);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

function vignette(g, a = 0.55, color = '0,0,0') {
  const grd = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  grd.addColorStop(0, `rgba(${color},0)`); grd.addColorStop(1, `rgba(${color},${a})`);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
}

// Rising embers, deterministic per index so they loop smoothly.
function embers(g, t, n, x0, x1, y0, rgb = '255,170,80', speed = 26) {
  for (let i = 0; i < n; i++) {
    const life = 4 + hash(i, 9) * 3;
    const p = ((t + hash(i, 7) * life) % life) / life;
    const x = x0 + hash(i, 8) * (x1 - x0) + Math.sin(t * 1.5 + i) * 6;
    const y = y0 - p * speed * life;
    g.globalAlpha = Math.sin(p * Math.PI) * 0.9;
    R(g, x, y, hash(i, 6) < 0.3 ? 2 : 1, hash(i, 6) < 0.3 ? 2 : 1, `rgb(${rgb})`);
  }
  g.globalAlpha = 1;
}

function flame(g, x, y, size, t, cols = ['#ff6a20', '#ffb040', '#fff0b0']) {
  cols.forEach((c, k) => {
    const s = size * (1 - k * 0.3);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x - s * 0.6, y);
    g.quadraticCurveTo(x - s * 0.7, y - s * 0.8, x + Math.sin(t * 9 + k) * s * 0.25, y - s * (1.6 + Math.sin(t * 13 + k * 2) * 0.2));
    g.quadraticCurveTo(x + s * 0.7, y - s * 0.8, x + s * 0.6, y);
    g.closePath(); g.fill();
  });
}

function spireShape(g, cx, baseY, h, col, edge) {
  const bw = 22, tw = 7;
  g.fillStyle = col;
  g.beginPath(); g.moveTo(cx - bw, baseY); g.lineTo(cx - tw, baseY - h); g.lineTo(cx, baseY - h - 14); g.lineTo(cx + tw, baseY - h); g.lineTo(cx + bw, baseY); g.closePath(); g.fill();
  g.fillStyle = edge;
  g.beginPath(); g.moveTo(cx - bw, baseY); g.lineTo(cx - tw, baseY - h); g.lineTo(cx - tw + 3, baseY - h); g.lineTo(cx - bw + 5, baseY); g.closePath(); g.fill();
  for (let y = baseY - 18; y > baseY - h + 6; y -= 16) { const f = (baseY - y) / h; R(g, cx - bw + (bw - tw) * f, y, (bw - (bw - tw) * f) * 2, 1, 'rgba(0,0,0,0.35)'); }
}

function house(g, x, y, w, h, t, lit = true, seed = 0) {
  R(g, x, y - h, w, h, '#1a1420');
  g.fillStyle = '#120c16';
  g.beginPath(); g.moveTo(x - 3, y - h); g.lineTo(x + w / 2, y - h - w * 0.55); g.lineTo(x + w + 3, y - h); g.closePath(); g.fill();
  R(g, x + w - 7, y - h - w * 0.45, 4, 8, '#120c16');
  if (lit) {
    const f = 0.75 + 0.25 * Math.sin(t * 6 + seed * 3) * Math.sin(t * 2.3 + seed);
    g.globalAlpha = f;
    R(g, x + 3, y - h + 4, 4, 4, '#ffc860'); if (w > 16) R(g, x + w - 8, y - h + 4, 4, 4, '#ffc860');
    g.globalAlpha = 1;
    glow(g, x + 5, y - h + 6, 10, '255,190,90', 0.25 * f);
  }
}

// Dark tendrils of the Gloam reaching inward from the edges.
export function tendrils(g, t, reach, alpha = 1) {
  const roots = [[0, 20], [60, 0], [150, 0], [260, 0], [370, 0], [480, 30], [480, 140], [0, 150], [430, 0]];
  roots.forEach(([rx, ry], k) => {
    const tx = W / 2 + Math.sin(k * 2.1) * 80, ty = H * 0.55 + Math.cos(k * 1.7) * 40;
    const len = reach * (0.55 + hash(k, 3) * 0.45);
    const ex = rx + (tx - rx) * len, ey = ry + (ty - ry) * len;
    const mx = (rx + ex) / 2 + Math.sin(t * 1.3 + k) * 22, my = (ry + ey) / 2 + Math.cos(t * 1.1 + k) * 18;
    g.lineCap = 'round';
    for (const [lw, col] of [[14, `rgba(120,60,170,${0.18 * alpha})`], [8, `rgba(14,4,22,${0.85 * alpha})`], [3, `rgba(40,12,60,${alpha})`]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(rx, ry); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    }
  });
}

export function eyes(g, cx, cy, open, scale = 1, a = 1) {
  if (open <= 0) return;
  for (const s of [-1, 1]) {
    const x = cx + s * 9 * scale, h = Math.max(1, 3 * scale * open);
    g.globalAlpha = a;
    g.fillStyle = '#e8ecff';
    g.beginPath(); g.ellipse(x, cy, 5 * scale, h / 2, s * 0.15, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    glow(g, x, cy, 16 * scale, '190,160,255', 0.55 * a * open);
  }
}

// ---------------------------------------------------------------- panels
function village(g, t, dim = 0) {
  sky(g, dim ? ['#05040c', '#0c0a1a', '#16102a'] : ['#070a1c', '#141a36', '#2a2244']);
  stars(g, t, 110, 170, 1 - dim * 0.6, 3);
  g.fillStyle = '#e8e4d0'; g.globalAlpha = 1 - dim * 0.7;
  g.beginPath(); g.arc(392, 48, 11, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  glow(g, 392, 48, 40, '200,210,255', 0.25 * (1 - dim));
  hills(g, 178, 10, 0.012, '#141428', 1);
  hills(g, 200, 7, 0.02, '#100e1e', 3);
  const houses = [[132, 214, 22, 16], [166, 206, 18, 14], [196, 220, 24, 18], [270, 220, 22, 17], [302, 206, 18, 13], [334, 214, 24, 16], [100, 222, 18, 13], [370, 224, 20, 15]];
  houses.forEach(([x, y, w, h], k) => house(g, x, y, w, h, t, true, k));
  const fire = (1 - dim * 0.75) * (dim ? 0.55 + 0.45 * Math.abs(Math.sin(t * 7) * Math.sin(t * 2.7)) : 1);
  glow(g, 240, 214, 120 * fire + 20, '255,160,70', 0.5);
  R(g, 232, 216, 16, 5, '#2a1a14'); R(g, 230, 214, 20, 3, '#4a3022');
  flame(g, 240, 215, 9 * fire + 2, t);
  embers(g, t, Math.round(14 * fire), 228, 252, 210, '255,180,90', 12);
  hills(g, 238, 4, 0.03, '#0a0810', 5);
  for (let i = 0; i < 12 * (1 - dim); i++) {
    const x = 60 + hash(i, 21) * 360 + Math.sin(t * 0.7 + i) * 14, y = 180 + hash(i, 22) * 50 + Math.cos(t * 0.9 + i * 2) * 8;
    g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i);
    R(g, x, y, 1, 1, '#e8ff90');
  }
  g.globalAlpha = 1;
}

function hall(g, t, fireScale, ctx, shot) {
  R(g, 0, 0, W, H, '#1c1416');
  for (let y = 0; y < 170; y += 12) for (let x = (y / 12) % 2 ? -12 : 0; x < W; x += 24) R(g, x + 1, y + 1, 22, 10, '#241a1a');
  R(g, 0, 170, W, 100, '#2a201c');
  for (let x = 0; x < W; x += 32) R(g, x, 170, 1, 100, '#221a16');
  for (const px of [70, 410]) { R(g, px - 12, 0, 24, 196, '#30262a'); R(g, px - 12, 0, 4, 196, '#3c3236'); R(g, px - 16, 190, 32, 8, '#251c1e'); }
  for (const bx of [130, 350]) { R(g, bx - 10, 20, 20, 50, '#7a2228'); R(g, bx - 10, 68, 10, 6, '#7a2228'); R(g, bx, 68, 10, 3, '#7a2228'); R(g, bx - 4, 34, 8, 8, '#e0b040'); }
  const fx = 240, fy = 186;
  glow(g, fx, fy - 10, 70 + 120 * fireScale, '255,160,70', 0.55);
  R(g, fx - 3, fy + 4, 6, 30, '#3a3030'); R(g, fx - 14, fy + 30, 28, 4, '#3a3030');
  R(g, fx - 18, fy - 2, 36, 8, '#4a3e3a'); R(g, fx - 16, fy + 6, 32, 2, '#2a2222');
  flame(g, fx, fy - 1, 4 + 14 * fireScale, t);
  embers(g, t, Math.round(4 + 20 * fireScale), fx - 12, fx + 12, fy - 4, '255,180,90', 10 + 20 * fireScale);
  const n = shot.shards || 0;
  for (let k = 0; k < n; k++) {
    const a = t * 1.2 + (k / n) * Math.PI * 2;
    const sx = fx + Math.cos(a) * 26, sy = fy - 30 + Math.sin(a) * 8;
    const col = ['120,240,120', '255,150,70', '170,230,255', '90,220,200'][k];
    glow(g, sx, sy, 14, col, 0.7);
    g.fillStyle = `rgb(${col})`;
    g.beginPath(); g.moveTo(sx, sy - 5); g.lineTo(sx + 3, sy); g.lineTo(sx, sy + 5); g.lineTo(sx - 3, sy); g.closePath(); g.fill();
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(humanSprite(LOOKS.elder, 'right', 0, 'npcelder0'), 150, 128, 48, 60);
  if (ctx.look) g.drawImage(humanSprite(ctx.look, 'left', 0, 'cine-hero'), 282, 128, 48, 60);
  vignette(g, 0.7);
}

function realmMap(g, t, ctx, heal = -1) {
  R(g, 0, 0, W, H, '#100a0c');
  const px = 96, py = 8, pw = 288, ph = 254;
  R(g, px, py, pw, ph, '#cdb98e');
  R(g, px + 3, py + 3, pw - 6, ph - 6, '#dccaa0');
  const Wd = ctx.world;
  const ix = px + 6, iy = py + 8, iw = pw - 12;
  if (Wd) {
    const s = iw / Wd.w, ih = Wd.h * s;
    g.imageSmoothingEnabled = false;
    g.drawImage(worldImage(Wd), ix, iy, iw, ih);
    g.fillStyle = 'rgba(140,100,50,0.28)'; g.fillRect(ix, iy, iw, ih);
    const at = (p) => [ix + (p.x + 0.5) * s, iy + (p.y + 0.5) * s];
    const D = Wd.pois.dungeons;
    // Gloam spreading from the Spire, unless the realm is healing.
    const [sx, sy] = at(Wd.pois.spire.front);
    const gloomA = heal < 0 ? 0.32 + 0.08 * Math.sin(t * 2) : 0.32 * (1 - clamp01(heal));
    if (gloomA > 0) {
      g.fillStyle = `rgba(30,10,50,${gloomA})`; g.fillRect(ix, iy, iw, ih);
      glow(g, sx, sy, 50, '120,60,190', 0.5 * (gloomA / 0.32));
    }
    if (heal >= 0) {
      const [hx, hy] = at(Wd.pois.home);
      glow(g, hx, hy, 40 + easeOut(heal) * 260, '255,190,100', 0.35 * (1 - clamp01(heal - 0.6)));
    }
    const wards = [['verdant', '120,240,120'], ['ashen', '255,140,60'], ['frost', '170,230,255'], ['drowned', '90,220,200']];
    wards.forEach(([id, col], k) => {
      const [x, y] = at(D[id].front);
      const calm = heal >= 0 && id !== 'drowned';
      const pulse = calm ? 0.8 : 0.5 + 0.5 * Math.sin(t * 3 - k * 1.3);
      glow(g, x, y, (calm ? 18 : 12) + pulse * 8, col, 0.8);
      R(g, x - 1, y - 1, 3, 3, `rgb(${col})`);
    });
    R(g, sx - 2, sy - 6, 4, 8, '#3a2a4a'); glow(g, sx, sy - 6, 10, '200,150,255', 0.6);
    const [hx, hy] = at(Wd.pois.home);
    glow(g, hx, hy, 12 + Math.sin(t * 5) * 2, '255,200,90', 0.9);
    R(g, hx - 1, hy - 1, 3, 3, '#fff0b0');
  }
  vignette(g, 0.6);
}

// Speed lines bursting out from a point, pulsing with a roar.
function burstLines(g, cx, cy, t, rgb, a) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.6 * Math.abs(Math.sin(t * 9));
  for (let k = 0; k < 40; k++) {
    const ang = (k / 40) * Math.PI * 2 + hash(k, 3) * 0.12 + t * 0.04, w = 0.012 + hash(k, 4) * 0.028, r0 = 40 + hash(k, 5) * 40;
    g.fillStyle = `rgba(${rgb},${a * pulse * (0.4 + hash(k, 6))})`;
    g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang - w) * 640, cy + Math.sin(ang - w) * 640); g.lineTo(cx + Math.cos(ang + w) * 640, cy + Math.sin(ang + w) * 640); g.closePath(); g.fill();
  }
  g.restore();
}

// The Spire's great door and its four sockets: `lit` of them catch one by one (the rest wait dark), and
// `open` (0..1) grinds the two leaves apart into the walls, on the dark and the one who waits in it.
const SOCKETS = [[240, 112, '120,240,120', -1], [200, 152, '255,140,60', -1], [280, 152, '170,230,255', 1], [240, 192, '90,220,200', 1]];
function spireDoor(g, t, lit, open) {
  R(g, 0, 0, W, H, '#0c0810');
  const arch = () => { g.beginPath(); g.moveTo(130, H); g.lineTo(130, 90); g.quadraticCurveTo(240, -10, 350, 90); g.lineTo(350, H); g.closePath(); };
  g.fillStyle = '#2a2232'; arch(); g.fill();
  g.save(); arch(); g.clip();
  const gap = open * 112, jolt = open > 0 && open < 1 ? Math.round(Math.sin(t * 40) * 0.8) : 0;
  if (open > 0) {
    R(g, 130, 0, 220, H, '#050208');
    glow(g, 240, 150, 40 + 120 * open, '150,100,220', 0.35 * open);
    eyes(g, 240, 128, clamp01((open - 0.6) / 0.4), 1.3, 0.8);
  }
  for (const side of [-1, 1]) {
    const x0 = (side < 0 ? 130 : 240) + side * gap + jolt;
    g.save(); g.beginPath(); g.rect(x0, 0, 110, H); g.clip();
    R(g, x0, 0, 110, H, '#2a2232');
    for (let y = 46; y < H; y += 18) for (let x = 136 + ((y / 18) % 2) * 14; x < 344; x += 28) R(g, x + side * gap + jolt, y, 26, 1, '#1e1826');
    g.restore();
    R(g, side < 0 ? x0 + 108 : x0, 40, 2, 230, '#1a1420'); // the seam where the leaves meet
  }
  SOCKETS.forEach(([x0, y, col, side], k) => {
    const x = x0 + side * gap + jolt, at = 0.4 + k * 0.6;
    R(g, x - 9, y - 9, 18, 18, '#16101c'); R(g, x - 7, y - 7, 14, 14, '#0a060c');
    if (k < lit && t > at) {
      // Ablaze with all four; their light goes with the leaves into the walls.
      const a = clamp01((t - at) * 2) * (1 - open), blaze = lit === 4 ? 1.3 + 0.2 * Math.sin(t * 6 + k) : 1;
      glow(g, x, y, 26 * a * blaze, col, 0.8); R(g, x - 4, y - 4, 8, 8, `rgb(${col})`);
    } else if (k >= lit) glow(g, x, y, 8 + Math.sin(t * 4) * 3, col, 0.15);
  });
  g.restore();
  for (let k = 0; k < 8; k++) {
    const x = ((k * 70 + t * 14) % 600) - 60;
    g.fillStyle = 'rgba(110,60,150,0.12)';
    g.beginPath(); g.ellipse(x, 252 + Math.sin(t + k) * 4, 70, 16, 0, 0, Math.PI * 2); g.fill();
  }
  if (open > 0 && open < 1) for (let i = 0; i < 16; i++) { // grit shaken loose from the lintel
    const p = (t * 0.9 + hash(i, 31)) % 1;
    g.globalAlpha = 1 - p; R(g, 140 + hash(i, 32) * 200, 20 + p * 230, 2, 2, '#4a4052');
  }
  g.globalAlpha = 1;
  vignette(g, 0.65);
}

// A warden painted big: (x,y) is where its feet would be, S the zoom, flip to face left.
function bigBoss(g, paint, pose, x, y, S, flip = false, fx = null) {
  const L = [];
  g.save(); g.translate(x, y); g.scale(flip ? -S : S, S);
  paint(g, pose, L);
  if (fx) { g.scale(flip ? -1 : 1, 1); fx(g); }
  g.restore();
  drawLights(g, L, 0, 0, 0.55);
}

// ---------------------------------------------------------------- the true ending
// A hex colour part-way to another, for scenes that heal.
function mix(a, b, k) {
  const c = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * clamp01(k))).join(',')})`;
}
const mixAll = (as, bs, k) => as.map((a, i) => mix(a, bs[i], k));

// The four spirits on their watch: where spirit k is, t seconds into the ring scene, coming in from
// its own edge of the sky onto an ellipse round the Spire (depth < 0: behind it).
const RING = { cx: 240, cy: 150, rx: 124, ry: 26 };
const SPIRITS = [['stag', -50, 70], ['phoenix', 530, 40], ['owl', 530, 250], ['whale', -50, 240]];
function ringPos(k, t) {
  const [, sx, sy] = SPIRITS[k], a = (k / 4) * Math.PI * 2 + t * 0.7, p = easeOut(t / 1.9);
  const ox = RING.cx + Math.cos(a) * RING.rx, oy = RING.cy + Math.sin(a) * RING.ry;
  return { x: sx + (ox - sx) * p, y: sy + (oy - sy) * p, depth: Math.sin(a) * p };
}
function ringSpirit(g, k, t) {
  const now = ringPos(k, t), was = ringPos(k, t - 0.05), s = 1.35 + 0.3 * now.depth;
  g.save(); g.translate(Math.round(now.x), Math.round(now.y)); g.scale(now.x < was.x ? -s : s, s);
  drawSpirit(g, SPIRITS[k][0], 0, 0, t + k * 1.7);
  g.restore();
}

// Each ward as it heals, painted into a 480-wide strip (0 → 1: blighted → whole). The panorama runs
// west to east, the way the healing travels.
function forestScape(g, heal, t) {
  sky(g, mixAll(['#0e0a18', '#22162c', '#3a2638'], ['#3a5a8a', '#8ab0c8', '#f0d8a0'], heal));
  glow(g, 380, 150, 90 * heal, '255,230,170', 0.4);
  hills(g, 170, 14, 0.011, mix('#1a1622', '#4a6a5a', heal), 1);
  for (let i = 0; i < 9; i++) { // the far wood
    const x = 10 + i * 56 + hash(i, 41) * 20, y = 186, r = 16 + hash(i, 42) * 8;
    g.fillStyle = mix('#18141e', '#3e6a40', heal); g.beginPath(); g.arc(x, y - r, r, 0, Math.PI * 2); g.fill();
  }
  hills(g, 200, 8, 0.02, mix('#14101a', '#2e5a26', heal), 3);
  for (let i = 0; i < 7; i++) { // the near trees
    const x = 20 + i * 70 + hash(i, 43) * 26, y = 222 + hash(i, 44) * 14, h = 54 + hash(i, 45) * 26;
    R(g, x - 3, y - h, 6, h, mix('#1a1210', '#4a3424', heal));
    for (const [dx, dy, r] of [[-10, -h, 14], [10, -h - 4, 15], [0, -h - 16, 16]]) {
      g.fillStyle = mix('#1c1a22', '#3a7a34', heal); g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = mix('#24202a', '#5aa048', heal); g.beginPath(); g.arc(x + dx - 3, y + dy - 4, r * 0.55, 0, Math.PI * 2); g.fill();
    }
  }
  // The thorns draw back into the earth.
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = hash(i, 46) * W, len = (60 + hash(i, 47) * 90) * (1 - heal), sw = Math.sin(t * 0.8 + i) * 6;
    if (len < 2) continue;
    g.strokeStyle = '#140a18'; g.lineWidth = 3 + hash(i, 48) * 3;
    g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + 30 * (hash(i, 49) - 0.5) + sw, H - len * 0.6, x + 50 * (hash(i, 50) - 0.5), H - len); g.stroke();
  }
  for (let i = 0; i < 40; i++) { // flowers open
    const a = clamp01(heal * 2.2 - hash(i, 51)); if (a <= 0) continue;
    g.globalAlpha = a; R(g, hash(i, 52) * W, 214 + hash(i, 53) * 52, 2, 2, ['#ffe070', '#ff90b0', '#ffffff', '#b0a0ff'][i % 4]);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 5 && heal > 0.6; i++) { // birds come back
    const x = ((t * 22 + i * 90) % (W + 40)) - 20, y = 60 + i * 9 + Math.sin(t * 2 + i) * 4;
    g.globalAlpha = clamp01((heal - 0.6) * 3); R(g, x - 3, y, 3, 1, '#2a2a30'); R(g, x + 1, y, 3, 1, '#2a2a30'); R(g, x, y + 1, 1, 1, '#2a2a30');
  }
  g.globalAlpha = 1;
  g.fillStyle = `rgba(40,10,60,${0.35 * (1 - heal)})`; g.fillRect(0, 0, W, H);
}

function ashScape(g, heal, t) {
  sky(g, mixAll(['#2a1a16', '#5a3a2a', '#8a5a3a'], ['#3a6aa0', '#90c0e0', '#f0e0b0'], heal));
  // The ridge and its fire mountain, calming.
  g.fillStyle = mix('#2a1a1a', '#7a5a4a', heal);
  g.beginPath(); g.moveTo(0, 190); g.lineTo(120, 150); g.lineTo(200, 96); g.lineTo(232, 96); g.lineTo(320, 150); g.lineTo(W, 170); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  glow(g, 216, 96, 40 * (1 - heal) + 6, '255,90,30', 0.7);
  for (let k = 0; k < 6; k++) { // its smoke thins to a wisp
    const p = (t * 0.25 + k / 6) % 1, x = 216 + Math.sin(p * 4 + k) * 10 + p * 60, y = 90 - p * 90;
    g.fillStyle = `rgba(${heal > 0.5 ? '230,230,235' : '40,30,30'},${(1 - p) * (0.5 - 0.38 * heal)})`;
    g.beginPath(); g.arc(x, y, 8 + p * 22, 0, Math.PI * 2); g.fill();
  }
  hills(g, 206, 10, 0.014, mix('#3a2e2a', '#b08048', heal), 2);
  hills(g, 232, 6, 0.022, mix('#2a221e', '#d0a060', heal), 5);
  if (heal > 0.2) { // an oasis catches the light again, and green comes up round it
    const a = clamp01((heal - 0.2) * 1.6);
    g.globalAlpha = a; g.fillStyle = '#3a8ac0'; g.beginPath(); g.ellipse(350, 218, 46, 7, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) R(g, 320 + i * 14 + Math.sin(t * 2 + i) * 3, 216 + (i % 2) * 3, 4, 1, '#d0f0ff');
    for (let i = 0; i < 14; i++) { const x = 296 + hash(i, 61) * 110, y = 210 + hash(i, 62) * 3; R(g, x, y - 4, 1, 4, '#4a8a3a'); R(g, x - 1, y - 3, 3, 1, '#5aa048'); }
    g.globalAlpha = 1;
  }
  for (let i = 0; i < 90; i++) { // the ash stops falling
    if (hash(i, 63) > 1 - heal) continue;
    const x = (hash(i, 64) * W + Math.sin(t + i) * 10 + t * 8) % W, y = (hash(i, 65) * H + t * (14 + hash(i, 66) * 14)) % H;
    R(g, x, y, 2, 1, i % 3 ? '#5a5050' : '#2a2424');
  }
  g.fillStyle = `rgba(90,60,40,${0.3 * (1 - heal)})`; g.fillRect(0, 0, W, H);
}

function frostScape(g, heal, t) {
  sky(g, mixAll(['#8aa0b8', '#c0d0e0', '#e8f0f8'], ['#3a70b0', '#8ac0e8', '#e0f0f0'], heal));
  glow(g, 90, 60, 70 * heal, '255,250,220', 0.6);
  const peaks = [[60, 92, 120], [190, 58, 130], [320, 80, 120], [440, 104, 100]];
  for (const [x, top, half] of peaks) {
    const base = 210;
    g.fillStyle = '#5a6a80'; g.beginPath(); g.moveTo(x - half, base); g.lineTo(x, top); g.lineTo(x + half, base); g.closePath(); g.fill();
    g.fillStyle = '#4a586c'; g.beginPath(); g.moveTo(x, top); g.lineTo(x + half, base); g.lineTo(x + half * 0.35, base); g.closePath(); g.fill();
    // The snow line climbs back up to the caps.
    const line = top + (base - top) * (1 - 0.68 * heal), w = half * (line - top) / (base - top);
    g.fillStyle = '#f4f8ff'; g.beginPath(); g.moveTo(x - w, line); g.lineTo(x, top); g.lineTo(x + w, line);
    for (let k = 4; k >= 0; k--) g.lineTo(x - w + (k / 4) * w * 2, line + (k % 2 ? 4 : 0)); g.closePath(); g.fill();
    if (heal > 0.3) { // meltwater runs down from it
      g.strokeStyle = `rgba(150,210,255,${clamp01((heal - 0.3) * 2)})`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + 4, line + 2);
      for (let y = line + 2; y < 236; y += 6) g.lineTo(x + 4 + Math.sin(y * 0.15 + x) * 7, y);
      g.stroke();
      const sp = (t * 40 + x) % (236 - line); R(g, x + 4 + Math.sin((line + sp) * 0.15 + x) * 7, line + sp, 2, 2, '#ffffff');
    }
  }
  hills(g, 214, 6, 0.02, mix('#e0e8f0', '#5a9a4a', heal), 4);
  hills(g, 236, 5, 0.03, mix('#d0dce8', '#4a8a3a', heal), 6);
  for (let i = 0; i < 30 && heal > 0.5; i++) { const a = clamp01(heal * 2 - 1 - hash(i, 71) * 0.5); g.globalAlpha = a; R(g, hash(i, 72) * W, 224 + hash(i, 73) * 40, 2, 2, i % 2 ? '#ffffff' : '#ffe080'); }
  g.globalAlpha = 1;
  for (let i = 0; i < 80; i++) { // the blizzard dies away
    if (hash(i, 74) > 1 - heal) continue;
    const sp = 260 + hash(i, 75) * 200, y = hash(i, 76) * H, x = ((hash(i, 77) * 640 + t * sp) % 640) - 80, len = 6 + hash(i, 78) * 14;
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x - len, y - len * 0.3); g.stroke();
  }
  g.fillStyle = `rgba(230,240,255,${0.3 * (1 - heal)})`; g.fillRect(0, 0, W, H);
}

function tideScape(g, heal, t) {
  sky(g, mixAll(['#1a2228', '#2a3a40', '#4a5a5a'], ['#4a3a6a', '#d07a6a', '#f8c080'], heal));
  glow(g, 300, 150, 110 * heal, '255,200,130', 0.55);
  if (heal > 0) { g.fillStyle = `rgba(255,230,180,${heal})`; g.beginPath(); g.arc(300, 150, 14, 0, Math.PI * 2); g.fill(); }
  // The Fane on its rise, and the beach the flood hid.
  R(g, 0, 160, W, 110, '#c8b080');
  for (const [x, h] of [[50, 70], [78, 56], [106, 74], [134, 48]]) { R(g, x, 196 - h, 12, h, '#8a8a94'); R(g, x - 2, 196 - h, 16, 4, '#a0a0aa'); }
  for (let k = 0; k < 4; k++) R(g, 34 + k * 6, 196 + k * 6, 128 - k * 12, 6, k % 2 ? '#9a9aa4' : '#8a8a94');
  // The sea draws back from its flood, then breathes in and out on the sand, slow as a lullaby.
  const level = 120 + 74 * easeOut(heal) + Math.sin(t * 1.1) * (2 + 5 * heal);
  const grd = g.createLinearGradient(0, level, 0, H);
  grd.addColorStop(0, mix('#1a3038', '#3a7a9a', heal)); grd.addColorStop(1, mix('#0e1a20', '#2a5a7a', heal));
  g.fillStyle = grd; g.beginPath(); g.moveTo(W, level - 40);
  for (let x = W; x >= 0; x -= 8) g.lineTo(x, level + Math.sin(x * 0.03 + t * (3 - 2 * heal)) * (6 - 4 * heal) + (W - x) * 0.04);
  g.lineTo(0, H); g.lineTo(W, H); g.closePath();
  g.save(); g.clip(); g.fillRect(0, 0, W, H);
  if (heal > 0) for (let k = 0; k < 10; k++) R(g, 290 + Math.sin(t * 2 + k) * 10 - k * 2, level + 6 + k * 7, 20 - k, 1, `rgba(255,220,160,${0.6 * heal})`);
  g.restore();
  g.strokeStyle = `rgba(240,250,255,${0.5 + 0.3 * heal})`; g.lineWidth = 1.5; g.beginPath(); // the foam line
  for (let x = 0; x <= W; x += 8) { const y = level + Math.sin(x * 0.03 + t * (3 - 2 * heal)) * (6 - 4 * heal) + (W - x) * 0.04; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  for (let i = 0; i < 60; i++) { // the storm's rain
    if (hash(i, 81) > 1 - heal) continue;
    const x = (hash(i, 82) * W + t * 40) % W, y = (hash(i, 83) * H + t * 300) % H;
    R(g, x, y, 1, 5, 'rgba(180,200,210,0.5)');
  }
  g.fillStyle = `rgba(20,30,36,${0.3 * (1 - heal)})`; g.fillRect(0, 0, W, H);
}

const SCAPES = [forestScape, ashScape, frostScape, tideScape];

// A dark crag in the foreground, standing over the seam where one ward gives way to the next.
function crag(g, x, seed) {
  g.fillStyle = '#0a080c';
  g.beginPath(); g.moveTo(x - 34, H);
  for (let k = 0; k <= 6; k++) { const q = k / 6; g.lineTo(x - 34 + q * 22 + hash(k, seed) * 8, H - q * (200 + hash(seed, 5) * 40)); }
  for (let k = 6; k >= 0; k--) { const q = k / 6; g.lineTo(x + 34 - q * 22 - hash(k, seed + 9) * 8, H - q * (190 + hash(seed, 6) * 40)); }
  g.closePath(); g.fill();
}

export const ART = {
  stars(g, t) {
    sky(g, ['#04040e', '#0e0c22', '#221630', '#3a1e2a']);
    stars(g, t, 170, 230, 1, 1);
    const p = clamp01(t / 2.4) ** 1.6;
    const x0 = 440, y0 = -10, x1 = 168, y1 = 212;
    if (t < 2.4) {
      const hx = x0 + (x1 - x0) * p, hy = y0 + (y1 - y0) * p;
      const dx = (x0 - x1) / 300, dy = (y0 - y1) / 300;
      for (let k = 0; k < 60; k++) {
        g.globalAlpha = (1 - k / 60) * 0.8;
        R(g, hx + dx * k * 2.2, hy + dy * k * 2.2, 2, 2, k < 10 ? '#fff4d0' : '#ffa050');
      }
      g.globalAlpha = 1;
      glow(g, hx, hy, 14 + p * 10, '255,220,160', 0.9);
    } else {
      const k = t - 2.4;
      glow(g, x1, y1, 60 + Math.sin(t * 2) * 4, '255,150,60', 0.55);
      embers(g, t, 26, x1 - 20, x1 + 20, y1, '255,190,100', 14);
      if (k < 0.7) { g.fillStyle = `rgba(255,240,210,${(1 - k / 0.7) * 0.85})`; g.fillRect(0, 0, W, H); }
    }
    hills(g, 210, 12, 0.011, '#120e1a', 2);
    hills(g, 232, 8, 0.02, '#0a0810', 4);
    vignette(g, 0.5);
  },

  spire(g, t) {
    sky(g, ['#120c26', '#2e1638', '#7a2e36', '#b0582e']);
    stars(g, t, 60, 90, 0.7, 5);
    hills(g, 176, 18, 0.008, '#3a1a2a', 1);
    hills(g, 198, 10, 0.015, '#24121c', 2);
    const rise = easeOut(t / 2.4);
    const h = 30 + 140 * rise;
    glow(g, 240, 218 - h, 30 + Math.sin(t * 3) * 4, '255,200,110', 0.6 * rise + 0.2);
    spireShape(g, 240, 218, h, '#1e1420', '#3a2a36');
    R(g, 236, 214 - h, 8, 6, '#ffe0a0');
    R(g, 0, 214, W, 56, '#160e14');
    for (let k = 0; k < 8; k++) {
      const x = 150 + k * 26 + (k > 3 ? 24 : 0);
      R(g, x, 220, 6, 7, '#0c080c'); R(g, x + 1, 217, 4, 4, '#0c080c');
      const c = 0.6 + 0.4 * Math.sin(t * 5 + k);
      R(g, x + 7, 219, 1, 3, '#e0d0b0'); glow(g, x + 7, 218, 6, '255,200,110', 0.5 * c);
    }
    vignette(g, 0.5);
  },

  sparks(g, t) {
    sky(g, ['#06060f', '#121028', '#1c1632']);
    stars(g, t, 120, 270, 0.8, 7);
    hills(g, 236, 6, 0.02, '#0e0c18', 1);
    spireShape(g, 240, 150, 80, '#1a1422', '#2e2438');
    glow(g, 240, 62, 26, '255,200,110', 0.6);
    const sparks = [
      { to: [92, 186], col: '120,240,120', icon: 'tree', at: 0.3 },
      { to: [396, 196], col: '255,140,60', icon: 'volcano', at: 0.75 },
      { to: [384, 92], col: '170,230,255', icon: 'peak', at: 1.2 },
      { to: [86, 94], col: '90,220,200', icon: 'wave', at: 1.65 },
      { to: [240, 238], col: '255,205,110', icon: 'house', at: 2.3 },
    ];
    for (const s of sparks) {
      const p = clamp01((t - s.at) / 1.2);
      if (p <= 0) continue;
      const [tx, ty] = s.to;
      const cx = (240 + tx) / 2, cy = Math.min(62, ty) - 70;
      const pos = (q) => [(1 - q) ** 2 * 240 + 2 * (1 - q) * q * cx + q * q * tx, (1 - q) ** 2 * 62 + 2 * (1 - q) * q * cy + q * q * ty];
      for (let k = 0; k < 14; k++) {
        const q = p - k * 0.02;
        if (q < 0) break;
        const [x, y] = pos(q);
        g.globalAlpha = (1 - k / 14) * (p < 1 ? 1 : Math.max(0, 1 - (t - s.at - 1.2) * 2));
        R(g, x, y, 2, 2, `rgb(${s.col})`);
      }
      g.globalAlpha = 1;
      const [x, y] = pos(p);
      glow(g, x, y, p < 1 ? 12 : 22 + Math.sin(t * 3) * 3, s.col, 0.8);
      if (p >= 1) {
        const a = clamp01((t - s.at - 1.2) * 2);
        g.globalAlpha = a;
        const c = `rgb(${s.col})`;
        if (s.icon === 'tree') { for (let k = 0; k < 3; k++) { g.fillStyle = c; g.beginPath(); g.moveTo(tx, ty - 22 + k * 6); g.lineTo(tx - 8 - k * 2, ty - 10 + k * 6); g.lineTo(tx + 8 + k * 2, ty - 10 + k * 6); g.closePath(); g.fill(); } R(g, tx - 1, ty + 2, 3, 5, c); }
        if (s.icon === 'volcano') { g.fillStyle = c; g.beginPath(); g.moveTo(tx - 16, ty + 6); g.lineTo(tx - 5, ty - 12); g.lineTo(tx + 5, ty - 12); g.lineTo(tx + 16, ty + 6); g.closePath(); g.fill(); R(g, tx - 4, ty - 14, 8, 3, '#ff5020'); }
        if (s.icon === 'peak') { g.fillStyle = c; g.beginPath(); g.moveTo(tx - 16, ty + 8); g.lineTo(tx, ty - 14); g.lineTo(tx + 16, ty + 8); g.closePath(); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(tx - 5, ty - 6); g.lineTo(tx, ty - 14); g.lineTo(tx + 5, ty - 6); g.closePath(); g.fill(); }
        if (s.icon === 'wave') { for (let k = 0; k < 3; k++) for (let x = -14; x < 14; x++) R(g, tx + x, ty - 6 + k * 6 + Math.sin(x * 0.5 + t * 3 + k) * 2, 1, 1, c); }
        if (s.icon === 'house') { R(g, tx - 6, ty - 6, 12, 8, c); g.fillStyle = c; g.beginPath(); g.moveTo(tx - 8, ty - 6); g.lineTo(tx, ty - 13); g.lineTo(tx + 8, ty - 6); g.closePath(); g.fill(); }
        g.globalAlpha = 1;
      }
    }
    vignette(g, 0.45);
  },

  village(g, t) { village(g, t, 0); vignette(g, 0.4); },

  unkindled(g, t) {
    const grd = g.createRadialGradient(240, 150, 10, 240, 150, 300);
    grd.addColorStop(0, '#22102e'); grd.addColorStop(1, '#040208');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    spireShape(g, 240, 96, 90, '#120a18', '#1a1022');
    // the binding circle
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + t * 0.25;
      R(g, 240 + Math.cos(a) * 70, 200 + Math.sin(a) * 14, 2, 2, k % 3 ? '#4a3266' : '#9a70d0');
    }
    // chains
    for (const [ex, ey] of [[0, 40], [480, 40], [0, 260], [480, 260]]) {
      for (let k = 0; k < 22; k++) {
        const q = k / 22, x = 240 + (ex - 240) * q, y = 142 + (ey - 142) * q + Math.sin(q * Math.PI) * (12 + Math.sin(t * 2) * 3);
        R(g, x - 1, y - 1, k % 2 ? 4 : 2, k % 2 ? 2 : 4, '#4e405e');
      }
    }
    // the figure
    g.fillStyle = '#060308';
    g.beginPath(); g.moveTo(206, 206); g.quadraticCurveTo(214, 140, 228, 110); g.quadraticCurveTo(240, 90, 252, 110); g.quadraticCurveTo(266, 140, 274, 206); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160,110,230,0.45)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.ellipse(240, 116, 13, 15, 0, 0, Math.PI * 2); g.fill();
    const open = clamp01((t - 0.9) / 0.35) * (Math.sin(t * 0.8) > 0.97 ? 0.2 : 1);
    eyes(g, 240, 118, open, 0.55);
    embers(g, t, 40, 120, 360, 270, '120,80,170', 10);
    vignette(g, 0.6);
  },

  gloam(g, t) {
    const dim = clamp01(t / 3);
    village(g, t, dim);
    tendrils(g, t, easeOut(t / 4));
    g.fillStyle = `rgba(30,8,44,${0.35 * dim})`; g.fillRect(0, 0, W, H);
    eyes(g, 240, 52, clamp01((t - 2.6) / 0.6), 1.2, 0.6);
    vignette(g, 0.7, '10,0,20');
  },

  bedroom(g, t, shot, ctx) {
    R(g, 0, 0, W, 180, '#1a1418');
    for (let y = 0; y < 180; y += 16) R(g, 0, y, W, 1, '#140f12');
    R(g, 0, 180, W, 90, '#261a14');
    for (let y = 186; y < H; y += 9) R(g, 0, y, W, 1, '#1e140f');
    // window and moonbeam
    R(g, 318, 50, 46, 40, '#3a2a22'); R(g, 322, 54, 38, 32, '#24304e'); R(g, 340, 54, 2, 32, '#3a2a22'); R(g, 322, 69, 38, 2, '#3a2a22');
    g.fillStyle = 'rgba(160,180,255,0.08)';
    g.beginPath(); g.moveTo(322, 86); g.lineTo(360, 86); g.lineTo(300, 240); g.lineTo(240, 240); g.closePath(); g.fill();
    // hearth
    const pulse = shot.glow ? 1 : 0.35 + 0.15 * Math.sin(t * 2);
    R(g, 90, 112, 64, 70, '#3a3434'); R(g, 98, 140, 48, 40, '#140c0a');
    glow(g, 122, 168, 40 + 60 * pulse, '255,150,60', 0.45 + 0.2 * pulse);
    flame(g, 122, 178, 4 + 8 * pulse, t);
    // motes drifting from the hearth to the sleeper
    for (let i = 0; i < 10; i++) {
      const p = ((t * 0.25 + i / 10) % 1);
      const x = 122 + (238 - 122) * p, y = 166 - Math.sin(p * Math.PI) * 40 + Math.sin(t * 3 + i) * 3;
      g.globalAlpha = Math.sin(p * Math.PI) * (0.4 + pulse * 0.6);
      R(g, x, y, 1, 1, '#ffd890');
    }
    g.globalAlpha = 1;
    // bed with the sleeping hero
    const look = ctx.look || LOOKS.swordsman;
    R(g, 196, 176, 100, 44, '#4a2e1c'); R(g, 196, 172, 8, 52, '#5a3a22'); R(g, 288, 184, 8, 40, '#5a3a22');
    R(g, 202, 178, 24, 16, '#a89e8c'); R(g, 202, 178, 24, 2, '#c0b6a2');
    R(g, 222, 182, 66, 30, look.tunic); R(g, 222, 182, 66, 3, '#ffffff22');
    const breathe = Math.sin(t * 1.8) * 1;
    R(g, 236, 179 - breathe, 40, 6, look.tunic);
    R(g, 208, 181, 13, 11, look.skin); R(g, 206, 179, 15, 4, look.hair); R(g, 206, 183, 3, 7, look.hair);
    R(g, 213, 187, 3, 1, '#7a5040'); R(g, 217, 187, 2, 1, '#7a5040');
    if (shot.glow) { R(g, 213, 186, 2, 2, '#20160e'); glow(g, 214, 172, 34 + Math.sin(t * 6) * 4, '255,200,120', 0.3); }
    vignette(g, 0.75);
  },

  titlecard(g, t) {
    R(g, 0, 0, W, H, '#060408');
    glow(g, 240, 300, 220 + Math.sin(t * 2) * 10, '255,140,60', 0.45);
    glow(g, 240, 130, 90, '255,190,110', 0.18 * clamp01(t));
    embers(g, t, 70, 100, 380, 280, '255,170,80', 30);
    if (t < 0.6) { g.fillStyle = `rgba(255,220,170,${(1 - t / 0.6) * 0.8})`; g.fillRect(0, 0, W, H); }
    vignette(g, 0.6);
  },

  hearth(g, t, shot, ctx) {
    // Guttering; steadier with shards to feed it; roaring once every spark is home (`bright`).
    const sput = shot.bright ? 1.5 + 0.06 * Math.sin(t * 3) : shot.shards ? 0.35 + 0.05 * Math.sin(t * 3) : 0.12 + 0.08 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7));
    hall(g, t, sput, ctx, shot);
  },

  rekindle(g, t, shot, ctx) {
    const grow = easeOut((t - 0.4) / 1.2);
    hall(g, t, 0.35 + grow * 1.2, ctx, { shards: t < 0.6 ? shot.shards ?? 3 : 0 }); // shards: 0 when the fire comes home without them
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + t * 0.3;
      g.fillStyle = `rgba(255,200,120,${0.08 * grow})`;
      g.beginPath(); g.moveTo(240, 170); g.lineTo(240 + Math.cos(a - 0.08) * 400, 170 + Math.sin(a - 0.08) * 400); g.lineTo(240 + Math.cos(a + 0.08) * 400, 170 + Math.sin(a + 0.08) * 400); g.closePath(); g.fill();
    }
    g.restore();
    const f = clamp01(1 - Math.abs(t - 0.6) / 0.35);
    if (f > 0) { g.fillStyle = `rgba(255,240,210,${f * 0.85})`; g.fillRect(0, 0, W, H); }
  },

  realm(g, t, shot, ctx) { realmMap(g, t, ctx, -1); },
  healing(g, t, shot, ctx) { realmMap(g, t, ctx, t / 2.6); },

  sockets3(g, t) { spireDoor(g, t, 3, 0); },
  sockets4(g, t) { spireDoor(g, t, 4, 0); },
  spireopen(g, t) { const k = clamp01((t - 0.6) / 2.6); spireDoor(g, t + 3, 4, k * k * (3 - 2 * k)); }, // sockets already ablaze

  eyes(g, t) {
    const grd = g.createRadialGradient(240, 130, 10, 240, 130, 300);
    grd.addColorStop(0, '#1a0c24'); grd.addColorStop(1, '#020104');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    tendrils(g, t, 0.5, 0.7);
    const blink = (t % 4.5) > 4.3 ? 0.15 : 1;
    eyes(g, 240, 118, clamp01(t / 0.5) * blink, 3.2);
    embers(g, t, 50, 60, 420, 280, '140,90,200', 12);
    vignette(g, 0.6);
  },

  // ---------------------------------------------------------------- the true ending
  // The Spire at daybreak. With `ghost`, the Kindler's ghost lets go above it and the stolen fire pours
  // up out of it; then the four warden spirits fly in and take up their watch, circling it.
  spiritsring(g, t, shot) {
    const day = shot.ghost ? easeOut((t - 0.6) / 3) : 1;
    sky(g, mixAll(['#0c0818', '#1e1030', '#3a1e3a', '#4a2436'], ['#2a2a5a', '#6a3a6a', '#d0705a', '#f0b060'], day));
    stars(g, t, 90, 160, 1 - day, 13);
    glow(g, 372, 206, 140 * day, '255,190,110', 0.45);
    hills(g, 196, 14, 0.009, mix('#24141e', '#4a2a3a', day), 1);
    hills(g, 214, 8, 0.016, mix('#160c14', '#2a1622', day), 2);
    const sx = 240, base = 222, top = base - 134;
    // The ring's back half, the spirits behind the Spire, the Spire, then whatever passes in front.
    const ring = shot.ghost ? 0 : clamp01((t - 1.2) / 1.5);
    const arc = (a0, a1) => { g.strokeStyle = `rgba(255,214,150,${0.35 * ring})`; g.lineWidth = 2; g.beginPath(); g.ellipse(RING.cx, RING.cy, RING.rx, RING.ry, 0, a0, a1); g.stroke(); };
    if (!shot.ghost) { arc(Math.PI, Math.PI * 2); for (let k = 0; k < 4; k++) if (ringPos(k, t).depth < 0) ringSpirit(g, k, t); }
    spireShape(g, sx, base, 120, '#1e1420', '#3a2a36');
    if (shot.ghost) {
      // Gold leaks from every seam, the Gloam round it thins, and the fire fountains up and out.
      const pour = clamp01((t - 0.3) / 1.2);
      for (let y = base - 18; y > top + 20; y -= 16) R(g, sx - 18 + (base - y) * 0.11, y, 36 - (base - y) * 0.22, 1, `rgba(255,200,110,${0.7 * pour})`);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `rgba(40,14,60,${0.5 * (1 - day)})`;
        g.beginPath(); g.ellipse(sx + Math.sin(k * 2.3 + t * 0.4) * 50, top + 30 + Math.cos(k * 1.7) * 30, 46 - day * 30, 16, 0, 0, Math.PI * 2); g.fill();
      }
      glow(g, sx, top, 30 + 60 * pour, '255,210,130', 0.7 * pour);
      for (let i = 0; i < 70; i++) {
        const life = 1.6 + hash(i, 21) * 1.2, p = ((t + hash(i, 22) * life) % life) / life, born = t - p * life;
        if (born < 0.3) continue;
        const ang = -Math.PI / 2 + (hash(i, 23) - 0.5) * 2.6, v = 120 + hash(i, 24) * 120;
        const x = sx + Math.cos(ang) * v * p * 1.6, y = top + Math.sin(ang) * v * p + 160 * p * p;
        g.globalAlpha = (1 - p) * pour; R(g, x, y, hash(i, 25) < 0.3 ? 2 : 1, 2, hash(i, 26) < 0.5 ? '#ffe0a0' : '#ffb050');
      }
      g.globalAlpha = 1;
      // His ghost, opening his hands, fades up into the light.
      const a = clamp01(t / 0.5) * clamp01(1 - (t - 1.2) / 1.8);
      if (a > 0) { g.save(); g.translate(sx, top - 26 - t * 5); g.scale(1.6, 1.6); drawSpirit(g, 'vesperghost', 0, 0, t, a); g.restore(); }
    } else {
      glow(g, sx, top + 4, 28 + Math.sin(t * 3) * 3, '255,200,110', 0.7);
      flame(g, sx, top + 8, 5, t);
      arc(0, Math.PI);
      for (let k = 0; k < 4; k++) if (ringPos(k, t).depth >= 0) ringSpirit(g, k, t);
      embers(g, t, 30, 120, 360, 230, '255,200,120', 14);
    }
    vignette(g, 0.5);
  },

  // The night of two fires, as the elder remembers it: a spark falls out of the stars into the Hearth
  // and it flares. With `babe`, the morning after: a child asleep in the ashes, the spark warm inside.
  spark(g, t, shot, ctx) {
    if (!shot.babe) {
      village(g, t, 0);
      const fall = 2.2, p = clamp01(t / fall) ** 1.6;
      if (t < fall) {
        const x0 = 420, y0 = -10, x1 = 240, y1 = 210, hx = x0 + (x1 - x0) * p, hy = y0 + (y1 - y0) * p;
        for (let k = 0; k < 40; k++) { g.globalAlpha = (1 - k / 40) * 0.8; R(g, hx + (x0 - x1) / 120 * k, hy + (y0 - y1) / 120 * k, 2, 2, k < 8 ? '#fff4d0' : '#ffb060'); }
        g.globalAlpha = 1;
        glow(g, hx, hy, 12 + p * 8, '255,230,170', 0.9);
      } else {
        const k = t - fall;
        glow(g, 240, 204, 150 + Math.sin(t * 4) * 8, '255,200,120', 0.55);
        flame(g, 240, 215, 16 + Math.sin(t * 5) * 1.5, t);
        embers(g, t, 30, 220, 260, 212, '255,210,140', 24);
        if (k < 0.6) { g.fillStyle = `rgba(255,240,210,${(1 - k / 0.6) * 0.85})`; g.fillRect(0, 0, W, H); }
      }
      vignette(g, 0.5);
      return;
    }
    const look = ctx.look || LOOKS.swordsman, beat = Math.max(0, Math.sin(t * 2.6)) ** 6;
    R(g, 0, 0, W, H, '#0c0706');
    glow(g, 240, 230, 280, '255,140,60', 0.4);
    for (let k = 0; k < 14; k++) { const a = Math.PI * (0.06 + k / 15 * 0.88); R(g, 240 - Math.cos(a) * 230 - 14, 268 - Math.sin(a) * 60, 28, 14, k % 2 ? '#2a201e' : '#342826'); }
    g.fillStyle = '#3a2822'; g.beginPath(); g.ellipse(240, 228, 190, 40, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a3630'; g.beginPath(); g.ellipse(240, 214, 120, 18, 0, 0, Math.PI * 2); g.fill(); // the hollow it lay in
    for (let i = 0; i < 70; i++) { // embers in the ash, breathing
      const x = 240 + (hash(i, 91) - 0.5) * 340, y = 200 + hash(i, 92) * 50, f = 0.4 + 0.6 * Math.sin(t * (1 + hash(i, 93) * 2) + i);
      g.globalAlpha = 0.4 + 0.6 * f; R(g, x, y, 2, 1, f > 0.6 ? '#ffb050' : '#a04020');
    }
    g.globalAlpha = 1;
    // The child, swaddled and asleep, painted twice size.
    g.save(); g.translate(240, 196); g.scale(2, 2);
    glow(g, 0, 0, 36, '255,210,140', 0.18);
    g.fillStyle = '#e8dcc8'; g.beginPath(); g.ellipse(6, 4, 26, 11, 0, 0, Math.PI * 2); g.fill(); // the swaddling
    g.beginPath(); g.ellipse(-20, 0, 12, 11, 0, 0, Math.PI * 2); g.fill(); // its hood
    g.fillStyle = '#c8baa4'; for (const x of [-4, 6, 16]) R(g, x, -4, 1, 14, '#c8baa4');
    g.fillStyle = look.skin; g.beginPath(); g.ellipse(-21, 1, 7.5, 8, 0, 0, Math.PI * 2); g.fill();
    R(g, -27, -7, 10, 3, look.hair); R(g, -24, -8, 4, 2, look.hair);
    R(g, -25, 1, 3, 1, '#6a4030'); R(g, -19, 1, 3, 1, '#6a4030'); // eyes shut
    R(g, -22, 5, 3, 1, '#b0605a'); // a small smile
    g.globalAlpha = 0.5; R(g, -27, 3, 2, 1, '#f0a090'); R(g, -16, 3, 2, 1, '#f0a090'); g.globalAlpha = 1;
    glow(g, 4, 2, 5 + beat * 4, '255,230,160', 0.45); R(g, 3, 1, 2, 2, '#fff8e0'); // the spark inside, beating
    g.restore();
    embers(g, t, 24, 120, 360, 232, '255,200,120', 10);
    if (t < 0.7) { g.fillStyle = `rgba(255,240,210,${(1 - t / 0.7) * 0.8})`; g.fillRect(0, 0, W, H); }
    vignette(g, 0.7);
  },

  // The four wards heal in turn: `region` (0 Grove, 1 Ash, 2 Rime, 3 Tide) pans in from the one before,
  // which stays healed, and heals in its turn.
  healing4(g, t, shot) {
    const k = shot.region || 0, camX = (k - (k ? 1 - easeOut(t / 1.8) : 0)) * W;
    for (let r = 0; r < SCAPES.length; r++) {
      const ox = Math.round(r * W - camX);
      if (ox >= W || ox <= -W) continue;
      const heal = r < k ? 1 : r > k ? 0 : easeOut((t - (k ? 1.4 : 0.6)) / 2.4);
      g.save(); g.beginPath(); g.rect(ox, 0, W, H); g.clip(); g.translate(ox, 0);
      SCAPES[r](g, heal, t);
      g.restore();
    }
    for (let r = 1; r < SCAPES.length; r++) crag(g, Math.round(r * W - camX), r * 7);
    vignette(g, 0.5);
  },

  // A short credits card: night over the Spire, the four spirits' lights on their watch, the Hearth warm below.
  credits(g, t) {
    sky(g, ['#06040a', '#0e0a16', '#1c1222']);
    stars(g, t, 120, 200, 0.8, 17);
    hills(g, 238, 5, 0.02, '#0c0a12', 2);
    spireShape(g, 240, 240, 46, '#140e1a', '#1e1626');
    glow(g, 240, 182, 18 + Math.sin(t * 3) * 2, '255,200,110', 0.55);
    for (let k = 0; k < 4; k++) {
      const a = t * 0.5 + (k / 4) * Math.PI * 2, x = 240 + Math.cos(a) * 64, y = 196 + Math.sin(a) * 9;
      const col = ['168,240,138', '255,176,112', '208,244,255', '160,232,255'][k];
      glow(g, x, y, 10, col, 0.7); R(g, x - 1, y - 1, 2, 2, `rgb(${col})`);
    }
    glow(g, 240, 310, 210, '255,140,60', 0.35);
    embers(g, t, 50, 80, 400, 280, '255,180,90', 18);
    vignette(g, 0.6);
  },

  // ---------------------------------------------------------------- warden close-ups (mid-roar)
  portrait_thornmaw(g, t) {
    const grd = g.createRadialGradient(200, 130, 10, 200, 130, 330);
    grd.addColorStop(0, '#34401a'); grd.addColorStop(0.45, '#141a0a'); grd.addColorStop(1, '#030502');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    burstLines(g, 190, 140, t, '190,255,110', 0.05);
    for (let k = 0; k < 9; k++) {
      const x = hash(k, 1) * W, len = 40 + hash(k, 2) * 70, sw = Math.sin(t * 1.5 + k) * 4;
      g.strokeStyle = '#0a0c06'; g.lineWidth = 3 + hash(k, 3) * 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + sw, len * 0.5, x + sw * 2 + 6, len); g.stroke();
    }
    embers(g, t, 34, 0, W, 280, '170,230,100', 22);
    glow(g, 236, 150, 130, '255,70,50', 0.22 + 0.1 * Math.abs(Math.sin(t * 9)));
    const S = 3.6 + easeOut(t / 2) * 0.35;
    bigBoss(g, paintThornmaw, portraitPose('thornmaw', t), 300, 244, S, true);
    for (let i = 0; i < 14; i++) {
      const p = ((t * 1.3 + hash(i, 4)) % 1), a = Math.PI * (0.7 + hash(i, 5) * 0.6), d = p * 300;
      g.globalAlpha = 1 - p; R(g, 200 + Math.cos(a) * d, 140 + Math.sin(a) * d * 0.6, 2 + p * 4, 2 + p * 3, i % 3 ? '#4a6a2a' : '#c03a4a');
    }
    g.globalAlpha = 1;
    vignette(g, 0.75);
  },

  portrait_cinder(g, t) {
    sky(g, ['#120404', '#2e0a06', '#1a0504']);
    glow(g, 240, 320, 300, '255,90,30', 0.55);
    burstLines(g, 240, 100, t, '255,150,60', 0.05);
    for (let k = 0; k < 7; k++) {
      const x = 20 + k * 72 + hash(k, 1) * 30;
      g.strokeStyle = `rgba(255,${110 + k * 10},40,${0.5 + 0.3 * Math.sin(t * 4 + k)})`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + 10, H - 20 - hash(k, 2) * 20); g.lineTo(x - 4, H - 40 - hash(k, 3) * 30); g.stroke();
    }
    embers(g, t, 90, 0, W, 290, '255,160,70', 36);
    const S = 2.6 + easeOut(t / 2) * 0.2, pose = portraitPose('cinder', t);
    glow(g, 240, 100, 120, '255,120,40', 0.25 + 0.1 * Math.abs(Math.sin(t * 9)));
    bigBoss(g, paintCinder, pose, 240, 104 + 66 * S, S, false, (gg) => fxCinder(gg, pose, 0, 0, 1));
    embers(g, t * 1.3, 30, 0, W, 300, '255,220,140', 60);
    vignette(g, 0.7, '30,4,0');
  },

  portrait_rime(g, t) {
    sky(g, ['#02050c', '#08162a', '#123050']);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = `rgba(${k % 2 ? '120,240,220' : '120,180,255'},0.07)`;
      g.beginPath(); g.moveTo(0, 40 + k * 22);
      for (let x = 0; x <= W; x += 12) g.lineTo(x, 40 + k * 22 + Math.sin(x * 0.012 + t * 0.8 + k * 2) * 16);
      for (let x = W; x >= 0; x -= 12) g.lineTo(x, 70 + k * 22 + Math.sin(x * 0.014 + t * 0.6 + k) * 14);
      g.closePath(); g.fill();
    }
    burstLines(g, 240, 96, t, '160,220,255', 0.05);
    const pose = portraitPose('rime', t), S = 2.7 + easeOut(t / 2) * 0.2;
    glow(g, 240, 110, 120, '120,200,255', 0.22 + 0.1 * Math.abs(Math.sin(t * 9)));
    bigBoss(g, (gg, b, L) => { rimeUnder(gg, b, 0, 0); paintRime(gg, b, L); }, pose, 240, 124 + 66 * S, S, false, (gg) => rimeOver(gg, pose, 0, 0));
    for (let i = 0; i < 90; i++) {
      const sp = 300 + hash(i, 1) * 260, y = hash(i, 2) * H, x = ((hash(i, 3) * 640 + t * sp) % 640) - 80, len = 8 + hash(i, 4) * 22;
      g.strokeStyle = `rgba(235,248,255,${0.25 + hash(i, 5) * 0.5})`; g.lineWidth = hash(i, 6) < 0.2 ? 2 : 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - len, y - len * 0.3); g.stroke();
    }
    vignette(g, 0.7, '0,8,24');
  },

  portrait_tide(g, t) {
    sky(g, ['#010a10', '#05283a', '#0a4458']);
    for (let k = 0; k < 6; k++) { // light falling through the water from far above
      const x = 30 + k * 82 + Math.sin(t * 0.7 + k) * 10, w = 16 + hash(k, 1) * 24;
      g.fillStyle = `rgba(150,230,250,${0.05 + 0.03 * Math.sin(t * 1.3 + k * 2)})`;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w * 2.4 - 60, H); g.lineTo(x + w * 0.6 - 60, H); g.closePath(); g.fill();
    }
    burstLines(g, 240, 100, t, '120,230,250', 0.05);
    g.fillStyle = 'rgba(4,24,34,0.85)'; g.beginPath(); g.ellipse(240, 236, 170, 36, 0, 0, Math.PI * 2); g.fill();
    const pose = portraitPose('tide', t), S = 2.9 + easeOut(t / 2) * 0.2;
    glow(g, 240, 110, 120, '90,200,220', 0.22 + 0.1 * Math.abs(Math.sin(t * 9)));
    bigBoss(g, paintTide, pose, 240, 234, S, false, (gg) => tideOver(gg, pose, 0, 0));
    for (let i = 0; i < 40; i++) { // bubbles streaming up
      const life = 3 + hash(i, 2) * 2, p = ((t + hash(i, 3) * life) % life) / life, x = hash(i, 4) * W + Math.sin(t * 2 + i) * 5, y = H - p * (H + 20);
      g.strokeStyle = `rgba(200,245,255,${0.6 * (1 - p)})`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 1 + hash(i, 5) * 2.5, 0, Math.PI * 2); g.stroke();
    }
    vignette(g, 0.72, '0,10,16');
  },

  // The Unkindled in the dark beneath the Spire: the broken binding circle, its chains hanging slack.
  portrait_vesper(g, t) {
    const grd = g.createRadialGradient(240, 120, 10, 240, 120, 320);
    grd.addColorStop(0, '#2a1440'); grd.addColorStop(0.5, '#0e0618'); grd.addColorStop(1, '#020104');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    burstLines(g, 240, 100, t, '200,160,255', 0.05);
    for (const [ex, ey] of [[0, 30], [480, 30], [0, 250], [480, 250]]) {
      for (let k = 0; k < 14; k++) {
        const q = k / 22, x = ex + (240 - ex) * q, y = ey + (150 - ey) * q + Math.sin(q * Math.PI) * 20;
        R(g, x - 1, y - 1, k % 2 ? 4 : 2, k % 2 ? 2 : 4, '#3a2e4a');
      }
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + t * 0.2;
      if (k % 5 === 0) continue; // broken
      R(g, 240 + Math.cos(a) * 120, 238 + Math.sin(a) * 18, 3, 2, k % 3 ? '#4a3266' : '#9a70d0');
    }
    embers(g, t, 50, 0, W, 290, '170,120,230', 18);
    const pose = { ...portraitPose('vesper', t), view: 'front' }, S = 2.5 + easeOut(t / 2) * 0.2;
    glow(g, 240, 110, 130, '200,160,255', 0.22 + 0.1 * Math.abs(Math.sin(t * 9)));
    bigBoss(g, paintVesper, pose, 240, 112 + 64 * S, S, false, (gg) => vesperOver(gg, pose, 0, 0));
    vignette(g, 0.75, '10,0,20');
  },
};

export const ART_IDS = Object.keys(ART);

// ---------------------------------------------------------------- warden spirits
// Glowing true forms that rise from a defeated warden. Drawn at 1x on the pixel canvas.
export function drawSpirit(g, kind, x, y, t, alpha = 1) {
  if (alpha <= 0) return;
  const col = { stag: '168,240,138', phoenix: '255,176,112', owl: '208,244,255', whale: '160,232,255', vesperghost: '226,218,244' }[kind] || '255,230,180';
  const bob = Math.sin(t * 2) * 2;
  y += bob;
  glow(g, x, y, 34, col, 0.55 * alpha);
  g.save();
  g.globalAlpha = alpha * (0.8 + 0.1 * Math.sin(t * 7));
  const c = `rgb(${col})`, hi = '#ffffff';
  g.fillStyle = c;
  if (kind === 'stag') {
    g.beginPath(); g.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2); g.fill();
    for (const lx of [-8, -4, 5, 9]) R(g, x + lx, y + 3, 2, 9, c);
    R(g, x + 8, y - 9, 4, 9, c); R(g, x + 9, y - 13, 7, 5, c); R(g, x + 15, y - 11, 2, 2, c);
    g.strokeStyle = hi; g.lineWidth = 1;
    g.beginPath();
    for (const s of [-1, 1]) { g.moveTo(x + 11, y - 13); g.lineTo(x + 11 + s * 5, y - 22); g.lineTo(x + 11 + s * 9, y - 26); g.moveTo(x + 11 + s * 5, y - 22); g.lineTo(x + 11 + s * 2, y - 27); }
    g.stroke();
    R(g, x + 13, y - 12, 1, 1, '#204020');
  } else if (kind === 'phoenix') {
    const flap = Math.sin(t * 8) * 6;
    g.beginPath(); g.ellipse(x, y, 5, 8, 0, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 3, y - 3); g.lineTo(x + s * 22, y - 10 - flap); g.lineTo(x + s * 16, y + 2); g.closePath(); g.fill(); }
    R(g, x - 2, y - 13, 5, 5, c); R(g, x + 2, y - 11, 3, 1, '#ffe0a0');
    for (let k = 0; k < 3; k++) R(g, x - 3 + k * 2 + Math.sin(t * 6 + k) * 1.5, y + 7, 1, 8 + k * 2, hi);
  } else if (kind === 'whale') { // a great whale swimming the air, its flukes beating, spouting
    const sw = Math.sin(t * 2.4) * 2;
    g.beginPath(); g.moveTo(x + 15, y - 1); g.quadraticCurveTo(x + 14, y - 8, x + 3, y - 8); g.quadraticCurveTo(x - 9, y - 8, x - 15, y - 2 + sw * 0.4);
    g.quadraticCurveTo(x - 7, y + 5, x + 6, y + 5); g.quadraticCurveTo(x + 15, y + 4, x + 15, y - 1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - 14, y - 2 + sw * 0.4); g.lineTo(x - 21, y - 7 + sw); g.lineTo(x - 19, y - 2 + sw); g.lineTo(x - 21, y + 3 + sw); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x + 4, y + 3); g.lineTo(x - 1, y + 9 + sw * 0.3); g.lineTo(x - 3, y + 6); g.closePath(); g.fill();
    g.strokeStyle = hi; g.lineWidth = 1; g.beginPath();
    for (const dy of [2, 4]) { g.moveTo(x + 12, y + dy - 1); g.quadraticCurveTo(x + 4, y + dy + 1.5, x - 4, y + dy); }
    g.stroke();
    R(g, x + 9, y - 2, 1, 1, '#203040');
    for (let k = 0; k < 3; k++) { const q = (t * 1.2 + k / 3) % 1; g.globalAlpha = alpha * (1 - q); R(g, x + 5 + (k - 1) * 3 * q, y - 10 - q * 9, 1, 2, hi); }
  } else if (kind === 'vesperghost') { // the frail old man he was: bowed, thin, his hands opening, no crown
    const sway = Math.sin(t * 1.3) * 0.8, open = 0.5 + 0.5 * Math.sin(t * 0.8);
    g.beginPath(); g.moveTo(x - 4, y - 9); g.quadraticCurveTo(x - 7, y + 4, x - 8 + sway, y + 14); // the robe, thinning to nothing at the hem
    for (let i = 0; i <= 4; i++) g.lineTo(x - 8 + i * 4 + sway, y + 14 - (i % 2 ? 3 : 0));
    g.quadraticCurveTo(x + 7, y + 4, x + 4, y - 9); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(x + 0.5, y - 13, 3.2, 3.8, 0, 0, Math.PI * 2); g.fill(); // his head, bowed a little forward
    g.strokeStyle = c; g.lineWidth = 1.5; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 4, y - 7); g.quadraticCurveTo(x + s * (6 + open * 2), y - 1, x + s * (5 + open * 4), y + 1 - open * 3); g.stroke(); }
    g.fillStyle = hi; g.globalAlpha = alpha * 0.9;
    R(g, x - 3, y - 15, 6, 1, hi); R(g, x - 0.5, y - 10, 1, 5, hi); // white hair and a thin beard
    for (const s of [-1, 1]) R(g, x + s * (5 + open * 4) - 1, y - open * 3, 2, 2, hi); // open hands
    R(g, x - 1.5, y - 13.5, 1, 1, '#403050'); R(g, x + 1.5, y - 13.5, 1, 1, '#403050');
  } else {
    g.beginPath(); g.ellipse(x, y, 9, 11, 0, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { R(g, x + s * 5 - 1, y - 12, 3, 4, c); g.fillStyle = hi; g.beginPath(); g.arc(x + s * 4, y - 4, 3, 0, Math.PI * 2); g.fill(); R(g, x + s * 4, y - 4, 1, 1, '#203040'); g.fillStyle = c; }
    R(g, x - 1, y - 1, 2, 3, '#e0c060');
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 8, y - 4); g.lineTo(x + s * 13, y + 6); g.lineTo(x + s * 7, y + 9); g.closePath(); g.fill(); }
  }
  g.restore();
  embers(g, t, 10, x - 14, x + 14, y + 10, col, 10);
}
