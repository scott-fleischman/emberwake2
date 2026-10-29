// Thornmaw's art: a boar of woven roots with a flytrap maw. The painter draws around its feet
// facing right (see bossart.js), or head-on / from behind for b.view 'front' / 'back'; every colour
// comes from a palette, so another body can wear it. In bloom (phase 2) its bark splits, a huge
// carnivorous flower bursts open on its back and vines thrash from around it.
import { TAU, clamp01, easeOut, lerp, hash, poly, line, disc, roarK, lit, dizzyStars } from './bossart.js';

// A `2` key is the phase-2 colour of the key without it.
export const THORN_PAL = {
  ink: '#140c06',
  leg: '#4a3620', leg2: '#4e2e1a', legHi: '#806242', legHi2: '#8e5c3a', legFar: '#20150c', legFarHi: '#382616',
  claw: '#e8dcb4', clawFar: '#8a8068', heel: '#2c1e10',
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
  // the Bloom: split bark, the flower on its back, the vines
  crack: '#1a0604', crackHot: '#ff6a2a', crackGlow: '255,100,40',
  bud: '#4a7a26', budHi: '#86b04a', bloom: '#b81e36', bloomHi: '#e8485a', bloomRim: '#5a0818', wart: '#f8d8c0',
  bloomLip: '#7a1024', bloomThroat: '#1a0206', bloomCore: '#ffb24a', bloomGlow: '255,150,60', stamen: '#c8d870',
  vine: '#3e6c22', vineHi: '#86b44a', vineThorn: '#f0e4bc', vineLeaf: '#5a9a2e', dirt: '#5a4026',
  // the world: charge streaks and pawed dust, drifting petals, blown spores, the lash's swish, its thorns
  streak: '230,220,190', dust: '140,120,90', petalFx: '#ff7a80', spore: '#fff0b0', swish: '#f0ffd0', shot: null,
};
// Whoever runs its moves wears its world effects in their own palette.
export const thornPal = (b) => b.thornPal || THORN_PAL;

const TM_SPINE = [[-30, -30, 6], [-26, -37, 8], [-19, -41, 10], [-12, -44, 11], [-4, -48, 13], [3, -50, 12], [10, -48, 10], [16, -43, 7]];
const TM_BLOOMS = [[-21, -29, 4], [-15, -18, 3.5], [-28, -22, 3], [-2, -20, 3]];
// Where the bark splits, side-on and end-on: jagged lines out from under the flower.
const CRACKS_SIDE = [[[-6, -46], [-8, -40], [-5, -35], [-9, -29], [-7, -23], [-11, -17]], [[3, -47], [6, -41], [3, -35], [8, -29], [6, -23]],
  [[-14, -43], [-19, -38], [-17, -33], [-23, -28], [-21, -24]], [[11, -44], [14, -38], [12, -32], [16, -27]]];
const CRACKS_FRONT = [[[-4, -44], [-7, -38], [-5, -33], [-10, -27], [-9, -21]], [[5, -44], [8, -39], [6, -33], [11, -28]], [[-12, -40], [-17, -35], [-16, -29]], [[14, -38], [17, -33], [16, -27]]];

// How far the Bloom has come: the bark splits through the transform, then the flower bursts open.
function bloomK(b) {
  if ((b.phase || 1) > 1) return 0.45 + 0.55 * easeOut((b.phaseT ?? 9) / 0.6);
  return b.state === 'transform' ? 0.45 * clamp01(1 - (b.timer ?? 0) / 1.5) : 0;
}

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

// A leg seen head-on or from behind: a shoulder or haunch, a thick column bowing out at the knee,
// and a foot with its claws to the camera (or its heel, from behind).
function tmLegEnd(g, pal, x, y, fy, near, ph2, back) {
  const s = Math.sign(x) || 1, col = near ? (ph2 ? pal.leg2 : pal.leg) : pal.legFar, hi = near ? (ph2 ? pal.legHi2 : pal.legHi) : pal.legFarHi;
  const ky = lerp(y, fy, 0.55);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (near) {
    g.fillStyle = col; g.beginPath(); g.ellipse(x - s, y - 4, back ? 8.5 : 8, back ? 9.5 : 9, 0, 0, TAU); g.fill();
    g.strokeStyle = hi; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x - s, y - 4, back ? 7 : 6.5, back ? 8 : 7.5, 0, s > 0 ? 4.4 : 3.6, s > 0 ? 5.8 : 5.0); g.stroke();
  }
  g.strokeStyle = col; g.lineWidth = near ? 8.5 : 6.5; line(g, [[x, y], [x + s * 1.5, ky], [x + s * 0.5, fy - 2]]);
  g.strokeStyle = hi; g.lineWidth = 1.3; line(g, [[x - s * 2.6, y + 1], [x - s * 1.4, ky], [x - s * 2.2, fy - 3]]);
  g.strokeStyle = pal.ink; g.lineWidth = 1; line(g, [[x + s * 1.5 - 3, ky - 0.5], [x + s * 1.5 + 3, ky + 0.8]]);
  g.fillStyle = col; g.beginPath(); g.ellipse(x + s * 0.5, fy - 1, near ? 5 : 4, 2.2, 0, 0, TAU); g.fill();
  if (back) { g.fillStyle = pal.heel; g.beginPath(); g.ellipse(x + s * 0.5, fy - 1.5, near ? 3 : 2.2, 1.2, 0, 0, TAU); g.fill(); return; }
  g.fillStyle = near ? pal.claw : pal.clawFar;
  for (const cx of [-2.6, 0, 2.6]) poly(g, [[x + s * 0.5 + cx - 1.2, fy - 1.2], [x + s * 0.5 + cx + 1.2, fy - 1.2], [x + s * 0.5 + cx, fy + 1.4]]);
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

// Bark split open along each path, glowing from inside. Through the transform the splits run out
// from under the bud; the light swells as the flower opens.
function barkCracks(g, pal, L, paths, k) {
  if (k <= 0) return;
  const run = clamp01(k / 0.4);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pts of paths) {
    const n = Math.max(2, Math.round(pts.length * run)), seg = pts.slice(0, n);
    g.strokeStyle = pal.crack; g.lineWidth = 2.8; line(g, seg);
    g.strokeStyle = pal.crackHot; g.lineWidth = 0.9; line(g, seg);
    const [mx, my] = seg[n >> 1];
    lit(g, L, mx, my, 5, pal.crackGlow, 0.12 + 0.18 * k);
  }
}

// The flower on its back, facing the sky, seen from above at a slant (sq squashes its depth). o: 0
// nothing, to 0.45 a swelling bud, to 1 open. puff: -1 clenched shut, +1 blown wide (its spores).
function bigBloom(g, pal, L, cx, cy, R, o, t, sq, puff = 0) {
  if (o <= 0.02) return;
  if (o < 0.45) { // a bud, swelling up out of the split bark, red showing at its seams
    const h = 5 + (o / 0.45) * 11, w = 4 + (o / 0.45) * 5, sw = Math.sin(t * 9) * (o / 0.45) * 0.8;
    g.fillStyle = pal.bloom; g.beginPath(); g.ellipse(cx + sw, cy - h * 0.45, w * 0.7, h * 0.5, 0, 0, TAU); g.fill();
    for (const s of [-1, 0, 1]) {
      g.fillStyle = s ? pal.bud : pal.budHi;
      g.beginPath(); g.moveTo(cx - w * 0.6 + s * w * 0.5, cy + 1); g.quadraticCurveTo(cx + s * w * 1.1, cy - h * 0.5, cx + sw + s * w * 0.15, cy - h); g.quadraticCurveTo(cx + s * w * 0.2, cy - h * 0.4, cx + w * 0.6 + s * w * 0.5, cy + 1); g.closePath(); g.fill();
    }
    return;
  }
  const k = easeOut((o - 0.45) / 0.55), flare = Math.max(0, puff), clench = Math.max(0, -puff);
  const open = k * (1 - clench * 0.7) + flare * 0.25;
  const rot = 0.25 + Math.sin(t * 0.7) * 0.05, n = 6;
  const angs = Array.from({ length: n }, (_, i) => rot + (i * TAU) / n).sort((a, b) => Math.sin(a) - Math.sin(b));
  // A petal: from beside the throat out to its tip, raised by `e` (0 flat, ~1.4 upright).
  const petal = (a, len, e, wide) => {
    const ca = Math.cos(a), sa = Math.sin(a), r = len * Math.cos(e), up = len * Math.sin(e) * 0.8;
    const bx = cx + ca * R * 0.22, by = cy + sa * R * 0.22 * sq, tx = cx + ca * r, ty = cy + sa * r * sq - up;
    const px = -sa * wide, py = ca * wide * sq, mx = lerp(bx, tx, 0.5), my = lerp(by, ty, 0.5);
    g.beginPath(); g.moveTo(bx + px * 0.35, by + py * 0.35);
    g.bezierCurveTo(mx + px * 1.1, my + py * 1.1, tx + px * 0.75, ty + py * 0.75, tx, ty);
    g.bezierCurveTo(tx - px * 0.75, ty - py * 0.75, mx - px * 1.1, my - py * 1.1, bx - px * 0.35, by - py * 0.35); g.closePath();
    return [bx, by, tx, ty];
  };
  for (const a of angs) { // sepals between the petals, under them
    g.fillStyle = pal.bud; petal(a + Math.PI / n, R * 0.78, 0.55 - open * 0.35, R * 0.13); g.fill();
  }
  angs.forEach((a, i) => {
    const len = R * (0.62 + 0.38 * open) * (1 + Math.sin(t * 2.2 + a * 3) * 0.04), e = 1.35 - open * 1.05 - flare * 0.25;
    const [bx, by, tx, ty] = petal(a, len, e, len * 0.34);
    g.fillStyle = Math.sin(a) < 0 ? pal.bloom : pal.bloomHi; g.fill();
    g.strokeStyle = pal.bloomRim; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = pal.wart;
    for (const [q, o2] of [[0.45, 0.2], [0.68, -0.25], [0.55, -0.05]]) disc(g, lerp(bx, tx, q) - Math.sin(a) * len * o2 * 0.3, lerp(by, ty, q) + Math.cos(a) * len * o2 * 0.3 * sq, 0.8 + hash(i, q * 10) * 0.6);
  });
  // the throat: a fleshy lip ringed with teeth, a fire deep inside
  const tr = R * (0.3 + 0.12 * open + flare * 0.1);
  g.fillStyle = pal.bloomLip; g.beginPath(); g.ellipse(cx, cy, tr + 2, (tr + 2) * sq, 0, 0, TAU); g.fill();
  g.fillStyle = pal.bloomThroat; g.beginPath(); g.ellipse(cx, cy, tr, tr * sq, 0, 0, TAU); g.fill();
  g.fillStyle = pal.bloomCore; g.beginPath(); g.ellipse(cx, cy + tr * sq * 0.25, tr * 0.3, tr * sq * 0.24, 0, 0, TAU); g.fill();
  lit(g, L, cx, cy, 7 + 5 * open + flare * 6, pal.bloomGlow, 0.22 + 0.15 * open + flare * 0.35);
  g.fillStyle = pal.teeth;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, ex = cx + Math.cos(a) * tr, ey = cy + Math.sin(a) * tr * sq, ix = cx + Math.cos(a) * tr * 0.55, iy = cy + Math.sin(a) * tr * sq * 0.55;
    poly(g, [[ex - Math.sin(a) * 1.3, ey + Math.cos(a) * 1.3 * sq], [ex + Math.sin(a) * 1.3, ey - Math.cos(a) * 1.3 * sq], [ix, iy]]);
  }
  // stamens nodding up out of it
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.9, sx = cx + Math.cos(a) * tr * 0.3, sy = cy + Math.sin(a) * tr * sq * 0.3, h = (3 + hash(i, 4) * 3) * (0.5 + 0.5 * open) * (1 + flare);
    const tx = sx + Math.cos(a) * 2 + Math.sin(t * 3 + i) * 1.2, ty = sy - h;
    g.strokeStyle = pal.stamen; g.lineWidth = 0.9; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx, sy - h * 0.6, tx, ty); g.stroke();
    g.fillStyle = pal.pollen; disc(g, tx, ty, 1.1);
  }
}

// A vine thrashing out from (x, y), heading `a`, a tube tapering to a barbed leaf. bend curls it;
// the thrash grows toward the tip. A vine that digs ends in the ground instead.
function vine(g, pal, x, y, a, len, bend, t, ph, dig = false, thrash = 1) {
  if (len < 2) return;
  const n = 8, pts = [[x, y]];
  let ang = a;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    ang = a + bend * f * 1.6 + Math.sin(t * 5 + ph - i * 0.9) * 0.75 * f * thrash;
    pts.push([pts[i - 1][0] + (Math.cos(ang) * len) / n, pts[i - 1][1] + (Math.sin(ang) * len) / n]);
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [col, extra, o] of [[pal.ink, 1.3, 0], [pal.vine, 0, 0], [pal.vineHi, -2.2, -0.6]]) {
    g.strokeStyle = col;
    for (let i = 0; i < n; i++) {
      g.lineWidth = Math.max(0.6, lerp(3, 1, i / n) + extra);
      g.beginPath(); g.moveTo(pts[i][0], pts[i][1] + o); g.lineTo(pts[i + 1][0], pts[i + 1][1] + o); g.stroke();
    }
  }
  g.fillStyle = pal.vineThorn;
  for (const i of [2, 4, 6]) {
    const [px, py] = pts[i], [qx, qy] = pts[i + 1], dx = qx - px, dy = qy - py, l = Math.hypot(dx, dy) || 1, s = i % 4 ? 1 : -1;
    poly(g, [[px - (dy / l) * 1.2 * s, py + (dx / l) * 1.2 * s], [px + (dx / l) * 1.6, py + (dy / l) * 1.6], [px - (dy / l) * 3.2 * s + (dx / l) * 0.4, py + (dx / l) * 3.2 * s + (dy / l) * 0.4]]);
  }
  const [ex, ey] = pts[n];
  if (dig) { g.fillStyle = pal.dirt; for (const [dx, r] of [[-3, 2.2], [0, 2.8], [3, 2]]) disc(g, ex + dx, ey + 0.5, r); return; }
  g.fillStyle = pal.vineLeaf; g.beginPath(); g.ellipse(ex, ey, 3.2, 1.6, ang, 0, TAU); g.fill();
}

export function thornPose(b) {
  const t = b.anim || 0, st = b.state, roar = roarK(b), charge = st === 'charge', q = (dur) => clamp01(1 - (b.timer ?? 0) / dur);
  const p = { lean: 0, tilt: 0, open: 0.16 + Math.sin(t * 2.4) * 0.06, bristle: 0, sy: 1 + Math.sin(t * 2.4) * 0.015, moving: st === 'stalk' || charge, charge, plunge: 0, puff: 0, lash: 0 };
  if (charge) Object.assign(p, { lean: 0.1, tilt: 0.28, open: 0.42 });
  if (st === 'wind') Object.assign(p, { lean: -0.36 - Math.sin(t * 18) * 0.04, open: 0.75, bristle: 0.6 });
  if (st === 'stunned') Object.assign(p, { lean: 0.05, tilt: 0.6 + Math.sin(t * 3) * 0.06, open: 0.34, sy: 0.93 });
  if (st === 'thorns') Object.assign(p, { open: 0.9 + Math.sin(t * 34) * 0.06, bristle: 1, sy: 1.04 });
  if (st === 'dying') Object.assign(p, { open: 0.7, tilt: 0.15 + Math.sin(t * 40) * 0.06, bristle: 0.5 });
  if (st === 'transform') Object.assign(p, { lean: -0.12, open: 0.6, bristle: 0.8, sy: 1.03 });
  // Bloom attacks: vines driven into the ground; the flower clenching, then blowing its spores;
  // vines drawn back, then whipped round in front.
  if (st === 'roots') Object.assign(p, { lean: 0.1, tilt: 0.2, open: 0.5, bristle: 0.5, plunge: easeOut(q(1.4) / 0.2) });
  if (st === 'spores') { const k = q(1.1); Object.assign(p, { lean: -0.1, open: 0.3, puff: k < 0.18 ? -k / 0.18 : Math.max(0, 1 - (k - 0.18) / 0.6) }); }
  if (st === 'lash') {
    const k = q(1);
    Object.assign(p, { lean: k < 0.6 ? -0.14 : 0.08, open: 0.65, bristle: 0.4, lash: k < 0.6 ? -easeOut(k / 0.6) : k < 0.72 ? -1 + 2 * easeOut((k - 0.6) / 0.12) : 1 - ((k - 0.72) / 0.28) * 0.7 });
  }
  if (roar) { p.lean = Math.min(p.lean, -0.24 * roar); p.open = Math.max(p.open, roar); p.bristle = Math.max(p.bristle, roar); p.tilt = Math.min(p.tilt, -0.18 * roar); }
  return p;
}

// The vines, grown out as the flower opens. Each heads `a` at rest; a lash coils it back (-1) then
// flings it round to `fore` (+1); a root attack arcs it into the ground along `dig` ([heading,
// length, bend]).
function vineSet(g, pal, P, t, bk, list) {
  const grow = easeOut((bk - 0.45) / 0.3);
  if (grow <= 0) return;
  for (const [x, y, a, len, ph, fore, dig] of list) {
    const l = P.lash, coil = a + (a - fore) * 0.35 * Math.max(0, -l), swing = l > 0 ? lerp(a, fore, l) : coil;
    const still = dig ? P.plunge : 0, head = still ? lerp(swing, dig[0], still) : swing, reach = still ? lerp(len, dig[1], still) : len * (1 + Math.max(0, l) * 0.8 + Math.max(0, P.puff) * 0.15);
    const bend = lerp(Math.sin(t * 4 + ph) * 0.5 - Math.max(0, -l) * 0.8 * Math.sign(fore - a), still ? dig[2] : 0, still);
    vine(g, pal, x, y, head, reach * grow, bend, t * (P.lash ? 1.6 : 1), ph, still > 0.9, 1 - still);
  }
}

export function paintThornmaw(g, b, L, pal = THORN_PAL) {
  if ((b.view || 'side') !== 'side') return paintThornmawFacing(g, b, L, pal, b.view === 'back');
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, roar = roarK(b);
  const bk = bloomK(b), bl = ph2 ? easeOut((b.phaseT ?? 9) / 0.9) : 0, P = thornPose(b);
  const cyc = t * (P.charge ? 16 : 7), bob = P.moving ? -Math.abs(Math.sin(cyc)) * (P.charge ? 2.5 : 1.2) : 0;
  g.save();
  g.scale(0.9, 0.9);
  g.translate(-15, 8); g.rotate(P.lean); g.scale(P.charge ? 1.05 : 1, P.sy); g.translate(15, -8 + bob);
  const leg = (hx, off, near) => {
    let fx = hx + 1, fy = 8, bend = hx < 0 ? -3 : 3;
    if (P.moving) { const sw = Math.sin(cyc + off); fx += sw * (P.charge ? 8 : 4); fy -= Math.max(0, Math.cos(cyc + off)) * (P.charge ? 5 : 2.5); }
    if ((st === 'wind' || roar > 0.5) && hx > 0) { const pw = t * 16 + off; fx += 4 + Math.sin(pw) * 4; fy -= 3 + Math.abs(Math.cos(pw)) * 4; bend = 5; }
    if (st === 'stunned') fx += hx < 0 ? -3 : 3;
    if (P.plunge > 0 && hx > 0) fx += 4 * P.plunge; // forelegs braced out in front
    tmLeg(g, pal, hx, -13, fx, fy - bob, bend, near, ph2);
  };
  leg(-19, Math.PI, false); leg(5, 0, false);
  // vines on the far side, behind the body: [x, y, rest heading, length, phase, lash heading, dig]
  vineSet(g, pal, P, t, bk, [[-17, -40, -2.1, 28, 0, -0.2], [5, -43, -1.2, 27, 2, 0.15, [0.3, 62, 0.6]]]);
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
  barkCracks(g, pal, L, CRACKS_SIDE, bk);
  g.fillStyle = pal.belly; g.beginPath(); g.ellipse(-4, -7, 30, 7, 0, 0, TAU); g.fill();
  g.fillStyle = pal.sheen; g.beginPath(); g.ellipse(-6, -45, 22, 6, -0.18, 0, TAU); g.fill();
  g.restore();
  if (bl > 0) TM_BLOOMS.forEach(([x, y, r], k) => bloom(g, pal, x, y, r * bl * (1 + Math.sin(t * 3 + k) * 0.08), t, k));
  // moss and the thorn ridge; in bloom the flower has shouldered aside the middle of it
  const ridge = bk > 0.45 ? TM_SPINE.filter((s, k) => k < 2 || k > 5) : TM_SPINE;
  ridge.forEach(([x, y], k) => {
    g.fillStyle = ph2 ? pal.moss2 : pal.moss; disc(g, x + 1, y + 2.5, 3.6 + hash(k, 1) * 1.5);
    g.fillStyle = ph2 ? pal.mossHi2 : pal.mossHi; disc(g, x, y + 1.5, 1.8 + hash(k, 2));
    g.strokeStyle = pal.moss; g.lineWidth = 1; line(g, [[x + 2, y + 4], [x + 2.5, y + 7 + hash(k, 3) * 4]]);
  });
  ridge.forEach(([x, y, s], k) => thornSpike(g, pal, x, y, s * (1 + P.bristle * 0.35), P.bristle * Math.sin(t * 40 + k) * 0.8 - 0.5, ph2 ? pal.spikeTip2 : pal.spikeTip));
  bigBloom(g, pal, L, -6, -48, 22, bk, t, 0.5, P.puff);
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
  // the near vines, over the head, so a lash whips round in front of it
  vineSet(g, pal, P, t, bk, [[-12, -42, -2.55, 25, 4, 0.35], [2, -44, -0.75, 25, 1, 0.45, [0.45, 58, 0.5]]]);
  g.restore();
}

// The barrel end-on, shared by the front and back views: braided roots round it and the moss and
// thorn ridge along its top, split open in bloom.
function tmBarrel(g, b, L, pal, P, bk) {
  const t = b.anim || 0, ph2 = (b.phase || 1) > 1, bc = ph2 ? pal.body2 : pal.body, body = () => { g.beginPath(); g.ellipse(0, -29, 21, 18, 0, 0, TAU); };
  const grd = g.createLinearGradient(0, -47, 0, -11);
  grd.addColorStop(0, bc[0]); grd.addColorStop(0.5, bc[1]); grd.addColorStop(1, bc[2]);
  g.fillStyle = grd; body(); g.fill();
  g.save(); body(); g.clip();
  for (let k = 0; k < 5; k++) { const y0 = -45 + k * 7.5, w = [2.4, 1.6, 2.8, 1.8, 2.4][k], wv = k % 2 ? 3 : -3; tmTube(g, pal, ph2, w, (o) => { g.moveTo(-24, y0 + 6 + o); g.bezierCurveTo(-10, y0 - 4 + wv + o, 10, y0 - 4 - wv + o, 24, y0 + 6 + o); }); }
  for (const [x0, sl, w] of [[-12, 6, 2], [12, -6, 2]]) tmTube(g, pal, ph2, w, (o) => { g.moveTo(x0 + sl + o, -50); g.bezierCurveTo(x0 + o, -36, x0 - sl * 0.5 + o, -22, x0 + o, -8); });
  for (const [kx, ky] of [[-10, -33], [9, -38], [3, -22], [-15, -20]]) { g.fillStyle = pal.knot; g.beginPath(); g.ellipse(kx, ky, 2.3, 1.6, 0, 0, TAU); g.fill(); g.fillStyle = pal.knotHi; g.fillRect(kx - 1, ky - 1, 1, 1); }
  barkCracks(g, pal, L, CRACKS_FRONT, bk);
  g.fillStyle = pal.belly; g.beginPath(); g.ellipse(0, -12, 19, 5, 0, 0, TAU); g.fill();
  g.fillStyle = pal.sheen; g.beginPath(); g.ellipse(-3, -42, 13, 5, -0.1, 0, TAU); g.fill();
  g.restore();
  // the ridge, fanned across the top; the flower shoulders its middle aside
  const ridge = [-2.55, -2.25, -1.9, -1.57, -1.24, -0.89, -0.59].map((a, k) => [Math.cos(a) * 18, -29 + Math.sin(a) * 16, [7, 9, 11, 13, 11, 9, 7][k], k]).filter(([, , , k]) => bk <= 0.45 || k < 2 || k > 4);
  ridge.forEach(([x, y, , k]) => {
    g.fillStyle = ph2 ? pal.moss2 : pal.moss; disc(g, x, y + 2.5, 3.4 + hash(k, 1) * 1.5);
    g.fillStyle = ph2 ? pal.mossHi2 : pal.mossHi; disc(g, x, y + 1.5, 1.6 + hash(k, 2));
  });
  ridge.forEach(([x, y, sz, k]) => thornSpike(g, pal, x, y, sz * (1 + P.bristle * 0.35), x * 0.25 + P.bristle * Math.sin(t * 40 + k) * 0.8, ph2 ? pal.spikeTip2 : pal.spikeTip));
}

// Head-on: the flytrap head low in front of the barrel, opening at the camera, the forelegs either
// side of it and the hind legs behind. From behind: the rump on its haunches, the tail swinging
// and the maw's sepals just showing over the ridge. In bloom the flower crowns the back either way.
function paintThornmawFacing(g, b, L, pal, back) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, roar = roarK(b);
  const bk = bloomK(b), bl = ph2 ? easeOut((b.phaseT ?? 9) / 0.9) : 0, P = thornPose(b);
  const cyc = t * (P.charge ? 16 : 7), bob = P.moving ? -Math.abs(Math.sin(cyc)) * (P.charge ? 2.5 : 1.2) : 0;
  const step = (off, k) => (P.moving ? Math.max(0, Math.cos(cyc + off)) * (P.charge ? 5 : 2.5) * k : 0);
  g.save();
  g.scale(0.9, 0.9);
  g.translate(0, 8); g.scale(1, P.sy * (P.charge ? 0.96 : 1)); g.translate(0, -8 + bob);
  const spread = st === 'stunned' ? 3 : 0;
  // the far pair, set further up the ground
  for (const [x, off] of [[-9, Math.PI], [9, 0]]) tmLegEnd(g, pal, x * 1.05 + Math.sign(x) * spread * 0.5, -16, -3 - step(off, 0.8) - bob, false, ph2, back);
  // vines on the far side, behind the barrel: [x, y, rest heading, length, phase, lash heading, dig]
  const fore = back ? -1.57 : 1.57, wide = back ? -0.95 : 0.95; // a lash flings them out either side of its aim
  vineSet(g, pal, P, t, bk, [[-12, -42, -2.15, 27, 0, fore + wide], [12, -42, -1.0, 27, 2, fore - wide]]);
  if (back) { // the maw's sepals over the ridge, far side
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.42 + Math.sin(t * 2 + k) * 0.05, len = 9 * (1 + P.open * 0.4);
      g.fillStyle = ph2 ? pal.sepal2 : pal.sepal; g.beginPath(); g.ellipse(Math.cos(a) * len * 0.6, -45 + Math.sin(a) * len * 0.6, len * 0.55, 3, a, 0, TAU); g.fill();
    }
  }
  tmBarrel(g, b, L, pal, P, bk);
  if (bl > 0) [[-15, -22, 3.5], [15, -24, 3.5]].forEach(([x, y, r], k) => bloom(g, pal, x, y, r * bl * (1 + Math.sin(t * 3 + k) * 0.08), t, k));
  bigBloom(g, pal, L, 0, -47, 21, bk, t, back ? 0.62 : 0.45, P.puff);
  vineSet(g, pal, P, t, bk, [[-9, -40, -2.65, 25, 4, fore + wide * 0.6, [2.4, 50, -0.4]], [9, -40, -0.5, 25, 1, fore - wide * 0.6, [0.75, 50, 0.4]]]);
  if (back) { // the haunches, and the vine tail swinging between them
    for (const [x, off] of [[-12, 0], [12, Math.PI]]) tmLegEnd(g, pal, x + Math.sign(x) * spread, -15, 0 - step(off, 1) - bob, true, ph2, true);
    const sw = Math.sin(t * 3) * 3 + (P.moving ? Math.sin(cyc) * 2 : 0);
    g.lineCap = 'round'; g.strokeStyle = pal.tail; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(0, -27); g.quadraticCurveTo(sw, -19, sw * 1.4, -11); g.stroke();
    g.strokeStyle = pal.tailHi; g.lineWidth = 1; g.beginPath(); g.moveTo(-0.8, -27); g.quadraticCurveTo(sw - 0.8, -19, sw * 1.4 - 0.8, -11); g.stroke();
    g.fillStyle = ph2 ? pal.leaf2 : pal.leaf; g.beginPath(); g.ellipse(sw * 1.4, -9, 1.8, 3.6, sw * 0.08, 0, TAU); g.fill();
    g.restore();
    return;
  }
  for (const [x, off] of [[-13, 0], [13, Math.PI]]) tmLegEnd(g, pal, x + Math.sign(x) * spread, -14, 0 - step(off, 1) - bob, true, ph2, false);
  // the flower maw, low and opening at the camera
  g.save(); g.translate(0, -19 + P.tilt * 3);
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
  g.strokeStyle = pal.jawLine; g.lineWidth = 1; g.beginPath(); g.moveTo(-7, gap * 0.4 + 3); g.quadraticCurveTo(0, gap + 5.5, 7, gap * 0.4 + 3); g.stroke();
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
  g.strokeStyle = pal.lidLine; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -gap - 1); g.quadraticCurveTo(0, -gap + 1, 6, -gap - 1); g.stroke();
  g.strokeStyle = pal.lidShine; g.beginPath(); g.moveTo(-7, -gap - 3); g.quadraticCurveTo(0, -gap - 7.5, 7, -gap - 3); g.stroke();
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
  g.restore();
}

// Behind / in front of Thornmaw: charge speed lines and dust, stun stars, drifting petals, the
// spores blown off its flower and the swish of a lash.
export function thornUnder(g, b, x, y, face, pal = thornPal(b)) {
  const t = b.anim || 0, side = (b.view || 'side') === 'side';
  if (b.state === 'charge') {
    g.strokeStyle = `rgba(${pal.streak},0.45)`; g.lineWidth = 1;
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
    g.fillStyle = `rgba(${pal.dust},${0.45 * (1 - p)})`; g.beginPath(); g.ellipse(px, y + 6 - p * 6, 3 + p * 5, 2 + p * 2, 0, 0, TAU); g.fill();
  }
}
export function thornOver(g, b, x, y, face, pal = thornPal(b)) {
  const t = b.anim || 0, side = (b.view || 'side') === 'side';
  if (b.state === 'stunned') dizzyStars(g, x + (side ? face * 20 : 0), y - 42, t, 4);
  if ((b.phase || 1) > 1) for (let i = 0; i < 6; i++) {
    const life = 2 + hash(i, 1), p = ((t + hash(i, 2) * life) % life) / life;
    const px = x + (hash(i, 3) - 0.5) * 60 + Math.sin(t * 2 + i) * 6, py = y - 50 + p * 56;
    g.globalAlpha = Math.sin(p * Math.PI) * 0.9; g.fillStyle = i % 2 ? pal.petalHi : pal.petalFx;
    g.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
  // spores billowing up off the flower, then drifting toward where they'll settle
  const P = b.state === 'spores' ? thornPose(b) : null;
  if (P && P.puff > 0) {
    const fx = x + (side ? face * -5 : 0), fy = y - 44, k = 1 - P.puff;
    for (let i = 0; i < 18; i++) {
      const a = hash(i, 5) * TAU, r = (6 + hash(i, 6) * 22) * (0.3 + k), px = fx + Math.cos(a) * r + (b.cdx || 0) * k * 30, py = fy + Math.sin(a) * r * 0.6 - k * 14 + (b.cdy || 0) * k * 20;
      g.globalAlpha = (1 - k) * 0.85; g.fillStyle = i % 3 ? pal.pollen : pal.spore;
      g.fillRect(Math.round(px), Math.round(py), i % 4 ? 1 : 2, i % 4 ? 1 : 2);
    }
  }
  // the lash's swish, sweeping the cone it strikes
  const q = b.state === 'lash' ? 1 - (b.timer ?? 0) : -1;
  if (q > 0.6 && q < 0.85) {
    const a0 = Math.atan2(b.cdy || 0, b.cdx || 1), f = (q - 0.6) / 0.25;
    g.globalAlpha = 1 - f; g.strokeStyle = pal.swish; g.lineWidth = 2;
    for (const r of [34, 46, 58]) { g.beginPath(); g.ellipse(x, y - 8, r, r * 0.75, 0, a0 - 1.1, a0 - 1.1 + 2.2 * easeOut(f * 1.6)); g.stroke(); }
  }
  g.globalAlpha = 1;
}
