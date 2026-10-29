// Boss art shared by every warden. Painters (one file each: art-thornmaw.js, art-cinder.js, art-tide.js,
// art-rime.js) draw around the boss's feet (0,0) in the boss's view (side, facing right; front;
// back) and read pose fields off the boss (view, state, phase, anim, timer, roarT, phaseT, cdx/cdy,
// mvx); each takes a palette, so another body can wear its look. stamp() runs them through an
// offscreen buffer for a crisp dark outline and white flashes, mirroring the side view to face left. Scaled up, the same painters make the cutscene portraits. Here: the stamp, lights,
// roars, deaths, entrances and omens. Nothing here touches Math.random, so headless runs stay
// reproducible.
import { makeCanvas } from './sprites.js';

export const TAU = Math.PI * 2;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
export const lerp = (a, b, k) => a + (b - a) * k;
export const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
export const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
export const line = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
export const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); g.fill(); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp01(k)))).join(',')})`; };
export const roarK = (b) => (b.roarT > 0 ? Math.min(1, b.roarT / 0.25) : 0);

// Roar / burst colors: red for the Grove, orange for the Ash, blue for the Rime, sea-green for the Tide,
// the Gloam's violet for Vesper.
export const BOSS_RGB = { thornmaw: '255,70,60', cinder: '255,150,40', rime: '120,200,255', tide: '90,200,220', vesper: '200,160,255' };

export function glow(g, x, y, r, rgb, a = 0.6) {
  if (!(r > 0) || a <= 0) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(${rgb},${Math.min(1, a)})`); grd.addColorStop(1, `rgba(${rgb},0)`);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

// Queue an additive light at a local point, in the target canvas's pixel space (works through any
// transform, so the same call lights the buffer in-game and the big portraits).
export function lit(g, L, x, y, r, rgb, a = 0.6) {
  const m = L && g.getTransform ? g.getTransform() : null;
  if (!m || m.a === undefined) return;
  const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  L.push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, r: r * s, rgb, a });
}
export const drawLights = (g, L, ox = 0, oy = 0, k = 1) => { for (const l of L) glow(g, ox + l.x, oy + l.y, l.r, l.rgb, l.a * k); };

// A licking flame in three nested tongues: the Cinder Warden's crown, and its entrance. cols: its
// colours, outside in (a weak flame's, or a borrower's).
export function flameTongue(g, x, y, h, t, k, weak = false, cols = weak ? ['#a03a14', '#e0802c', '#ffeab8'] : ['#ff4a10', '#ffa030', '#fff2b0']) {
  if (h <= 0.5) return;
  cols.forEach((c, j) => {
    const s = h * (1 - j * 0.28), w = s * 0.3 + 0.6, sway = Math.sin(t * 9 + k * 1.7 + j) * s * 0.18;
    const top = y - s * (1 + Math.sin(t * 13 + k * 2.3) * 0.12);
    g.fillStyle = c; g.beginPath();
    g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 1.1, y - s * 0.55, x + sway, top); g.quadraticCurveTo(x + w * 1.1, y - s * 0.55, x + w, y); g.closePath(); g.fill();
  });
}

// ---------------------------------------------------------------- the stamp
// Paint into an offscreen buffer, optionally whiten it, then lay a 1px dark outline around it.
const BW = 184, BH = 150, OX = 92, OY = 124;
let cv = null;
export function stamp(g, x, y, paint, o = {}) {
  if (!cv) cv = [makeCanvas(BW, BH), makeCanvas(BW, BH), makeCanvas(BW, BH)];
  const [buf, sil, out] = cv, b = buf.getContext('2d'), s = sil.getContext('2d'), c = out.getContext('2d');
  const L = [], a = o.alpha ?? 1;
  b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, BW, BH);
  b.save(); b.translate(OX, OY);
  if (o.ground !== undefined) { b.beginPath(); b.rect(-OX, -OY, BW, OY + o.ground); b.clip(); }
  b.translate(0, o.sink || 0);
  if (o.face < 0 && (o.view ?? 'side') === 'side') b.scale(-1, 1); // front and back views don't turn
  paint(b, L);
  b.restore();
  if (o.cracks > 0) lightCracks(b, o.cracks, o.rgb || '255,240,200');
  if (o.white > 0) { b.globalCompositeOperation = 'source-atop'; b.globalAlpha = Math.min(1, o.white); b.fillStyle = '#ffffff'; b.fillRect(0, 0, BW, BH); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over'; }
  s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, BW, BH); s.drawImage(buf, 0, 0);
  s.globalCompositeOperation = 'source-in'; s.fillStyle = o.outline || '#0a0608'; s.fillRect(0, 0, BW, BH);
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, BW, BH);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(sil, dx, dy);
  c.drawImage(buf, 0, 0);
  const X = Math.round(x) - OX, Y = Math.round(y) - OY;
  if (o.ghosts) for (const [gx, gy, ga] of o.ghosts) { g.globalAlpha = ga * a; g.drawImage(buf, X + Math.round(gx), Y + Math.round(gy)); }
  g.globalAlpha = a; g.drawImage(out, X, Y); g.globalAlpha = 1;
  drawLights(g, o.ground === undefined ? L : L.filter((l) => l.y < OY + o.ground), X, Y, a * (o.white > 0.5 ? 0.4 : 1));
  return L;
}

// Light breaking out through the body as a warden dies (only lands on painted pixels).
function lightCracks(b, p, rgb) {
  b.save(); b.globalCompositeOperation = 'source-atop'; b.lineCap = 'round'; b.lineJoin = 'round';
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + hash(k, 3), pts = [[OX, OY - 30]];
    for (let i = 1; i <= 5; i++) { const r = i * 12 * p, j = (hash(k, i) - 0.5) * 0.8; pts.push([OX + Math.cos(a + j) * r, OY - 30 + Math.sin(a + j) * r * 0.9]); }
    for (const [w, col] of [[3.5, `rgba(${rgb},0.75)`], [1.3, '#ffffff']]) { b.strokeStyle = col; b.lineWidth = w; line(b, pts); }
  }
  b.restore();
}

// ---------------------------------------------------------------- shared effects
export function roarRings(g, x, y, roarT, rgb) {
  const q = clamp01(1 - roarT / 0.9);
  for (let k = 0; k < 3; k++) {
    const r = q - k * 0.16;
    if (r <= 0 || r >= 1) continue;
    const R = 16 + r * 100;
    g.strokeStyle = `rgba(${rgb},${(1 - r) * Math.min(1, r * 5) * 0.85})`; g.lineWidth = 1 + (1 - r) * 3;
    g.beginPath(); g.ellipse(x, y, R, R * 0.55, 0, 0, TAU); g.stroke();
  }
  g.strokeStyle = `rgba(255,255,255,${(1 - q) * 0.6})`; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + hash(k, 5) * 0.3, r0 = 26 + q * 44, r1 = r0 + 10 + hash(k, 6) * 20;
    g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.7); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.7);
  }
  g.stroke();
}

export function dizzyStars(g, x, y, t, n = 3) {
  for (let k = 0; k < n; k++) {
    const a = t * 5 + (k * TAU) / n, sx = Math.round(x + Math.cos(a) * 14), sy = Math.round(y + Math.sin(a) * 4), s = Math.sin(a) > 0 ? 3 : 2;
    g.fillStyle = '#ffe060';
    poly(g, [[sx, sy - s - 1], [sx + 1, sy - 1], [sx + s + 1, sy], [sx + 1, sy + 1], [sx, sy + s + 1], [sx - 1, sy + 1], [sx - s - 1, sy], [sx - 1, sy - 1]]);
    g.fillStyle = '#fffbe0'; g.fillRect(sx - 0.5, sy - 0.5, 1, 1);
  }
}

export function deathRays(g, x, y, p, t, rgb) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + t * 0.7 + hash(k, 2), len = (30 + hash(k, 4) * 40) * (0.4 + p * 1.8), w = 0.05 + hash(k, 7) * 0.05;
    g.fillStyle = `rgba(${k % 3 ? rgb : '255,255,235'},${0.12 + p * 0.3})`;
    poly(g, [[x, y], [x + Math.cos(a - w) * len, y + Math.sin(a - w) * len], [x + Math.cos(a + w) * len, y + Math.sin(a + w) * len]]);
  }
  g.restore();
  glow(g, x, y, 18 + p * 56, '255,250,230', 0.25 + p * 0.55);
}

// ---------------------------------------------------------------- cutscene effects
// Falling grit and dust streams while the room quakes. t: seconds, q: strength.
export function quakeDebris(g, t, q = 1) {
  for (let i = 0; i < 14 + q * 6; i++) {
    const per = 0.8 + hash(i, 1) * 0.9, p = ((t + hash(i, 2) * per) % per) / per;
    const x = 30 + hash(i, 3) * 420 + Math.sin(t * 3 + i) * 2, y = 30 + p * p * 220, s = hash(i, 4) < 0.25 ? 2 : 1;
    g.globalAlpha = Math.min(1, (1 - p) * 3) * 0.9;
    g.fillStyle = hash(i, 5) < 0.5 ? '#7a6e66' : '#40363a'; g.fillRect(Math.round(x), Math.round(y), s, s + (p > 0.3 ? 1 : 0));
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 5; i++) {
    const x = 60 + hash(i, 7) * 360, len = (40 + hash(i, 8) * 90) * Math.min(1, t * 1.5), w = 2 + Math.round(hash(i, 9) * 3);
    const grd = g.createLinearGradient(0, 30, 0, 30 + len);
    grd.addColorStop(0, `rgba(190,170,150,${0.22 * Math.min(1, q)})`); grd.addColorStop(1, 'rgba(190,170,150,0)');
    g.fillStyle = grd; g.fillRect(Math.round(x + Math.sin(t * 2 + i) * 1), 30, w, len);
  }
}

// Each warden's entrance (and Vesper's), drawn around its feet (x,y on screen). p: 0..1 over the shot, t: seconds.
export function drawEntrance(g, kind, x, y, p, t) {
  if (kind === 'vesper') vesperEntrance(g, x, y, p, t);
  else if (kind === 'thornmaw') riseFx(g, x, y, p, t);
  else if (kind === 'cinder') igniteFx(g, x, y, p, t);
  else if (kind === 'tide') surgeFx(g, x, y, p, t);
  else descendFx(g, x, y, p, t);
}

// What stirs before a warden shows itself: twitching roots, rising embers, creeping frost, seeping water.
export function drawOmen(g, kind, x, y, t) {
  const k = clamp01(t / 1.4);
  if (kind === 'vesper') vesperOmen(g, x, y, t);
  else if (kind === 'thornmaw') {
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, r = 18 + hash(i, 1) * 22, bx = x + Math.cos(a) * r, by = y + 6 + Math.sin(a) * r * 0.45;
      const h = Math.max(0, Math.sin(t * (3 + hash(i, 2) * 3) + i * 2)) * 7 * k + 1;
      g.strokeStyle = '#2a1c10'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + 2, by - h * 0.6, bx + Math.sin(t * 6 + i) * 3, by - h); g.stroke();
    }
    glow(g, x, y + 6, 20 + k * 14, '170,240,90', 0.12 + 0.1 * Math.abs(Math.sin(t * 5)));
  } else if (kind === 'cinder') {
    glow(g, x, y + 4, 30 + k * 30, '255,90,30', 0.15 + 0.12 * Math.abs(Math.sin(t * 4)));
    for (let i = 0; i < 30; i++) {
      const life = 1 + hash(i, 1), q = ((t + hash(i, 2) * life) % life) / life;
      g.globalAlpha = Math.sin(q * Math.PI) * k; g.fillStyle = i % 3 ? '#ff7a30' : '#ffd080';
      g.fillRect(Math.round(x + (hash(i, 3) - 0.5) * 110), Math.round(y + 10 - hash(i, 4) * 20 - q * 34), 1, 1 + (i % 4 === 0));
    }
    g.globalAlpha = 1;
  } else if (kind === 'tide') {
    for (let i = 0; i < 7; i++) { // puddles welling up between the stones, joining as it nears
      const a = (i / 7) * TAU + hash(i, 1), r = (12 + hash(i, 2) * 30) * (1 - k * 0.6), s = 3 + k * (6 + hash(i, 3) * 6);
      g.fillStyle = `rgba(16,50,68,${0.3 + 0.5 * k})`; g.beginPath(); g.ellipse(x + Math.cos(a) * r, y + 6 + Math.sin(a) * r * 0.4, s, s * 0.35, 0, 0, TAU); g.fill();
    }
    g.fillStyle = `rgba(16,50,68,${0.7 * k})`; g.beginPath(); g.ellipse(x, y + 6, 4 + k * 22, 1.5 + k * 7, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(160,230,245,${0.5 * k})`; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const q = (t * 0.8 + i / 3) % 1, r = 6 + q * 34 * k; g.beginPath(); g.ellipse(x, y + 6, r, r * 0.35, 0, 0, TAU); g.stroke(); }
    for (let i = 0; i < 16; i++) { // bubbles breaking the surface
      const q = (t * 0.9 + hash(i, 4)) % 1;
      g.globalAlpha = Math.sin(q * Math.PI) * k; g.fillStyle = '#c8f4ff';
      g.fillRect(Math.round(x + (hash(i, 5) - 0.5) * 50), Math.round(y + 6 + (hash(i, 6) - 0.5) * 14 - q * 10), 1, 1);
    }
    g.globalAlpha = 1;
    glow(g, x, y + 6, 24 + k * 20, '90,200,220', 0.12 + 0.08 * Math.abs(Math.sin(t * 3)));
  } else {
    g.fillStyle = `rgba(210,240,255,${0.18 * k})`; g.beginPath(); g.ellipse(x, y + 4, 20 + k * 40, 8 + k * 14, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(235,250,255,${0.6 * k})`; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + hash(i, 1) * 0.3, r0 = 8 + hash(i, 2) * 6, r1 = r0 + (14 + hash(i, 3) * 26) * k; g.moveTo(x + Math.cos(a) * r0, y + 4 + Math.sin(a) * r0 * 0.4); g.lineTo(x + Math.cos(a) * r1, y + 4 + Math.sin(a) * r1 * 0.4); }
    g.stroke();
    for (let i = 0; i < 24; i++) { const q = (t * 0.4 + hash(i, 4)) % 1; g.globalAlpha = Math.sin(q * Math.PI) * 0.8; g.fillStyle = '#f0fbff'; g.fillRect(Math.round(x + (hash(i, 5) - 0.5) * 160 + Math.sin(t + i) * 4), Math.round(y - 90 + q * 110), 1, 1); }
    g.globalAlpha = 1;
  }
}

function riseFx(g, x, y, p, t) {
  const cr = easeOut(p / 0.32);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + hash(k, 1) * 0.5, len = (20 + hash(k, 2) * 34) * cr, pts = [[x, y + 6]];
    for (let i = 1; i <= 4; i++) { const r = (len * i) / 4, j = (hash(k, i + 3) - 0.5) * 0.6; pts.push([x + Math.cos(a + j) * r, y + 6 + Math.sin(a + j) * r * 0.5]); }
    for (const [w, col] of [[2.6, '#100804'], [0.8, `rgba(170,240,90,${0.6 * cr * (1 - clamp01((p - 0.5) * 2))})`]]) { g.strokeStyle = col; g.lineWidth = w; line(g, pts); }
  }
  if (p < 0.34) { g.fillStyle = `rgba(70,50,30,${0.5 * cr})`; g.beginPath(); g.ellipse(x, y + 5, 14 + cr * 10, 4 + cr * 3, 0, 0, TAU); g.fill(); }
  const sec = t - 0.62;
  if (sec > 0) {
    const up = easeOut(sec / 0.45), back = clamp01((p - 0.78) / 0.22);
    for (let k = 0; k < 8; k++) {
      const s = k % 2 ? 1 : -1, bx = x + s * (24 + hash(k, 4) * 28), by = y + 4 + (hash(k, 5) - 0.5) * 16;
      const h = (34 + hash(k, 6) * 40) * up * (1 - back * 0.55), curl = s * (8 + hash(k, 7) * 12) + Math.sin(t * 4 + k) * 3;
      for (const [w, col] of [[6.5, '#20140a'], [4.5, '#4a3620'], [1.2, '#806242']]) { g.strokeStyle = col; g.lineWidth = w * (0.6 + 0.4 * up); g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx - curl * 0.3, by - h * 0.6, bx + curl, by - h); g.stroke(); }
      g.fillStyle = '#e8dcb4';
      for (let j = 1; j < 4; j++) { const q = j / 4, tx = lerp(bx, bx + curl, q * q), ty = by - h * q; poly(g, [[tx - 1, ty], [tx + s * 4, ty - 2], [tx + 1, ty - 1.5]]); }
    }
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (hash(i, 8) - 0.5) * 2.4, v = 60 + hash(i, 9) * 100, px = x + Math.cos(a) * v * sec, py = y + Math.sin(a) * v * sec + 170 * sec * sec;
      if (py > y + 14) continue;
      g.fillStyle = hash(i, 10) < 0.5 ? '#4a3620' : '#24180c'; g.fillRect(Math.round(px), Math.round(py), 2 + (i % 3 === 0), 2);
    }
    const d = clamp01(sec / 0.3) * (1 - clamp01((sec - 0.6) / 0.6));
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(120,96,64,${0.4 * d})`; g.beginPath(); g.ellipse(x + (hash(i, 11) - 0.5) * 80 * d, y + 6 - hash(i, 12) * 10, 10 + hash(i, 13) * 9, 5, 0, 0, TAU); g.fill(); }
    const fl = Math.max(0, 1 - sec / 0.2);
    if (fl > 0) { g.fillStyle = `rgba(255,250,230,${fl * 0.55})`; g.fillRect(0, 0, 480, 270); }
  }
}

function igniteFx(g, x, y, p, t) {
  const conv = 1 - clamp01(p / 0.48);
  if (conv > 0) for (let i = 0; i < 44; i++) {
    const a = hash(i, 1) * TAU + t * (2 + hash(i, 2) * 2), r = (14 + hash(i, 3) * 100) * conv;
    g.globalAlpha = Math.min(1, (1 - conv) * 2 + 0.3); g.fillStyle = i % 3 ? '#ff8a30' : '#ffe080';
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 30 + Math.sin(a) * r * 0.6), 1 + (i % 5 === 0), 1 + (i % 5 === 0));
  }
  g.globalAlpha = 1;
  const ring = easeOut(p / 0.3);
  g.strokeStyle = `rgba(255,120,40,${0.75 * ring})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y + 4, 48 * ring, 18 * ring, 0, 0, TAU); g.stroke();
  g.fillStyle = `rgba(255,200,90,${0.8 * ring})`;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + t * 0.5; g.fillRect(Math.round(x + Math.cos(a) * 40 * ring) - 1, Math.round(y + 4 + Math.sin(a) * 15 * ring) - 1, 2, 2); }
  if (p > 0.25) {
    const f = easeOut((p - 0.25) / 0.2);
    glow(g, x, y + 2, 70 * f, '255,110,30', 0.35 * f);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU, cx = Math.cos(a), sy = Math.sin(a);
      if (sy < 0 && Math.abs(cx) < 0.45) continue;
      flameTongue(g, x + cx * 48, y + 4 + sy * 18, (9 + hash(k, 4) * 12) * f * (sy < 0 ? 0.7 : 1), t, k);
    }
  }
  const pil = clamp01((p - 0.33) / 0.12) * (1 - clamp01((p - 0.6) / 0.2));
  if (pil > 0) {
    glow(g, x, y - 40, 60 * pil, '255,170,70', 0.7 * pil);
    for (const [dx, h, k] of [[-11, 0.6, 11], [11, 0.65, 12], [-5, 0.9, 13], [5, 0.85, 14], [0, 1, 9]]) flameTongue(g, x + dx, y + 4, 92 * h * pil, t, k);
    g.fillStyle = `rgba(255,250,220,${0.7 * pil})`; g.fillRect(x - 2, y - 84 * pil, 4, 84 * pil);
  }
  const fl = Math.max(0, 1 - Math.abs(p - 0.5) / 0.07);
  if (fl > 0) { g.fillStyle = `rgba(255,220,160,${fl * 0.7})`; g.fillRect(0, 0, 480, 270); }
}

function descendFx(g, x, y, p, t) {
  const bl = clamp01(p / 0.25) * (1 - clamp01((p - 0.85) / 0.15) * 0.6);
  g.lineWidth = 1;
  for (let i = 0; i < 80; i++) {
    const sp = 260 + hash(i, 1) * 220, yy = 30 + hash(i, 2) * 210, xx = ((hash(i, 3) * 620 + t * sp) % 620) - 70, len = 6 + hash(i, 4) * 16;
    g.strokeStyle = `rgba(232,246,255,${(0.3 + hash(i, 5) * 0.5) * bl})`; line(g, [[xx, yy], [xx - len, yy - len * 0.3]]);
  }
  for (let i = 0; i < 40; i++) {
    const a = hash(i, 6) * TAU + t * (3 + hash(i, 7) * 2), r = 10 + hash(i, 8) * 54 * (1 - p * 0.5);
    g.globalAlpha = bl * (0.5 + hash(i, 9) * 0.5); g.fillStyle = '#f0fbff';
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 34 + Math.sin(a) * r * 0.45 - hash(i, 10) * 30 * (1 - p)), 1 + (i % 4 === 0), 1 + (i % 4 === 0));
  }
  g.globalAlpha = 1;
  const land = clamp01((p - 0.72) / 0.12);
  if (land > 0) {
    g.fillStyle = `rgba(200,240,255,${0.25 * land})`; g.beginPath(); g.ellipse(x, y + 4, 52 * land, 18 * land, 0, 0, TAU); g.fill();
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + hash(k, 11) * 0.2, cx = Math.cos(a), sy = Math.sin(a);
      if (sy < 0 && Math.abs(cx) < 0.4) continue;
      const sx = x + cx * (30 + hash(k, 12) * 16) * land, by = y + 4 + sy * 13 * land, h = (8 + hash(k, 13) * 12) * easeOut(land), w = 2.5 + hash(k, 14) * 2;
      g.fillStyle = '#e8f8ff'; poly(g, [[sx - w, by], [sx + cx * 2, by - h], [sx, by]]);
      g.fillStyle = '#7ab4de'; poly(g, [[sx, by], [sx + cx * 2, by - h], [sx + w, by]]);
    }
  }
  const fr = clamp01((p - 0.78) / 0.22);
  if (fr > 0 && fr < 1) { g.strokeStyle = `rgba(230,248,255,${1 - fr})`; g.lineWidth = 3 * (1 - fr) + 1; g.beginPath(); g.ellipse(x, y, 20 + fr * 110, (20 + fr * 110) * 0.45, 0, 0, TAU); g.stroke(); }
  const fl = Math.max(0, 1 - Math.abs(p - 0.8) / 0.06);
  if (fl > 0) { g.fillStyle = `rgba(230,248,255,${fl * 0.6})`; g.fillRect(0, 0, 480, 270); }
}

// The floor floods dark round the spot and wheels; a geyser bursts up out of it, the serpent rising in
// its column, the spray raining back down and waves rolling out across the flood.
function surgeFx(g, x, y, p, t) {
  const fl = easeOut(p / 0.38), R = 18 + fl * 56;
  g.fillStyle = `rgba(16,50,68,${0.8 * fl})`; g.beginPath(); g.ellipse(x, y + 4, R, R * 0.34, 0, 0, TAU); g.fill();
  g.strokeStyle = `rgba(80,160,180,${0.7 * fl})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 4, R, R * 0.34, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  for (let arm = 0; arm < 4; arm++) { // the flood wheeling in to where it will break
    const fade = fl * (1 - clamp01((p - 0.45) / 0.2));
    if (fade <= 0) break;
    g.strokeStyle = `rgba(${arm % 2 ? '80,160,180' : '232,250,255'},${0.6 * fade})`; g.beginPath();
    for (let i = 0; i <= 12; i++) { const q = i / 12, a = arm * (TAU / 4) - t * 4 + q * 3.2, r = R * (0.95 - q * 0.85); const px = x + Math.cos(a) * r, py = y + 4 + Math.sin(a) * r * 0.34; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
  }
  const burst = clamp01((p - 0.4) / 0.08) * (1 - clamp01((p - 0.62) / 0.25));
  if (burst > 0) { // the geyser
    const h = 120 * easeOut(clamp01((p - 0.4) / 0.12));
    glow(g, x, y - h * 0.5, 40 + h * 0.3, '150,230,250', 0.4 * burst);
    for (const [w, col] of [[30, '40,120,150'], [22, '120,210,235'], [10, '232,250,255']]) {
      g.fillStyle = `rgba(${col},${0.85 * burst})`; g.beginPath();
      g.moveTo(x - w * 0.7, y + 4); g.quadraticCurveTo(x - w * 0.4, y - h * 0.5, x - w * 0.25 + Math.sin(t * 20) * 2, y - h); g.lineTo(x + w * 0.25 + Math.sin(t * 23) * 2, y - h); g.quadraticCurveTo(x + w * 0.4, y - h * 0.5, x + w * 0.7, y + 4); g.closePath(); g.fill();
    }
  }
  const sec = (p - 0.42) * 2;
  if (sec > 0) for (let i = 0; i < 40; i++) { // spray thrown up and raining back
    const a = -Math.PI / 2 + (hash(i, 8) - 0.5) * 2.2, v = 70 + hash(i, 9) * 110, px = x + Math.cos(a) * v * sec, py = y - 30 + Math.sin(a) * v * sec + 160 * sec * sec;
    if (py > y + 8) continue;
    g.fillStyle = hash(i, 10) < 0.5 ? '#e8faff' : '#78cce0'; g.fillRect(Math.round(px), Math.round(py), 1 + (i % 3 === 0), 2);
  }
  const wv = clamp01((p - 0.45) / 0.55);
  for (let k = 0; k < 3; k++) { // waves rolling out across the flood
    const q = wv - k * 0.18;
    if (q <= 0 || q >= 1) continue;
    const r = 20 + q * 120;
    g.strokeStyle = `rgba(232,250,255,${(1 - q) * 0.8})`; g.lineWidth = 1 + (1 - q) * 2; g.beginPath(); g.ellipse(x, y + 4, r, r * 0.34, 0, 0, TAU); g.stroke();
  }
  const fl2 = Math.max(0, 1 - Math.abs(p - 0.44) / 0.06);
  if (fl2 > 0) { g.fillStyle = `rgba(220,248,255,${fl2 * 0.6})`; g.fillRect(0, 0, 480, 270); }
}

// How a warden's body is placed during its entrance: {sink, ground} for rising out of the
// floor, {dy, alpha} for igniting or descending, or null when it should not be drawn yet.
export function entranceOffset(c) {
  if (!c) return {};
  if (c.hidden) return null;
  if (c.kind === 'thornmaw') return { sink: (1 - easeOut((c.p - 0.32) / 0.4)) * 76, ground: 9 };
  if (c.kind === 'cinder') return { alpha: clamp01((c.p - 0.48) / 0.2) };
  if (c.kind === 'tide') return { sink: (1 - easeOut((c.p - 0.42) / 0.33)) * 110, ground: 1 };
  if (c.kind === 'vesper') return { alpha: clamp01((c.p - 0.5) / 0.25), dy: -(1 - easeOut((c.p - 0.5) / 0.35)) * 12 };
  return { dy: -(1 - easeOut((c.p - 0.22) / 0.52)) * 140, alpha: clamp01((c.p - 0.18) / 0.25) };
}

// ---------------------------------------------------------------- portraits
// A pose for the close-up: the warden mid-roar.
export const portraitPose = (kind, t) => ({ kind, anim: t, state: 'intro', phase: 1, phaseT: 9, roarT: Math.min(0.25, 0.05 + t * 0.7), timer: 0, face: 1, alpha: 1 });

// ---------------------------------------------------------------- the wardens
// The painters live one to a file; they stay importable from here. Those files import the helpers
// above, so they must not call into this module while loading.
export { THORN_PAL, thornPose, paintThornmaw, thornUnder, thornOver } from './art-thornmaw.js';
export { CINDER_PAL, cinderHover, ventOpen, cinderHands, paintCinder, fxCinder, emberSwirl } from './art-cinder.js';
export { RIME_PAL, rimeHover, rimePose, paintRime, rimeUnder, rimeOver } from './art-rime.js';
export { TIDE_PAL, tidePose, paintTide, tideOver } from './art-tide.js';
import { vesperEntrance, vesperOmen } from './art-vesper.js';
