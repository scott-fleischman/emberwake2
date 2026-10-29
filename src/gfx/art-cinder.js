// The Cinder Warden's art: a floating obsidian knight crowned with living flame. The painter draws
// around its feet facing the camera (b.view 'front', the default), from behind ('back') or turned
// to the right ('side', see bossart.js); every colour comes from a palette, so another body can
// wear it. Unbound (phase 2) its plates have blasted off: an iron cage round a blazing core, the
// crown a pillar of fire, and a flame greatsword that hovers at its side until it swings.
import { TAU, clamp01, easeOut, lerp, hash, poly, line, disc, mix, roarK, lit, glow, flameTongue } from './bossart.js';

// A `2` key is the Unbound colour of the key without it.
export const CINDER_PAL = {
  molten: '255,96,20', moltenHi: '255,238,160',
  cuff: '#261c20', cuffHi: '#4e3e42', spikes: '#140e10', hand: '#342a2e', handHi: '#5c4a4e', iron: '#1a1214',
  palm: '#ffe9a0', palmCore: '#ffffff', palmGlow: '255,160,60',
  cloak: ['#20141a', '#341410', '#5c1c0c'], cloak2: ['#2a1012', '#5a1a0a', '#a8340c'], folds: 'rgba(0,0,0,0.5)',
  hem: [255, 100, 40], // its green rises with the heat
  coreHot: '#ffffff', coreMid: '#fff2a8', core: '#ff9a30', coreEdge: '255,80,20', coreGlow: '255,230,150',
  plate: '#34282c', plateDark: '#241a1e', plateEdge: '#64525a',
  chest: '#3c2e32', chestDark: '#211719', chestHot: '#7a3a2a', chestHotDark: '#5a2a1e',
  seam: '#0e0809', ridge: '#665458', ridgeDark: '#3e3236', seamGlow: '255,214,110', crackGlow: '255,120,40',
  belt: '#140c0e', buckleGlow: '255,150,50',
  helm: ['#4c3c40', '#140e10'], steelHi: '#5c4c50', helmLine: '#0c0708', slot: '#0a0506',
  visor: '#ffb040', visorDim: '#a05020', visorHot: '#fff6d0', visorGlow: '255,170,60', band: '#4a2a16', studs: '#ff8a30',
  // from behind: the back plate, its spine and the louvred vents that open as it vents
  back: ['#3a2c30', '#1c1416'], spine: '#4e3e42', spineHi: '#6e5a60', louvre: '#0a0506', louvreLip: '#56444a',
  // Unbound: the cage round the core, what is left of the shoulders, and the greatsword
  cage: '#2e2224', cageHi: '#6e5a5e', hollow: '#120a0b', stub: '#3a2c30', vertebra: '#3e3034',
  hilt: '#1e1416', hiltHi: '#6a5458', guard: '#3a2a2e', guardHi: '#8a6e72', pommel: '#ffb040',
  blade: '#ff6a18', bladeHi: '#ffb84a', bladeCore: '#fff4c8', bladeGlow: '255,140,40', flame: ['#ff4a10', '#ffa030', '#fff2b0'],
};

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
// The moveset's clocks (warden-cinder.js): a throw's windup, the vent, the sweep and its strike,
// the meteor call and the lava throw.
const CAST = 0.55, VENT = 1.9, SWEEP = 1.2, STRIKE = 0.7, METEORS = 1.2, POOLS = 1;
const PALM = [1, 8]; // in a gauntlet's own frame

export const cinderHover = (b) => (b.state === 'vent' ? 2 : -6 + Math.sin((b.anim || 0) * 3) * 2);
export const ventOpen = (b) => (b.state === 'vent' ? clamp01(Math.min((VENT - (b.timer || 0)) / 0.25, (b.timer || 0) / 0.2)) : 0);

// How far it has come Unbound: the plates crack and rattle through the transform (to 0.45), then
// blast off as phase 2 begins.
function unboundK(b) {
  if ((b.phase || 1) > 1) return 0.45 + 0.55 * easeOut((b.phaseT ?? 9) / 0.5);
  return b.state === 'transform' ? 0.45 * clamp01(1 - (b.timer ?? 0) / 1.5) : 0;
}

function moltenLine(g, pal, pts, a = 1, w = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [lw, col] of [[1.9 * w, `rgba(${pal.molten},${a})`], [0.75 * w, `rgba(${pal.moltenHi},${a})`]]) { g.strokeStyle = col; g.lineWidth = lw; line(g, pts); }
}

// ---------------------------------------------------------------- the greatsword
// Unbound, the flame greatsword: {x, y} its grip, (dx, dy) the way its blade points on screen, len
// the blade as seen, k how far it has caught fire, behind when it is on the far side of the body.
// It hovers point-down at its side; a sweep swings it round over the ground, seen at the view's slant.
export function cinderSword(b) {
  const view = b.view || 'front', t = b.anim || 0, k = clamp01(((b.phaseT ?? 9) - 0.15) / 0.5), sag = ventOpen(b) * 5;
  const bob = Math.sin(t * 2) * 1.5 + sag;
  const hover = view === 'side' ? { x: -21, y: -54 + bob, dx: 0.14, dy: 0.99, len: 40, behind: true }
    : { x: view === 'back' ? -36 : 36, y: -52 + bob, dx: 0, dy: 1, len: 40, behind: false };
  if (b.state !== 'sweep') return { ...hover, k };
  const q = clamp01(1 - (b.timer ?? 0) / SWEEP), qs = STRIKE / SWEEP, aimG = view === 'side' ? 0 : view === 'front' ? Math.PI / 2 : -Math.PI / 2;
  // [ground heading from the aim, elevation, grip reach, grip height]
  let pose, w = 1;
  if (q < qs) { pose = [-2.1, 1.15, 9, 58]; w = easeOut(q / (qs * 0.6)); }
  else if (q < qs + 0.1) { const f = easeOut((q - qs) / 0.1); pose = [lerp(-1.9, 1.7, f), lerp(1, 0.05, Math.min(1, f * 1.6)), 12, lerp(52, 40, f)]; }
  else { const f = clamp01((q - qs - 0.1) / (1 - qs - 0.1)); pose = [1.7 + 0.25 * f, 0.05 - 0.5 * f, 12, 40 - 4 * f]; }
  const [phi, elev, reach, h] = pose, ga = aimG + phi, cx = Math.cos(ga), cy = Math.sin(ga);
  const bx = cx * Math.cos(elev), by = cy * Math.cos(elev) * 0.55 - Math.sin(elev), bl = Math.hypot(bx, by) || 1;
  const s = { x: cx * reach, y: cy * reach * 0.55 - h, dx: bx / bl, dy: by / bl, len: 40 * bl, behind: cy < -0.25 };
  if (w >= 1) return { ...s, k };
  const dx = lerp(hover.dx, s.dx, w), dy = lerp(hover.dy, s.dy, w), dl = Math.hypot(dx, dy) || 1;
  return { x: lerp(hover.x, s.x, w), y: lerp(hover.y, s.y, w), dx: dx / dl, dy: dy / dl, len: lerp(hover.len, s.len, w), behind: w > 0.5 ? s.behind : hover.behind, k };
}

function sword(g, pal, L, sw, t, dim) {
  if (sw.k <= 0) return;
  const { x, y, dx, dy } = sw, px = -dy, py = dx, P = (u, v) => [x + dx * u + px * v, y + dy * u + py * v];
  const len = sw.len * easeOut(sw.k), tip = 5 + len;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = pal.hilt; g.lineWidth = 2.6; line(g, [P(-8, 0), P(4, 0)]);
  g.strokeStyle = pal.hiltHi; g.lineWidth = 0.8; for (const u of [-5, -2, 1]) line(g, [P(u, -1.2), P(u + 1, 1.2)]);
  g.fillStyle = pal.pommel; disc(g, ...P(-9, 0), 2);
  g.fillStyle = pal.guard; poly(g, [P(3, -8), P(4.5, -9), P(6, -6), P(6, 6), P(4.5, 9), P(3, 8)]);
  g.fillStyle = pal.guardHi; poly(g, [P(3.5, -7.5), P(4.5, -8.3), P(5, -6.5), P(4, -6.5)]);
  if (len < 1) return;
  // a blade of fire: molten edges round a white-hot core, flames licking up off it
  g.fillStyle = pal.blade; poly(g, [P(6, -3.4), P(tip - 6, -3), P(tip, 0), P(tip - 6, 3), P(6, 3.4)]);
  g.fillStyle = pal.bladeHi; poly(g, [P(6, -2), P(tip - 7, -1.7), P(tip - 2, 0), P(tip - 7, 1.7), P(6, 2)]);
  g.strokeStyle = pal.bladeCore; g.lineWidth = 1; line(g, [P(7, 0), P(tip - 4, 0)]);
  const fl = 1 - dim * 0.6;
  for (let i = 0; i < 6; i++) {
    const u = 8 + (len - 8) * (i + 0.5) / 6, side = i % 2 ? 3 : -3, [fx, fy] = P(u, side), hh = (3 + hash(i, 2) * 3 + Math.sin(t * 13 + i * 2.1) * 1.5) * fl;
    pal.flame.forEach((c, j) => {
      const s = hh * (1 - j * 0.3), wv = s * 0.35 + 0.4, sway = Math.sin(t * 9 + i + j) * s * 0.25;
      g.fillStyle = c; g.beginPath(); g.moveTo(fx - wv, fy); g.quadraticCurveTo(fx - wv, fy - s * 0.6, fx + sway, fy - s); g.quadraticCurveTo(fx + wv, fy - s * 0.6, fx + wv, fy); g.closePath(); g.fill();
    });
  }
  for (const q of [0.3, 0.7]) lit(g, L, ...P(6 + len * q, 0), 12, pal.bladeGlow, 0.4 * fl);
}

// ---------------------------------------------------------------- the hands
// Floating gauntlets. s is which hand: in front and behind views -1 is on the left of the picture,
// side-on -1 is the far hand and +1 the near one, both on the side it faces. m mirrors the drawing,
// sc scales it for depth, behind draws it before the body.
export function cinderHands(b) {
  const view = b.view || 'front', side = view === 'side', t = b.anim || 0, st = b.state, roar = roarK(b), ph2 = (b.phase || 1) > 1;
  const aim = side ? [Math.abs(b.cdx ?? 1), b.cdy ?? 0] : [0, view === 'back' ? -1 : 1];
  const sw = ph2 && st === 'sweep' ? cinderSword(b) : null;
  return [-1, 1].map((s) => {
    const at = (x, y, nx, ny, fx, fy) => (side ? (s > 0 ? [nx, ny] : [fx, fy]) : [s * x, y]); // front/back, or side-on near then far
    const [rx, ry] = at(24, -36, 9, -34, -7, -37);
    const h = { s, m: side ? 1 : s, x: rx, y: ry + Math.sin(t * 3 + s) * 2, open: 0, glow: 0, rot: side ? 0.15 : s * 0.15, sc: 1, behind: side && s < 0, back: view === 'back' };
    if (st === 'volley') {
      // Drawn back and up over the first 60% of each throw's windup, then thrust along the aim with
      // both palms open; each throw draws back from where the last one ended. Never inward.
      const q = 1 - clamp01((b.timer ?? 0) / CAST);
      // Side-on the far hand rides higher, so both show; from behind they thrust up past the shoulders.
      const out = side ? { x: s > 0 ? 33 : 28, y: (s > 0 ? -39 : -45) + aim[1] * 10, rot: Math.atan2(-aim[0], aim[1]), sc: 1 }
        : view === 'front' ? { x: s * 26, y: -28, rot: 0, sc: 1.25 } : { x: s * 26, y: -64, rot: -s * Math.PI, sc: 0.8 };
      const back = side ? { x: s > 0 ? 26 : 22, y: -44, rot: -Math.PI - 0.3, sc: 1 } : { x: s * 26, y: -44, rot: -s * (Math.PI - 0.4), sc: 1 };
      const w = q < 0.6 ? 1 - easeOut(q / 0.6) : ((q - 0.6) / 0.4) ** 2;
      Object.assign(h, { x: lerp(back.x, out.x, w), y: lerp(back.y, out.y, w), rot: lerp(back.rot, out.rot, w), sc: lerp(back.sc, out.sc, w), open: lerp(0.35, 1, w), glow: 0.2 + 0.8 * q * q, behind: side ? s < 0 : view === 'back' && w > 0.5 });
    }
    if (st === 'vent') { const [x, y] = at(21, -16, 6, -14, -7, -17); Object.assign(h, { x, y: y + Math.sin(t * 2 + s), rot: side ? 0.4 : s * 0.5 }); }
    if (st === 'transform') { const [x, y] = at(25, -44, 10, -42, -6, -44); Object.assign(h, { x: x + Math.sin(t * 50 + s) * 0.8, y, glow: unboundK(b), rot: side ? -0.3 : -s * 0.3 }); }
    if (st === 'meteors') { // raised to the sky, palms up and blazing
      const k = easeOut(clamp01((1 - (b.timer ?? 0) / METEORS) / 0.25)), [x, y] = at(21, -72, 6, -70, 0, -72);
      Object.assign(h, { x: lerp(h.x, x, k), y: lerp(h.y, y, k), rot: side ? -Math.PI + 0.2 : -s * (Math.PI - 0.25), open: 1, glow: k });
    }
    if (st === 'pools') { // tearing the lava out of its core
      const k = easeOut(clamp01((1 - (b.timer ?? 0) / POOLS) / 0.35)), [x0, y0] = at(7, -44, 12, -42, 9, -44), [x1, y1] = at(22, -40, 20, -40, 16, -42);
      Object.assign(h, { x: lerp(x0, x1, k), y: lerp(y0, y1, k), rot: side ? -1.2 : -s * 1.3, open: 1, glow: 1 - k * 0.5 });
    }
    if (sw) { // both fists on the grip
      const u = s > 0 ? 0 : -5;
      Object.assign(h, { x: sw.x + sw.dx * u, y: sw.y + sw.dy * u, rot: Math.atan2(sw.dy, sw.dx), open: 0, m: 1, behind: sw.behind });
    }
    if (roar && !['volley', 'meteors', 'pools', 'sweep'].includes(st)) {
      const [x, y] = at(27, -58, 8, -60, 1, -62);
      Object.assign(h, { x: lerp(h.x, x, roar), y: lerp(h.y, y, roar), open: Math.max(h.open, roar), glow: Math.max(h.glow, roar * 0.8), rot: lerp(h.rot, side ? -Math.PI + 0.3 : -s * 0.5, roar) });
    }
    return h;
  });
}

// Where each palm is from the boss's feet, in the world: the volley's embers leave from here.
export function cinderPalms(b) {
  const f = (b.view || 'front') === 'side' && (b.face ?? 1) < 0 ? -1 : 1, hy = cinderHover(b);
  return cinderHands(b).map((h) => {
    const c = Math.cos(h.rot), sn = Math.sin(h.rot), lx = h.m * PALM[0] * h.sc, ly = PALM[1] * h.sc;
    return { x: f * (h.x + lx * c - ly * sn), y: hy + h.y + lx * sn + ly * c };
  });
}

function gauntlet(g, pal, h, L, hot) {
  g.save(); g.translate(h.x, h.y); g.rotate(h.rot); g.scale(h.m * h.sc, h.sc);
  g.fillStyle = pal.cuff; poly(g, [[-6, -10], [3, -11], [4.5, -3], [-5, -2]]);
  g.fillStyle = pal.cuffHi; g.fillRect(-5.5, -10.5, 8, 1);
  g.fillStyle = pal.spikes; poly(g, [[-4, -10], [-8.5, -15.5], [-1, -10.5]]);
  g.fillStyle = pal.hand; poly(g, [[-5.5, -3], [5.5, -4], [7, 2], [-4.5, 3.5]]);
  g.fillStyle = pal.handHi; g.fillRect(-4.5, -3.5, 9, 1);
  g.strokeStyle = pal.iron; g.lineWidth = 1.8; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const bx = -3 + i * 3, sp = (i - 1.5) * h.open * 1.8; g.beginPath(); g.moveTo(bx, 2.5); g.quadraticCurveTo(bx + sp, 6, bx + sp * 1.6 + (1 - h.open) * 1.5, 8 - h.open * 1.5); g.stroke(); }
  if (h.back) { g.fillStyle = pal.cuffHi; for (let i = 0; i < 3; i++) g.fillRect(-3.5 + i * 3, -1, 2, 1.2); } // knuckle plates
  moltenLine(g, pal, [[-4.5, 0], [0, -0.5], [6, -1]], 0.6 + hot * 0.4);
  if (h.glow > 0.15 && !h.back) { g.fillStyle = pal.palm; disc(g, ...PALM, 1 + h.glow * 2.5); g.fillStyle = pal.palmCore; disc(g, ...PALM, h.glow * 1.2); }
  if (h.glow > 0) lit(g, L, ...PALM, 8 + h.glow * 12, pal.palmGlow, (0.3 + h.glow * 0.5) * (h.back ? 0.7 : 1));
  g.restore();
}

// ---------------------------------------------------------------- the body, part by part
// The smoke-and-ember skirt it floats on, no legs; side-on it streams out behind. Unbound it burns.
function skirt(g, pal, t, ph2, heat, view) {
  const side = view === 'side', cl = ph2 ? pal.cloak2 : pal.cloak, hc = pal.hem;
  const hem = side ? (i) => [10 - i * 4 - (i > 5 ? (i - 5) * 1.5 : 0), (i % 2 ? -5 : 1) - i * 1.2 + Math.sin(t * 7 + i * 1.7) * 2]
    : (i) => [-19 + i * 4.75, (i % 2 ? -6 : 1) + Math.sin(t * 7 + i * 1.7) * 2];
  const cg = g.createLinearGradient(0, -30, 0, 2);
  cg.addColorStop(0, cl[0]); cg.addColorStop(0.55, cl[1]); cg.addColorStop(1, cl[2]);
  g.fillStyle = cg; g.beginPath();
  if (side) { g.moveTo(7, -30); g.quadraticCurveTo(11, -14, ...hem(0)); for (let i = 1; i <= 8; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(-18, -22, -9, -30); }
  else { g.moveTo(-10, -30); g.quadraticCurveTo(-14, -16, ...hem(0)); for (let i = 1; i <= 8; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(14, -16, 10, -30); }
  g.closePath(); g.fill();
  g.strokeStyle = pal.folds; g.lineWidth = 1.2; g.beginPath();
  if (side) for (const k of [0, 1, 2]) { g.moveTo(4 - k * 6, -28); g.quadraticCurveTo(2 - k * 9 + Math.sin(t * 3 + k) * 1.5, -16, -k * 12 + 4, -4 - k * 3); }
  else if (view === 'back') for (const x of [-8, -3, 3, 8]) { g.moveTo(x * 0.6, -28); g.quadraticCurveTo(x * 1.1 + Math.sin(t * 3 + x) * 1.5, -15, x * 2, -3); }
  else for (const x of [-6, 0, 6]) { g.moveTo(x * 0.6, -28); g.quadraticCurveTo(x * 1.2 + Math.sin(t * 3 + x) * 1.5, -14, x * 2.2, -3); }
  g.stroke();
  g.strokeStyle = `rgba(${hc[0]},${Math.min(255, hc[1] + 30 + heat * 60)},${hc[2]},${0.75 * (0.75 + 0.25 * Math.sin(t * 5))})`; g.lineWidth = 1.5; g.lineJoin = 'round';
  g.beginPath(); for (let i = 0; i <= 8; i++) { const [x, y] = hem(i); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  if (!ph2) return;
  // Unbound, the hem is alight
  for (let i = 0; i <= 8; i += 2) {
    const [x, y] = hem(i), hh = 3 + hash(i, 9) * 3 + Math.sin(t * 12 + i) * 1.5;
    pal.flame.forEach((c, j) => { const s = hh * (1 - j * 0.3), wv = s * 0.35 + 0.4; g.fillStyle = c; g.beginPath(); g.moveTo(x - wv, y); g.quadraticCurveTo(x, y - s * 1.1, x + wv, y); g.closePath(); g.fill(); });
  }
}

// Spiked shoulder plates, from the front or from behind (lit from the other side).
function pauldrons(g, pal, t, hot, jit, back) {
  for (const s of [-1, 1]) {
    g.save(); g.scale(s, 1); g.translate(jit * s, -Math.abs(jit) * 0.5);
    g.fillStyle = pal.spikes; poly(g, [[14, -53], [17, -64], [19.5, -53]]); poly(g, [[19, -51], [26, -59], [23.5, -48]]);
    g.fillStyle = (s < 0) !== back ? pal.plate : pal.plateDark;
    g.beginPath(); g.moveTo(10, -53); g.quadraticCurveTo(20, -57, 25.5, -48); g.lineTo(22.5, -40.5); g.quadraticCurveTo(16, -44, 11, -43); g.closePath(); g.fill();
    g.strokeStyle = pal.plateEdge; g.lineWidth = 1; g.beginPath(); g.moveTo(11, -53); g.quadraticCurveTo(20, -56, 24.5, -48.5); g.stroke();
    moltenLine(g, pal, back ? [[13, -52], [18, -54], [23, -49]] : [[12, -44], [17, -45], [22, -42]], 0.55 + hot * 0.45);
    g.restore();
  }
}

// Front: the breastplate in two halves that part to vent, cracked with fire.
function chestFront(g, pal, L, t, op, hot, ncr, jit) {
  if (op > 0) coreGlow(g, pal, L, 0, -40, 4 + op * 7.5, t, op);
  for (const s of [-1, 1]) {
    g.save(); g.translate(s * (4 * op + jit), 0); g.rotate(s * 0.12 * op);
    g.fillStyle = s < 0 ? mix(pal.chest, pal.chestHot, hot * 0.5) : mix(pal.chestDark, pal.chestHotDark, hot * 0.5);
    poly(g, [[0, -51], [s * 13, -51], [s * 14.5, -42], [s * 9, -29], [0, -29]]);
    g.strokeStyle = pal.seam; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -43); g.lineTo(s * 14.2, -43); g.moveTo(0, -36); g.lineTo(s * 11.6, -36); g.stroke();
    g.strokeStyle = s < 0 ? pal.ridge : pal.ridgeDark; g.beginPath(); g.moveTo(s * 0.5, -42); g.lineTo(s * 13.8, -42); g.moveTo(s * 0.5, -35); g.lineTo(s * 11.2, -35); g.moveTo(s * 1, -50); g.lineTo(s * 12.5, -50); g.stroke();
    if (op > 0 || hot > 0.4) { g.strokeStyle = `rgba(${pal.seamGlow},${Math.max(op, (hot - 0.4) * 1.5)})`; g.lineWidth = 1.5; line(g, [[0, -51], [0, -29]]); }
    CW_CRACKS.slice(0, ncr).forEach((c, k) => {
      if (Math.sign(c[0][0]) !== s) return;
      moltenLine(g, pal, c, 0.65 + 0.35 * Math.sin(t * 4 + k) + hot * 0.2);
      lit(g, L, c[1][0], c[1][1], 5 + hot * 3, pal.crackGlow, 0.25 + hot * 0.15);
    });
    g.restore();
  }
}

// Behind: one back plate, its spine ridge, and louvred vents either side of it that open as it
// vents, so the punish window shows from behind as well as in front.
function backPlate(g, pal, L, t, op, hot, jit) {
  coreGlow(g, pal, L, 0, -41, 3 + op * 6, t, op * 0.8);
  g.save(); g.translate(jit, 0);
  const bg = g.createLinearGradient(-14, -51, 14, -29); bg.addColorStop(0, pal.back[0]); bg.addColorStop(1, pal.back[1]);
  g.fillStyle = bg; poly(g, [[-13, -51], [13, -51], [14.5, -42], [9, -29], [-9, -29], [-14.5, -42]]);
  g.strokeStyle = pal.seam; g.lineWidth = 1; g.beginPath(); for (const s of [-1, 1]) { g.moveTo(s * 2.5, -50); g.quadraticCurveTo(s * 11, -48, s * 13.5, -42); } g.stroke();
  for (const [i, y] of [-47, -42, -37].entries()) for (const s of [-1, 1]) {
    const w = 6 - i, x0 = s * 3.5, x1 = s * (3.5 + w), hgt = 1.2 + op * 1.5;
    g.fillStyle = pal.louvreLip; poly(g, [[x0, y - 1.2], [x1, y - 1.2], [x1, y - 0.4], [x0, y - 0.4]]);
    g.fillStyle = pal.louvre; poly(g, [[x0, y], [x1, y], [x1, y + hgt], [x0, y + hgt]]);
    const heat = 0.18 + hot * 0.25 + op * 0.75 + Math.sin(t * 6 + i + s) * 0.06;
    g.fillStyle = `rgba(${pal.molten},${heat})`; poly(g, [[x0, y + 0.3], [x1, y + 0.3], [x1, y + hgt - 0.2], [x0, y + hgt - 0.2]]);
    if (op > 0.3) { g.fillStyle = `rgba(${pal.moltenHi},${op})`; g.fillRect(Math.min(x0, x1) + 0.5, y + hgt * 0.4, Math.abs(x1 - x0) - 1, 0.8); }
    lit(g, L, (x0 + x1) / 2, y + hgt / 2, 4 + op * 8, pal.crackGlow, 0.12 + hot * 0.1 + op * 0.45);
  }
  g.fillStyle = pal.spine; g.fillRect(-1.5, -51, 3, 21);
  g.fillStyle = pal.spineHi; g.fillRect(-1.5, -51, 1, 21);
  for (const y of [-49, -44, -39, -34]) { g.fillStyle = pal.seam; g.fillRect(-1.5, y, 3, 0.8); }
  moltenLine(g, pal, [[-12, -36], [-9.5, -33], [-11, -31]], 0.35 + hot * 0.4);
  moltenLine(g, pal, [[11, -45], [9, -42], [11.5, -39]], 0.35 + hot * 0.4);
  g.restore();
}

// Side-on: the breastplate in profile; venting, its front half swings open off the hinge behind.
function chestSide(g, pal, L, t, op, hot, ncr, jit) {
  if (op > 0) coreGlow(g, pal, L, 5, -40, 3 + op * 6, t, op);
  g.fillStyle = mix(pal.chestDark, pal.chestHotDark, hot * 0.5); poly(g, [[-8, -51], [3, -52], [3, -29], [-7, -30], [-10.5, -41]]);
  g.strokeStyle = pal.seam; g.lineWidth = 1; g.beginPath(); g.moveTo(-10, -43); g.lineTo(3, -43); g.moveTo(-8.5, -36); g.lineTo(3, -36); g.stroke();
  if (op > 0 || hot > 0.4) { g.strokeStyle = `rgba(${pal.seamGlow},${Math.max(op, (hot - 0.4) * 1.5)})`; g.lineWidth = 1.5; line(g, [[3.5, -51], [3.5, -29]]); }
  g.save(); g.translate(3 + jit, -52); g.rotate(-0.32 * op); g.translate(-3, 52);
  g.fillStyle = mix(pal.chest, pal.chestHot, hot * 0.5); poly(g, [[3, -52], [9, -51], [13, -44], [12, -37], [8, -29], [3, -29]]);
  g.strokeStyle = pal.seam; g.beginPath(); g.moveTo(3, -43); g.lineTo(12.8, -43); g.moveTo(3, -36); g.lineTo(11.6, -36); g.stroke();
  g.strokeStyle = pal.ridge; g.beginPath(); g.moveTo(3.5, -42); g.lineTo(12.6, -42); g.moveTo(3.5, -35); g.lineTo(11.2, -35); g.moveTo(4, -50); g.lineTo(9.5, -50); g.stroke();
  CW_CRACKS.slice(0, ncr).forEach((c, k) => {
    if (c[0][0] < 0) return;
    const pts = c.map(([x, y]) => [3 + x * 0.65, y]);
    moltenLine(g, pal, pts, 0.65 + 0.35 * Math.sin(t * 4 + k) + hot * 0.2);
    lit(g, L, pts[1][0], pts[1][1], 5 + hot * 3, pal.crackGlow, 0.25 + hot * 0.15);
  });
  g.restore();
}

// Side-on, the near shoulder plate in profile, its spikes raked back.
function pauldronSide(g, pal, hot, jit) {
  g.save(); g.translate(jit, -Math.abs(jit) * 0.5);
  g.fillStyle = pal.spikes; poly(g, [[-9, -56], [-17, -61], [-7, -52]]); poly(g, [[-6, -57], [-11, -68], [-1, -58]]); poly(g, [[0, -58], [-1, -69], [5, -57.5]]);
  g.fillStyle = pal.plate; g.beginPath(); g.moveTo(-12, -44); g.quadraticCurveTo(-12, -58, 0, -59); g.quadraticCurveTo(12, -58.5, 12.5, -45); g.lineTo(9, -41); g.quadraticCurveTo(0, -45, -9, -40.5); g.closePath(); g.fill();
  g.fillStyle = pal.plateDark; g.beginPath(); g.moveTo(-11, -46); g.quadraticCurveTo(0, -50, 12, -46.5); g.lineTo(9, -41); g.quadraticCurveTo(0, -45, -9, -40.5); g.closePath(); g.fill();
  g.strokeStyle = pal.plateEdge; g.lineWidth = 1; g.beginPath(); g.moveTo(-10.5, -50); g.quadraticCurveTo(-9.5, -57, 0, -57.8); g.quadraticCurveTo(10, -57.5, 11.5, -48); g.stroke();
  moltenLine(g, pal, [[-10, -46.5], [1, -49], [11.5, -46.5]], 0.55 + hot * 0.45);
  g.restore();
}

// The white-hot core, behind plates or in the cage; lr, the reach of its light.
function coreGlow(g, pal, L, x, y, r, t, a, lr = 16 + r * 2.2) {
  if (a <= 0) return;
  const rr = r + Math.sin(t * 22) * 0.8, cgr = g.createRadialGradient(x, y, 0, x, y, rr);
  cgr.addColorStop(0, pal.coreHot); cgr.addColorStop(0.35, pal.coreMid); cgr.addColorStop(0.75, pal.core); cgr.addColorStop(1, `rgba(${pal.coreEdge},0)`);
  g.fillStyle = cgr; disc(g, x, y, rr);
  lit(g, L, x, y, lr, pal.coreGlow, 0.8 * Math.min(1, a));
}

// Unbound, front or behind: an iron cage of ribs round the blazing core; venting, the ribs splay.
// From behind the spine runs down the middle and the core shows dimmer through the ribs.
function cage(g, pal, L, t, op, back) {
  g.fillStyle = pal.hollow; poly(g, [[-11, -51], [11, -51], [12.5, -42], [8, -30], [-8, -30], [-12.5, -42]]);
  coreGlow(g, pal, L, 0, -41, (back ? 6 : 8.5) + op * 4, t, back ? 0.5 + op * 0.5 : 0.6 + op * 0.4, 20 + op * 20);
  if (back && op > 0) lit(g, L, 0, -50, 14 + op * 14, pal.coreGlow, 0.5 * op);
  for (const s of [-1, 1]) {
    g.save(); g.translate(s * op * 2.5, 0); g.rotate(s * op * 0.08);
    for (const [i, y] of [-48, -42.5, -37].entries()) {
      const x0 = back ? s * 2.5 : s * (3.5 + i * 0.5), rib = [[x0, y - 0.5], [s * 9, y - 2.5], [s * (12.5 - i), y + 3]];
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = pal.cage; g.lineWidth = 2.6; g.beginPath(); g.moveTo(...rib[0]); g.quadraticCurveTo(...rib[1], ...rib[2]); g.stroke();
      g.strokeStyle = pal.cageHi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(rib[0][0], rib[0][1] - 0.9); g.quadraticCurveTo(rib[1][0], rib[1][1] - 0.9, rib[2][0], rib[2][1] - 0.9); g.stroke();
      g.strokeStyle = `rgba(${pal.molten},${back ? 0.45 : 0.75})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(rib[0][0], rib[0][1] + 1); g.quadraticCurveTo(rib[1][0], rib[1][1] + 1, rib[2][0], rib[2][1] + 0.6); g.stroke();
    }
    // the jagged edge of the breastplate it blew off, still glowing
    g.fillStyle = pal.plateDark; poly(g, [[s * 11, -52], [s * 14.5, -51], [s * 15, -43], [s * 12, -39], [s * 12.5, -34], [s * 9.5, -29], [s * 9, -33], [s * 11, -37], [s * 10.5, -44]]);
    moltenLine(g, pal, [[s * 11, -51], [s * 10.5, -44], [s * 11, -37], [s * 9, -33]], 0.7 + 0.3 * Math.sin(t * 4 + s));
    g.restore();
  }
  if (back) {
    for (let y = -52; y < -30; y += 4) {
      g.fillStyle = `rgba(${pal.molten},${0.5 + op * 0.5})`; g.fillRect(-1.5, y + 2.6, 3, 1.4);
      g.fillStyle = pal.vertebra; g.fillRect(-2.5, y, 5, 2.8); g.fillStyle = pal.cageHi; g.fillRect(-2.5, y, 5, 0.8);
    }
    lit(g, L, 0, -41, 8 + op * 6, pal.crackGlow, 0.25 + op * 0.4);
  } else { g.fillStyle = pal.cage; g.fillRect(-9, -53, 18, 2.5); g.fillStyle = pal.cageHi; g.fillRect(-9, -53, 18, 0.8); }
}

// Unbound, side-on: the spine behind, ribs arcing forward round the core.
function cageSide(g, pal, L, t, op) {
  g.fillStyle = pal.hollow; poly(g, [[-8, -51], [8, -51], [12, -44], [11, -36], [7, -30], [-7, -30], [-10, -41]]);
  coreGlow(g, pal, L, 2, -41, 7.5 + op * 4, t, 0.6 + op * 0.4, 20 + op * 20);
  for (const [i, y] of [-48, -42.5, -37].entries()) {
    g.save(); g.translate(-7, y); g.rotate(-op * 0.25); g.translate(7, -y);
    const rib = [[-7, y], [6, y - 3.5], [11 - i * 0.8, y + 3]];
    g.lineCap = 'round';
    g.strokeStyle = pal.cage; g.lineWidth = 2.6; g.beginPath(); g.moveTo(...rib[0]); g.quadraticCurveTo(...rib[1], ...rib[2]); g.stroke();
    g.strokeStyle = pal.cageHi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(rib[0][0], rib[0][1] - 0.9); g.quadraticCurveTo(rib[1][0], rib[1][1] - 0.9, rib[2][0], rib[2][1] - 0.9); g.stroke();
    g.strokeStyle = `rgba(${pal.molten},0.75)`; g.beginPath(); g.moveTo(rib[0][0], rib[0][1] + 1); g.quadraticCurveTo(rib[1][0], rib[1][1] + 1, rib[2][0], rib[2][1] + 0.6); g.stroke();
    g.restore();
  }
  for (let y = -52; y < -30; y += 4) { g.fillStyle = pal.vertebra; g.fillRect(-9.5, y, 4.5, 2.8); g.fillStyle = pal.cageHi; g.fillRect(-9.5, y, 4.5, 0.8); }
  g.fillStyle = pal.plateDark; poly(g, [[-9, -52], [-12, -46], [-11, -40], [-12.5, -34], [-8, -30], [-9, -38]]);
  moltenLine(g, pal, [[-9, -52], [-9, -38], [-8, -30]], 0.7);
}

// Unbound, where the pauldrons were: iron ball joints and the broken stumps of their spikes.
function stubs(g, pal, t, side) {
  for (const s of side ? [1] : [-1, 1]) {
    const x = side ? 1 : s * 13;
    g.fillStyle = pal.spikes; poly(g, [[x - 2.5, -52], [x - 0.5 + (side ? -1 : s), -57.5], [x + 1.5, -52]]);
    g.fillStyle = pal.stub; disc(g, x, -49, 4.2);
    g.fillStyle = pal.cageHi; disc(g, x - 1.2, -50.5, 1.4);
    moltenLine(g, pal, [[x - 4, -47.5], [x, -45.6], [x + 4, -47.5]], 0.65 + 0.35 * Math.sin(t * 5 + s));
  }
}

// The horned great helm with its burning T-visor. Unbound it is cracked, and the visor white-hot.
function helm(g, pal, L, b, view, ph2, uk) {
  const t = b.anim || 0, st = b.state, roar = roarK(b), dim = st === 'vent', vis = dim ? pal.visorDim : ph2 ? pal.visorHot : pal.visor;
  g.save(); if (dim) { g.translate(0, 2); g.rotate(0.06 * Math.sin(t * 2)); }
  if (view === 'side') {
    g.lineCap = 'round';
    g.strokeStyle = pal.iron; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-3, -64); g.quadraticCurveTo(-6, -67, -5, -73); g.stroke(); // the far horn
    const hg = g.createLinearGradient(-8, -69, 8, -52); hg.addColorStop(0, pal.helm[0]); hg.addColorStop(1, pal.helm[1]);
    g.fillStyle = hg; g.beginPath(); g.moveTo(-6.5, -52); g.lineTo(-8, -61); g.quadraticCurveTo(-6, -69, 1, -69); g.quadraticCurveTo(8, -68, 9.5, -61); g.lineTo(9, -54); g.lineTo(6, -51.5); g.quadraticCurveTo(0, -50.5, -6.5, -52); g.closePath(); g.fill();
    g.fillStyle = pal.steelHi; g.fillRect(-4, -67.5, 6, 1);
    g.strokeStyle = pal.helmLine; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -56); g.lineTo(5, -55); g.moveTo(-1, -66); g.lineTo(-2, -52); g.stroke();
    g.fillStyle = pal.slot; g.fillRect(2, -61, 8, 3); g.fillRect(6.5, -61, 3, 7);
    g.fillStyle = vis; g.fillRect(2.5, -60.5, 7.5, 1.6); g.fillRect(7, -60.5, 2, 6);
    g.fillStyle = pal.visorHot; g.fillRect(7.5, -60.2, 2.5, 1);
    lit(g, L, 7, -59.7, 9 + roar * 6, pal.visorGlow, dim ? 0.25 : 0.6);
    g.strokeStyle = pal.iron; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-1, -63); g.quadraticCurveTo(4, -65, 3, -73); g.stroke(); // the near horn
    g.strokeStyle = pal.steelHi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-0.5, -64); g.quadraticCurveTo(3.2, -65.8, 2.4, -72.5); g.stroke();
    if (ph2) moltenLine(g, pal, [[2.6, -70], [3, -73]], 0.8);
  } else {
    for (const s of [-1, 1]) {
      g.lineCap = 'round'; g.strokeStyle = pal.iron; g.lineWidth = 2.6; g.beginPath(); g.moveTo(s * 7.5, -62); g.quadraticCurveTo(s * 13, -64, s * 13.5, -72); g.stroke();
      g.strokeStyle = pal.steelHi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(s * 7.5, -63); g.quadraticCurveTo(s * 12.2, -64.8, s * 12.8, -71.5); g.stroke();
      if (ph2) moltenLine(g, pal, [[s * 13.2, -69], [s * 13.5, -72]], 0.8);
    }
    const hg = g.createLinearGradient(-8, -69, 8, -52); hg.addColorStop(0, pal.helm[view === 'back' ? 1 : 0]); hg.addColorStop(1, pal.helm[view === 'back' ? 0 : 1]);
    g.fillStyle = hg; g.beginPath(); g.moveTo(-7, -52); g.lineTo(-8.5, -61); g.quadraticCurveTo(-7, -68, 0, -69); g.quadraticCurveTo(7, -68, 8.5, -61); g.lineTo(7, -52); g.quadraticCurveTo(0, -50, -7, -52); g.closePath(); g.fill();
    if (view === 'back') { // a crest down the back of the helm, and the neck guard's lames
      g.fillStyle = pal.helmLine; g.fillRect(-0.5, -68, 1, 15); g.fillStyle = pal.steelHi; g.fillRect(-2.5, -66, 1, 10);
      g.strokeStyle = pal.helmLine; g.lineWidth = 1; g.beginPath(); for (const y of [-56.5, -54]) { g.moveTo(-7.5, y); g.quadraticCurveTo(0, y + 1.5, 7.5, y); } g.stroke();
      g.strokeStyle = pal.steelHi; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-7, -55.5); g.quadraticCurveTo(0, -54, 7, -55.5); g.stroke();
    } else {
      g.fillStyle = pal.steelHi; g.fillRect(-0.5, -68, 1, 6);
      g.strokeStyle = pal.helmLine; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -55); g.lineTo(-2, -53); g.moveTo(6, -55); g.lineTo(2, -53); g.stroke();
      g.fillStyle = pal.slot; g.fillRect(-6.5, -61, 13, 3); g.fillRect(-1.5, -61, 3, 7);
      g.fillStyle = vis; g.fillRect(-6, -60.5, 12, 1.6); g.fillRect(-1, -60.5, 2, 6);
      g.fillStyle = pal.visorHot; g.fillRect(-4.5, -60.2, 2.5, 1); g.fillRect(2, -60.2, 2.5, 1);
      for (const s of [-1, 1]) lit(g, L, s * 3, -59.7, 9 + roar * 6, pal.visorGlow, dim ? 0.25 : ph2 ? 0.85 : 0.6);
    }
  }
  if (uk > 0.1) { // fire splitting the helm
    const run = clamp01((uk - 0.1) / 0.35), pts = view === 'side' ? [[-5, -66], [-3, -62], [-5, -58], [-3, -54]] : [[4, -67], [2.5, -64], [4.5, -62], [3, -58]];
    moltenLine(g, pal, pts.slice(0, Math.max(2, Math.round(pts.length * run))), 0.5 + 0.5 * run, 0.8);
  }
  if (view !== 'side') { g.fillStyle = pal.band; g.fillRect(-7, -66, 14, 2); g.fillStyle = pal.studs; for (const x of [-5, 0, 5]) g.fillRect(x - 0.5, -65.6, 1, 1); }
  else { g.fillStyle = pal.band; g.fillRect(-7.5, -66, 15, 2); g.fillStyle = pal.studs; for (const x of [-4, 1, 6]) g.fillRect(x - 0.5, -65.6, 1, 1); }
  g.restore();
}

// Behind, a torn half-cape from under each shoulder plate, down over the flanks.
function halfCapes(g, pal, t) {
  for (const s of [-1, 1]) {
    const sw = Math.sin(t * 3 + s) * 1.2, kg = g.createLinearGradient(0, -52, 0, -26);
    kg.addColorStop(0, pal.cloak[0]); kg.addColorStop(1, pal.cloak[2]); g.fillStyle = kg;
    poly(g, [[s * 9.5, -52], [s * 15, -50], [s * 16 + sw, -36], [s * 15 + sw, -27], [s * 13.5 + sw, -30], [s * 12 + sw, -26], [s * 10.5, -33], [s * 9.5, -44]]);
  }
}

// The moment it comes Unbound: its plates blasting away from it.
function flyingPlates(g, pal, pt) {
  if (pt >= 0.6) return;
  const a = 1 - pt / 0.6;
  g.save(); g.globalAlpha *= a;
  [[-8, -42, -70, -60, 5], [8, -42, 75, -50, -6], [-19, -50, -95, -85, 7], [19, -50, 95, -80, -8], [-5, -33, -45, 5, 4], [6, -34, 55, 10, -5]].forEach(([x, y, vx, vy, w], i) => {
    const px = x + vx * pt, py = y + vy * pt + 160 * pt * pt;
    g.save(); g.translate(px, py); g.rotate(w * pt);
    g.fillStyle = i % 2 ? pal.plateDark : pal.plate; poly(g, [[-5, -4], [4, -5], [6, 1], [1, 4], [-4, 3]]);
    moltenLine(g, pal, [[-4, 3], [1, 4], [6, 1]], a);
    g.restore();
  });
  g.restore();
}

// ---------------------------------------------------------------- the painter
export function paintCinder(g, b, L, pal = CINDER_PAL) {
  const view = b.view || 'front', side = view === 'side', back = view === 'back';
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, op = ventOpen(b), uk = unboundK(b);
  const hot = st === 'vent' ? 1 : ph2 ? 0.6 : uk * 1.5, ncr = ph2 ? 10 : st === 'transform' ? 3 + Math.round(uk * 15) : 3;
  const jit = st === 'transform' ? Math.sin(t * 61) * uk * 1.6 : 0; // the plates rattling loose
  const hands = cinderHands(b), sw = ph2 ? cinderSword(b) : null;
  g.save(); g.translate(0, cinderHover(b));
  if (sw?.behind) sword(g, pal, L, sw, t, op);
  for (const h of hands) if (h.behind) gauntlet(g, pal, h, L, hot);
  skirt(g, pal, t, ph2, hot, view);
  if (side) {
    if (ph2) { cageSide(g, pal, L, t, op); stubs(g, pal, t, true); } else { chestSide(g, pal, L, t, op, hot, ncr, jit); pauldronSide(g, pal, hot, jit); }
    g.fillStyle = pal.belt; g.fillRect(-8, -31, 17, 3); g.fillStyle = pal.core; g.fillRect(6.5, -31, 2.5, 3); lit(g, L, 8, -29.5, 6, pal.buckleGlow, 0.5);
  } else {
    if (ph2) { cage(g, pal, L, t, op, back); stubs(g, pal, t, false); } else if (back) { backPlate(g, pal, L, t, op, hot, jit); halfCapes(g, pal, t); pauldrons(g, pal, t, hot, jit, true); } else {
      pauldrons(g, pal, t, hot, jit, false); chestFront(g, pal, L, t, op, hot, ncr, jit);
    }
    g.fillStyle = pal.belt; g.fillRect(-10, -31, 20, 3);
    if (!back) { g.fillStyle = pal.core; g.fillRect(-1.5, -31, 3, 3); lit(g, L, 0, -29.5, 6, pal.buckleGlow, 0.5); }
  }
  g.fillStyle = pal.iron; g.fillRect(side ? -4 : -5, -54, side ? 8 : 10, 4);
  helm(g, pal, L, b, view, ph2, uk);
  if (sw && !sw.behind) sword(g, pal, L, sw, t, op);
  for (const h of hands) if (!h.behind) gauntlet(g, pal, h, L, hot);
  if (ph2) flyingPlates(g, pal, b.phaseT ?? 9);
  g.restore();
}

// ---------------------------------------------------------------- world effects
// Fire and smoke drawn straight onto the world (never outlined): the crown of living flame (a pillar
// of fire, Unbound), rising embers, smoke under the skirt, heat shimmer over an open core or vent,
// flames off the greatsword and the arc of its sweep.
export function fxCinder(g, b, x, y, a = 1, scale = 1) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, op = ventOpen(b), uk = unboundK(b), hy = y + cinderHover(b) * scale;
  const view = b.view || 'front', f = view === 'side' ? (b.face ?? 1) < 0 ? -1 : 1 : 1, hx = x + (view === 'side' ? f * 1 : 0) * scale;
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  for (let i = 0; i < 5; i++) {
    const p = ((t * 0.6 + i / 5) % 1), sx = x + (hash(i, 1) - 0.5) * 22 * scale - (view === 'side' ? f * p * 10 * scale : 0);
    g.fillStyle = `rgba(30,18,20,${0.35 * (1 - p) * a})`; g.beginPath(); g.ellipse(sx, hy + (2 + p * 10) * scale, (4 + p * 6) * scale, (2 + p * 2) * scale, 0, 0, TAU); g.fill();
  }
  const cy = hy - (st === 'vent' ? 64 : 66) * scale;
  if (ph2) { // the pillar: one tall flame with tongues licking up round it and wisps tearing off its top
    const k = clamp01(((b.phaseT ?? 9) - 0.1) / 0.5), weak = st === 'vent', H = (14 + 32 * easeOut(k)) * (weak ? 0.45 : 1) * scale;
    glow(g, hx, cy - H * 0.5, 10 * scale + H * 0.5, '255,140,50', 0.5);
    const tongue = (dx, y, h, kk, sq) => { g.save(); g.translate(hx + dx * scale, y); g.scale(sq, 1); flameTongue(g, 0, 0, h, t, kk, weak); g.restore(); };
    for (const [dx, f, kk, sq] of [[-6, 0.38, 0, 0.8], [6, 0.44, 1, 0.8], [-3, 0.66, 2, 0.6], [3, 0.6, 3, 0.6], [0, 1, 4, 0.42]]) tongue(dx, cy, H * f, kk, sq);
    for (let i = 0; i < 3; i++) { const p = (t * 1.4 + i / 3) % 1; tongue(Math.sin(t * 3 + i * 2) * 3, cy - H * (0.6 + p * 0.55), H * 0.22 * (1 - p), i + 9, 0.6); }
  } else {
    const fs = (st === 'vent' ? 0.45 : 1 + uk * 2.4) * (1 + roarK(b) * 0.5) * scale;
    glow(g, hx, cy - 6 * fs, 12 * fs + 8 * scale, '255,140,50', 0.5);
    for (const [dx, h, k] of [[-5.5, 7, 0], [5.5, 7, 1], [-3, 10, 2], [3, 10, 3], [0, 14, 4]]) flameTongue(g, hx + dx * scale, cy, h * fs, t, k, st === 'vent');
  }
  for (let i = 0; i < (ph2 ? 26 : 15); i++) {
    const life = 1.2 + hash(i, 3), p = ((t + hash(i, 4) * life) % life) / life;
    const ex = x + ((hash(i, 5) - 0.5) * 34 + Math.sin(t * 2 + i) * 3) * scale, ey = hy + (-2 - p * (30 + hash(i, 6) * 40)) * scale;
    g.globalAlpha = a * Math.sin(p * Math.PI);
    g.fillStyle = hash(i, 7) < 0.5 ? '#ffb040' : '#ff6a20'; g.fillRect(Math.round(ex), Math.round(ey), Math.max(1, Math.round(scale)), Math.max(1, Math.round(scale)));
  }
  g.globalAlpha = a;
  const vent = Math.max(op, ph2 ? 0.25 : 0);
  if (vent > 0) { // heat shimmer off the open core, or off the vents in its back
    g.strokeStyle = `rgba(255,240,200,${0.3 * vent})`; g.lineWidth = scale;
    g.beginPath();
    for (let k = 0; k < 3; k++) { const bx = hx + (k - 1) * 5 * scale; g.moveTo(bx, hy - 46 * scale); for (let j = 1; j <= 6; j++) g.lineTo(bx + Math.sin(t * 12 + j + k) * 1.5 * scale, hy - (46 + j * 4) * scale); }
    g.stroke();
  }
  if (op > 0 && view === 'back') for (let i = 0; i < 14; i++) { // sparks blasting out of the back vents
    const p = ((t * 1.8 + hash(i, 11)) % 1), sx = hx + (hash(i, 12) - 0.5) * 18 * scale + (hash(i, 13) - 0.5) * p * 20 * scale, sy = hy - (40 + p * 34) * scale;
    g.globalAlpha = a * op * (1 - p); g.fillStyle = i % 3 ? '#ffb040' : '#fff0c0'; g.fillRect(Math.round(sx), Math.round(sy), Math.max(1, Math.round(scale)), Math.max(1, Math.round(scale)) + (i % 2));
  }
  g.globalAlpha = a;
  if (ph2) { // the greatsword's flames, and the arc of fire its sweep leaves
    const sw = cinderSword(b), k = easeOut(sw.k);
    if (k > 0) for (let i = 0; i < 4; i++) {
      const u = 5 + sw.len * k * (i + 0.5) / 4, px = x + f * (sw.x + sw.dx * u) * scale, py = hy + (sw.y + sw.dy * u) * scale;
      flameTongue(g, px + Math.sin(t * 7 + i) * scale, py, (5 + hash(i, 21) * 3) * scale * (1 - op * 0.5), t * 1.3, i + 7, op > 0.5);
    }
    if (k > 0) glow(g, x + f * (sw.x + sw.dx * sw.len * 0.5) * scale, hy + (sw.y + sw.dy * sw.len * 0.5) * scale, (14 + sw.len * 0.4) * scale, '255,120,30', 0.3 * (1 - op * 0.6));
    const q = st === 'sweep' ? 1 - (b.timer ?? 0) / SWEEP - STRIKE / SWEEP : -1;
    if (q > -0.02 && q < 0.3) {
      const a0 = Math.atan2(b.cdy || 0, b.cdx || 1), e = clamp01(q / 0.3);
      for (const [r, col] of [[30, '255,240,190'], [44, '255,170,60'], [58, '255,90,20']]) {
        g.globalAlpha = a * (1 - e); g.strokeStyle = `rgb(${col})`; g.lineWidth = 3 * scale;
        g.beginPath(); g.ellipse(x, y - 4 * scale, r * scale, r * 0.7 * scale, 0, a0 - 1, a0 - 1 + 2 * easeOut(clamp01((q + 0.02) / 0.12))); g.stroke();
      }
    }
  }
  g.restore();
}

// Meteors falling on their marks, from the upper right, each landing as its zone strikes.
export function drawMeteors(g, b, zones, cam) {
  for (const z of zones) {
    if (z.owner !== b || !z.meteor || z.t <= 0 || z.t > 0.8) continue;
    const x = z.x - cam.left, y = z.y - cam.top, h = z.t * 230, k = 1 - z.t / 0.8;
    g.fillStyle = `rgba(0,0,0,${0.15 + 0.3 * k})`; g.beginPath(); g.ellipse(x, y, 3 + k * 9, 1.5 + k * 4, 0, 0, TAU); g.fill();
    const mx = x + h * 0.45, my = y - h;
    for (let i = 5; i > 0; i--) { g.fillStyle = `rgba(255,${120 + i * 15},40,${0.5 - i * 0.08})`; g.beginPath(); g.arc(mx + i * 4.5, my - i * 10, 4.5 - i * 0.6, 0, TAU); g.fill(); }
    glow(g, mx, my, 16, '255,140,50', 0.6);
    g.fillStyle = '#5a2010'; g.beginPath(); g.arc(mx, my, 4.5, 0, TAU); g.fill();
    g.fillStyle = '#ff7a20'; g.beginPath(); g.arc(mx - 0.5, my + 0.5, 3.4, 0, TAU); g.fill();
    g.fillStyle = '#fff0b0'; g.fillRect(Math.round(mx) - 1, Math.round(my), 2, 2);
  }
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
