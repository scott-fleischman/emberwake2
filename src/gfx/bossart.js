// Boss art: the three wardens, procedurally painted and animated. Painters draw around the boss's
// feet (0,0) facing right and read pose fields off the boss (state, phase, anim, timer, roarT,
// phaseT, cdx/cdy, mvx). stamp() runs them through an offscreen buffer for a crisp dark outline and
// white flashes. Scaled up, the same painters make the cutscene portraits. Nothing here touches
// Math.random, so headless runs stay reproducible.
import { makeCanvas } from './sprites.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
const lerp = (a, b, k) => a + (b - a) * k;
const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
const line = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); g.fill(); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp01(k)))).join(',')})`; };
export const roarK = (b) => (b.roarT > 0 ? Math.min(1, b.roarT / 0.25) : 0);

// Roar / burst colors: red for the Grove, orange for the Ash, blue for the Rime.
export const BOSS_RGB = { thornmaw: '255,70,60', cinder: '255,150,40', rime: '120,200,255' };

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
function lit(g, L, x, y, r, rgb, a = 0.6) {
  const m = L && g.getTransform ? g.getTransform() : null;
  if (!m || m.a === undefined) return;
  const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  L.push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, r: r * s, rgb, a });
}
export const drawLights = (g, L, ox = 0, oy = 0, k = 1) => { for (const l of L) glow(g, ox + l.x, oy + l.y, l.r, l.rgb, l.a * k); };

function moltenLine(g, pts, a = 1, w = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [lw, col] of [[1.9 * w, `rgba(255,96,20,${a})`], [0.75 * w, `rgba(255,238,160,${a})`]]) { g.strokeStyle = col; g.lineWidth = lw; line(g, pts); }
}

function flameTongue(g, x, y, h, t, k, weak = false) {
  if (h <= 0.5) return;
  const cols = weak ? ['#a03a14', '#e0802c', '#ffeab8'] : ['#ff4a10', '#ffa030', '#fff2b0'];
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
  if (o.face < 0) b.scale(-1, 1);
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

// ---------------------------------------------------------------- Thornmaw: a boar of woven roots with a flytrap maw
const TM_SPINE = [[-30, -30, 6], [-26, -37, 8], [-19, -41, 10], [-12, -44, 11], [-4, -48, 13], [3, -50, 12], [10, -48, 10], [16, -43, 7]];
const TM_BLOOMS = [[-21, -29, 4], [-9, -37, 5], [4, -31, 4.5], [-15, -18, 3.5], [11, -40, 3.5], [-28, -22, 3], [-2, -20, 3.5]];

function tmBody(g) {
  g.beginPath();
  g.moveTo(-26, -13);
  g.bezierCurveTo(-35, -21, -33, -36, -21, -40);
  g.bezierCurveTo(-11, -44, -3, -51, 7, -49);
  g.bezierCurveTo(17, -46, 22, -35, 20, -24);
  g.bezierCurveTo(18, -15, 9, -10, 0, -11);
  g.bezierCurveTo(-9, -11, -19, -8, -26, -13);
  g.closePath();
}

function tmLeg(g, hx, hy, fx, fy, bend, near, ph2) {
  const kx = (hx + fx) / 2 + bend, ky = (hy + fy) / 2 - 1;
  const col = near ? (ph2 ? '#4e2e1a' : '#4a3620') : '#20150c', hi = near ? (ph2 ? '#8e5c3a' : '#806242') : '#382616';
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (near) { // muscled haunch where the leg meets the body
    g.fillStyle = col; g.beginPath(); g.ellipse(hx + (hx < 0 ? -1 : 1), hy - 4, 7.5, 9, hx < 0 ? 0.3 : -0.2, 0, TAU); g.fill();
    g.strokeStyle = hi; g.lineWidth = 1.2; g.beginPath(); g.ellipse(hx + (hx < 0 ? -1 : 1), hy - 4, 6, 7.5, hx < 0 ? 0.3 : -0.2, 3.6, 5.4); g.stroke();
    g.strokeStyle = '#140c06'; g.lineWidth = 1; g.beginPath(); g.ellipse(hx + (hx < 0 ? -1 : 1), hy - 4, 4, 5.5, 0.2, 0.2, 2.2); g.stroke();
  }
  g.strokeStyle = col; g.lineWidth = 9; line(g, [[hx, hy], [kx, ky]]);
  g.lineWidth = 6; line(g, [[kx, ky], [fx, fy - 2]]);
  g.strokeStyle = hi; g.lineWidth = 1.4; line(g, [[hx - 3, hy + 1], [kx - 2.5, ky], [fx - 2, fy - 3]]);
  g.strokeStyle = '#140c06'; g.lineWidth = 1; line(g, [[kx - 3, ky - 1.5], [kx + 3, ky + 0.5]]); line(g, [[hx - 4, hy + 4], [hx + 4, hy + 6]]);
  g.fillStyle = col; g.beginPath(); g.ellipse(fx + 0.5, fy - 1, 4.5, 2, 0, 0, TAU); g.fill();
  g.fillStyle = near ? '#e8dcb4' : '#8a8068';
  for (const cx of [1.5, 4, 6.2]) poly(g, [[fx + cx - 1.6, fy - 1.8], [fx + cx + 1.6, fy + 0.4], [fx + cx - 1.2, fy + 0.4]]);
}

function thornSpike(g, x, y, s, lean, tip) {
  const tx = x - s * 0.45 + lean, ty = y - s;
  g.fillStyle = '#2c3c18';
  g.beginPath(); g.moveTo(x - s * 0.3, y + 1); g.quadraticCurveTo(x - s * 0.1, y - s * 0.55, tx, ty); g.quadraticCurveTo(x + s * 0.12, y - s * 0.4, x + s * 0.32, y + 1); g.closePath(); g.fill();
  g.strokeStyle = '#6e823c'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + s * 0.2, y); g.quadraticCurveTo(x + s * 0.04, y - s * 0.42, tx, ty); g.stroke();
  const my = lerp(y, ty, 0.55);
  g.fillStyle = tip; poly(g, [[lerp(x - s * 0.2, tx, 0.55), my], [tx, ty], [lerp(x + s * 0.14, tx, 0.55), my + 0.5]]);
}

function bloom(g, x, y, r, t, k) {
  if (r < 0.6) return;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + k + Math.sin(t * 2 + k) * 0.12;
    g.fillStyle = i % 2 ? '#c4283c' : '#e2404e';
    g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.62, r * 0.4, a, 0, TAU); g.fill();
  }
  g.fillStyle = '#ff8a8a'; disc(g, x - r * 0.2, y - r * 0.25, r * 0.25);
  g.fillStyle = '#ffd040'; disc(g, x, y, Math.max(0.8, r * 0.22));
}

export function thornPose(b) {
  const t = b.anim || 0, st = b.state, roar = roarK(b), charge = st === 'charge';
  const p = { lean: 0, tilt: 0, open: 0.16 + Math.sin(t * 2.4) * 0.06, bristle: 0, sy: 1 + Math.sin(t * 2.4) * 0.015, moving: st === 'stalk' || charge, charge };
  if (charge) Object.assign(p, { lean: 0.1, tilt: 0.28, open: 0.42 });
  if (st === 'wind') Object.assign(p, { lean: -0.36 - Math.sin(t * 18) * 0.04, open: 0.75, bristle: 0.6 });
  if (st === 'stunned') Object.assign(p, { lean: 0.05, tilt: 0.6 + Math.sin(t * 3) * 0.06, open: 0.34, sy: 0.93 });
  if (st === 'thorns') Object.assign(p, { open: 0.9 + Math.sin(t * 34) * 0.06, bristle: 1, sy: 1.04 });
  if (st === 'dying') Object.assign(p, { open: 0.7, tilt: 0.15 + Math.sin(t * 40) * 0.06, bristle: 0.5 });
  if (roar) { p.lean = Math.min(p.lean, -0.24 * roar); p.open = Math.max(p.open, roar); p.bristle = Math.max(p.bristle, roar); p.tilt = Math.min(p.tilt, -0.18 * roar); }
  return p;
}

export function paintThornmaw(g, b, L) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, roar = roarK(b);
  const bl = ph2 ? easeOut((b.phaseT ?? 9) / 0.9) : 0, P = thornPose(b);
  const cyc = t * (P.charge ? 16 : 7), bob = P.moving ? -Math.abs(Math.sin(cyc)) * (P.charge ? 2.5 : 1.2) : 0;
  g.save();
  g.scale(0.9, 0.9);
  g.translate(-15, 8); g.rotate(P.lean); g.scale(P.charge ? 1.05 : 1, P.sy); g.translate(15, -8 + bob);
  const leg = (hx, off, near) => {
    let fx = hx + 1, fy = 8, bend = hx < 0 ? -3 : 3;
    if (P.moving) { const sw = Math.sin(cyc + off); fx += sw * (P.charge ? 8 : 4); fy -= Math.max(0, Math.cos(cyc + off)) * (P.charge ? 5 : 2.5); }
    if ((st === 'wind' || roar > 0.5) && hx > 0) { const pw = t * 16 + off; fx += 4 + Math.sin(pw) * 4; fy -= 3 + Math.abs(Math.cos(pw)) * 4; bend = 5; }
    if (st === 'stunned') fx += hx < 0 ? -3 : 3;
    tmLeg(g, hx, -13, fx, fy - bob, bend, near, ph2);
  };
  leg(-19, Math.PI, false); leg(5, 0, false);
  // vine tail with a leaf
  const sw = Math.sin(t * 3) * 3 + (P.moving ? Math.sin(cyc) * 2 : 0);
  g.lineCap = 'round'; g.strokeStyle = '#2e2010'; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(-29, -27); g.quadraticCurveTo(-39, -33 + sw, -44, -22 + sw * 0.6); g.stroke();
  g.strokeStyle = '#5e4628'; g.lineWidth = 1; g.beginPath(); g.moveTo(-29, -28); g.quadraticCurveTo(-39, -34 + sw, -44, -23 + sw * 0.6); g.stroke();
  g.fillStyle = ph2 ? '#c03040' : '#4e8a2e'; g.beginPath(); g.ellipse(-45, -20 + sw * 0.6, 3.6, 1.8, 1.1, 0, TAU); g.fill();
  // body of braided roots
  const pal = ph2 ? ['#6e4c2e', '#4a2818', '#1e0c08'] : ['#6e6436', '#4a3822', '#20140a'];
  const grd = g.createLinearGradient(0, -51, 0, -9);
  grd.addColorStop(0, pal[0]); grd.addColorStop(0.5, pal[1]); grd.addColorStop(1, pal[2]);
  g.fillStyle = grd; tmBody(g); g.fill();
  g.save(); tmBody(g); g.clip();
  // roots as tubes: long ones wrapping the barrel, diagonal ones binding them
  const tube = (w, path) => { for (const [lw, col, o] of [[w + 1.4, '#140c06', 0], [w, ph2 ? '#5e3420' : '#5a4428', 0], [Math.max(0.6, w * 0.3), ph2 ? '#b07050' : '#a08452', -w * 0.3]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); path(o); g.stroke(); } };
  for (let k = 0; k < 6; k++) { const y0 = -46 + k * 6.5, w = [2.6, 1.6, 3, 2, 2.6, 1.8][k], wv = (k % 2 ? 3 : -3); tube(w, (o) => { g.moveTo(-36, y0 + 10 + o); g.bezierCurveTo(-18, y0 - 5 + wv + o, 2, y0 - 1 - wv + o, 24, y0 + 8 + k * 0.5 + o); }); }
  for (const [x0, sl, w] of [[-22, 12, 2.2], [-8, 16, 1.6], [6, 10, 2.4]]) tube(w, (o) => { g.moveTo(x0 + sl + o, -54); g.bezierCurveTo(x0 + sl * 0.2 + o, -42, x0 - sl * 0.6 + o, -28, x0 - sl * 0.2 + o, -8); });
  for (const [kx, ky] of [[-18, -30], [-4, -38], [8, -27], [-24, -20]]) { g.fillStyle = '#26180c'; g.beginPath(); g.ellipse(kx, ky, 2.3, 1.6, 0, 0, TAU); g.fill(); g.fillStyle = '#9a7a48'; g.fillRect(kx - 1, ky - 1, 1, 1); }
  g.fillStyle = 'rgba(8,4,2,0.5)'; g.beginPath(); g.ellipse(-4, -7, 30, 7, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,240,170,0.10)'; g.beginPath(); g.ellipse(-6, -45, 22, 6, -0.18, 0, TAU); g.fill();
  g.restore();
  if (bl > 0) TM_BLOOMS.forEach(([x, y, r], k) => bloom(g, x, y, r * bl * (1 + Math.sin(t * 3 + k) * 0.08), t, k));
  // moss and the thorn ridge
  TM_SPINE.forEach(([x, y], k) => {
    g.fillStyle = ph2 ? '#3a5420' : '#35601e'; disc(g, x + 1, y + 2.5, 3.6 + hash(k, 1) * 1.5);
    g.fillStyle = ph2 ? '#6a8a36' : '#6a9c3a'; disc(g, x, y + 1.5, 1.8 + hash(k, 2));
    g.strokeStyle = '#35601e'; g.lineWidth = 1; line(g, [[x + 2, y + 4], [x + 2.5, y + 7 + hash(k, 3) * 4]]);
  });
  TM_SPINE.forEach(([x, y, s], k) => thornSpike(g, x, y, s * (1 + P.bristle * 0.35), P.bristle * Math.sin(t * 40 + k) * 0.8 - 0.5, ph2 ? '#ff5a4a' : '#ece2b4'));
  leg(-15, 0, true); leg(9, Math.PI, true);
  // the flower maw
  g.save(); g.translate(18, -27); g.rotate(P.tilt);
  const pl = (st === 'stunned' ? 7 : 10) * (1 + P.open * 0.5);
  for (let k = 0; k < 9; k++) {
    const a = -2.95 + k * 0.62 + Math.sin(t * 2 + k) * 0.06, len = pl * (k % 2 ? 0.85 : 1), cx = Math.cos(a) * (len * 0.5 + 2), cy = Math.sin(a) * (len * 0.5 + 2);
    g.fillStyle = ph2 ? '#5a6a24' : '#3a7024'; g.beginPath(); g.ellipse(cx, cy, len * 0.58, 3.6, a, 0, TAU); g.fill();
    g.fillStyle = ph2 ? '#ea4656' : '#c8364a'; g.beginPath(); g.ellipse(cx * 0.92, cy * 0.92, len * 0.42, 2.3, a, 0, TAU); g.fill();
    g.strokeStyle = ph2 ? '#ffb0a0' : '#f08a8a'; g.lineWidth = 0.6; line(g, [[Math.cos(a) * 3, Math.sin(a) * 3], [Math.cos(a) * (len * 0.8 + 2), Math.sin(a) * (len * 0.8 + 2)]]);
  }
  const ua = -P.open * 0.8, la = P.open * 0.5;
  g.fillStyle = '#2c0810'; g.beginPath(); g.ellipse(7, 1, 10, 2 + P.open * 7, 0, 0, TAU); g.fill();
  g.fillStyle = ph2 ? '#ff7030' : '#7a1822'; g.beginPath(); g.ellipse(5, 1, 5, 1 + P.open * 3.5, 0, 0, TAU); g.fill();
  if (ph2 || P.open > 0.5) lit(g, L, 6, 1, 8 + P.open * 8, ph2 ? '255,120,40' : '255,80,60', 0.3 * P.open + (ph2 ? 0.2 : 0));
  g.save(); g.rotate(la);
  g.fillStyle = '#3a5a1e'; g.beginPath(); g.moveTo(-2, 0); g.lineTo(21, 0); g.quadraticCurveTo(22, 5, 16, 8); g.bezierCurveTo(8, 10, 0, 9, -3, 4); g.closePath(); g.fill();
  g.strokeStyle = '#22361a'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(6, 8.5, 12, 8.5, 17, 6.5); g.stroke();
  g.fillStyle = '#a02838'; g.fillRect(-1, 0, 21, 1.5);
  g.fillStyle = '#f2ead0'; for (let i = 0; i < 6; i++) { const x = 2 + i * 3.3; poly(g, [[x, 0.5], [x + 2, 0.5], [x + 1, -3 - (i % 2)]]); }
  g.lineCap = 'round'; g.strokeStyle = '#e8e0c0'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(13, 4); g.quadraticCurveTo(21, 3, 22, -5); g.stroke();
  g.strokeStyle = '#a89c78'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(14, 5); g.quadraticCurveTo(21.5, 4, 22.8, -4); g.stroke();
  if (st === 'stunned' || st === 'dying') { g.strokeStyle = '#d0607a'; g.lineWidth = 2; g.beginPath(); g.moveTo(9, 1); g.quadraticCurveTo(15, 6, 13, 11 + Math.sin(t * 3)); g.stroke(); }
  g.restore();
  g.save(); g.rotate(ua);
  const ug = g.createLinearGradient(0, -12, 0, 1); ug.addColorStop(0, ph2 ? '#7e6a30' : '#6a8a36'); ug.addColorStop(1, '#2e4a18');
  g.fillStyle = ug; g.beginPath(); g.moveTo(-4, 1); g.bezierCurveTo(-3, -10, 10, -13, 20, -7); g.quadraticCurveTo(26, -3, 25, 1); g.closePath(); g.fill();
  g.strokeStyle = '#1e2e10'; g.lineWidth = 1; g.beginPath(); g.moveTo(2, -9); g.quadraticCurveTo(10, -6, 14, -9.5); g.moveTo(8, -4); g.quadraticCurveTo(14, -2, 19, -5); g.stroke();
  g.strokeStyle = 'rgba(220,240,160,0.35)'; g.beginPath(); g.moveTo(0, -9); g.bezierCurveTo(4, -11.5, 12, -12, 19, -7.5); g.stroke();
  g.fillStyle = '#a02838'; g.fillRect(-1, -0.5, 25, 1.5);
  g.fillStyle = '#f2ead0'; for (let i = 0; i < 7; i++) { const x = 1 + i * 3.3; poly(g, [[x, 0], [x + 2.2, 0], [x + 1.1, 3.2 + (i % 2) * 0.8]]); }
  g.fillStyle = '#16240c'; poly(g, [[0, -10], [12, -8], [11, -6.5], [1, -8]]);
  const eye = ph2 ? '#ff7a30' : '#ffe040', eyeRgb = ph2 ? '255,110,40' : '255,220,70';
  if (st === 'stunned') {
    g.strokeStyle = '#9a8a40'; g.lineWidth = 0.8;
    for (const [ex, ey] of [[4, -6], [9.5, -5.5]]) { g.beginPath(); g.moveTo(ex - 1.3, ey - 1.3); g.lineTo(ex + 1.3, ey + 1.3); g.moveTo(ex + 1.3, ey - 1.3); g.lineTo(ex - 1.3, ey + 1.3); g.stroke(); }
  } else for (const [ex, ey, r] of [[4, -6, 2.3], [9.5, -5.5, 1.7]]) {
    g.fillStyle = eye; g.beginPath(); g.ellipse(ex, ey, r, r * 0.6, 0.35, 0, TAU); g.fill();
    g.fillStyle = '#fffbe0'; g.fillRect(ex - 0.5, ey - 0.5, 1, 1);
    lit(g, L, ex, ey, 7 + r * 2, eyeRgb, 0.55 + roar * 0.3);
  }
  g.restore();
  if (P.open > 0.55) { g.strokeStyle = 'rgba(220,240,200,0.5)'; g.lineWidth = 0.7; g.beginPath(); for (const d of [9, 15]) { g.moveTo(Math.cos(ua) * d, Math.sin(ua) * d + 2); g.lineTo(Math.cos(la) * d, Math.sin(la) * d - 1); } g.stroke(); }
  g.restore();
  g.restore();
}

// Behind / in front of Thornmaw: charge speed lines and dust, stun stars, drifting petals.
export function thornUnder(g, b, x, y, face) {
  const t = b.anim || 0;
  if (b.state === 'charge') {
    g.strokeStyle = 'rgba(230,220,190,0.45)'; g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const yy = y - 6 - k * 8 + Math.sin(t * 30 + k) * 1.5, x0 = x - face * (30 + hash(k, 1) * 10), len = 14 + ((t * 90 + k * 13) % 18); g.moveTo(x0, yy); g.lineTo(x0 - face * len, yy); }
    g.stroke();
  }
  if (b.state === 'wind') for (let k = 0; k < 5; k++) {
    const p = (t * 2.5 + k / 5) % 1, px = x + face * (14 + p * 10) + (hash(k) - 0.5) * 8;
    g.fillStyle = `rgba(140,120,90,${0.45 * (1 - p)})`; g.beginPath(); g.ellipse(px, y + 6 - p * 6, 3 + p * 5, 2 + p * 2, 0, 0, TAU); g.fill();
  }
}
export function thornOver(g, b, x, y, face) {
  const t = b.anim || 0;
  if (b.state === 'stunned') dizzyStars(g, x + face * 20, y - 42, t, 4);
  if ((b.phase || 1) > 1) for (let i = 0; i < 6; i++) {
    const life = 2 + hash(i, 1), p = ((t + hash(i, 2) * life) % life) / life;
    const px = x + (hash(i, 3) - 0.5) * 60 + Math.sin(t * 2 + i) * 6, py = y - 50 + p * 56;
    g.globalAlpha = Math.sin(p * Math.PI) * 0.9; g.fillStyle = i % 2 ? '#e2404e' : '#ff7a80';
    g.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- Cinder Warden: a floating obsidian knight
const CW_CRACKS = [
  [[-9, -49], [-7, -45], [-9, -42], [-6, -38]],
  [[7, -50], [5, -46], [8, -43]],
  [[-3, -33], [-1, -31], [-2.5, -29]],
  [[11, -44], [8, -40], [10, -36], [7, -33]],
  [[-12, -45], [-9, -43], [-11, -39]],
  [[2, -48], [4, -44], [2, -40], [5, -37]],
  [[-6, -36], [-3, -34], [-5, -30]],
  [[6, -33], [4, -31], [6.5, -29.5]],
  [[-11, -50], [-8, -51], [-6, -48]],
  [[9, -49], [12, -47], [11, -43]],
];
export const cinderHover = (b) => (b.state === 'vent' ? 2 : -6 + Math.sin((b.anim || 0) * 3) * 2);
export const ventOpen = (b) => (b.state === 'vent' ? clamp01(Math.min(((b.phase === 3 ? 1.4 : 1.9) - (b.timer || 0)) / 0.25, (b.timer || 0) / 0.2)) : 0);

export function cinderHands(b) {
  const t = b.anim || 0, st = b.state, roar = roarK(b);
  return [-1, 1].map((s) => {
    const h = { s, x: s * 24, y: -36 + Math.sin(t * 3 + s) * 2, open: 0, glow: 0, rot: s * 0.15 };
    if (st === 'volley') { const q = 1 - clamp01((b.timer || 0) / 0.55); Object.assign(h, { x: s * (23 - q * 10), y: -32 + q * 14, open: q, glow: q * q, rot: -s * 0.5 * q }); } // embers leave at the palms
    if (st === 'vent') Object.assign(h, { x: s * 21, y: -14 + Math.sin(t * 2 + s), rot: s * 0.5 });
    if (roar) Object.assign(h, { x: lerp(h.x, s * 27, roar), y: lerp(h.y, -58, roar), open: Math.max(h.open, roar), glow: Math.max(h.glow, roar * 0.8), rot: lerp(h.rot, -s * 0.5, roar) });
    return h;
  });
}

function gauntlet(g, h, L, hot) {
  g.save(); g.translate(h.x, h.y); g.rotate(h.rot); g.scale(h.s, 1);
  g.fillStyle = '#261c20'; poly(g, [[-6, -10], [3, -11], [4.5, -3], [-5, -2]]);
  g.fillStyle = '#4e3e42'; g.fillRect(-5.5, -10.5, 8, 1);
  g.fillStyle = '#140e10'; poly(g, [[-4, -10], [-8.5, -15.5], [-1, -10.5]]);
  g.fillStyle = '#342a2e'; poly(g, [[-5.5, -3], [5.5, -4], [7, 2], [-4.5, 3.5]]);
  g.fillStyle = '#5c4a4e'; g.fillRect(-4.5, -3.5, 9, 1);
  g.strokeStyle = '#1a1214'; g.lineWidth = 1.8; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const bx = -3 + i * 3, sp = (i - 1.5) * h.open * 1.8; g.beginPath(); g.moveTo(bx, 2.5); g.quadraticCurveTo(bx + sp, 6, bx + sp * 1.6 + (1 - h.open) * 1.5, 8 - h.open * 1.5); g.stroke(); }
  moltenLine(g, [[-4.5, 0], [0, -0.5], [6, -1]], 0.6 + hot * 0.4);
  if (h.glow > 0.15) { g.fillStyle = '#ffe9a0'; disc(g, 1, 8, 1 + h.glow * 2.5); g.fillStyle = '#ffffff'; disc(g, 1, 8, h.glow * 1.2); }
  if (h.glow > 0) lit(g, L, 1, 8, 8 + h.glow * 12, '255,160,60', 0.3 + h.glow * 0.5);
  g.restore();
}

export function paintCinder(g, b, L) {
  const t = b.anim || 0, st = b.state, ph = b.phase || 1, op = ventOpen(b), pulse = 0.75 + 0.25 * Math.sin(t * 5);
  const hot = st === 'vent' ? 1 : ph === 3 ? 0.6 : ph === 2 ? 0.3 : 0;
  g.save(); g.translate(0, cinderHover(b));
  // smoke-and-ember cloak, no legs
  const hem = (i) => [-19 + i * 4.75, (i % 2 ? -6 : 1) + Math.sin(t * 7 + i * 1.7) * 2];
  const cg = g.createLinearGradient(0, -30, 0, 2);
  cg.addColorStop(0, '#20141a'); cg.addColorStop(0.55, '#341410'); cg.addColorStop(1, '#5c1c0c');
  g.fillStyle = cg;
  g.beginPath(); g.moveTo(-10, -30); g.quadraticCurveTo(-14, -16, ...hem(0));
  for (let i = 1; i <= 8; i++) g.lineTo(...hem(i));
  g.quadraticCurveTo(14, -16, 10, -30); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.beginPath();
  for (const x of [-6, 0, 6]) { g.moveTo(x * 0.6, -28); g.quadraticCurveTo(x * 1.2 + Math.sin(t * 3 + x) * 1.5, -14, x * 2.2, -3); }
  g.stroke();
  g.strokeStyle = `rgba(255,${100 + ph * 30},40,${0.75 * pulse})`; g.lineWidth = 1.5; g.lineJoin = 'round';
  g.beginPath(); for (let i = 0; i <= 8; i++) { const [x, y] = hem(i); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  // the white-hot core behind the chest plates
  if (op > 0) {
    const r = 4 + op * 7.5 + Math.sin(t * 22) * 0.8, cgr = g.createRadialGradient(0, -40, 0, 0, -40, r);
    cgr.addColorStop(0, '#ffffff'); cgr.addColorStop(0.35, '#fff2a8'); cgr.addColorStop(0.75, '#ff9a30'); cgr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = cgr; disc(g, 0, -40, r);
    lit(g, L, 0, -40, 22 + op * 20, '255,230,150', 0.8 * op);
  }
  // pauldrons
  for (const s of [-1, 1]) {
    g.save(); g.scale(s, 1);
    g.fillStyle = '#140e10'; poly(g, [[14, -53], [17, -64], [19.5, -53]]); poly(g, [[19, -51], [26, -59], [23.5, -48]]);
    g.fillStyle = s < 0 ? '#34282c' : '#241a1e';
    g.beginPath(); g.moveTo(10, -53); g.quadraticCurveTo(20, -57, 25.5, -48); g.lineTo(22.5, -40.5); g.quadraticCurveTo(16, -44, 11, -43); g.closePath(); g.fill();
    g.strokeStyle = '#64525a'; g.lineWidth = 1; g.beginPath(); g.moveTo(11, -53); g.quadraticCurveTo(20, -56, 24.5, -48.5); g.stroke();
    moltenLine(g, [[12, -44], [17, -45], [22, -42]], 0.55 + hot * 0.45);
    if (ph === 3) moltenLine(g, [[18, -54], [19, -50], [17, -47]], pulse);
    g.restore();
  }
  // breastplate in two halves that part to vent
  for (const s of [-1, 1]) {
    g.save(); g.translate(s * 4 * op, 0); g.rotate(s * 0.12 * op);
    g.fillStyle = s < 0 ? mix('#3c2e32', '#7a3a2a', hot * 0.5) : mix('#211719', '#5a2a1e', hot * 0.5);
    poly(g, [[0, -51], [s * 13, -51], [s * 14.5, -42], [s * 9, -29], [0, -29]]);
    g.strokeStyle = '#0e0809'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -43); g.lineTo(s * 14.2, -43); g.moveTo(0, -36); g.lineTo(s * 11.6, -36); g.stroke();
    g.strokeStyle = s < 0 ? '#665458' : '#3e3236'; g.beginPath(); g.moveTo(s * 0.5, -42); g.lineTo(s * 13.8, -42); g.moveTo(s * 0.5, -35); g.lineTo(s * 11.2, -35); g.moveTo(s * 1, -50); g.lineTo(s * 12.5, -50); g.stroke();
    if (op > 0) { g.strokeStyle = `rgba(255,214,110,${op})`; g.lineWidth = 1.5; line(g, [[0, -51], [0, -29]]); }
    CW_CRACKS.slice(0, [3, 6, 10][ph - 1] || 10).forEach((c, k) => {
      if (Math.sign(c[0][0]) !== s) return;
      moltenLine(g, c, 0.65 + 0.35 * Math.sin(t * 4 + k) + hot * 0.2);
      lit(g, L, c[1][0], c[1][1], 5 + hot * 3, '255,120,40', 0.25 + hot * 0.15);
    });
    g.restore();
  }
  g.fillStyle = '#140c0e'; g.fillRect(-10, -31, 20, 3);
  g.fillStyle = '#ff9a30'; g.fillRect(-1.5, -31, 3, 3); lit(g, L, 0, -29.5, 6, '255,150,50', 0.5);
  g.fillStyle = '#1a1214'; g.fillRect(-5, -54, 10, 4);
  // horned great helm with a burning T-visor
  g.save(); if (st === 'vent') { g.translate(0, 2); g.rotate(0.06 * Math.sin(t * 2)); }
  for (const s of [-1, 1]) {
    g.lineCap = 'round'; g.strokeStyle = '#1a1214'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(s * 7.5, -62); g.quadraticCurveTo(s * 13, -64, s * 13.5, -72); g.stroke();
    g.strokeStyle = '#5c4c50'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(s * 7.5, -63); g.quadraticCurveTo(s * 12.2, -64.8, s * 12.8, -71.5); g.stroke();
  }
  const hg = g.createLinearGradient(-8, -69, 8, -52); hg.addColorStop(0, '#4c3c40'); hg.addColorStop(1, '#140e10');
  g.fillStyle = hg; g.beginPath(); g.moveTo(-7, -52); g.lineTo(-8.5, -61); g.quadraticCurveTo(-7, -68, 0, -69); g.quadraticCurveTo(7, -68, 8.5, -61); g.lineTo(7, -52); g.quadraticCurveTo(0, -50, -7, -52); g.closePath(); g.fill();
  g.fillStyle = '#5c4c50'; g.fillRect(-0.5, -68, 1, 6);
  g.strokeStyle = '#0c0708'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -55); g.lineTo(-2, -53); g.moveTo(6, -55); g.lineTo(2, -53); g.stroke();
  g.fillStyle = '#0a0506'; g.fillRect(-6.5, -61, 13, 3); g.fillRect(-1.5, -61, 3, 7);
  g.fillStyle = st === 'vent' ? '#a05020' : '#ffb040'; g.fillRect(-6, -60.5, 12, 1.6); g.fillRect(-1, -60.5, 2, 6);
  g.fillStyle = '#fff6d0'; g.fillRect(-4.5, -60.2, 2.5, 1); g.fillRect(2, -60.2, 2.5, 1);
  for (const s of [-1, 1]) lit(g, L, s * 3, -59.7, 9 + roarK(b) * 6, '255,170,60', st === 'vent' ? 0.25 : 0.6);
  g.fillStyle = '#4a2a16'; g.fillRect(-7, -66, 14, 2); g.fillStyle = '#ff8a30'; for (const x of [-5, 0, 5]) g.fillRect(x - 0.5, -65.6, 1, 1);
  g.restore();
  for (const h of cinderHands(b)) gauntlet(g, h, L, hot);
  g.restore();
}

// Fire and smoke drawn straight onto the world (never outlined): the crown of living flame,
// rising embers, smoke under the cloak and heat shimmer over an open core.
export function fxCinder(g, b, x, y, a = 1, scale = 1) {
  const t = b.anim || 0, st = b.state, ph = b.phase || 1, op = ventOpen(b), hy = y + cinderHover(b) * scale;
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  for (let i = 0; i < 5; i++) {
    const p = ((t * 0.6 + i / 5) % 1), sx = x + (hash(i, 1) - 0.5) * 22 * scale;
    g.fillStyle = `rgba(30,18,20,${0.35 * (1 - p) * a})`; g.beginPath(); g.ellipse(sx, hy + (2 + p * 10) * scale, (4 + p * 6) * scale, (2 + p * 2) * scale, 0, 0, TAU); g.fill();
  }
  const fs = (st === 'vent' ? 0.45 : [1, 1.35, 1.7][ph - 1] || 1.7) * (1 + roarK(b) * 0.5) * scale;
  const cy = hy - (st === 'vent' ? 64 : 66) * scale;
  glow(g, x, cy - 6 * fs, 12 * fs + 8 * scale, '255,140,50', 0.5);
  for (const [dx, h, k] of [[-5.5, 7, 0], [5.5, 7, 1], [-3, 10, 2], [3, 10, 3], [0, 14, 4]]) flameTongue(g, x + dx * scale, cy, h * fs, t, k, st === 'vent');
  for (let i = 0; i < 10 + ph * 5; i++) {
    const life = 1.2 + hash(i, 3), p = ((t + hash(i, 4) * life) % life) / life;
    const ex = x + ((hash(i, 5) - 0.5) * 34 + Math.sin(t * 2 + i) * 3) * scale, ey = hy + (-2 - p * (30 + hash(i, 6) * 40)) * scale;
    g.globalAlpha = a * Math.sin(p * Math.PI);
    g.fillStyle = hash(i, 7) < 0.5 ? '#ffb040' : '#ff6a20'; g.fillRect(Math.round(ex), Math.round(ey), Math.max(1, Math.round(scale)), Math.max(1, Math.round(scale)));
  }
  g.globalAlpha = a;
  if (op > 0) {
    g.strokeStyle = `rgba(255,240,200,${0.3 * op})`; g.lineWidth = scale;
    g.beginPath();
    for (let k = 0; k < 3; k++) { const bx = x + (k - 1) * 5 * scale; g.moveTo(bx, hy - 46 * scale); for (let j = 1; j <= 6; j++) g.lineTo(bx + Math.sin(t * 12 + j + k) * 1.5 * scale, hy - (46 + j * 4) * scale); }
    g.stroke();
  }
  g.restore();
}

// Embers spiralling in or out while the warden fades between anchors.
export function emberSwirl(g, x, y, k, t) {
  if (k <= 0) return;
  for (let i = 0; i < 24; i++) {
    const a = hash(i, 1) * TAU + t * (4 + hash(i, 2) * 3), r = 6 + hash(i, 3) * 20 + k * 10;
    g.globalAlpha = k * (0.5 + hash(i, 4) * 0.5);
    g.fillStyle = i % 3 ? '#ff8a30' : '#ffe080';
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 30 + Math.sin(a) * r * 0.8 - hash(i, 5) * 10), 1 + (i % 4 === 0), 1 + (i % 4 === 0));
  }
  g.globalAlpha = 1;
  glow(g, x, y - 30, 20 + k * 14, '255,130,50', 0.35 * k);
}

// ---------------------------------------------------------------- Rime Sovereign: a crystalline owl-queen
export const rimeHover = (b) => -8 + Math.sin((b.anim || 0) * 2) * 2 + (b.state === 'skid' || b.state === 'stunned' ? 5 : 0);

function shard(g, px, py, ang, len, w, s, u) {
  const dx = Math.sin(ang) * s, dy = -Math.cos(ang), nx = -dy, ny = dx;
  const tx = px + dx * len, ty = py + dy * len, mx = px + dx * len * 0.38, my = py + dy * len * 0.38;
  g.fillStyle = u < 0.5 ? '#e6f9ff' : '#ccecff'; poly(g, [[px, py], [mx + nx * w, my + ny * w], [tx, ty]]);
  g.fillStyle = u < 0.5 ? '#76b2e0' : '#5a92c6'; poly(g, [[px, py], [mx - nx * w, my - ny * w], [tx, ty]]);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.7; line(g, [[mx, my], [tx, ty]]);
}

// Wing pose: shard fan from a0 (outermost, off the wrist) to a1 (innermost, by the shoulder),
// arm elevation al and arm length arm. Angles: 0 points straight up, positive sweeps outward.
export function rimeWings(b) {
  const t = b.anim || 0, st = b.state, roar = roarK(b);
  let w = { a0: 0.45, a1: 2.5, ln: 1, flap: Math.sin(t * 4) * 0.12, al: 0.3 + Math.sin(t * 4) * 0.12, arm: 12 };
  if (st === 'wind') w = { a0: -0.15, a1: 1.5, ln: 1.05, flap: Math.sin(t * 30) * 0.03, al: 1, arm: 11 };
  else if (st === 'dash') w = { a0: 2.55, a1: 3.0, ln: 0.8, flap: 0, al: -1.3, arm: 5 };
  else if (st === 'skid') w = { a0: 0.9, a1: 2.6, ln: 0.9, flap: Math.sin(t * 20) * 0.1, al: -0.2, arm: 10 };
  else if (st === 'stunned') w = { a0: 1.7, a1: 2.95, ln: 0.9, flap: Math.sin(t * 2) * 0.05, al: -0.7, arm: 10 };
  else if (st === 'rain') w = { a0: 0.1, a1: 1.9, ln: 1.1, flap: Math.sin(t * 8) * 0.05, al: 0.85, arm: 12 };
  else if (st === 'dying') w = { a0: 0.9, a1: 2.6, ln: 1, flap: Math.sin(t * 30) * 0.08, al: 0, arm: 11 };
  if (roar) Object.assign(w, { a0: lerp(w.a0, 0.05, roar), a1: lerp(w.a1, 1.9, roar), ln: lerp(w.ln, 1.15, roar), al: lerp(w.al, 0.75, roar), arm: lerp(w.arm, 13, roar) });
  return w;
}

export function paintRime(g, b, L) {
  const t = b.anim || 0, st = b.state, ph = b.phase || 1, roar = roarK(b), W = rimeWings(b);
  g.save(); g.translate(0, rimeHover(b));
  let lean = 0;
  if (st === 'dash') lean = (b.cdx || 0) * 0.35;
  if (st === 'skid') lean = -(b.cdx || 0) * 0.2 + Math.sin(t * 24) * 0.04;
  if (st === 'stunned') lean = Math.sin(t * 2.5) * 0.12;
  g.translate(0, -28); g.rotate(lean); g.translate(0, 28);
  if (st === 'wind') { g.translate(0, 2); g.scale(1, 0.95); }
  // wings of ice shards: primaries off the wrist, secondaries along the arm
  const n = 5 + ph * 2;
  for (const s of [-1, 1]) {
    const tw = st === 'skid' ? s * 0.35 : 0, sx = s * 7, sy = -46, wx = sx + s * Math.cos(W.al) * W.arm, wy = sy - Math.sin(W.al) * W.arm;
    for (let i = n - 1; i >= 0; i--) {
      const u = i / (n - 1), bx = lerp(wx, sx, u * 0.85), by = lerp(wy, sy, u * 0.85);
      const len = (14 + 20 * Math.sin(Math.PI * (0.25 + u * 0.6))) * W.ln * (1 + (ph - 1) * 0.12) * (u < 0.2 ? 1.1 : 1);
      shard(g, bx, by, lerp(W.a0, W.a1, u) + W.flap * (1 - u * 0.6) + tw, len, lerp(3.4, 2.4, u), s, u);
    }
    g.lineCap = 'round'; g.strokeStyle = '#5a92c6'; g.lineWidth = 3.2; line(g, [[sx, sy], [wx, wy]]);
    g.strokeStyle = '#e6f9ff'; g.lineWidth = 1.4; line(g, [[sx, sy - 0.8], [wx, wy - 0.8]]);
    for (let i = 0; i < 3; i++) { const u = (i + 0.5) / 3; shard(g, lerp(sx, wx, u), lerp(sy, wy, u), lerp(W.a1, W.a0, u) * 0.85 + 0.25, 9, 2.4, s, 0.3); }
  }
  // gown of frost mist
  const sway = Math.sin(t * 1.7) * 1.5 - clamp01(Math.abs(b.mvx || 0) / 200) * Math.sign(b.mvx || 0) * 3;
  const hem = (i) => [-15 + i * 5 + sway, -3 + (i % 2 ? -3 : 1) + Math.sin(t * 3 + i * 1.3) * 1.5];
  const gg = g.createLinearGradient(0, -33, 0, 0); gg.addColorStop(0, '#e8f9ff'); gg.addColorStop(0.45, '#a4d4f2'); gg.addColorStop(1, '#4a7cb2');
  g.fillStyle = gg; g.beginPath(); g.moveTo(-7, -33); g.quadraticCurveTo(-11, -18, ...hem(0)); for (let i = 1; i <= 6; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(11, -18, 7, -33); g.closePath(); g.fill();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); for (const x of [-4, 1, 5]) { g.moveTo(x * 0.5, -31); g.quadraticCurveTo(x + sway * 0.5, -18, x * 1.8 + sway, -5); } g.stroke();
  g.strokeStyle = 'rgba(30,70,130,0.4)'; g.beginPath(); for (const x of [-2, 3]) { g.moveTo(x * 0.5, -30); g.quadraticCurveTo(x + sway * 0.6, -16, x * 2.2 + sway, -4); } g.stroke();
  // faceted crystal bodice
  const V = [[-8, -47], [0, -52], [8, -47], [6.5, -33], [0, -29], [-6.5, -33]];
  ['#f0fcff', '#c4eaff', '#78b2de', '#5890c4', '#8ec6ea', '#d6f2ff'].forEach((c, i) => { g.fillStyle = c; poly(g, [[0, -40], V[i], V[(i + 1) % 6]]); });
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.6; g.beginPath(); for (const v of V) { g.moveTo(0, -40); g.lineTo(...v); } g.stroke();
  g.fillStyle = '#40c8ff'; poly(g, [[0, -42.5], [2, -40], [0, -37.5], [-2, -40]]); g.fillStyle = '#ffffff'; g.fillRect(-0.5, -41.5, 1, 1);
  lit(g, L, 0, -40, 8 + ph * 2 + roar * 6, '120,210,255', 0.5);
  // owl ruff of ice feathers
  for (let k = 0; k < 9; k++) { const x = -10 + k * 2.5; g.fillStyle = k % 2 ? '#dff6ff' : '#a6d6f4'; poly(g, [[x - 1.8, -51], [x + 1.8, -51], [x * 1.25, -45 + Math.abs(x) * 0.15]]); }
  // head: ear tufts, crown of icicles, heart-shaped facial disc and burning blue eyes
  g.save(); g.translate(0, -58); if (st === 'stunned') g.rotate(Math.sin(t * 2.5) * 0.15 - 0.12);
  for (const s of [-1, 1]) { g.fillStyle = '#e4f8ff'; poly(g, [[s * 3, -5], [s * 10, -13], [s * 7.5, -2]]); g.fillStyle = '#78b2de'; poly(g, [[s * 5.5, -4], [s * 10, -13], [s * 7.5, -2]]); }
  g.fillStyle = '#b4def6'; g.beginPath(); g.ellipse(0, 0, 8, 7, 0, 0, TAU); g.fill();
  const cs = (1 + (ph - 1) * 0.28) * (1 + roar * 0.15);
  g.save(); if (st === 'stunned') { g.translate(0, -5); g.rotate(-0.3); g.translate(0, 5); }
  for (const [x, h0] of [[-6, 6], [-3, 9], [0, 14], [3, 9], [6, 6]]) { const h = h0 * cs; g.fillStyle = '#f2fcff'; poly(g, [[x - 1.7, -5], [x, -5 - h], [x, -5]]); g.fillStyle = '#88c4ec'; poly(g, [[x, -5], [x, -5 - h], [x + 1.7, -5]]); }
  g.fillStyle = '#9ad2f2'; g.fillRect(-7, -6.5, 14, 2); g.fillStyle = '#40c8ff'; g.fillRect(-1, -6.5, 2, 2);
  lit(g, L, 0, -6, 6 + roar * 6, '120,210,255', 0.5);
  g.restore();
  g.fillStyle = '#f6fdff'; disc(g, -3.4, -0.5, 3.9); disc(g, 3.4, -0.5, 3.9); poly(g, [[-7, 0.8], [7, 0.8], [0, 6.5]]);
  g.strokeStyle = '#7ab4de'; g.lineWidth = 0.6; line(g, [[0, -3.5], [0, 1]]);
  const er = 1 + roar * 0.3 + (st === 'rain' ? 0.25 : 0);
  for (const s of [-1, 1]) {
    g.fillStyle = '#12304c'; disc(g, s * 3.4, -0.6, 2.6);
    if (st === 'stunned') { g.strokeStyle = '#6ab8e8'; g.lineWidth = 0.7; g.beginPath(); g.arc(s * 3.4, -0.6, 1.5, t * 8, t * 8 + 4.5); g.stroke(); continue; }
    g.fillStyle = '#3cc8ff'; disc(g, s * 3.4, -0.6, 1.9 * er);
    g.fillStyle = '#ffffff'; disc(g, s * 3.4 - s * 0.4, -1, 0.85);
    lit(g, L, s * 3.4, -0.6, 9 * er, '110,210,255', 0.65);
  }
  g.strokeStyle = '#2a5a8a'; g.lineWidth = 1; g.beginPath(); for (const s of [-1, 1]) { g.moveTo(s * 7, -4.5); g.lineTo(s * 1.5, -2.6); } g.stroke();
  g.fillStyle = '#e4d48a'; poly(g, [[-1.3, 1.5], [1.3, 1.5], [0, 4.8]]);
  g.restore();
  g.restore();
}

// Mist trailing under the gown and a cold glow at her feet.
export function rimeUnder(g, b, x, y, scale = 1) {
  const t = b.anim || 0, ph = b.phase || 1, hy = y + rimeHover(b) * scale;
  glow(g, x, y + 4 * scale, (26 + ph * 6) * scale, '140,210,255', 0.16 + ph * 0.06);
  for (let i = 0; i < 7; i++) {
    const p = (t * 0.7 + i / 7) % 1, mx = x + ((hash(i, 1) - 0.5) * 22 - (b.mvx || 0) * 0.08 * p) * scale, my = hy + (-4 + p * 12) * scale;
    g.fillStyle = `rgba(210,240,255,${0.3 * (1 - p)})`; g.beginPath(); g.ellipse(mx, my, (6 + p * 8) * scale, (2.5 + p * 2) * scale, 0, 0, TAU); g.fill();
  }
}
// Frost aura (phase 2+), skid shavings, stun stars.
export function rimeOver(g, b, x, y, scale = 1) {
  const t = b.anim || 0, ph = b.phase || 1, hy = y + rimeHover(b) * scale, roar = roarK(b);
  const n = ph === 1 ? (roar ? 6 : 0) : ph === 2 ? 6 : 10;
  for (let k = 0; k < n; k++) {
    const a = t * 1.4 + (k / n) * TAU, fx = x + Math.cos(a) * 30 * scale, fy = hy + (-30 + Math.sin(a) * 12 + Math.sin(t * 3 + k) * 2) * scale, r = (1.6 + hash(k) * 1.2) * scale;
    g.strokeStyle = `rgba(230,248,255,${0.6 + 0.4 * Math.sin(a)})`; g.lineWidth = Math.max(0.7, 0.7 * scale);
    g.beginPath(); for (let j = 0; j < 3; j++) { const q = a * 2 + (j * Math.PI) / 3; g.moveTo(fx - Math.cos(q) * r, fy - Math.sin(q) * r); g.lineTo(fx + Math.cos(q) * r, fy + Math.sin(q) * r); } g.stroke();
  }
  if (b.state === 'skid') {
    const d = Math.sign(b.cdx || 1);
    g.fillStyle = 'rgba(220,245,255,0.6)'; g.fillRect(x - 14 - d * 6, y + 3, 28, 2);
    for (let k = 0; k < 6; k++) { const p = (t * 3 + k / 6) % 1; g.fillStyle = `rgba(255,255,255,${1 - p})`; g.fillRect(Math.round(x + d * (6 + p * 10) + (hash(k) - 0.5) * 10), Math.round(y + 2 - p * 8 + p * p * 10), 1, 1); }
    g.fillStyle = '#ffffff'; g.fillRect(x + 9, y - 64 + rimeHover(b), 2, 3); g.fillRect(x + 9.5, y - 65 + rimeHover(b), 1, 1);
  }
  if (b.state === 'stunned') dizzyStars(g, x, hy - 76, t, 4);
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

// Each warden's entrance, drawn around its feet (x,y on screen). p: 0..1 over the shot, t: seconds.
export function drawEntrance(g, kind, x, y, p, t) {
  if (kind === 'thornmaw') riseFx(g, x, y, p, t);
  else if (kind === 'cinder') igniteFx(g, x, y, p, t);
  else descendFx(g, x, y, p, t);
}

// What stirs before a warden shows itself: twitching roots, rising embers, creeping frost.
export function drawOmen(g, kind, x, y, t) {
  const k = clamp01(t / 1.4);
  if (kind === 'thornmaw') {
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

// How a warden's body is placed during its entrance: {sink, ground} for rising out of the
// floor, {dy, alpha} for igniting or descending, or null when it should not be drawn yet.
export function entranceOffset(c) {
  if (!c) return {};
  if (c.hidden) return null;
  if (c.kind === 'thornmaw') return { sink: (1 - easeOut((c.p - 0.32) / 0.4)) * 76, ground: 9 };
  if (c.kind === 'cinder') return { alpha: clamp01((c.p - 0.48) / 0.2) };
  return { dy: -(1 - easeOut((c.p - 0.22) / 0.52)) * 140, alpha: clamp01((c.p - 0.18) / 0.25) };
}

// ---------------------------------------------------------------- portraits
// A pose for the close-up: the warden mid-roar.
export const portraitPose = (kind, t) => ({ kind, anim: t, state: 'intro', phase: 1, phaseT: 9, roarT: Math.min(0.25, 0.05 + t * 0.7), timer: 0, face: 1, alpha: 1 });
