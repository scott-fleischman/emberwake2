// The Tidewarden's art: a coral-crowned sea serpent rising out of the pool it carries with it, its body
// arcing out of the water in loops behind it. The painter draws around the middle of its pool at the
// waterline, facing the camera (b.view 'front', the default), from behind ('back') or turned to the
// right ('side', see bossart.js); every colour comes from a palette, so another body can wear it, and
// so do its world effects (tidePal). In the Wail (phase 2) it sheds its coral and rises pale and
// drowned, a ghost of itself: fins torn into veils, ribs showing, its jaw hanging open in a wail.
import { TAU, clamp01, easeOut, lerp, hash, poly, line, disc, mix, roarK, lit, glow, dizzyStars } from './bossart.js';

// A `2` key is the Wail's colour of the key without it. The world keys (r,g,b) colour the water it
// lies in, its foam, the zones it puts down, its jets, song rings and whirlpool, and the flood.
export const TIDE_PAL = {
  body: ['#3c94a2', '#246070', '#123644'], body2: ['#d2e2dc', '#94b0ac', '#5a7470'],
  belly: '#e0cf9c', belly2: '#eef4ea', plate: '#a89262', plate2: '#a2b6ae',
  seam: 'rgba(8,30,40,0.5)', seam2: 'rgba(50,80,80,0.45)', sheen: 'rgba(200,250,255,0.35)', sheen2: 'rgba(255,255,255,0.4)',
  barnacle: '#dcd6c2', pit: '#5e5c4c', barnacle2: '#6e807a', pit2: '#24302e',
  fin: ['#86f2ff', '#26aed0'], fin2: ['rgba(230,252,255,0.8)', 'rgba(150,200,210,0.45)'], finRay: '#d8feff', finRay2: '#f0ffff',
  finGlow: '90,220,255', finGlow2: '200,240,250',
  coral: '#ff6c5c', coralHi: '#ffac92', coralTip: '#ffe4cc', coralDark: '#b23a44', stub: '#cbbcae', stubDark: '#8a7c72',
  eye: '#ffe466', eye2: '#eaffff', eyeGlow: '255,226,100', eyeGlow2: '170,240,255', socket: '#0a1a20', glint: '#ffffff', brow: '#123440',
  maw: '#3a0e1e', maw2: '#081418', teeth: '#f6f0dc', teeth2: '#d6e2dc', tongue: '#c84e68', nostril: '#0c2630',
  sac: '#74d4e6', sac2: '#dcf6fa', sacHi: '#eaffff', sacGlow: '110,226,255', sacGlow2: '210,250,255',
  rib: 'rgba(60,90,90,0.6)', crack: '210,250,255', wisp: '220,245,250',
  water: '16,50,68', waterHi: '80,160,180', foam: '232,250,255', zone: '90,200,220', jet: '140,224,244', ring: '150,240,255', whirl: '30,96,126', flood: '22,66,86',
};
export const tidePal = (b) => b.tidePal || TIDE_PAL;

// The fight's clocks, shared with the moveset (warden-tide.js) so the poses keep time with it: the
// jets' first draw-back and the beat between salvos; the sweep's coil and what follows the lash; the
// dive (its ripple's countdown) and how long the sinking takes; dazed after surfacing; the wave's
// gathering and the spent window after it; the whirlpool's stirring and its pull; when each song
// ring leaves and how long the song lasts.
export const JET_WIND = 0.5, JET_GAP = 0.45, SWEEP = 1, SWEEP_HOLD = 0.45, DIVE = 0.9, SINK = 0.4, SURFACE = 1.4;
export const WAVE_T = 1, SPENT = 1.6, WHIRL_T = 0.6, WHIRL = 3, RING_T = [0.7, 1.2, 1.7], RINGS = 2.3;
export const JETS = 3; // salvos in a volley
const EASE = 0.25; // seconds a pose takes to ease into the next
const smooth = (v) => v * v * (3 - 2 * v);

// ---------------------------------------------------------------- the pose
// rear: the neck raised (+) or ducked (-); lean: the head tipped forward, toward the aim; jaw: open;
// sac: the throat sac swelling and glowing; tail: raised (+) or lashed down (-); coil: how high the
// loops arch; sink: how far under the water (1: gone); sway: a rock of the neck; fin: the fins flared.
const KEYS = ['rear', 'lean', 'jaw', 'sac', 'tail', 'coil', 'sink', 'sway', 'fin'];
const pose = (o) => ({ rear: 0, lean: 0, jaw: 0.1, sac: 0, tail: 0, coil: 1, sink: 0, sway: 0, fin: 0.4, ...o });
const mixPose = (a, b, k) => Object.fromEntries(KEYS.map((key) => [key, lerp(a[key], b[key], k)]));
const ROAR = { rear: 0.9, lean: -0.35, jaw: 1, fin: 1, sac: 0.5 };

function rawPose(b) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, bob = Math.sin(t * 2.2), timer = b.timer ?? 0;
  const rest = pose({ rear: bob * 0.08, sway: Math.sin(t * 1.3) * 0.05, jaw: ph2 ? 0.35 : 0.08, coil: 1 + bob * 0.05, fin: 0.4 + Math.sin(t * 3) * 0.1 });
  let P = rest;
  if (st === 'jets') { // spat (u 0), recoiled to rest (0.3), drawn back (0.75), thrust into the next spit (1)
    const full = (b.tideJets ?? JETS) >= JETS, u0 = clamp01(1 - (b.tideShotT ?? 0) / (full ? JET_WIND : JET_GAP));
    const u = full ? lerp(0.3, 1, u0) : (b.tideJets ?? 0) > 0 ? u0 : Math.min(u0, 0.3);
    const spat = pose({ rear: 0.1, lean: 0.45, jaw: 0.9, sac: 0.2, fin: 0.7 }), back = pose({ rear: 0.6, lean: -0.35, jaw: 0.15, sac: 0.9, fin: 0.8, coil: 1.1 });
    const mid = pose({ rear: 0.2, jaw: ph2 ? 0.4 : 0.3, sac: 0.3, fin: 0.5 });
    P = u < 0.3 ? mixPose(spat, mid, smooth(u / 0.3)) : u < 0.75 ? mixPose(mid, back, smooth((u - 0.3) / 0.45)) : mixPose(back, spat, smooth((u - 0.75) / 0.25));
  } else if (st === 'sweep') { // the tail rising as the body coils, then lashed down along the line
    const coil = pose({ rear: 0.3, lean: -0.15, tail: 1, coil: 1.3, fin: 0.8, jaw: 0.4 });
    P = timer > SWEEP_HOLD ? mixPose(rest, coil, smooth(clamp01(1 - (timer - SWEEP_HOLD) / SWEEP))) : mixPose(coil, pose({ rear: -0.1, lean: 0.3, tail: -1, coil: 0.8, fin: 0.9, jaw: 0.6 }), easeOut((SWEEP_HOLD - timer) / 0.08));
  } else if (st === 'dive') { // the head ducks and it sinks out of sight
    const q = clamp01((DIVE - timer) / SINK);
    P = pose({ rear: -0.3 * q, lean: 0.4, jaw: 0.2, coil: lerp(1, 0.7, q), fin: 0.2, sink: q * q });
  } else if (st === 'surface') { // bursting up out of the water, then slumped, dazed
    const e = SURFACE - timer, burst = pose({ rear: 1, lean: -0.3, jaw: 0.9, fin: 1, coil: 1.2, sink: 1 - easeOut(e / 0.2) });
    P = mixPose(burst, pose({ rear: -0.35, lean: 0.35, jaw: 0.5, fin: 0.15, coil: 0.85, sway: Math.sin(t * 2.6) * 0.12, sink: 0.12 }), smooth(clamp01((e - 0.25) / 0.35)));
  } else if (st === 'wave') P = pose({ rear: 0.9, lean: -0.2, jaw: 1, sac: 0.6, fin: 1, coil: 1.2, sway: Math.sin(t * 5) * 0.04 });
  else if (st === 'spent') P = pose({ rear: -0.4, lean: 0.4, jaw: 0.6, fin: 0.1, coil: 0.75, sway: Math.sin(t * 1.4) * 0.08, sink: 0.12 });
  else if (st === 'whirl') P = pose({ rear: 0.3, jaw: 0.7, sac: 0.8, fin: 0.9, coil: 1.35, sway: Math.sin(t * 4) * 0.22 });
  else if (st === 'rings') { // the sac swelling with each ring it sings out
    const e = RINGS - timer, beat = Math.max(0, ...RING_T.map((r) => 1 - Math.abs(e - r) / 0.18));
    P = pose({ rear: 0.5, lean: -0.1, jaw: 0.6 + beat * 0.4, sac: 0.55 + beat * 0.45, fin: 0.7 + beat * 0.3, coil: 1.1 });
  } else if (st === 'transform') P = pose({ rear: 0.8, lean: -0.2, jaw: 1, sac: 0.4, fin: 1, coil: 1.3, sway: Math.sin(t * 40) * 0.05 });
  else if (st === 'defeated' || st === 'dying') P = pose({ rear: -0.2, lean: 0.25, jaw: 0.4, coil: 0.9, fin: 0.2, sway: Math.sin(t * 1.5) * 0.1 + (st === 'dying' ? Math.sin(t * 31) * 0.04 : 0) });
  const roar = roarK(b);
  if (roar) for (const [k, v] of Object.entries(ROAR)) P[k] = lerp(P[k], v, roar);
  return P;
}

// The pose as drawn: when its state changes, it eases from the pose drawn then (this very frame if the
// tick hasn't seen the change yet). The death flow's states take no ticks, so they never ease: it sets
// the warden down 'defeated' behind its fade, in the pose it then dies in.
export function tidePose(b) {
  const P = rawPose(b), st = b.state, fresh = b.tidePoseState !== st;
  if (st === 'defeated' || st === 'dying') return P;
  const from = fresh ? b.tidePoseNow : b.tidePoseFrom, k = smooth(clamp01((fresh ? 0 : b.tidePoseT ?? 9) / EASE));
  return from && k < 1 ? mixPose(from, P, k) : P;
}
// Visual bookkeeping, once a frame from the moveset's tick.
export function tidePoseTick(b, dt) {
  if (b.tidePoseState !== b.state) { b.tidePoseState = b.state; b.tidePoseFrom = b.tidePoseNow; b.tidePoseT = 0; }
  else b.tidePoseT = (b.tidePoseT ?? 9) + dt;
  b.tidePoseNow = tidePose(b);
}

// How far it has drowned: its colour drains through the transform, and in the Wail the coral is shed.
const drainK = (b) => ((b.phase || 1) > 1 ? 0.5 + 0.5 * easeOut((b.phaseT ?? 9) / 0.6) : b.state === 'transform' ? 0.5 * clamp01(1 - (b.timer ?? 0) / 1.5) : 0);
const sizeOf = (b) => ((b.phase || 1) > 1 ? lerp(1, 1.1, easeOut((b.phaseT ?? 9) / 0.6)) : 1);
// A palette colour on the way to its Wail colour; i picks from a list.
function col(pal, key, k, i) {
  const a = i === undefined ? pal[key] : pal[key][i], two = pal[`${key}2`], z = two === undefined ? a : i === undefined ? two : two[i];
  if (k <= 0 || a === z) return a;
  if (k >= 1) return z;
  return a[0] === '#' && z[0] === '#' ? mix(a, z, k) : k < 0.5 ? a : z;
}

// ---------------------------------------------------------------- the body's shape
// Points along a cubic, each with its unit normal (to the left of the way the curve runs) and t.
function curve(p0, p1, p2, p3, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x, y, nx: -dy / l, ny: dx / l, t });
  }
  return out;
}
// A band along the curve between offsets a and b (in half-widths, -1 to 1 the whole tube), its width
// going from w0 to w1.
function ribbon(g, pts, w0, w1, a = -1, b = 1) {
  const h = (p) => lerp(w0, w1, p.t) / 2;
  g.beginPath();
  pts.forEach((p, i) => { const x = p.x + p.nx * h(p) * a, y = p.y + p.ny * h(p) * a; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; g.lineTo(p.x + p.nx * h(p) * b, p.y + p.ny * h(p) * b); }
  g.closePath(); g.fill();
}

// Where everything goes, in the painter's frame before mirroring: the size, the neck's curve and the
// head on it (H, its tilt th), the loops, the tail's tip, and where each part meets the water.
function shape(b, P) {
  const view = b.view || 'front', S = sizeOf(b), up = P.rear * 12, side = view === 'side';
  if (side) {
    const H = [12 + P.lean * 10 + P.sway * 22, -44 - up];
    return {
      S, H, th: P.lean * 0.8 + P.sway, view,
      neck: curve([4, 4], [0, -16], [H[0] - 12, H[1] + 14], H), nw: [13, 9],
      loops: [{ a: [-24, 4], b: [-2, 4], h: 20 * P.coil, w: [10, 11] }, { a: [-46, 4], b: [-28, 4], h: 15 * P.coil, w: [7, 9] }],
      tail: { a: [-50, 4], tip: [-57 - P.tail * 3, -12 - P.tail * 10] },
      water: [5, -1, -23, -27, -47, -50],
    };
  }
  const H = [P.sway * 18, -42 - up + P.lean * 6], back = view === 'back';
  return {
    S, H, th: P.sway * 0.8, view,
    neck: curve([0, 4], [-2, -14], [H[0], H[1] + 14], H), nw: [14, 10],
    loops: back ? [{ a: [-36, 6], b: [-10, 6], h: 16 * P.coil, w: [8, 10] }, { a: [12, 6], b: [34, 6], h: 12 * P.coil, w: [9, 7] }]
      : [{ a: [-34, 4], b: [-8, 4], h: 18 * P.coil, w: [8, 10] }, { a: [10, 4], b: [30, 4], h: 13 * P.coil, w: [9, 7] }],
    tail: back ? { a: [36, 6], tip: [44 + P.tail * 2, -8 - P.tail * 9] } : { a: [32, 4], tip: [39 + P.tail * 2, -10 - P.tail * 9] },
    water: back ? [0, -10, -36, 12, 34, 36] : [0, -8, -34, 10, 30, 32],
  };
}
const loopCurve = (L) => curve(L.a, [L.a[0], L.a[1] - L.h * 1.33], [L.b[0], L.b[1] - L.h * 1.33], L.b, 10);
const tailCurve = (T) => curve(T.a, [T.a[0], T.a[1] - 8], [T.tip[0] + (T.a[0] - T.tip[0]) * 0.2, T.tip[1] + 6], T.tip, 8);

// ---------------------------------------------------------------- the body, part by part
// A length of body: its flank lit along its back, its belly on the side `belly` (+1 or -1, or 0 when
// it faces the camera, or null when it is turned away), segment seams, barnacles crusting its back, fin
// spines down its spine. Drawn tail to head, its +1 side is underneath.
function body(g, pal, L, pts, w0, w1, k, ph2, t, { belly = 1, dim = false, spines = true, seed = 0 } = {}) {
  g.fillStyle = col(pal, 'body', k, dim ? 2 : 1); ribbon(g, pts, w0, w1);
  g.fillStyle = col(pal, 'body', k, dim ? 1 : 0); ribbon(g, pts, w0, w1, -1, belly ? -belly * 0.15 : -0.4);
  g.fillStyle = col(pal, 'belly', k);
  if (belly === 0) ribbon(g, pts, w0, w1, -0.45, 0.45);
  else if (belly) ribbon(g, pts, w0, w1, belly > 0 ? 0.35 : -1, belly > 0 ? 1 : -0.35);
  g.strokeStyle = ph2 ? pal.seam2 : pal.seam; g.lineWidth = 0.8;
  g.beginPath();
  for (let i = 1; i < pts.length - 1; i += 1) { // segment seams across the body
    const p = pts[i], h = lerp(w0, w1, p.t) / 2;
    g.moveTo(p.x - p.nx * h, p.y - p.ny * h); g.lineTo(p.x + p.nx * h, p.y + p.ny * h);
  }
  g.stroke();
  if (!dim) { g.strokeStyle = ph2 ? pal.sheen2 : pal.sheen; g.lineWidth = 0.8; g.beginPath(); pts.forEach((p, i) => { const h = lerp(w0, w1, p.t) / 2, x = p.x - p.nx * h * 0.6, y = p.y - p.ny * h * 0.6; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }
  if (ph2) { // drowned: the ribs show through
    g.strokeStyle = pal.rib; g.lineWidth = 1;
    g.beginPath();
    for (let i = 2; i < pts.length - 2; i += 2) { const p = pts[i], h = lerp(w0, w1, p.t) / 2; g.moveTo(p.x - p.nx * h * 0.7 - p.ny * 1.5, p.y - p.ny * h * 0.7 + p.nx * 1.5); g.quadraticCurveTo(p.x, p.y, p.x + p.nx * h * 0.7 - p.ny * 1.5, p.y + p.ny * h * 0.7 + p.nx * 1.5); }
    g.stroke();
  }
  const back = belly ? -belly : 1;
  for (let i = 1; i < pts.length - 1; i++) { // barnacles crusting its back
    if (hash(i, seed) > 0.32) continue;
    const p = pts[i], h = lerp(w0, w1, p.t) / 2, o = back * h * (0.3 + hash(i, seed + 1) * 0.4);
    g.fillStyle = col(pal, 'barnacle', k); disc(g, p.x + p.nx * o, p.y + p.ny * o, 1.3);
    g.fillStyle = col(pal, 'pit', k); disc(g, p.x + p.nx * o, p.y + p.ny * o, 0.55);
  }
  if (!spines) return;
  for (let i = 1; i < pts.length - 1; i += 2) { // fin spines down its spine, glowing (torn in the Wail)
    const p = pts[i], h = lerp(w0, w1, p.t) / 2, bx = p.x + p.nx * back * h * 0.9, by = p.y + p.ny * back * h * 0.9, len = (3.5 + hash(i, seed + 2) * 1.5) * (ph2 ? 1.3 : 1);
    const tx = bx + p.nx * back * len, ty = by + p.ny * back * len;
    g.fillStyle = col(pal, 'fin', k, 1); poly(g, [[bx - p.ny * 2, by + p.nx * 2], [tx, ty], [bx + p.ny * 2, by - p.nx * 2]]);
    g.fillStyle = col(pal, 'fin', k, 0); poly(g, [[bx, by], [tx, ty], [bx + p.ny * 1.4, by - p.nx * 1.4]]);
    if (i % 4 === 1) lit(g, L, tx, ty, 5, ph2 ? pal.finGlow2 : pal.finGlow, 0.25 + Math.sin(t * 3 + i) * 0.08);
  }
}

// A fin as a fan of rays from (x, y), spread between angles a0 and a1, rays len long, its membrane
// glowing; in the Wail a torn veil, longer and ragged.
function fan(g, pal, L, x, y, a0, a1, len, k, ph2, t, n = 4) {
  const tip = (i) => { const a = lerp(a0, a1, i / (n - 1)) + Math.sin(t * 3 + i) * 0.06, l = len * (ph2 ? 1.25 + hash(i, 7) * 0.35 : 1); return [x + Math.cos(a) * l, y + Math.sin(a) * l]; };
  const tips = Array.from({ length: n }, (_, i) => tip(i));
  g.fillStyle = col(pal, 'fin', k, 1); poly(g, [[x, y], ...tips]);
  g.fillStyle = col(pal, 'fin', k, 0);
  for (let i = 0; i < n - 1; i++) { const [ax, ay] = tips[i], [bx, by] = tips[i + 1]; poly(g, [[x, y], [ax, ay], [lerp(ax, bx, 0.5) + (ph2 ? (hash(i, 9) - 0.5) * 3 : 0), lerp(ay, by, 0.5) + (ph2 ? 2 : 0)]]); }
  g.strokeStyle = col(pal, 'finRay', k); g.lineWidth = 0.7; g.beginPath(); for (const [tx, ty] of tips) { g.moveTo(x, y); g.lineTo(tx, ty); } g.stroke();
  const [mx, my] = tips[n >> 1];
  lit(g, L, lerp(x, mx, 0.6), lerp(y, my, 0.6), len * 0.9, ph2 ? pal.finGlow2 : pal.finGlow, 0.35 + Math.sin(t * 2.5) * 0.08);
}

// The tail's fluke at its tip: two lobes either side of the way it points.
function fluke(g, pal, L, pts, k, ph2, t, dim) {
  const p = pts[pts.length - 1], q = pts[pts.length - 3], a = Math.atan2(p.y - q.y, p.x - q.x);
  fan(g, pal, L, p.x, p.y, a - 1, a - 0.25, 10, k, ph2, t, 3);
  fan(g, pal, L, p.x, p.y, a + 0.25, a + 1, 10, k, ph2, t + 1, 3);
  if (dim) return;
  g.fillStyle = col(pal, 'body', k, 0); disc(g, p.x, p.y, 2.2);
}

// The coral crown, as branches from the top of the head (x0 its middle; xs how far it splays across,
// -1 to 1 seen side-on as it leans back). In the Wail it is shed: broken stubs are all that is left.
const CORAL_SIDE = [
  [[1, -7], [0, -14], [-3, -20], [-2, -26]], [[0, -14], [4, -18], [5, -23]], [[-3, -20], [-7, -23], [-8, -27]],
  [[6, -7], [7, -12], [10, -16], [12, -21]], [[7, -12], [4, -16]], [[10, -16], [14, -16]], [[-3, -6], [-7, -11], [-10, -13]],
];
const CORAL_FRONT = [
  [[-3, -8], [-5, -15], [-10, -20], [-11, -27]], [[-5, -15], [-1, -20], [-1, -25]], [[-10, -20], [-15, -22]],
  [[3, -8], [5, -15], [10, -20], [11, -27]], [[5, -15], [1, -20]], [[10, -20], [15, -22], [17, -26]], [[0, -9], [0, -15]],
];
function crown(g, pal, L, side, back, k, ph2, shed, t) {
  const set = side ? CORAL_SIDE : CORAL_FRONT;
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (ph2) { // the stubs where it broke away, off the skull
    for (const br of set.filter((q) => q[0][1] > -10)) {
      const [x0, y0] = br[0], [x1, y1] = br[1], sx = lerp(x0, x1, 0.45), sy = lerp(y0, y1, 0.45);
      g.strokeStyle = pal.stubDark; g.lineWidth = 3; line(g, [[x0, y0], [sx, sy]]);
      g.strokeStyle = pal.stub; g.lineWidth = 1.6; line(g, [[x0, y0], [sx, sy]]);
    }
    return;
  }
  set.forEach((br, i) => {
    const w = br.length > 3 ? 2.6 : 1.8, far = side && i === set.length - 1;
    const pts = br.map(([x, y], j) => [x + (j ? Math.sin(t * 1.5 + i) * 0.4 * j : 0) + (shed > 0 ? Math.sin(t * 50 + i) * shed * j : 0), y]);
    g.strokeStyle = pal.coralDark; g.lineWidth = w + 1; line(g, pts);
    g.strokeStyle = back || far ? pal.coralDark : pal.coral; g.lineWidth = w; line(g, pts);
    if (!back && !far) { g.strokeStyle = pal.coralHi; g.lineWidth = 0.8; line(g, pts.map(([x, y]) => [x - 0.5, y - 0.3])); }
    const [tx, ty] = pts[pts.length - 1];
    g.fillStyle = back ? pal.coral : pal.coralTip; disc(g, tx, ty, w * 0.55);
  });
  if (shed > 0) { // light breaking through the coral as it lets go
    g.strokeStyle = `rgba(${pal.crack},${0.4 + shed * 0.6})`; g.lineWidth = 0.8;
    set.slice(0, Math.ceil(shed * set.length)).forEach((br) => line(g, br.slice(0, 3)));
    lit(g, L, 0, -16, 10 + shed * 10, pal.crack, 0.2 + shed * 0.4);
  }
}

// The head side-on, about where the neck meets it (the jaw's hinge just below): the skull with its
// snout to the right, the lower jaw dropping open, one eye, the frill behind, the crown on top.
function headSide(g, pal, L, P, k, ph2, shed, dazed, t, roar) {
  fan(g, pal, L, -3, -1, Math.PI + 0.35, Math.PI + 1.25, 12, k, ph2, t);
  const open = P.jaw * 0.55;
  g.fillStyle = col(pal, 'maw', k); poly(g, [[1, 2.5], [21, 1], [1 + Math.cos(open) * 18, 3 + Math.sin(open) * 18]]);
  if (open > 0.2) { g.fillStyle = pal.tongue; poly(g, [[3, 3.5], [12, 3 + open * 6], [15, 4 + open * 8], [6, 5 + open * 3]]); }
  g.save(); g.translate(1, 3); g.rotate(open);
  g.fillStyle = col(pal, 'body', k, 1); poly(g, [[-4, -1.5], [17, -1], [19, 0], [15, 3], [2, 4], [-5, 2]]);
  g.fillStyle = col(pal, 'belly', k); poly(g, [[0, 2], [15, 1.5], [14, 3], [2, 3.8]]);
  g.fillStyle = col(pal, 'teeth', k); for (const x of [5, 9, 13, 16]) poly(g, [[x - 1, -1], [x + 1, -1], [x, -3.2]]);
  g.restore();
  g.fillStyle = col(pal, 'body', k, 0); poly(g, [[-7, 3], [-6, -4], [-1, -8], [6, -8.5], [12, -6], [19, -3.5], [23, -0.5], [22, 1.5], [12, 2.5], [2, 3.5]]);
  g.fillStyle = col(pal, 'body', k, 1); poly(g, [[-7, 3], [-6, -1], [2, 1], [12, 0.5], [22, 1.5], [12, 2.5], [2, 3.5]]);
  g.fillStyle = col(pal, 'teeth', k); for (const x of [7, 11, 15, 19]) poly(g, [[x - 1, 1.6], [x + 1, 1.4], [x, 3.6]]);
  g.fillStyle = col(pal, 'barnacle', k); for (const [x, y] of [[-4, -3], [-2, -5.5], [1, -6.5]]) disc(g, x, y, 1.1);
  g.fillStyle = col(pal, 'pit', k); for (const [x, y] of [[-4, -3], [-2, -5.5], [1, -6.5]]) disc(g, x, y, 0.45);
  g.fillStyle = pal.nostril; disc(g, 19.5, -2.3, 0.7);
  eye(g, pal, L, 7, -3.5, k, ph2, dazed, t, roar);
  g.strokeStyle = pal.brow; g.lineWidth = 1.2; line(g, [[2.5, -7], [10.5, -5.2]]);
  crown(g, pal, L, true, false, k, ph2, shed, t);
}

// One eye: burning gold, or in the Wail a hollow socket with a cold point of light. Dazed, it rolls.
function eye(g, pal, L, x, y, k, ph2, dazed, t, roar) {
  g.fillStyle = pal.socket; disc(g, x, y, ph2 ? 2.8 : 2.5);
  if (dazed) { g.strokeStyle = col(pal, 'eye', k); g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, 1.4, t * 8, t * 8 + 4.5); g.stroke(); return; }
  const r = (ph2 ? 1 : 1.8) * (1 + roar * 0.25);
  g.fillStyle = col(pal, 'eye', k); disc(g, x, y, r);
  g.fillStyle = pal.glint; disc(g, x + 0.5, y - 0.6, ph2 ? 0.45 : 0.6);
  lit(g, L, x, y, (ph2 ? 9 : 7) * (1 + roar * 0.3), ph2 ? pal.eyeGlow2 : pal.eyeGlow, 0.6);
}

// The throat sac under the jaw, swelling and glowing as it sings.
function sac(g, pal, L, x, y, s, k, ph2, front) {
  const rx = (front ? 4 : 3.2) + s * 3, ry = 3 + s * 2.6;
  g.fillStyle = col(pal, 'sac', k); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  g.fillStyle = pal.sacHi; g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25, 0, 0, TAU); g.fill();
  lit(g, L, x, y, 6 + s * 12, ph2 ? pal.sacGlow2 : pal.sacGlow, 0.2 + s * 0.6);
}

// The head from the front: the broad snout facing us, both eyes, the frills either side, the jaw
// dropping open under it, the crown splaying up.
function headFront(g, pal, L, P, k, ph2, shed, dazed, t, roar) {
  for (const s of [-1, 1]) fan(g, pal, L, s * 9, -2, s > 0 ? -0.75 : Math.PI + 0.75, s > 0 ? 0.35 : Math.PI - 0.35, 12, k, ph2, t + s);
  const drop = P.jaw * 6;
  g.fillStyle = col(pal, 'maw', k); poly(g, [[-7, 4], [7, 4], [6, 5 + drop], [0, 6 + drop], [-6, 5 + drop]]);
  if (drop > 1.5) { g.fillStyle = pal.tongue; g.beginPath(); g.ellipse(0, 4.5 + drop * 0.7, 3, 1.4, 0, 0, TAU); g.fill(); }
  g.fillStyle = col(pal, 'body', k, 1); poly(g, [[-8, 4.5 + drop], [-6, 7 + drop], [0, 8.5 + drop], [6, 7 + drop], [8, 4.5 + drop], [0, 6 + drop]]);
  g.fillStyle = col(pal, 'teeth', k);
  for (const x of [-5, -2, 2, 5]) poly(g, [[x - 0.9, 5.5 + drop], [x + 0.9, 5.5 + drop], [x, 3.4 + drop]]);
  g.fillStyle = col(pal, 'body', k, 0); poly(g, [[-11, -2], [-8, -8], [0, -10], [8, -8], [11, -2], [8, 4], [0, 5], [-8, 4]]);
  g.fillStyle = col(pal, 'body', k, 1); poly(g, [[-11, -2], [-8, 4], [0, 5], [8, 4], [11, -2], [6, 1], [0, 2], [-6, 1]]);
  g.fillStyle = col(pal, 'teeth', k); for (const x of [-5, -2, 2, 5]) poly(g, [[x - 0.9, 4.2], [x + 0.9, 4.2], [x, 6.4]]);
  g.fillStyle = col(pal, 'barnacle', k); for (const [x, y] of [[-3, -7], [4, -7.5], [0, -8.5]]) disc(g, x, y, 1);
  g.fillStyle = col(pal, 'pit', k); for (const [x, y] of [[-3, -7], [4, -7.5], [0, -8.5]]) disc(g, x, y, 0.4);
  g.fillStyle = pal.nostril; for (const s of [-1, 1]) disc(g, s * 2, 2, 0.7);
  for (const s of [-1, 1]) eye(g, pal, L, s * 6, -3, k, ph2, dazed, t, roar);
  g.strokeStyle = pal.brow; g.lineWidth = 1.2; g.beginPath(); for (const s of [-1, 1]) { g.moveTo(s * 9, -6.5); g.lineTo(s * 3, -4.8); } g.stroke();
  crown(g, pal, L, false, false, k, ph2, shed, t);
}

// The head from behind: the round of its skull, scaled and crusted, the frills' backs, the crown, and
// nothing of its face.
function headBack(g, pal, L, P, k, ph2, shed, t) {
  for (const s of [-1, 1]) fan(g, pal, L, s * 8, -1, s > 0 ? -0.6 : Math.PI + 0.6, s > 0 ? 0.45 : Math.PI - 0.45, 11, k, ph2, t + s);
  g.fillStyle = col(pal, 'body', k, 1); g.beginPath(); g.ellipse(0, -1, 10, 8.5, 0, 0, TAU); g.fill();
  g.fillStyle = col(pal, 'body', k, 0); g.beginPath(); g.ellipse(0, -2.5, 8.5, 6.5, 0, 0, TAU); g.fill();
  g.strokeStyle = ph2 ? pal.seam2 : pal.seam; g.lineWidth = 0.8; g.beginPath();
  for (const [x, y] of [[-5, -4], [0, -5], [5, -4], [-3, 0], [3, 0], [0, 3]]) { g.moveTo(x - 2.2, y); g.quadraticCurveTo(x, y + 2, x + 2.2, y); }
  g.stroke();
  g.fillStyle = col(pal, 'barnacle', k); for (const [x, y] of [[-6, 1], [6, -1], [-1, -7]]) disc(g, x, y, 1.1);
  g.fillStyle = col(pal, 'pit', k); for (const [x, y] of [[-6, 1], [6, -1], [-1, -7]]) disc(g, x, y, 0.45);
  crown(g, pal, L, false, true, k, ph2, shed, t);
}

// Coral flung off as the Wail begins, tumbling away over 0.6 s.
function shedCoral(g, pal, phaseT) {
  const e = clamp01(phaseT / 0.6);
  if (e >= 1) return;
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (hash(i, 51) - 0.5) * 2.6, v = 50 + hash(i, 52) * 60, x = Math.cos(a) * v * phaseT, y = -60 + Math.sin(a) * v * phaseT + 120 * phaseT * phaseT;
    g.strokeStyle = i % 2 ? pal.coral : pal.coralDark; g.lineWidth = 2;
    g.globalAlpha = 1 - e;
    line(g, [[x, y], [x + Math.cos(i + phaseT * 9) * 4, y + Math.sin(i + phaseT * 9) * 4]]);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- the painter
export function paintTide(g, b, L, pal = TIDE_PAL) {
  const P = tidePose(b), sh = shape(b, P), { S, H, view } = sh, side = view === 'side', back = view === 'back';
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, k = drainK(b), roar = roarK(b);
  const shed = !ph2 && st === 'transform' ? clamp01(1 - (b.timer ?? 0) / 1.5) : 0, dazed = st === 'surface' && P.rear < 0;
  g.save();
  g.beginPath(); g.rect(-91, -124, 182, 125); g.clip(); // the waterline: what is under it isn't seen
  g.translate(0, P.sink * 96 * S);
  g.scale(S, S);
  const loops = sh.loops.map(loopCurve), tail = tailCurve(sh.tail);
  const drawLoops = (dim) => {
    body(g, pal, L, tail, 6, 3, k, ph2, t, { dim, seed: 3, spines: false });
    fluke(g, pal, L, tail, k, ph2, t, dim);
    loops.slice().reverse().forEach((pts, i) => { const lp = sh.loops[loops.length - 1 - i]; body(g, pal, L, pts, lp.w[0], lp.w[1], k, ph2, t, { dim, seed: 10 + i }); });
  };
  const head = () => {
    g.save(); g.translate(H[0], H[1]); g.rotate(sh.th);
    if (side) headSide(g, pal, L, P, k, ph2, shed, dazed, t, roar);
    else if (back) headBack(g, pal, L, P, k, ph2, shed, t);
    else headFront(g, pal, L, P, k, ph2, shed, dazed, t, roar);
    g.restore();
  };
  if (back) { // from behind, the neck and head are farthest; its loops trail toward us
    body(g, pal, L, sh.neck, sh.nw[0], sh.nw[1], k, ph2, t, { belly: null, seed: 1, spines: false });
    neckRidge(g, pal, L, sh.neck, sh.nw[0], sh.nw[1], k, ph2, t);
    head();
    drawLoops(false);
  } else {
    drawLoops(!side);
    body(g, pal, L, sh.neck, sh.nw[0], sh.nw[1], k, ph2, t, { belly: side ? 1 : 0, seed: 1, spines: side });
    if (side) sac(g, pal, L, H[0] + 6 + P.lean * 2, H[1] + 9, P.sac, k, ph2, false);
    else sac(g, pal, L, H[0], H[1] + 13 + P.jaw * 4, P.sac, k, ph2, true);
    head();
  }
  g.restore();
  if (ph2) { g.save(); g.scale(S, S); shedCoral(g, pal, b.phaseT ?? 9); g.restore(); }
}

// From behind: the fin crest running down the back of its neck, its spines splaying out either side.
function neckRidge(g, pal, L, pts, w0, w1, k, ph2, t) {
  g.fillStyle = col(pal, 'fin', k, 1); ribbon(g, pts, w0, w1, -0.22, 0.22);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], s = i % 2 ? 1 : -1, h = lerp(w0, w1, p.t) / 2, len = (4 + (i % 3)) * (ph2 ? 1.3 : 1);
    const tip = [p.x + p.nx * s * (h + len), p.y + p.ny * s * (h + len) - len * 0.6];
    g.fillStyle = col(pal, 'fin', k, 1); poly(g, [[p.x - p.ny * 2, p.y + p.nx * 2], tip, [p.x + p.ny * 2, p.y - p.nx * 2]]);
    g.fillStyle = col(pal, 'fin', k, 0); poly(g, [[p.x, p.y], tip, [p.x + p.ny * 1.2, p.y - p.nx * 1.2]]);
    if (i % 3 === 0) lit(g, L, tip[0], tip[1], 5, ph2 ? pal.finGlow2 : pal.finGlow, 0.3 + Math.sin(t * 3 + i) * 0.08);
  }
  g.strokeStyle = col(pal, 'finRay', k); g.lineWidth = 0.7; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
}

// Where the head is, for effects drawn over it, from the boss's feet: [x, y] on screen at scale 1,
// mirrored for a side view facing left.
export function tideHead(b) {
  const P = tidePose(b), sh = shape(b, P), f = (b.view || 'front') === 'side' && (b.face ?? 1) < 0 ? -1 : 1;
  return [sh.H[0] * sh.S * f, (sh.H[1] + P.sink * 96) * sh.S];
}

// Over it, drawn straight onto the world: foam where it breaks the water, the splash as it dives and
// bursts up, a dazed swirl, and in the Wail wisps rising off its drowned body and water running off it.
export function tideOver(g, b, x, y, a = 1, scale = 1, pal = TIDE_PAL) {
  const t = b.anim || 0, st = b.state, P = tidePose(b), sh = shape(b, P), S = sh.S * scale, f = sh.view === 'side' && (b.face ?? 1) < 0 ? -1 : 1, timer = b.timer ?? 0;
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  if (P.sink < 0.97) { // foam rings where its body breaks the surface
    g.lineWidth = Math.max(1, scale);
    sh.water.forEach((wx, i) => {
      const r = (3 + Math.sin(t * 4 + i) * 0.8) * S;
      g.strokeStyle = `rgba(${pal.foam},${0.55 * (1 - P.sink)})`; g.beginPath(); g.ellipse(x + wx * S * f, y + 2 * scale, r + 1.5 * S, r * 0.35, 0, 0, TAU); g.stroke();
    });
  }
  const splash = (k, n, h) => { // droplets thrown up out of the pool, falling back
    for (let i = 0; i < n; i++) {
      const q = clamp01(k - hash(i, 61) * 0.2), ang = -Math.PI / 2 + (hash(i, 62) - 0.5) * 1.8, v = (40 + hash(i, 63) * 50) * h;
      if (q <= 0 || q >= 1) continue;
      const px = x + Math.cos(ang) * v * q * scale, py = y + (Math.sin(ang) * v * q + 90 * h * q * q) * scale;
      if (py > y + 3 * scale) continue;
      g.fillStyle = `rgba(${i % 3 ? pal.waterHi : pal.foam},${1 - q})`; g.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(scale * (1 + (i % 4 === 0)))), Math.max(2, Math.round(scale * 2)));
    }
  };
  if (st === 'dive' && DIVE - timer < SINK) splash((DIVE - timer) / SINK, 14, 0.7); // not where it swims to
  if (st === 'surface') { const e = SURFACE - timer; splash(clamp01(e / 0.7), 26, 1.2); if (e < 0.25) glow(g, x, y - 20 * S, 40 * S, pal.foam, 0.35 * (1 - e / 0.25)); }
  if (st === 'surface' && P.rear < -0.1) { const [hx, hy] = tideHead(b); dizzyStars(g, x + hx * scale, y + (hy - 14) * scale, t, 3); }
  if ((b.phase || 1) > 1 && P.sink < 0.9) { // the Wail: wisps rising off it, water streaming from its jaw
    for (let i = 0; i < 7; i++) {
      const q = (t * 0.5 + i / 7) % 1, wx = x + ((hash(i, 71) - 0.5) * 50 + Math.sin(t * 2 + i) * 4) * S, wy = y + (-10 - hash(i, 72) * 40 - q * 30) * S;
      g.fillStyle = `rgba(${pal.wisp},${0.28 * Math.sin(q * Math.PI)})`; g.beginPath(); g.ellipse(wx, wy, (2 + q * 4) * S, (1.5 + q * 3) * S, 0, 0, TAU); g.fill();
    }
    const [hx, hy] = tideHead(b);
    for (let i = 0; i < 3; i++) { const q = (t * 1.3 + i / 3) % 1; g.fillStyle = `rgba(${pal.waterHi},${1 - q})`; g.fillRect(Math.round(x + (hx + f * (sh.view === 'side' ? 10 : 0) + (i - 1) * 2) * scale), Math.round(y + (hy + 6 + q * 22) * scale), Math.max(1, Math.round(scale)), Math.max(2, Math.round(2 * scale))); }
  }
  g.restore();
}

// ---------------------------------------------------------------- world effects
// The floor beneath everything that stands: the pool it lies in (and, diving, the pool it left and the
// ripple it will burst up from), the room's edges flooding in the Wail, the whirlpool, the tidal wave,
// the song rings and the tail's sweep along its line.
export function drawTideWater(g, b, zones, cam, map, pal = TIDE_PAL) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, S = sizeOf(b);
  if (ph2 && map) flood(g, pal, map, cam, easeOut((b.phaseT ?? 9) / 1.2), t);
  if (st === 'dive') {
    const from = b.tideFrom || b, q = clamp01((DIVE - (b.timer ?? 0)) / (DIVE * 0.8));
    pool(g, pal, from.x - cam.left, from.y - cam.top, 32 * S * (1 - q * q), t, 1 - q * 0.5);
  } else {
    const fade = st === 'dying' ? clamp01((b.timer ?? 0) / 1.6) : 1;
    pool(g, pal, b.x - cam.left, b.y - cam.top, (st === 'surface' ? lerp(40, 32, clamp01((SURFACE - (b.timer ?? 0)) / 0.5)) : 32) * S, t, fade);
  }
  for (const z of zones) {
    if (z.owner !== b) continue;
    const live = z.t <= 0, age = live ? -z.t : z.t0 - z.t, k = live ? 1 : 1 - clamp01(z.t / z.t0);
    const x = (z.x ?? 0) - cam.left, y = (z.y ?? 0) - cam.top;
    if (z.tideDive) { // dark water welling up where it will burst out, its ripples closing in
      pool(g, pal, x, y, z.r * (0.3 + 0.9 * k), t, 0.5 + 0.5 * k);
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const r = z.r * (1.6 - ((age * 1.4 + i / 3) % 1) * 1.2); g.strokeStyle = `rgba(${pal.foam},${0.25 + 0.45 * k})`; g.beginPath(); g.ellipse(x, y, r, r * 0.4, 0, 0, TAU); g.stroke(); }
    } else if (z.tideWhirl) whirlpool(g, pal, x, y, z.r, live ? 1 : k * 0.6, age, z.life + z.t);
    else if (z.tideWave) wave(g, pal, z, cam, k, live, age);
    else if (z.tideRing && live) song(g, pal, z, x, y, age);
    else if (z.tideSweep) sweepLine(g, pal, z, cam, k, live, age);
  }
}

// A pool of dark water: its depths, a lit rim, rings spreading on it, glints. r: its half-width.
function pool(g, pal, x, y, r, t, a = 1) {
  if (r < 1 || a <= 0) return;
  g.fillStyle = `rgba(${pal.water},${0.85 * a})`; g.beginPath(); g.ellipse(x, y + 1, r, r * 0.32, 0, 0, TAU); g.fill();
  g.fillStyle = `rgba(${pal.water},${0.6 * a})`; g.beginPath(); g.ellipse(x, y + 1.5, r * 0.7, r * 0.2, 0, 0, TAU); g.fill();
  g.strokeStyle = `rgba(${pal.waterHi},${0.7 * a})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 1, r, r * 0.32, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  for (let i = 0; i < 2; i++) { const q = (t * 0.45 + i / 2) % 1, rr = r * (0.3 + q * 0.7); g.strokeStyle = `rgba(${pal.waterHi},${0.4 * (1 - q) * a})`; g.beginPath(); g.ellipse(x, y + 1, rr, rr * 0.32, 0, 0, TAU); g.stroke(); }
  for (let i = 0; i < 4; i++) { if (Math.sin(t * 3 + i * 1.7) < 0.6) continue; g.fillStyle = `rgba(${pal.foam},${0.8 * a})`; g.fillRect(Math.round(x + (hash(i, 81) - 0.5) * r * 1.4), Math.round(y + 1 + (hash(i, 82) - 0.5) * r * 0.4), 2, 1); }
}

// The Wail floods the room's edges: a band of water along each wall, lapping in and out.
function flood(g, pal, map, cam, k, t) {
  if (k <= 0) return;
  const T = 16, x0 = T - cam.left, y0 = T - cam.top, x1 = map.pixelW - T - cam.left, y1 = map.pixelH - T - cam.top, d = 10 * k;
  const top = (x) => y0 + d + Math.sin(t * 2 + x * 0.08) * 2, bot = (x) => y1 - d - Math.sin(t * 2.2 + x * 0.08) * 2;
  const left = (y) => x0 + d + Math.sin(t * 2.2 + y * 0.08) * 2, right = (y) => x1 - d - Math.sin(t * 2 + y * 0.08) * 2;
  g.fillStyle = `rgba(${pal.flood},${0.7 * k})`;
  g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); // the room's floor, less its dry middle
  g.moveTo(left(y0 + d), top(x0 + d));
  for (let x = x0 + d; x <= x1 - d; x += 8) g.lineTo(x, top(x));
  for (let y = y0 + d; y <= y1 - d; y += 8) g.lineTo(right(y), y);
  for (let x = x1 - d; x >= x0 + d; x -= 8) g.lineTo(x, bot(x));
  for (let y = y1 - d; y >= y0 + d; y -= 8) g.lineTo(left(y), y);
  g.closePath();
  g.fill('evenodd');
  g.fillStyle = `rgba(${pal.foam},${0.5 * k})`;
  for (let x = x0 + d + 4; x < x1 - d; x += 13) { g.fillRect(Math.round(x), Math.round(top(x)), 3, 1); g.fillRect(Math.round(x), Math.round(bot(x)), 3, 1); }
  for (let y = y0 + d + 4; y < y1 - d; y += 13) { g.fillRect(Math.round(left(y)), Math.round(y), 1, 3); g.fillRect(Math.round(right(y)), Math.round(y), 1, 3); }
}

// A whirlpool, round as the ground it mires: arms of water wheeling in to a dark eye. k: how far it
// has gathered; left: seconds before it lets go.
function whirlpool(g, pal, x, y, r, k, age, left) {
  const fade = clamp01(left / 0.4) * k;
  if (fade <= 0) return;
  g.fillStyle = `rgba(${pal.whirl},${0.7 * fade})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  for (const [q, a] of [[0.7, 0.35], [0.4, 0.6], [0.18, 0.9]]) { g.fillStyle = `rgba(${pal.water},${a * fade})`; g.beginPath(); g.arc(x, y, r * q, 0, TAU); g.fill(); }
  for (let arm = 0; arm < 5; arm++) {
    g.strokeStyle = `rgba(${arm % 2 ? pal.waterHi : pal.foam},${0.85 * fade})`; g.lineWidth = arm % 2 ? 1 : 2; g.beginPath();
    for (let i = 0; i <= 16; i++) { const q = i / 16, a = arm * (TAU / 5) - age * 3.2 + q * 3.6, rr = r * (1 - q * 0.85); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
  }
  g.strokeStyle = `rgba(${pal.foam},${0.6 * fade})`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
}

// The tidal wave, one length of it: water gathering along the wall while it counts down, then a wall
// of water rolling on, foam on its crest and spray thrown off ahead of it.
function wave(g, pal, z, cam, k, live, age) {
  const sp = Math.hypot(z.vx, z.vy) || 1, ux = z.vx / sp, uy = z.vy / sp, h = z.w / 2;
  const x1 = z.x1 - cam.left, y1 = z.y1 - cam.top, x2 = z.x2 - cam.left, y2 = z.y2 - cam.top;
  const band = (back, front, rgb, a) => { g.fillStyle = `rgba(${rgb},${a})`; poly(g, [[x1 + ux * front, y1 + uy * front], [x2 + ux * front, y2 + uy * front], [x2 + ux * back, y2 + uy * back], [x1 + ux * back, y1 + uy * back]]); };
  if (!live) { band(-h, -h + z.w * k, pal.water, 0.35 + 0.4 * k); band(-h + z.w * k - 2, -h + z.w * k, pal.foam, 0.5 * k); return; }
  band(-h - 14, -h, pal.water, 0.25); // wet floor trailing behind
  band(-h, h, pal.water, 0.8);
  band(-h * 0.2, h * 0.6, pal.waterHi, 0.6);
  band(h * 0.5, h, pal.foam, 0.85);
  const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.floor(L / 9));
  for (let i = 0; i < n; i++) { // curls of foam riding the crest
    const q = (i + 0.5) / n, cx = lerp(x1, x2, q) + ux * (h + 1), cy = lerp(y1, y2, q) + uy * (h + 1), bob = Math.sin(age * 9 + i * 1.9);
    g.fillStyle = `rgba(${pal.foam},${0.6 + 0.3 * bob})`; g.fillRect(Math.round(cx + ux * bob), Math.round(cy + uy * bob), 2, 2);
  }
}

// A song ring sung out from the throat sac: a shimmer along it, brighter at its crest, open at its gaps.
function song(g, pal, z, x, y, age) {
  const fade = clamp01((z.life + z.t) / 0.5);
  if (fade <= 0) return;
  const gaps = z.gaps.map(([a, hw]) => [a - hw, a + hw]).sort((p, q) => p[0] - q[0]);
  const arcs = gaps.map((gp, i) => [gp[1], (gaps[(i + 1) % gaps.length][0]) + (i === gaps.length - 1 ? TAU : 0)]);
  for (const [w, a] of [[z.width, 0.25], [2, 0.9]]) {
    g.strokeStyle = `rgba(${pal.ring},${a * fade})`; g.lineWidth = w;
    for (const [a0, a1] of arcs) { g.beginPath(); g.ellipse(x, y, z.r, z.r, 0, a0, a1); g.stroke(); }
  }
  g.fillStyle = `rgba(${pal.foam},${0.9 * fade})`;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + age * 1.5;
    if (z.gaps.some(([ga, hw]) => Math.abs(Math.atan2(Math.sin(a - ga), Math.cos(a - ga))) < hw)) continue;
    g.fillRect(Math.round(x + Math.cos(a) * z.r), Math.round(y + Math.sin(a) * z.r) - 1, 1, 2);
  }
}

// The tail's sweep: water churning along its line while the tail coils, then a lash of spray racing
// down it from the warden's end.
function sweepLine(g, pal, z, cam, k, live, age) {
  const x1 = z.x1 - cam.left, x2 = z.x2 - cam.left, y = z.y1 - cam.top, dir = z.from || 1, L = x2 - x1;
  if (!live) {
    g.fillStyle = `rgba(${pal.foam},${0.25 + 0.5 * k})`;
    for (let i = 0; i < L / 12; i++) { const q = ((i * 12 + age * 60 * dir) % L + L) % L; g.fillRect(Math.round(x1 + q), Math.round(y + Math.sin(i * 1.3 + age * 6) * 2 * k), 3, 1); }
    return;
  }
  const q = clamp01(age / Math.max(0.05, z.life)), head = dir > 0 ? x1 + L * q : x2 - L * q;
  g.fillStyle = `rgba(${pal.waterHi},0.7)`; g.fillRect(Math.round(Math.min(head, dir > 0 ? x1 : x2)), Math.round(y - 3), Math.round(L * q), 6);
  g.fillStyle = `rgba(${pal.foam},0.9)`; g.fillRect(Math.round(head - 4), Math.round(y - 6), 8, 12);
}

// ---------------------------------------------------------------- the jets
// Where a jet leaves its jaws, from its feet: [x, y] the start of its track on the floor, under the
// snout (spat down the screen, in front of its body, so it is drawn over it), and how high above that
// track the jaws are, for the jet to fall from.
export function tideMouth(b) {
  const [hx, hy] = tideHead(b), side = (b.view || 'front') === 'side', f = (b.face ?? 1) < 0 ? -1 : 1, y = -10 + (b.cdy || 0) * 18;
  return [hx + (side ? f * 16 * sizeOf(b) : 0), y, Math.max(0, y - hy - 3)];
}
