// Thornmaw's art: a boar of woven roots with a flytrap maw. The painter draws around its feet
// facing right (see bossart.js), or head-on / from behind for b.view 'front' / 'back'; every colour
// comes from a palette, so another body can wear it.
import { TAU, easeOut, lerp, hash, poly, line, disc, roarK, lit, dizzyStars } from './bossart.js';

// A `2` key is the phase-2 colour of the key without it.
export const THORN_PAL = {
  ink: '#140c06',
  leg: '#4a3620', leg2: '#4e2e1a', legHi: '#806242', legHi2: '#8e5c3a', legFar: '#20150c', legFarHi: '#382616',
  claw: '#e8dcb4', clawFar: '#8a8068',
  spike: '#2c3c18', spikeHi: '#6e823c', spikeTip: '#ece2b4', spikeTip2: '#ff5a4a',
  petal: '#c4283c', petalHi: '#e2404e', petalShine: '#ff8a8a', pollen: '#ffd040',
  tail: '#2e2010', tailHi: '#5e4628', leaf: '#4e8a2e', leaf2: '#c03040',
  body: ['#6e6436', '#4a3822', '#20140a'], body2: ['#6e4c2e', '#4a2818', '#1e0c08'],
  root: '#5a4428', root2: '#5e3420', rootHi: '#a08452', rootHi2: '#b07050', knot: '#26180c', knotHi: '#9a7a48',
  belly: 'rgba(8,4,2,0.5)', sheen: 'rgba(255,240,170,0.10)',
  moss: '#35601e', moss2: '#3a5420', mossHi: '#6a9c3a', mossHi2: '#6a8a36',
  sepal: '#3a7024', sepal2: '#5a6a24', mawPetal: '#c8364a', mawPetal2: '#ea4656', vein: '#f08a8a', vein2: '#ffb0a0',
  throat: '#2c0810', gullet: '#7a1822', gullet2: '#ff7030', gulletGlow: '255,80,60', gulletGlow2: '255,120,40',
  jaw: '#3a5a1e', jawLine: '#22361a', gum: '#a02838', teeth: '#f2ead0', tusk: '#e8e0c0', tuskShade: '#a89c78', drool: '#d0607a',
  lid: '#6a8a36', lid2: '#7e6a30', lidBase: '#2e4a18', lidLine: '#1e2e10', lidShine: 'rgba(220,240,160,0.35)', brow: '#16240c',
  eye: '#ffe040', eye2: '#ff7a30', eyeGlow: '255,220,70', eyeGlow2: '255,110,40', eyeShut: '#9a8a40', glint: '#fffbe0',
  spit: 'rgba(220,240,200,0.5)',
};

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

function tmLeg(g, pal, hx, hy, fx, fy, bend, near, ph2) {
  const kx = (hx + fx) / 2 + bend, ky = (hy + fy) / 2 - 1;
  const col = near ? (ph2 ? pal.leg2 : pal.leg) : pal.legFar, hi = near ? (ph2 ? pal.legHi2 : pal.legHi) : pal.legFarHi;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (near) { // muscled haunch where the leg meets the body
    g.fillStyle = col; g.beginPath(); g.ellipse(hx + (hx < 0 ? -1 : 1), hy - 4, 7.5, 9, hx < 0 ? 0.3 : -0.2, 0, TAU); g.fill();
    g.strokeStyle = hi; g.lineWidth = 1.2; g.beginPath(); g.ellipse(hx + (hx < 0 ? -1 : 1), hy - 4, 6, 7.5, hx < 0 ? 0.3 : -0.2, 3.6, 5.4); g.stroke();
    g.strokeStyle = pal.ink; g.lineWidth = 1; g.beginPath(); g.ellipse(hx + (hx < 0 ? -1 : 1), hy - 4, 4, 5.5, 0.2, 0.2, 2.2); g.stroke();
  }
  g.strokeStyle = col; g.lineWidth = 9; line(g, [[hx, hy], [kx, ky]]);
  g.lineWidth = 6; line(g, [[kx, ky], [fx, fy - 2]]);
  g.strokeStyle = hi; g.lineWidth = 1.4; line(g, [[hx - 3, hy + 1], [kx - 2.5, ky], [fx - 2, fy - 3]]);
  g.strokeStyle = pal.ink; g.lineWidth = 1; line(g, [[kx - 3, ky - 1.5], [kx + 3, ky + 0.5]]); line(g, [[hx - 4, hy + 4], [hx + 4, hy + 6]]);
  g.fillStyle = col; g.beginPath(); g.ellipse(fx + 0.5, fy - 1, 4.5, 2, 0, 0, TAU); g.fill();
  g.fillStyle = near ? pal.claw : pal.clawFar;
  for (const cx of [1.5, 4, 6.2]) poly(g, [[fx + cx - 1.6, fy - 1.8], [fx + cx + 1.6, fy + 0.4], [fx + cx - 1.2, fy + 0.4]]);
}

// A root as a tube: dark edge, body, and a highlight along one side.
function tmTube(g, pal, ph2, w, path) {
  for (const [lw, col, o] of [[w + 1.4, pal.ink, 0], [w, ph2 ? pal.root2 : pal.root, 0], [Math.max(0.6, w * 0.3), ph2 ? pal.rootHi2 : pal.rootHi, -w * 0.3]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); path(o); g.stroke(); }
}

function thornSpike(g, pal, x, y, s, lean, tip) {
  const tx = x - s * 0.45 + lean, ty = y - s;
  g.fillStyle = pal.spike;
  g.beginPath(); g.moveTo(x - s * 0.3, y + 1); g.quadraticCurveTo(x - s * 0.1, y - s * 0.55, tx, ty); g.quadraticCurveTo(x + s * 0.12, y - s * 0.4, x + s * 0.32, y + 1); g.closePath(); g.fill();
  g.strokeStyle = pal.spikeHi; g.lineWidth = 1; g.beginPath(); g.moveTo(x + s * 0.2, y); g.quadraticCurveTo(x + s * 0.04, y - s * 0.42, tx, ty); g.stroke();
  const my = lerp(y, ty, 0.55);
  g.fillStyle = tip; poly(g, [[lerp(x - s * 0.2, tx, 0.55), my], [tx, ty], [lerp(x + s * 0.14, tx, 0.55), my + 0.5]]);
}

function bloom(g, pal, x, y, r, t, k) {
  if (r < 0.6) return;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + k + Math.sin(t * 2 + k) * 0.12;
    g.fillStyle = i % 2 ? pal.petal : pal.petalHi;
    g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.62, r * 0.4, a, 0, TAU); g.fill();
  }
  g.fillStyle = pal.petalShine; disc(g, x - r * 0.2, y - r * 0.25, r * 0.25);
  g.fillStyle = pal.pollen; disc(g, x, y, Math.max(0.8, r * 0.22));
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

export function paintThornmaw(g, b, L, pal = THORN_PAL) {
  if ((b.view || 'side') !== 'side') return paintThornmawFacing(g, b, L, pal, b.view === 'back');
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
    tmLeg(g, pal, hx, -13, fx, fy - bob, bend, near, ph2);
  };
  leg(-19, Math.PI, false); leg(5, 0, false);
  // vine tail with a leaf
  const sw = Math.sin(t * 3) * 3 + (P.moving ? Math.sin(cyc) * 2 : 0);
  g.lineCap = 'round'; g.strokeStyle = pal.tail; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(-29, -27); g.quadraticCurveTo(-39, -33 + sw, -44, -22 + sw * 0.6); g.stroke();
  g.strokeStyle = pal.tailHi; g.lineWidth = 1; g.beginPath(); g.moveTo(-29, -28); g.quadraticCurveTo(-39, -34 + sw, -44, -23 + sw * 0.6); g.stroke();
  g.fillStyle = ph2 ? pal.leaf2 : pal.leaf; g.beginPath(); g.ellipse(-45, -20 + sw * 0.6, 3.6, 1.8, 1.1, 0, TAU); g.fill();
  // body of braided roots
  const bc = ph2 ? pal.body2 : pal.body;
  const grd = g.createLinearGradient(0, -51, 0, -9);
  grd.addColorStop(0, bc[0]); grd.addColorStop(0.5, bc[1]); grd.addColorStop(1, bc[2]);
  g.fillStyle = grd; tmBody(g); g.fill();
  g.save(); tmBody(g); g.clip();
  // roots as tubes: long ones wrapping the barrel, diagonal ones binding them
  const tube = (w, path) => tmTube(g, pal, ph2, w, path);
  for (let k = 0; k < 6; k++) { const y0 = -46 + k * 6.5, w = [2.6, 1.6, 3, 2, 2.6, 1.8][k], wv = (k % 2 ? 3 : -3); tube(w, (o) => { g.moveTo(-36, y0 + 10 + o); g.bezierCurveTo(-18, y0 - 5 + wv + o, 2, y0 - 1 - wv + o, 24, y0 + 8 + k * 0.5 + o); }); }
  for (const [x0, sl, w] of [[-22, 12, 2.2], [-8, 16, 1.6], [6, 10, 2.4]]) tube(w, (o) => { g.moveTo(x0 + sl + o, -54); g.bezierCurveTo(x0 + sl * 0.2 + o, -42, x0 - sl * 0.6 + o, -28, x0 - sl * 0.2 + o, -8); });
  for (const [kx, ky] of [[-18, -30], [-4, -38], [8, -27], [-24, -20]]) { g.fillStyle = pal.knot; g.beginPath(); g.ellipse(kx, ky, 2.3, 1.6, 0, 0, TAU); g.fill(); g.fillStyle = pal.knotHi; g.fillRect(kx - 1, ky - 1, 1, 1); }
  g.fillStyle = pal.belly; g.beginPath(); g.ellipse(-4, -7, 30, 7, 0, 0, TAU); g.fill();
  g.fillStyle = pal.sheen; g.beginPath(); g.ellipse(-6, -45, 22, 6, -0.18, 0, TAU); g.fill();
  g.restore();
  if (bl > 0) TM_BLOOMS.forEach(([x, y, r], k) => bloom(g, pal, x, y, r * bl * (1 + Math.sin(t * 3 + k) * 0.08), t, k));
  // moss and the thorn ridge
  TM_SPINE.forEach(([x, y], k) => {
    g.fillStyle = ph2 ? pal.moss2 : pal.moss; disc(g, x + 1, y + 2.5, 3.6 + hash(k, 1) * 1.5);
    g.fillStyle = ph2 ? pal.mossHi2 : pal.mossHi; disc(g, x, y + 1.5, 1.8 + hash(k, 2));
    g.strokeStyle = pal.moss; g.lineWidth = 1; line(g, [[x + 2, y + 4], [x + 2.5, y + 7 + hash(k, 3) * 4]]);
  });
  TM_SPINE.forEach(([x, y, s], k) => thornSpike(g, pal, x, y, s * (1 + P.bristle * 0.35), P.bristle * Math.sin(t * 40 + k) * 0.8 - 0.5, ph2 ? pal.spikeTip2 : pal.spikeTip));
  leg(-15, 0, true); leg(9, Math.PI, true);
  // the flower maw
  g.save(); g.translate(18, -27); g.rotate(P.tilt);
  const pl = (st === 'stunned' ? 7 : 10) * (1 + P.open * 0.5);
  for (let k = 0; k < 9; k++) {
    const a = -2.95 + k * 0.62 + Math.sin(t * 2 + k) * 0.06, len = pl * (k % 2 ? 0.85 : 1), cx = Math.cos(a) * (len * 0.5 + 2), cy = Math.sin(a) * (len * 0.5 + 2);
    g.fillStyle = ph2 ? pal.sepal2 : pal.sepal; g.beginPath(); g.ellipse(cx, cy, len * 0.58, 3.6, a, 0, TAU); g.fill();
    g.fillStyle = ph2 ? pal.mawPetal2 : pal.mawPetal; g.beginPath(); g.ellipse(cx * 0.92, cy * 0.92, len * 0.42, 2.3, a, 0, TAU); g.fill();
    g.strokeStyle = ph2 ? pal.vein2 : pal.vein; g.lineWidth = 0.6; line(g, [[Math.cos(a) * 3, Math.sin(a) * 3], [Math.cos(a) * (len * 0.8 + 2), Math.sin(a) * (len * 0.8 + 2)]]);
  }
  const ua = -P.open * 0.8, la = P.open * 0.5;
  g.fillStyle = pal.throat; g.beginPath(); g.ellipse(7, 1, 10, 2 + P.open * 7, 0, 0, TAU); g.fill();
  g.fillStyle = ph2 ? pal.gullet2 : pal.gullet; g.beginPath(); g.ellipse(5, 1, 5, 1 + P.open * 3.5, 0, 0, TAU); g.fill();
  if (ph2 || P.open > 0.5) lit(g, L, 6, 1, 8 + P.open * 8, ph2 ? pal.gulletGlow2 : pal.gulletGlow, 0.3 * P.open + (ph2 ? 0.2 : 0));
  g.save(); g.rotate(la);
  g.fillStyle = pal.jaw; g.beginPath(); g.moveTo(-2, 0); g.lineTo(21, 0); g.quadraticCurveTo(22, 5, 16, 8); g.bezierCurveTo(8, 10, 0, 9, -3, 4); g.closePath(); g.fill();
  g.strokeStyle = pal.jawLine; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(6, 8.5, 12, 8.5, 17, 6.5); g.stroke();
  g.fillStyle = pal.gum; g.fillRect(-1, 0, 21, 1.5);
  g.fillStyle = pal.teeth; for (let i = 0; i < 6; i++) { const x = 2 + i * 3.3; poly(g, [[x, 0.5], [x + 2, 0.5], [x + 1, -3 - (i % 2)]]); }
  g.lineCap = 'round'; g.strokeStyle = pal.tusk; g.lineWidth = 2.2; g.beginPath(); g.moveTo(13, 4); g.quadraticCurveTo(21, 3, 22, -5); g.stroke();
  g.strokeStyle = pal.tuskShade; g.lineWidth = 0.8; g.beginPath(); g.moveTo(14, 5); g.quadraticCurveTo(21.5, 4, 22.8, -4); g.stroke();
  if (st === 'stunned' || st === 'dying') { g.strokeStyle = pal.drool; g.lineWidth = 2; g.beginPath(); g.moveTo(9, 1); g.quadraticCurveTo(15, 6, 13, 11 + Math.sin(t * 3)); g.stroke(); }
  g.restore();
  g.save(); g.rotate(ua);
  const ug = g.createLinearGradient(0, -12, 0, 1); ug.addColorStop(0, ph2 ? pal.lid2 : pal.lid); ug.addColorStop(1, pal.lidBase);
  g.fillStyle = ug; g.beginPath(); g.moveTo(-4, 1); g.bezierCurveTo(-3, -10, 10, -13, 20, -7); g.quadraticCurveTo(26, -3, 25, 1); g.closePath(); g.fill();
  g.strokeStyle = pal.lidLine; g.lineWidth = 1; g.beginPath(); g.moveTo(2, -9); g.quadraticCurveTo(10, -6, 14, -9.5); g.moveTo(8, -4); g.quadraticCurveTo(14, -2, 19, -5); g.stroke();
  g.strokeStyle = pal.lidShine; g.beginPath(); g.moveTo(0, -9); g.bezierCurveTo(4, -11.5, 12, -12, 19, -7.5); g.stroke();
  g.fillStyle = pal.gum; g.fillRect(-1, -0.5, 25, 1.5);
  g.fillStyle = pal.teeth; for (let i = 0; i < 7; i++) { const x = 1 + i * 3.3; poly(g, [[x, 0], [x + 2.2, 0], [x + 1.1, 3.2 + (i % 2) * 0.8]]); }
  g.fillStyle = pal.brow; poly(g, [[0, -10], [12, -8], [11, -6.5], [1, -8]]);
  const eye = ph2 ? pal.eye2 : pal.eye, eyeRgb = ph2 ? pal.eyeGlow2 : pal.eyeGlow;
  if (st === 'stunned') {
    g.strokeStyle = pal.eyeShut; g.lineWidth = 0.8;
    for (const [ex, ey] of [[4, -6], [9.5, -5.5]]) { g.beginPath(); g.moveTo(ex - 1.3, ey - 1.3); g.lineTo(ex + 1.3, ey + 1.3); g.moveTo(ex + 1.3, ey - 1.3); g.lineTo(ex - 1.3, ey + 1.3); g.stroke(); }
  } else for (const [ex, ey, r] of [[4, -6, 2.3], [9.5, -5.5, 1.7]]) {
    g.fillStyle = eye; g.beginPath(); g.ellipse(ex, ey, r, r * 0.6, 0.35, 0, TAU); g.fill();
    g.fillStyle = pal.glint; g.fillRect(ex - 0.5, ey - 0.5, 1, 1);
    lit(g, L, ex, ey, 7 + r * 2, eyeRgb, 0.55 + roar * 0.3);
  }
  g.restore();
  if (P.open > 0.55) { g.strokeStyle = pal.spit; g.lineWidth = 0.7; g.beginPath(); for (const d of [9, 15]) { g.moveTo(Math.cos(ua) * d, Math.sin(ua) * d + 2); g.lineTo(Math.cos(la) * d, Math.sin(la) * d - 1); } g.stroke(); }
  g.restore();
  g.restore();
}

// Head-on (or from behind): the barrel end-on, the flower maw opening at the camera, or the vine
// tail and the sepals peeking over the ridge. Rough until it gets its own pass.
function paintThornmawFacing(g, b, L, pal, back) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, roar = roarK(b);
  const bl = ph2 ? easeOut((b.phaseT ?? 9) / 0.9) : 0, P = thornPose(b);
  const cyc = t * (P.charge ? 16 : 7), bob = P.moving ? -Math.abs(Math.sin(cyc)) * (P.charge ? 2.5 : 1.2) : 0;
  g.save();
  g.scale(0.9, 0.9);
  g.translate(0, 8); g.scale(1, P.sy * (P.charge ? 0.96 : 1)); g.translate(0, -8 + bob);
  const leg = (hx, off, near) => {
    let fy = 8;
    if (P.moving) fy -= Math.max(0, Math.cos(cyc + off)) * (P.charge ? 5 : 2.5);
    if (st === 'wind' && near) fy -= Math.abs(Math.cos(t * 16 + off)) * 3;
    tmLeg(g, pal, hx, -13, hx + Math.sign(hx) * (st === 'stunned' ? 3 : 1), fy - bob, Math.sign(hx) * 2, near, ph2);
  };
  leg(-8, Math.PI, false); leg(8, 0, false);
  if (back) { // the maw's sepals over the ridge, far side
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.42 + Math.sin(t * 2 + k) * 0.05, len = 9 * (1 + P.open * 0.4);
      g.fillStyle = ph2 ? pal.sepal2 : pal.sepal; g.beginPath(); g.ellipse(Math.cos(a) * len * 0.6, -44 + Math.sin(a) * len * 0.6, len * 0.55, 3, a, 0, TAU); g.fill();
    }
  }
  // the barrel, end-on
  const bc = ph2 ? pal.body2 : pal.body, body = () => { g.beginPath(); g.ellipse(0, -28, 22, 19, 0, 0, TAU); };
  const grd = g.createLinearGradient(0, -47, 0, -9);
  grd.addColorStop(0, bc[0]); grd.addColorStop(0.5, bc[1]); grd.addColorStop(1, bc[2]);
  g.fillStyle = grd; body(); g.fill();
  g.save(); body(); g.clip();
  for (let k = 0; k < 5; k++) { const y0 = -44 + k * 7.5, w = [2.4, 1.6, 2.8, 1.8, 2.4][k], wv = k % 2 ? 3 : -3; tmTube(g, pal, ph2, w, (o) => { g.moveTo(-24, y0 + 6 + o); g.bezierCurveTo(-10, y0 - 4 + wv + o, 10, y0 - 4 - wv + o, 24, y0 + 6 + o); }); }
  for (const [x0, sl, w] of [[-12, 6, 2], [12, -6, 2]]) tmTube(g, pal, ph2, w, (o) => { g.moveTo(x0 + sl + o, -50); g.bezierCurveTo(x0 + o, -36, x0 - sl * 0.5 + o, -22, x0 + o, -8); });
  for (const [kx, ky] of [[-10, -33], [9, -38], [3, -22], [-15, -20]]) { g.fillStyle = pal.knot; g.beginPath(); g.ellipse(kx, ky, 2.3, 1.6, 0, 0, TAU); g.fill(); g.fillStyle = pal.knotHi; g.fillRect(kx - 1, ky - 1, 1, 1); }
  g.fillStyle = pal.belly; g.beginPath(); g.ellipse(0, -10, 20, 5, 0, 0, TAU); g.fill();
  g.fillStyle = pal.sheen; g.beginPath(); g.ellipse(-3, -42, 14, 5, -0.1, 0, TAU); g.fill();
  g.restore();
  if (bl > 0) [[-13, -38, 4], [12, -37, 4.5], [-1, -45, 3.5], [-15, -22, 3.5], [15, -24, 3]].forEach(([x, y, r], k) => bloom(g, pal, x, y, r * bl * (1 + Math.sin(t * 3 + k) * 0.08), t, k));
  // moss and the thorn ridge along the top of the barrel
  const ridge = [-2.55, -2.25, -1.9, -1.57, -1.24, -0.89, -0.59].map((a, k) => [Math.cos(a) * 19, -28 + Math.sin(a) * 17, [7, 9, 11, 13, 11, 9, 7][k]]);
  ridge.forEach(([x, y], k) => {
    g.fillStyle = ph2 ? pal.moss2 : pal.moss; disc(g, x, y + 2.5, 3.4 + hash(k, 1) * 1.5);
    g.fillStyle = ph2 ? pal.mossHi2 : pal.mossHi; disc(g, x, y + 1.5, 1.6 + hash(k, 2));
  });
  ridge.forEach(([x, y, sz], k) => thornSpike(g, pal, x, y, sz * (1 + P.bristle * 0.35), x * 0.25 + P.bristle * Math.sin(t * 40 + k) * 0.8, ph2 ? pal.spikeTip2 : pal.spikeTip));
  if (back) { // the vine tail, swinging toward the camera
    const sw = Math.sin(t * 3) * 3 + (P.moving ? Math.sin(cyc) * 2 : 0);
    g.lineCap = 'round'; g.strokeStyle = pal.tail; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(sw, -20, sw * 1.4, -12); g.stroke();
    g.strokeStyle = pal.tailHi; g.lineWidth = 1; g.beginPath(); g.moveTo(-0.8, -30); g.quadraticCurveTo(sw - 0.8, -20, sw * 1.4 - 0.8, -12); g.stroke();
    g.fillStyle = ph2 ? pal.leaf2 : pal.leaf; g.beginPath(); g.ellipse(sw * 1.4, -10, 1.8, 3.6, sw * 0.08, 0, TAU); g.fill();
  }
  leg(-14, 0, true); leg(14, Math.PI, true);
  if (!back) { // the flower maw, opening at the camera
    g.save(); g.translate(0, -24);
    const pl = (st === 'stunned' ? 7 : 9) * (1 + P.open * 0.5);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + Math.sin(t * 2 + k) * 0.06, len = pl * (k % 2 ? 0.85 : 1), cx = Math.cos(a) * (len * 0.5 + 6), cy = Math.sin(a) * (len * 0.5 + 5);
      g.fillStyle = ph2 ? pal.sepal2 : pal.sepal; g.beginPath(); g.ellipse(cx, cy, len * 0.58, 3.4, a, 0, TAU); g.fill();
      g.fillStyle = ph2 ? pal.mawPetal2 : pal.mawPetal; g.beginPath(); g.ellipse(cx * 0.9, cy * 0.9, len * 0.42, 2.2, a, 0, TAU); g.fill();
      g.strokeStyle = ph2 ? pal.vein2 : pal.vein; g.lineWidth = 0.6; line(g, [[Math.cos(a) * 6, Math.sin(a) * 5], [Math.cos(a) * (len * 0.8 + 6), Math.sin(a) * (len * 0.8 + 5)]]);
    }
    const gap = 1 + P.open * 6;
    g.fillStyle = pal.throat; g.beginPath(); g.ellipse(0, 0, 9, gap, 0, 0, TAU); g.fill();
    g.fillStyle = ph2 ? pal.gullet2 : pal.gullet; g.beginPath(); g.ellipse(0, 0.5, 4.5, gap * 0.5, 0, 0, TAU); g.fill();
    if (ph2 || P.open > 0.5) lit(g, L, 0, 0, 8 + P.open * 8, ph2 ? pal.gulletGlow2 : pal.gulletGlow, 0.3 * P.open + (ph2 ? 0.2 : 0));
    // lower jaw, teeth up, tusks curling out of its corners
    g.fillStyle = pal.jaw; g.beginPath(); g.moveTo(-11, gap * 0.4); g.quadraticCurveTo(0, gap + 9, 11, gap * 0.4); g.closePath(); g.fill();
    g.fillStyle = pal.gum; g.fillRect(-10, gap * 0.4, 20, 1.5);
    g.fillStyle = pal.teeth; for (let i = 0; i < 6; i++) { const x = -8.5 + i * 3.2; poly(g, [[x, gap * 0.4 + 0.5], [x + 2, gap * 0.4 + 0.5], [x + 1, gap * 0.4 - 2.5]]); }
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.strokeStyle = pal.tusk; g.lineWidth = 2.2; g.beginPath(); g.moveTo(s * 8, gap * 0.4 + 3); g.quadraticCurveTo(s * 15, gap * 0.4 + 2, s * 15, -5); g.stroke();
      g.strokeStyle = pal.tuskShade; g.lineWidth = 0.8; g.beginPath(); g.moveTo(s * 8.5, gap * 0.4 + 4); g.quadraticCurveTo(s * 15.8, gap * 0.4 + 3, s * 15.8, -4); g.stroke();
    }
    if (st === 'stunned' || st === 'dying') { g.strokeStyle = pal.drool; g.lineWidth = 2; g.beginPath(); g.moveTo(2, gap * 0.4 + 2); g.quadraticCurveTo(4, gap + 6, 3, gap + 10 + Math.sin(t * 3)); g.stroke(); }
    // upper lid with the eyes
    const ug = g.createLinearGradient(0, -gap - 10, 0, -gap * 0.4); ug.addColorStop(0, ph2 ? pal.lid2 : pal.lid); ug.addColorStop(1, pal.lidBase);
    g.fillStyle = ug; g.beginPath(); g.moveTo(-12, -gap * 0.4); g.quadraticCurveTo(0, -gap - 13, 12, -gap * 0.4); g.closePath(); g.fill();
    g.strokeStyle = pal.lidShine; g.lineWidth = 1; g.beginPath(); g.moveTo(-7, -gap - 3); g.quadraticCurveTo(0, -gap - 7.5, 7, -gap - 3); g.stroke();
    g.fillStyle = pal.gum; g.fillRect(-11, -gap * 0.4 - 1.5, 22, 1.5);
    g.fillStyle = pal.teeth; for (let i = 0; i < 7; i++) { const x = -10 + i * 3.1; poly(g, [[x, -gap * 0.4 - 0.5], [x + 2.2, -gap * 0.4 - 0.5], [x + 1.1, -gap * 0.4 + 2.7]]); }
    g.fillStyle = pal.brow; for (const s of [-1, 1]) poly(g, [[s * 1.5, -gap - 6], [s * 8, -gap - 7], [s * 7.5, -gap - 5.5], [s * 1.5, -gap - 4.5]]);
    const eye = ph2 ? pal.eye2 : pal.eye, eyeRgb = ph2 ? pal.eyeGlow2 : pal.eyeGlow;
    for (const s of [-1, 1]) {
      const ex = s * 4.5, ey = -gap - 3;
      if (st === 'stunned') { g.strokeStyle = pal.eyeShut; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ex - 1.3, ey - 1.3); g.lineTo(ex + 1.3, ey + 1.3); g.moveTo(ex + 1.3, ey - 1.3); g.lineTo(ex - 1.3, ey + 1.3); g.stroke(); continue; }
      g.fillStyle = eye; g.beginPath(); g.ellipse(ex, ey, 2, 1.3, s * 0.35, 0, TAU); g.fill();
      g.fillStyle = pal.glint; g.fillRect(ex - 0.5, ey - 0.5, 1, 1);
      lit(g, L, ex, ey, 9, eyeRgb, 0.55 + roar * 0.3);
    }
    if (P.open > 0.55) { g.strokeStyle = pal.spit; g.lineWidth = 0.7; g.beginPath(); for (const x of [-5, 4]) { g.moveTo(x, -gap * 0.4 + 2); g.lineTo(x + 0.5, gap * 0.4 - 1); } g.stroke(); }
    g.restore();
  }
  g.restore();
}

// Behind / in front of Thornmaw: charge speed lines and dust, stun stars, drifting petals.
export function thornUnder(g, b, x, y, face) {
  const t = b.anim || 0, side = (b.view || 'side') === 'side';
  if (b.state === 'charge') {
    g.strokeStyle = 'rgba(230,220,190,0.45)'; g.lineWidth = 1;
    g.beginPath();
    if (side) for (let k = 0; k < 6; k++) { const yy = y - 6 - k * 8 + Math.sin(t * 30 + k) * 1.5, x0 = x - face * (30 + hash(k, 1) * 10), len = 14 + ((t * 90 + k * 13) % 18); g.moveTo(x0, yy); g.lineTo(x0 - face * len, yy); }
    else { // streaks trailing up the screen (charging down it), or down it
      const d = b.view === 'front' ? -1 : 1;
      for (let k = 0; k < 6; k++) { const xx = x - 22 + k * 9 + Math.sin(t * 30 + k) * 1.5, y0 = y - 24 + d * (22 + hash(k, 1) * 8), len = 10 + ((t * 90 + k * 13) % 14); g.moveTo(xx, y0); g.lineTo(xx, y0 + d * len); }
    }
    g.stroke();
  }
  if (b.state === 'wind') for (let k = 0; k < 5; k++) {
    const p = (t * 2.5 + k / 5) % 1, px = x + (side ? face * (14 + p * 10) : (k % 2 ? 1 : -1) * (12 + p * 8)) + (hash(k) - 0.5) * 8;
    g.fillStyle = `rgba(140,120,90,${0.45 * (1 - p)})`; g.beginPath(); g.ellipse(px, y + 6 - p * 6, 3 + p * 5, 2 + p * 2, 0, 0, TAU); g.fill();
  }
}
export function thornOver(g, b, x, y, face) {
  const t = b.anim || 0;
  if (b.state === 'stunned') dizzyStars(g, x + ((b.view || 'side') === 'side' ? face * 20 : 0), y - 42, t, 4);
  if ((b.phase || 1) > 1) for (let i = 0; i < 6; i++) {
    const life = 2 + hash(i, 1), p = ((t + hash(i, 2) * life) % life) / life;
    const px = x + (hash(i, 3) - 0.5) * 60 + Math.sin(t * 2 + i) * 6, py = y - 50 + p * 56;
    g.globalAlpha = Math.sin(p * Math.PI) * 0.9; g.fillStyle = i % 2 ? '#e2404e' : '#ff7a80';
    g.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
  g.globalAlpha = 1;
}
