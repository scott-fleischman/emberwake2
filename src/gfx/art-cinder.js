// The Cinder Warden's art: a floating obsidian knight. The painter draws around its feet facing the
// camera (b.view 'front', the default), from behind ('back'), or turned to the right ('side', see
// bossart.js); every colour comes from a palette, so another body can wear it.
import { TAU, clamp01, lerp, hash, poly, line, disc, mix, roarK, lit, glow, flameTongue } from './bossart.js';

export const CINDER_PAL = {
  molten: '255,96,20', moltenHi: '255,238,160',
  cuff: '#261c20', cuffHi: '#4e3e42', spikes: '#140e10', hand: '#342a2e', handHi: '#5c4a4e', iron: '#1a1214',
  palm: '#ffe9a0', palmCore: '#ffffff', palmGlow: '255,160,60',
  cloak: ['#20141a', '#341410', '#5c1c0c'], folds: 'rgba(0,0,0,0.5)',
  hem: [255, 100, 40], // its green rises 30 a phase
  coreHot: '#ffffff', coreMid: '#fff2a8', core: '#ff9a30', coreEdge: '255,80,20', coreGlow: '255,230,150',
  plate: '#34282c', plateDark: '#241a1e', plateEdge: '#64525a',
  chest: '#3c2e32', chestDark: '#211719', chestHot: '#7a3a2a', chestHotDark: '#5a2a1e',
  seam: '#0e0809', ridge: '#665458', ridgeDark: '#3e3236', seamGlow: '255,214,110', crackGlow: '255,120,40',
  belt: '#140c0e', buckleGlow: '255,150,50',
  helm: ['#4c3c40', '#140e10'], steelHi: '#5c4c50', helmLine: '#0c0708', slot: '#0a0506',
  visor: '#ffb040', visorDim: '#a05020', visorHot: '#fff6d0', visorGlow: '255,170,60', band: '#4a2a16', studs: '#ff8a30',
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
export const cinderHover = (b) => (b.state === 'vent' ? 2 : -6 + Math.sin((b.anim || 0) * 3) * 2);
export const ventOpen = (b) => (b.state === 'vent' ? clamp01(Math.min(((b.phase === 3 ? 1.4 : 1.9) - (b.timer || 0)) / 0.25, (b.timer || 0) / 0.2)) : 0);

function moltenLine(g, pal, pts, a = 1, w = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [lw, col] of [[1.9 * w, `rgba(${pal.molten},${a})`], [0.75 * w, `rgba(${pal.moltenHi},${a})`]]) { g.strokeStyle = col; g.lineWidth = lw; line(g, pts); }
}

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

function gauntlet(g, pal, h, L, hot) {
  g.save(); g.translate(h.x, h.y); g.rotate(h.rot); g.scale(h.s, 1);
  g.fillStyle = pal.cuff; poly(g, [[-6, -10], [3, -11], [4.5, -3], [-5, -2]]);
  g.fillStyle = pal.cuffHi; g.fillRect(-5.5, -10.5, 8, 1);
  g.fillStyle = pal.spikes; poly(g, [[-4, -10], [-8.5, -15.5], [-1, -10.5]]);
  g.fillStyle = pal.hand; poly(g, [[-5.5, -3], [5.5, -4], [7, 2], [-4.5, 3.5]]);
  g.fillStyle = pal.handHi; g.fillRect(-4.5, -3.5, 9, 1);
  g.strokeStyle = pal.iron; g.lineWidth = 1.8; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const bx = -3 + i * 3, sp = (i - 1.5) * h.open * 1.8; g.beginPath(); g.moveTo(bx, 2.5); g.quadraticCurveTo(bx + sp, 6, bx + sp * 1.6 + (1 - h.open) * 1.5, 8 - h.open * 1.5); g.stroke(); }
  moltenLine(g, pal, [[-4.5, 0], [0, -0.5], [6, -1]], 0.6 + hot * 0.4);
  if (h.glow > 0.15) { g.fillStyle = pal.palm; disc(g, 1, 8, 1 + h.glow * 2.5); g.fillStyle = pal.palmCore; disc(g, 1, 8, h.glow * 1.2); }
  if (h.glow > 0) lit(g, L, 1, 8, 8 + h.glow * 12, pal.palmGlow, 0.3 + h.glow * 0.5);
  g.restore();
}

export function paintCinder(g, b, L, pal = CINDER_PAL) {
  const view = b.view || 'front', back = view === 'back', side = view === 'side';
  const t = b.anim || 0, st = b.state, ph = b.phase || 1, op = back ? 0 : ventOpen(b), pulse = 0.75 + 0.25 * Math.sin(t * 5);
  const hot = st === 'vent' ? 1 : ph === 3 ? 0.6 : ph === 2 ? 0.3 : 0;
  g.save(); g.translate(0, cinderHover(b));
  if (side) g.scale(0.72, 1); // turned side-on: narrower, its far pauldron hidden, the visor forward (rough)
  // smoke-and-ember cloak, no legs
  const hem = (i) => [-19 + i * 4.75, (i % 2 ? -6 : 1) + Math.sin(t * 7 + i * 1.7) * 2];
  const cg = g.createLinearGradient(0, -30, 0, 2);
  cg.addColorStop(0, pal.cloak[0]); cg.addColorStop(0.55, pal.cloak[1]); cg.addColorStop(1, pal.cloak[2]);
  g.fillStyle = cg;
  g.beginPath(); g.moveTo(-10, -30); g.quadraticCurveTo(-14, -16, ...hem(0));
  for (let i = 1; i <= 8; i++) g.lineTo(...hem(i));
  g.quadraticCurveTo(14, -16, 10, -30); g.closePath(); g.fill();
  g.strokeStyle = pal.folds; g.lineWidth = 1.2; g.beginPath();
  for (const x of [-6, 0, 6]) { g.moveTo(x * 0.6, -28); g.quadraticCurveTo(x * 1.2 + Math.sin(t * 3 + x) * 1.5, -14, x * 2.2, -3); }
  g.stroke();
  const hc = pal.hem;
  g.strokeStyle = `rgba(${hc[0]},${hc[1] + ph * 30},${hc[2]},${0.75 * pulse})`; g.lineWidth = 1.5; g.lineJoin = 'round';
  g.beginPath(); for (let i = 0; i <= 8; i++) { const [x, y] = hem(i); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  // the white-hot core behind the chest plates
  if (op > 0) {
    const r = 4 + op * 7.5 + Math.sin(t * 22) * 0.8, cgr = g.createRadialGradient(0, -40, 0, 0, -40, r);
    cgr.addColorStop(0, pal.coreHot); cgr.addColorStop(0.35, pal.coreMid); cgr.addColorStop(0.75, pal.core); cgr.addColorStop(1, `rgba(${pal.coreEdge},0)`);
    g.fillStyle = cgr; disc(g, 0, -40, r);
    lit(g, L, 0, -40, 22 + op * 20, pal.coreGlow, 0.8 * op);
  }
  // pauldrons
  for (const s of side ? [1] : [-1, 1]) {
    g.save(); g.scale(s, 1);
    g.fillStyle = pal.spikes; poly(g, [[14, -53], [17, -64], [19.5, -53]]); poly(g, [[19, -51], [26, -59], [23.5, -48]]);
    g.fillStyle = s < 0 ? pal.plate : pal.plateDark;
    g.beginPath(); g.moveTo(10, -53); g.quadraticCurveTo(20, -57, 25.5, -48); g.lineTo(22.5, -40.5); g.quadraticCurveTo(16, -44, 11, -43); g.closePath(); g.fill();
    g.strokeStyle = pal.plateEdge; g.lineWidth = 1; g.beginPath(); g.moveTo(11, -53); g.quadraticCurveTo(20, -56, 24.5, -48.5); g.stroke();
    moltenLine(g, pal, [[12, -44], [17, -45], [22, -42]], 0.55 + hot * 0.45);
    if (ph === 3) moltenLine(g, pal, [[18, -54], [19, -50], [17, -47]], pulse);
    g.restore();
  }
  // from behind, the cloak hangs over the back plate from the shoulders
  if (back) {
    const kg = g.createLinearGradient(0, -53, 0, -24);
    kg.addColorStop(0, pal.cloak[0]); kg.addColorStop(0.6, pal.cloak[1]); kg.addColorStop(1, pal.cloak[2]);
    g.fillStyle = kg; g.beginPath(); g.moveTo(-12, -52); g.quadraticCurveTo(0, -55, 12, -52); g.lineTo(14, -26); g.quadraticCurveTo(0, -22 + Math.sin(t * 4) * 1.5, -14, -26); g.closePath(); g.fill();
    g.strokeStyle = pal.folds; g.lineWidth = 1.2; g.beginPath(); for (const x of [-6, 0, 6]) { g.moveTo(x * 0.8, -51); g.quadraticCurveTo(x + Math.sin(t * 3 + x) * 1.2, -38, x * 1.5, -25); } g.stroke();
    g.strokeStyle = `rgba(${hc[0]},${hc[1] + ph * 30},${hc[2]},${0.6 * pulse})`; g.lineWidth = 1; g.beginPath(); g.moveTo(-14, -26); g.quadraticCurveTo(0, -22 + Math.sin(t * 4) * 1.5, 14, -26); g.stroke();
  }
  // breastplate in two halves that part to vent
  if (!back) for (const s of [-1, 1]) {
    g.save(); g.translate(s * 4 * op, 0); g.rotate(s * 0.12 * op);
    g.fillStyle = s < 0 ? mix(pal.chest, pal.chestHot, hot * 0.5) : mix(pal.chestDark, pal.chestHotDark, hot * 0.5);
    poly(g, [[0, -51], [s * 13, -51], [s * 14.5, -42], [s * 9, -29], [0, -29]]);
    g.strokeStyle = pal.seam; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -43); g.lineTo(s * 14.2, -43); g.moveTo(0, -36); g.lineTo(s * 11.6, -36); g.stroke();
    g.strokeStyle = s < 0 ? pal.ridge : pal.ridgeDark; g.beginPath(); g.moveTo(s * 0.5, -42); g.lineTo(s * 13.8, -42); g.moveTo(s * 0.5, -35); g.lineTo(s * 11.2, -35); g.moveTo(s * 1, -50); g.lineTo(s * 12.5, -50); g.stroke();
    if (op > 0) { g.strokeStyle = `rgba(${pal.seamGlow},${op})`; g.lineWidth = 1.5; line(g, [[0, -51], [0, -29]]); }
    CW_CRACKS.slice(0, [3, 6, 10][ph - 1] || 10).forEach((c, k) => {
      if (Math.sign(c[0][0]) !== s) return;
      moltenLine(g, pal, c, 0.65 + 0.35 * Math.sin(t * 4 + k) + hot * 0.2);
      lit(g, L, c[1][0], c[1][1], 5 + hot * 3, pal.crackGlow, 0.25 + hot * 0.15);
    });
    g.restore();
  }
  g.fillStyle = pal.belt; g.fillRect(-10, -31, 20, 3);
  g.fillStyle = pal.core; g.fillRect(-1.5, -31, 3, 3); lit(g, L, 0, -29.5, 6, pal.buckleGlow, 0.5);
  g.fillStyle = pal.iron; g.fillRect(-5, -54, 10, 4);
  // horned great helm with a burning T-visor
  g.save(); if (st === 'vent') { g.translate(0, 2); g.rotate(0.06 * Math.sin(t * 2)); }
  for (const s of [-1, 1]) {
    g.lineCap = 'round'; g.strokeStyle = pal.iron; g.lineWidth = 2.6; g.beginPath(); g.moveTo(s * 7.5, -62); g.quadraticCurveTo(s * 13, -64, s * 13.5, -72); g.stroke();
    g.strokeStyle = pal.steelHi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(s * 7.5, -63); g.quadraticCurveTo(s * 12.2, -64.8, s * 12.8, -71.5); g.stroke();
  }
  const hg = g.createLinearGradient(-8, -69, 8, -52); hg.addColorStop(0, pal.helm[0]); hg.addColorStop(1, pal.helm[1]);
  g.fillStyle = hg; g.beginPath(); g.moveTo(-7, -52); g.lineTo(-8.5, -61); g.quadraticCurveTo(-7, -68, 0, -69); g.quadraticCurveTo(7, -68, 8.5, -61); g.lineTo(7, -52); g.quadraticCurveTo(0, -50, -7, -52); g.closePath(); g.fill();
  g.fillStyle = pal.steelHi; g.fillRect(-0.5, -68, 1, 6);
  g.strokeStyle = pal.helmLine; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -55); g.lineTo(-2, -53); g.moveTo(6, -55); g.lineTo(2, -53); g.stroke();
  if (back) { g.fillStyle = pal.helmLine; g.fillRect(-0.5, -66, 1, 13); g.fillStyle = pal.steelHi; g.fillRect(-2.5, -64, 1, 9); }
  else if (side) { // the visor slot wraps round to the front
    g.fillStyle = pal.slot; g.fillRect(1, -61, 8, 3); g.fillRect(4.5, -61, 3, 7);
    g.fillStyle = st === 'vent' ? pal.visorDim : pal.visor; g.fillRect(1.5, -60.5, 7.5, 1.6); g.fillRect(5, -60.5, 2, 6);
    g.fillStyle = pal.visorHot; g.fillRect(6.5, -60.2, 2.5, 1);
    lit(g, L, 6, -59.7, 9 + roarK(b) * 6, pal.visorGlow, st === 'vent' ? 0.25 : 0.6);
  } else {
    g.fillStyle = pal.slot; g.fillRect(-6.5, -61, 13, 3); g.fillRect(-1.5, -61, 3, 7);
    g.fillStyle = st === 'vent' ? pal.visorDim : pal.visor; g.fillRect(-6, -60.5, 12, 1.6); g.fillRect(-1, -60.5, 2, 6);
    g.fillStyle = pal.visorHot; g.fillRect(-4.5, -60.2, 2.5, 1); g.fillRect(2, -60.2, 2.5, 1);
    for (const s of [-1, 1]) lit(g, L, s * 3, -59.7, 9 + roarK(b) * 6, pal.visorGlow, st === 'vent' ? 0.25 : 0.6);
  }
  g.fillStyle = pal.band; g.fillRect(-7, -66, 14, 2); g.fillStyle = pal.studs; for (const x of [-5, 0, 5]) g.fillRect(x - 0.5, -65.6, 1, 1);
  g.restore();
  for (const h of cinderHands(b)) gauntlet(g, pal, h, L, hot);
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
