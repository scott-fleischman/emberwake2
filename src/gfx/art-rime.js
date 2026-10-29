// The Rime Sovereign's art: a crystalline owl-queen. The painter draws around her feet facing
// right (see bossart.js); every colour comes from a palette, so another body can wear it.
import { TAU, clamp01, lerp, hash, poly, line, disc, roarK, lit, glow, dizzyStars } from './bossart.js';

export const RIME_PAL = {
  shard: '#e6f9ff', shardB: '#ccecff', shardShade: '#76b2e0', shardShadeB: '#5a92c6', shardEdge: 'rgba(255,255,255,0.85)',
  arm: '#5a92c6', armHi: '#e6f9ff',
  gown: ['#e8f9ff', '#a4d4f2', '#4a7cb2'], gownLight: 'rgba(255,255,255,0.55)', gownShade: 'rgba(30,70,130,0.4)',
  facets: ['#f0fcff', '#c4eaff', '#78b2de', '#5890c4', '#8ec6ea', '#d6f2ff'], facetEdge: 'rgba(255,255,255,0.8)',
  gem: '#40c8ff', glint: '#ffffff', gemGlow: '120,210,255',
  ruff: '#a6d6f4', ruffHi: '#dff6ff', tuft: '#e4f8ff', tuftShade: '#78b2de', face: '#b4def6',
  icicle: '#f2fcff', icicleShade: '#88c4ec', band: '#9ad2f2', mask: '#f6fdff', maskLine: '#7ab4de',
  socket: '#12304c', daze: '#6ab8e8', eye: '#3cc8ff', eyeGlow: '110,210,255', brow: '#2a5a8a', beak: '#e4d48a',
};

export const rimeHover = (b) => -8 + Math.sin((b.anim || 0) * 2) * 2 + (b.state === 'skid' || b.state === 'stunned' ? 5 : 0);

function shard(g, pal, px, py, ang, len, w, s, u) {
  const dx = Math.sin(ang) * s, dy = -Math.cos(ang), nx = -dy, ny = dx;
  const tx = px + dx * len, ty = py + dy * len, mx = px + dx * len * 0.38, my = py + dy * len * 0.38;
  g.fillStyle = u < 0.5 ? pal.shard : pal.shardB; poly(g, [[px, py], [mx + nx * w, my + ny * w], [tx, ty]]);
  g.fillStyle = u < 0.5 ? pal.shardShade : pal.shardShadeB; poly(g, [[px, py], [mx - nx * w, my - ny * w], [tx, ty]]);
  g.strokeStyle = pal.shardEdge; g.lineWidth = 0.7; line(g, [[mx, my], [tx, ty]]);
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

export function paintRime(g, b, L, pal = RIME_PAL) {
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
      shard(g, pal, bx, by, lerp(W.a0, W.a1, u) + W.flap * (1 - u * 0.6) + tw, len, lerp(3.4, 2.4, u), s, u);
    }
    g.lineCap = 'round'; g.strokeStyle = pal.arm; g.lineWidth = 3.2; line(g, [[sx, sy], [wx, wy]]);
    g.strokeStyle = pal.armHi; g.lineWidth = 1.4; line(g, [[sx, sy - 0.8], [wx, wy - 0.8]]);
    for (let i = 0; i < 3; i++) { const u = (i + 0.5) / 3; shard(g, pal, lerp(sx, wx, u), lerp(sy, wy, u), lerp(W.a1, W.a0, u) * 0.85 + 0.25, 9, 2.4, s, 0.3); }
  }
  // gown of frost mist
  const sway = Math.sin(t * 1.7) * 1.5 - clamp01(Math.abs(b.mvx || 0) / 200) * Math.sign(b.mvx || 0) * 3;
  const hem = (i) => [-15 + i * 5 + sway, -3 + (i % 2 ? -3 : 1) + Math.sin(t * 3 + i * 1.3) * 1.5];
  const gg = g.createLinearGradient(0, -33, 0, 0); gg.addColorStop(0, pal.gown[0]); gg.addColorStop(0.45, pal.gown[1]); gg.addColorStop(1, pal.gown[2]);
  g.fillStyle = gg; g.beginPath(); g.moveTo(-7, -33); g.quadraticCurveTo(-11, -18, ...hem(0)); for (let i = 1; i <= 6; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(11, -18, 7, -33); g.closePath(); g.fill();
  g.lineWidth = 1;
  g.strokeStyle = pal.gownLight; g.beginPath(); for (const x of [-4, 1, 5]) { g.moveTo(x * 0.5, -31); g.quadraticCurveTo(x + sway * 0.5, -18, x * 1.8 + sway, -5); } g.stroke();
  g.strokeStyle = pal.gownShade; g.beginPath(); for (const x of [-2, 3]) { g.moveTo(x * 0.5, -30); g.quadraticCurveTo(x + sway * 0.6, -16, x * 2.2 + sway, -4); } g.stroke();
  // faceted crystal bodice
  const V = [[-8, -47], [0, -52], [8, -47], [6.5, -33], [0, -29], [-6.5, -33]];
  pal.facets.forEach((c, i) => { g.fillStyle = c; poly(g, [[0, -40], V[i], V[(i + 1) % 6]]); });
  g.strokeStyle = pal.facetEdge; g.lineWidth = 0.6; g.beginPath(); for (const v of V) { g.moveTo(0, -40); g.lineTo(...v); } g.stroke();
  g.fillStyle = pal.gem; poly(g, [[0, -42.5], [2, -40], [0, -37.5], [-2, -40]]); g.fillStyle = pal.glint; g.fillRect(-0.5, -41.5, 1, 1);
  lit(g, L, 0, -40, 8 + ph * 2 + roar * 6, pal.gemGlow, 0.5);
  // owl ruff of ice feathers
  for (let k = 0; k < 9; k++) { const x = -10 + k * 2.5; g.fillStyle = k % 2 ? pal.ruffHi : pal.ruff; poly(g, [[x - 1.8, -51], [x + 1.8, -51], [x * 1.25, -45 + Math.abs(x) * 0.15]]); }
  // head: ear tufts, crown of icicles, heart-shaped facial disc and burning blue eyes
  g.save(); g.translate(0, -58); if (st === 'stunned') g.rotate(Math.sin(t * 2.5) * 0.15 - 0.12);
  for (const s of [-1, 1]) { g.fillStyle = pal.tuft; poly(g, [[s * 3, -5], [s * 10, -13], [s * 7.5, -2]]); g.fillStyle = pal.tuftShade; poly(g, [[s * 5.5, -4], [s * 10, -13], [s * 7.5, -2]]); }
  g.fillStyle = pal.face; g.beginPath(); g.ellipse(0, 0, 8, 7, 0, 0, TAU); g.fill();
  const cs = (1 + (ph - 1) * 0.28) * (1 + roar * 0.15);
  g.save(); if (st === 'stunned') { g.translate(0, -5); g.rotate(-0.3); g.translate(0, 5); }
  for (const [x, h0] of [[-6, 6], [-3, 9], [0, 14], [3, 9], [6, 6]]) { const h = h0 * cs; g.fillStyle = pal.icicle; poly(g, [[x - 1.7, -5], [x, -5 - h], [x, -5]]); g.fillStyle = pal.icicleShade; poly(g, [[x, -5], [x, -5 - h], [x + 1.7, -5]]); }
  g.fillStyle = pal.band; g.fillRect(-7, -6.5, 14, 2); g.fillStyle = pal.gem; g.fillRect(-1, -6.5, 2, 2);
  lit(g, L, 0, -6, 6 + roar * 6, pal.gemGlow, 0.5);
  g.restore();
  g.fillStyle = pal.mask; disc(g, -3.4, -0.5, 3.9); disc(g, 3.4, -0.5, 3.9); poly(g, [[-7, 0.8], [7, 0.8], [0, 6.5]]);
  g.strokeStyle = pal.maskLine; g.lineWidth = 0.6; line(g, [[0, -3.5], [0, 1]]);
  const er = 1 + roar * 0.3 + (st === 'rain' ? 0.25 : 0);
  for (const s of [-1, 1]) {
    g.fillStyle = pal.socket; disc(g, s * 3.4, -0.6, 2.6);
    if (st === 'stunned') { g.strokeStyle = pal.daze; g.lineWidth = 0.7; g.beginPath(); g.arc(s * 3.4, -0.6, 1.5, t * 8, t * 8 + 4.5); g.stroke(); continue; }
    g.fillStyle = pal.eye; disc(g, s * 3.4, -0.6, 1.9 * er);
    g.fillStyle = pal.glint; disc(g, s * 3.4 - s * 0.4, -1, 0.85);
    lit(g, L, s * 3.4, -0.6, 9 * er, pal.eyeGlow, 0.65);
  }
  g.strokeStyle = pal.brow; g.lineWidth = 1; g.beginPath(); for (const s of [-1, 1]) { g.moveTo(s * 7, -4.5); g.lineTo(s * 1.5, -2.6); } g.stroke();
  g.fillStyle = pal.beak; poly(g, [[-1.3, 1.5], [1.3, 1.5], [0, 4.8]]);
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
