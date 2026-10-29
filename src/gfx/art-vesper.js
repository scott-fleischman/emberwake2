// Vesper's art. His own form: a tall, gaunt Kindler floating in tattered robes of cold violet flame,
// a hollow crown on his white hair and a cracked, dark ember in his chest. Past half (phase 2) the
// robes burn away and what they hid stands up: a towering shadow on wings of smoke, the fire he stole
// showing gold through its cracks. The painter draws around his feet facing the camera (b.view
// 'front', the default), from behind ('back') or turned right ('side', see bossart.js); every colour
// comes from a palette. Borrowing a warden, he is drawn by that warden's painter in VESPER_PALS, his
// crown set on its head (vesperCrown). Here too: his world effects, the gloam pillars, the light he
// pulls out of the sockets as he rises, his entrance and omen. Nothing here touches Math.random.
import { TAU, clamp01, easeOut, lerp, hash, poly, line, disc, roarK, lit, glow, flameTongue, dizzyStars } from './bossart.js';
import { THORN_PAL } from './art-thornmaw.js';
import { CINDER_PAL, cinderHover } from './art-cinder.js';
import { RIME_PAL, rimeHover } from './art-rime.js';
import { TIDE_PAL, tideHead } from './art-tide.js';

// A `2` key is the risen shadow's colour of the key without it.
export const VESPER_PAL = {
  robe: ['#5e3a8c', '#2c1640', '#0c0614'], robeFold: 'rgba(8,2,16,0.55)', robeLight: 'rgba(200,160,255,0.35)', hemFire: '#b48af0',
  sleeve: '#3a2058', sleeveFar: '#1e1030', hand: '#e8e2f2', handShade: '#9e94b4', nail: '#3a2a4e',
  skin: '#ece6f4', skinShade: '#a69cbc', socket: '#1a0e26', mouth: '#2a1638', hair: ['#f4f0fa', '#bcb2d0'], beard: '#d8d0e6',
  eye: '#e8d8ff', eyeGlow: '200,160,255', eye2: '#ffffff', eyeGlow2: '235,215,255',
  crown: '#140c1c', crownHi: '#5a4670', crownTip: '#c8a0ff', crownGlow: '200,160,255',
  ember: '#1c0e1a', emberRim: '#3a1e34', emberCrack: '#d8b0ff', emberGlow: '200,140,255',
  haft: '#1a1222', haftHi: '#4e3e62', blade: ['#f6f0ff', '#c8a0ff', '#5a2e98'], bladeGlow: '200,160,255',
  // the shadow: its body, the smoke of its wings, the stolen fire in its cracks, its claws
  body2: ['#2a1a3c', '#120a1c', '#040208'], smoke2: ['#3a2652', '#1a0e28', '#08040e'], smokeRim2: 'rgba(200,160,255,0.55)',
  crack2: '#ffc070', crackHot2: '#fff4d0', fireGlow2: '255,190,110', claw2: '#0a0610',
};
// What his world effects are drawn in: cold flame, wisps, smoke, the stolen fire, the swish of the
// scythe, his pool of shadow, the sockets' light.
const FX = { flame: ['#4a2280', '#9a6ae0', '#efe4ff'], burn: ['#ff6a20', '#ffc070', '#fff2c0'], wisp: '200,160,255', smoke: '30,14,44', fire: '255,200,120', swish: '#e8d8ff', pool: '18,8,28', light: '255,216,150' };

// The fight's clocks, shared with the moveset (vesper.js) so the poses keep time with it: a bolt's
// draw and the beat between bolts; the step, the scythe's swing and the recovery after it; the
// pillars' call and their eruption, and how long one stands; the ring; the beam's gathering and its
// sweep, the spent window after; the eclipse; a call to his kin; the shift into a warden's shape and
// the stun when one breaks.
export const BOLT_WIND = 0.5, BOLT_GAP = 0.32, STEP = 0.6, SCYTHE = 0.65, RECOVER = 1.3, PILLARS = 1.3, PILLAR_T = 1, PILLAR_LIFE = 0.7;
export const RING = 1.4, RING_T = 0.8, BEAM_T = 0.9, BEAM = 2, SPENT = 1.2, ECLIPSE = 2.6, CALL = 1, SHIFT = 1, STUN = 2.2;
const EASE = 0.22; // seconds a pose takes to ease into the next
const smooth = (v) => v * v * (3 - 2 * v);

// ---------------------------------------------------------------- his colours on the wardens
// Every colour of a warden's palette steeped in his: its brightness kept, its hue gone to Gloam (deep
// black through violet to cold white), so its shading still reads.
const RAMP = [[0, [8, 4, 14]], [80, [52, 26, 92]], [165, [168, 120, 240]], [255, [246, 240, 255]]];
// (Run while the modules load, so it leans on nothing from bossart.js.)
function gloam([r, g, b]) {
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  let i = 0; while (i < RAMP.length - 2 && L > RAMP[i + 1][0]) i++;
  const [l0, c0] = RAMP[i], [l1, c1] = RAMP[i + 1], k = Math.max(0, Math.min(1, (L - l0) / (l1 - l0)));
  return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
}
const hexOf = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
function steep(v) {
  if (Array.isArray(v)) return v.length === 3 && v.every((n) => typeof n === 'number') ? gloam(v) : v.map(steep);
  if (typeof v !== 'string') return v;
  return v.replace(/#([0-9a-f]{6})\b/gi, (_, h) => hexOf(gloam([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)))))
    .replace(/(^|[(])(\d+),(\d+),(\d+)/g, (_, pre, r, g, b) => pre + gloam([+r, +g, +b]).join(','));
}
const steeped = (pal) => Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, steep(v)]));
// His shots, whatever form throws them.
const SHOT = '200,160,255';
export const VESPER_PALS = {
  thornmaw: { ...steeped(THORN_PAL), shot: SHOT },
  cinder: { ...steeped(CINDER_PAL), shot: SHOT },
  rime: { ...steeped(RIME_PAL), shot: SHOT },
  tide: { ...steeped(TIDE_PAL), shot: SHOT },
};

// ---------------------------------------------------------------- the pose
// Arms: an angle from hanging straight down (0) round to straight up (PI), outward from the body
// (front and back) or forward (side): a/b the arm on the picture's left/right (side-on, far/near);
// bend at the elbow; reach: a cast pushed out. lean: forward; tilt: the head (back is negative);
// hover: up off the floor (negative); sink: the body settling; wings: how far they spread (phase 2);
// swing: the scythe, -1 drawn back to +1 swung through, and scy how much of it is there.
const KEYS = ['a', 'b', 'bend', 'reach', 'lean', 'tilt', 'hover', 'sink', 'wings', 'swing', 'scy'];
const pose = (o) => ({ a: 0.22, b: 0.22, bend: 0.35, reach: 0, lean: 0, tilt: 0, hover: -5, sink: 0, wings: 0.55, swing: 0, scy: 0, ...o });
const mixPose = (p, q, k) => Object.fromEntries(KEYS.map((key) => [key, lerp(p[key], q[key], k)]));
const ROAR = { a: 1.9, b: 1.9, bend: 0.2, tilt: -0.35, wings: 1 };

function rawPose(b) {
  const t = b.anim || 0, st = b.state, timer = b.timer ?? 0, bob = Math.sin(t * 2.2);
  let w = pose({ a: 0.2 + bob * 0.05, b: 0.24 - bob * 0.05, hover: -5 + bob * 1.5, wings: 0.55 + bob * 0.05 });
  if (st === 'bolts') w = pose({ a: 0.3, b: 1.35 + Math.sin(t * 9) * 0.06, bend: 0.1, reach: 1, lean: 0.06, hover: -6, wings: 0.7 });
  else if (st === 'step') w = pose({ a: 0.1, b: 0.1, bend: 0.6, sink: 6, lean: 0.1, hover: -2, wings: 0.2 });
  else if (st === 'scythe') {
    const k = clamp01(1 - timer / SCYTHE), strike = k > 0.78;
    w = pose({ a: strike ? 0.9 : 2.4, b: strike ? 0.6 : 2.2, bend: 0.25, lean: strike ? 0.28 : -0.12, hover: -4, wings: 0.8, scy: 1, swing: strike ? lerp(-1, 1, easeOut((k - 0.78) / 0.12)) : -easeOut(k / 0.4) });
  } else if (st === 'recover') w = pose({ a: 0.12, b: 0.35, bend: 0.5, lean: 0.3, tilt: 0.25, sink: 5, hover: -2, wings: 0.25, scy: clamp01(timer / RECOVER - 0.5) * 2, swing: 1 });
  else if (st === 'pillars') {
    const k = clamp01(1 - timer / PILLARS), down = k > PILLAR_T / PILLARS - 0.12;
    w = down ? pose({ a: 0.55, b: 0.55, bend: 0.1, lean: 0.18, sink: 4, wings: 0.9 }) : pose({ a: 2.6, b: 2.6, bend: 0.15, tilt: -0.15, hover: -8, wings: 1 });
  } else if (st === 'ring') w = pose({ a: 1.65, b: 1.65, bend: 0.05, tilt: -0.1, hover: -7, wings: 1 });
  else if (st === 'beam') w = pose({ a: 0.4, b: 1.45, bend: 0, reach: 1, lean: 0.08, hover: -6, wings: 0.85 });
  else if (st === 'eclipse') w = pose({ a: 2.75, b: 2.75, bend: 0.2, tilt: -0.25, hover: -9, wings: 1 });
  else if (st === 'spent') w = pose({ a: 0.1, b: 0.12, bend: 0.4, lean: 0.25, tilt: 0.3, sink: 6, hover: -1, wings: 0.15 });
  else if (st === 'call') w = pose({ a: 2.3, b: 0.3, bend: 0.2, tilt: -0.1, hover: -6, wings: 0.8 });
  else if (st === 'shift') w = pose({ a: 0.6, b: 0.6, bend: 1.6, sink: 2, tilt: 0.2, hover: -6 + Math.sin(t * 30) * 0.8, wings: 0.3 });
  else if (st === 'stunned') w = pose({ a: 0.08, b: 0.18, bend: 0.3, lean: -0.12, tilt: 0.35 + Math.sin(t * 2.6) * 0.18, sink: 4, hover: -2, wings: 0.2 });
  else if (st === 'transform') w = pose({ a: 1.3, b: 1.3, bend: 0.1, tilt: -0.4, hover: -9 + Math.sin(t * 40) * 0.6, wings: 1 });
  else if (st === 'rise') w = pose({ a: 2.2 + Math.sin(t * 7) * 0.1, b: 2.2 - Math.sin(t * 7) * 0.1, bend: 0.25, tilt: -0.5 + Math.sin(t * 16) * 0.06, hover: -10, wings: 1 });
  else if (st === 'defeated' || st === 'dying') w = pose({ a: 0.06, b: 0.1, bend: 0.5, lean: 0.2, tilt: 0.4, sink: 9, hover: -1, wings: 0.1 });
  const roar = roarK(b);
  if (roar && st !== 'rise') for (const [k, v] of Object.entries(ROAR)) w[k] = lerp(w[k], v, roar);
  return w;
}

// The pose as drawn: when his state changes it eases from the pose drawn then. The death flow's
// states take no ticks, so they never ease.
export function vesperPose(b) {
  const w = rawPose(b), st = b.state, fresh = b.vesperPoseState !== st;
  if (st === 'defeated' || st === 'dying' || st === 'rise') return w;
  const from = fresh ? b.vesperPoseNow : b.vesperPoseFrom, k = smooth(clamp01((fresh ? 0 : b.vesperPoseT ?? 9) / EASE));
  return from && k < 1 ? mixPose(from, w, k) : w;
}
// Visual bookkeeping, once a frame from the moveset's tick.
export function vesperPoseTick(b, dt) {
  if (b.vesperPoseState !== b.state) { b.vesperPoseState = b.state; b.vesperPoseFrom = b.vesperPoseNow; b.vesperPoseT = 0; }
  else b.vesperPoseT = (b.vesperPoseT ?? 9) + dt;
  b.vesperPoseNow = vesperPose(b);
}

// How far his robes have burned through the transform (to 1); risen, how far the shadow has grown.
const burnK = (b) => ((b.phase || 1) < 2 && b.state === 'transform' ? clamp01(1 - (b.timer ?? 0) / 1.5) : 0);
const riseK = (b) => ((b.phase || 1) > 1 ? easeOut((b.phaseT ?? 9) / 0.6) : 0);
const sizeOf = (b) => ((b.phase || 1) > 1 ? lerp(1.12, 1.24, riseK(b)) : 1.12); // tall, and taller risen

// ---------------------------------------------------------------- parts
// The hollow crown: a ring of black iron tines, open through the middle, each tipped with cold light,
// about its centre on the brow. s: its scale; side-on it narrows; from behind it's seen from inside.
function crown(g, pal, L, view, s, glowK = 1) {
  const side = view === 'side', back = view === 'back', xs = side ? 0.55 : 1;
  const tines = [[-6, 5], [-3.5, 8], [-1, 6], [1, 6], [3.5, 8], [6, 5]];
  g.fillStyle = pal.crown;
  for (const [x, h] of tines) poly(g, [[(x - 1.4) * xs * s, 0], [x * 1.1 * xs * s, -h * s], [(x + 1.4) * xs * s, 0]]);
  g.fillStyle = back ? pal.crown : pal.crownHi;
  for (const [x, h] of tines) poly(g, [[x * xs * s, 0], [x * 1.1 * xs * s, -h * s], [(x + 1.2) * xs * s, 0]]);
  g.fillStyle = pal.crown; g.fillRect(-7.4 * xs * s, -1.2 * s, 14.8 * xs * s, 2.6 * s); // the band
  g.fillStyle = pal.crownHi; g.fillRect(-7 * xs * s, -1 * s, 14 * xs * s, 0.8 * s);
  g.fillStyle = pal.crownTip;
  for (const [x, h] of tines) g.fillRect(x * 1.1 * xs * s - 0.5, -h * s - 0.5, 1, 1);
  lit(g, L, 0, -4 * s, 9 * s, pal.crownGlow, 0.35 * glowK);
}

// An arm from the shoulder (sx, sy): a sleeve of robe to a bony white hand. dir: +1 the arm on the
// picture's right (or side-on, forward), -1 its left. far: the arm behind the body, side-on, in shade.
function arm(g, pal, sx, sy, ang, bend, dir, reach, { far = false, ph2 = false, claws = false } = {}) {
  const ux = Math.sin(ang) * dir, uy = Math.cos(ang), e = [sx + ux * 11, sy + uy * 11];
  const a2 = ang + bend * (ang > 1.2 ? -1 : 1), vx = Math.sin(a2) * dir, vy = Math.cos(a2), len = 11 + reach * 3;
  const h = [e[0] + vx * len, e[1] + vy * len];
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = ph2 ? pal.body2[far ? 2 : 1] : far ? pal.sleeveFar : pal.sleeve; g.lineWidth = ph2 ? 4 : 4.4;
  line(g, [[sx, sy], e, h]);
  if (!ph2) { g.strokeStyle = far ? pal.sleeveFar : pal.robe[0]; g.lineWidth = 1.2; line(g, [[sx + 0.8, sy], [e[0] + 0.8, e[1]]]); }
  // the sleeve hangs open at the wrist
  if (!ph2) { g.fillStyle = far ? pal.sleeveFar : pal.sleeve; poly(g, [[h[0] - vy * 3.4 - vx * 2, h[1] + vx * 3.4 - vy * 2], [h[0] + vy * 3.4 - vx * 2, h[1] - vx * 3.4 - vy * 2], [h[0] + vx * 0.5, h[1] + vy * 0.5]]); }
  g.fillStyle = ph2 ? pal.claw2 : far ? pal.handShade : pal.hand; disc(g, h[0] + vx, h[1] + vy, 1.6);
  g.strokeStyle = ph2 ? pal.claw2 : far ? pal.handShade : pal.hand; g.lineWidth = 0.8;
  for (const o of [-0.5, 0, 0.5]) line(g, [[h[0] + vx, h[1] + vy], [h[0] + Math.sin(a2 + o) * dir * (claws ? 5 : 3.6), h[1] + Math.cos(a2 + o) * (claws ? 5 : 3.6)]]);
  return h;
}

// His robes of cold flame, shoulders (-46) to the hem, the hem torn into tongues that lick up; side-on
// they trail back. burn: the transform's fire eating them from the hem up.
function robe(g, pal, L, P, view, t, burn) {
  const side = view === 'side', sw = Math.sin(t * 1.8) * 1.4, top = -46;
  const hemY = -2 - burn * 30, n = 8, W = side ? 10 : 13;
  const hem = (i) => {
    const u = i / n, x = side ? lerp(7, -W - 6, u) + sw * u : lerp(-W, W, u) + sw;
    return [x, hemY + (i % 2 ? -5 - Math.sin(t * 7 + i) * 2 : Math.sin(t * 5 + i) * 1.2)];
  };
  const gg = g.createLinearGradient(0, top, 0, hemY); gg.addColorStop(0, pal.robe[0]); gg.addColorStop(0.55, pal.robe[1]); gg.addColorStop(1, pal.robe[2]);
  g.fillStyle = gg; g.beginPath();
  if (side) { g.moveTo(4, top); g.quadraticCurveTo(7, -24, ...hem(0)); for (let i = 1; i <= n; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(-10, -26, -5, top); }
  else { g.moveTo(-8, top); g.quadraticCurveTo(-11, -24, ...hem(0)); for (let i = 1; i <= n; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(11, -24, 8, top); }
  g.closePath(); g.fill();
  g.lineWidth = 1;
  g.strokeStyle = pal.robeFold; g.beginPath(); for (const x of side ? [-2, -6] : [-5, 0, 5]) { g.moveTo(x * 0.4, top + 4); g.quadraticCurveTo(x + sw * 0.5, -24, x * 1.5 + sw, hemY - 4); } g.stroke();
  g.strokeStyle = pal.robeLight; g.beginPath(); for (const x of side ? [2] : [-3, 3]) { g.moveTo(x * 0.5, top + 3); g.quadraticCurveTo(x + sw * 0.4, -26, x * 1.3 + sw, hemY - 7); } g.stroke();
  // flame licking up the tatters
  g.fillStyle = pal.hemFire;
  for (let i = 1; i < n; i += 2) { const [x, y] = hem(i), h = 4 + Math.sin(t * 9 + i * 1.7) * 1.5; poly(g, [[x - 1.6, y + 1], [x + Math.sin(t * 6 + i) * 0.8, y - h], [x + 1.6, y + 1]]); }
  if (burn > 0) lit(g, L, 0, hemY, 14 + burn * 10, pal.fireGlow2, 0.4 * burn);
}

// The risen shadow's body: broad shoulders tapering to a tail of smoke, the stolen fire glowing gold
// in the cracks across it.
function shadowBody(g, pal, L, view, t, k) {
  const side = view === 'side', back = view === 'back', top = -50, W = side ? 9 : 13;
  const gg = g.createLinearGradient(0, top, 0, 0); gg.addColorStop(0, pal.body2[0]); gg.addColorStop(0.5, pal.body2[1]); gg.addColorStop(1, pal.body2[2]);
  g.fillStyle = gg; g.beginPath();
  g.moveTo(-W, top + 2); g.quadraticCurveTo(-W - 3, top + 18, -W * 0.5, -14);
  for (let i = 0; i <= 6; i++) { const u = i / 6, x = lerp(-W * 0.5, W * 0.5, u) + Math.sin(t * 3 + i) * 1.5; g.lineTo(x, -4 + (i % 2 ? -4 : 3) + Math.sin(t * 4 + i * 2) * 2); }
  g.quadraticCurveTo(W + 3, top + 18, W, top + 2); g.quadraticCurveTo(0, top - 3, -W, top + 2); g.closePath(); g.fill();
  const cracks = side ? [[[2, -46], [4, -40], [1, -34], [4, -26]], [[-3, -42], [-1, -36], [-4, -30]]]
    : back ? [[[-6, -44], [-3, -38], [-6, -32]], [[5, -45], [3, -39], [6, -33], [3, -27]]]
    : [[[-1, -47], [-3, -41], [0, -35], [-2, -28], [1, -22]], [[-8, -44], [-5, -40], [-7, -34]], [[7, -45], [5, -39], [8, -33], [5, -28]]];
  for (const pts of cracks) {
    const q = pts.slice(0, Math.max(2, Math.ceil(pts.length * k)));
    g.strokeStyle = pal.crack2; g.lineWidth = 1.8; line(g, q);
    g.strokeStyle = pal.crackHot2; g.lineWidth = 0.6; line(g, q);
    lit(g, L, q[q.length - 1][0], q[q.length - 1][1], 7, pal.fireGlow2, 0.25 * k + 0.08 * Math.sin(t * 5));
  }
}

// Wings of smoke from his shoulders: layered lobes, each torn at its edge, a cold rim of light. s:
// the side it spreads (+1 the picture's right); spread 0 folded to 1 open.
function wing(g, pal, s, sx, sy, spread, t, far) {
  for (let i = 3; i >= 0; i--) {
    const a = lerp(0.35, 1.25, spread) - i * lerp(0.08, 0.32, spread) + Math.sin(t * 2.2 + i) * 0.05;
    const len = (30 + i * 7) * lerp(0.6, 1, spread), ex = sx + s * Math.sin(a) * len, ey = sy - Math.cos(a) * len * 0.8;
    const c = pal.smoke2[Math.min(2, i === 0 ? 0 : far ? 2 : 1)];
    g.fillStyle = c; g.beginPath(); g.moveTo(sx, sy);
    g.quadraticCurveTo(sx + s * len * 0.2, ey - 6, ex, ey);
    for (let j = 1; j <= 4; j++) { const u = j / 4; g.lineTo(lerp(ex, sx + s * 4, u) + s * Math.sin(t * 4 + j + i) * 1.5, lerp(ey, sy + 14 + i * 2, u) + (j % 2 ? 4 : -1)); }
    g.closePath(); g.fill();
    if (!far) { g.strokeStyle = pal.smokeRim2; g.lineWidth = 0.7; g.beginPath(); g.moveTo(sx + s * 2, sy - 2); g.quadraticCurveTo(sx + s * len * 0.2, ey - 6, ex, ey); g.stroke(); }
  }
}

// The cracked dark ember in his chest, glowing through its cracks (the risen shadow's burns gold).
function ember(g, pal, L, x, y, t, ph2) {
  g.fillStyle = pal.emberRim; g.beginPath(); g.ellipse(x, y, 3.6, 4.2, 0, 0, TAU); g.fill();
  g.fillStyle = pal.ember; g.beginPath(); g.ellipse(x, y, 2.8, 3.4, 0, 0, TAU); g.fill();
  g.strokeStyle = ph2 ? pal.crackHot2 : pal.emberCrack; g.lineWidth = 0.7;
  line(g, [[x - 1.5, y - 2.5], [x, y - 0.5], [x - 0.8, y + 1.2], [x + 0.6, y + 2.8]]); line(g, [[x, y - 0.5], [x + 1.8, y - 1.2]]);
  lit(g, L, x, y, 9 + Math.sin(t * 3) * 1.5, ph2 ? pal.fireGlow2 : pal.emberGlow, 0.45);
}

// His head about its centre: a gaunt face with sunken cheeks and burning eyes between falls of white
// hair, a thin beard; side-on in profile; from behind only hair. The risen shadow has no face but its
// eyes. The crown sits on the brow (y -6).
function head(g, pal, L, P, view, t, ph2, roar, s = 1) {
  const side = view === 'side', back = view === 'back';
  g.save(); g.rotate(P.tilt * (side ? 1 : 0.4)); g.scale(s, s);
  if (ph2) {
    g.fillStyle = pal.body2[0]; g.beginPath(); g.ellipse(side ? 0.5 : 0, 0, side ? 4.2 : 5, 5.6, 0, 0, TAU); g.fill();
    if (!back) {
      for (const ex of side ? [3] : [-2, 2]) { g.fillStyle = pal.eye2; g.fillRect(ex - 1, -1.2, 2, 1.4); lit(g, L, ex, -0.5, 6 + roar * 4, pal.eyeGlow2, 0.6); }
      if (roar > 0.3 || P.tilt < -0.3) { g.fillStyle = pal.crack2; g.fillRect(side ? 1.5 : -2, 2.5, side ? 2.5 : 4, 1.2); lit(g, L, 0, 3, 6, pal.fireGlow2, 0.4); }
    }
  } else if (back) {
    g.fillStyle = pal.hair[1]; g.beginPath(); g.ellipse(0, 0.5, 5, 6, 0, 0, TAU); g.fill();
    g.fillStyle = pal.hair[0]; g.beginPath(); g.moveTo(-5, -2); g.quadraticCurveTo(-6, 8, -4, 13); g.lineTo(4, 13); g.quadraticCurveTo(6, 8, 5, -2); g.quadraticCurveTo(0, -6, -5, -2); g.closePath(); g.fill();
    g.strokeStyle = pal.hair[1]; g.lineWidth = 0.6; g.beginPath(); for (const x of [-2.5, 0, 2.5]) { g.moveTo(x * 0.6, -3); g.quadraticCurveTo(x, 5, x * 1.2, 12); } g.stroke();
  } else if (side) {
    g.fillStyle = pal.hair[0]; g.beginPath(); g.moveTo(-1, -5); g.quadraticCurveTo(-7, -2, -7, 10 + Math.sin(t * 2) * 0.8); g.lineTo(-2, 9); g.quadraticCurveTo(-3, 2, 0, -2); g.closePath(); g.fill();
    g.fillStyle = pal.skin; g.beginPath(); g.moveTo(-2, -5); g.quadraticCurveTo(3, -6.5, 4, -2); g.lineTo(5.5, 0.5); g.lineTo(4, 1.2); g.quadraticCurveTo(4, 4.5, 1.5, 5.5); g.quadraticCurveTo(-2, 5, -2.5, 0); g.closePath(); g.fill();
    g.fillStyle = pal.skinShade; poly(g, [[1, 1.5], [3.5, 2.5], [1.5, 4.5]]); // the sunken cheek
    g.fillStyle = pal.beard; poly(g, [[1, 5], [4, 4], [2.5, 9 + Math.sin(t * 2.4) * 0.5], [0, 6]]);
    g.fillStyle = pal.socket; g.fillRect(1.5, -2, 2.5, 2);
    g.fillStyle = pal.eye; g.fillRect(2.5, -1.5, 1.4, 1); lit(g, L, 3, -1, 6 + roar * 4, pal.eyeGlow, 0.55);
    g.fillStyle = pal.hair[1]; g.beginPath(); g.moveTo(-2, -5.5); g.quadraticCurveTo(2, -7, 4, -4); g.lineTo(-1, -3); g.closePath(); g.fill();
  } else {
    for (const sx of [-1, 1]) { g.fillStyle = pal.hair[0]; g.beginPath(); g.moveTo(sx * 3, -5); g.quadraticCurveTo(sx * 7.5, 0, sx * 6.5 + Math.sin(t * 2 + sx) * 0.6, 12); g.lineTo(sx * 4, 9); g.quadraticCurveTo(sx * 4.5, 2, sx * 2, -3); g.closePath(); g.fill(); }
    g.fillStyle = pal.skin; g.beginPath(); g.moveTo(-4, -4); g.quadraticCurveTo(0, -7, 4, -4); g.quadraticCurveTo(4.2, 3, 1.5, 5.5); g.lineTo(-1.5, 5.5); g.quadraticCurveTo(-4.2, 3, -4, -4); g.closePath(); g.fill();
    g.fillStyle = pal.skinShade; for (const sx of [-1, 1]) poly(g, [[sx * 1.5, 1.5], [sx * 3.8, 1], [sx * 2, 4.2]]);
    g.fillStyle = pal.beard; poly(g, [[-2, 5], [2, 5], [0.5, 10 + Math.sin(t * 2.4) * 0.5], [-0.5, 10]]);
    const laugh = P.tilt < -0.3 || roar > 0.4;
    g.fillStyle = pal.mouth; g.fillRect(-1.2, laugh ? 3 : 3.6, 2.4, laugh ? 2 : 0.8);
    for (const ex of [-2, 2]) { g.fillStyle = pal.socket; g.fillRect(ex - 1.4, -2.2, 2.8, 2.2); g.fillStyle = pal.eye; g.fillRect(ex - 0.8, -1.6, 1.6, 1); lit(g, L, ex, -1.1, 6 + roar * 4, pal.eyeGlow, 0.5); }
  }
  g.save(); g.translate(side ? 0.5 : 0, -5.5); crown(g, pal, L, view, ph2 ? 1.25 : 1, 1 + roar); g.restore();
  g.restore();
}

// The cold-flame scythe in his hands (h), its haft swung by P.swing about them; scy fades it in and out.
function scythe(g, pal, L, h, P, view, t) {
  if (P.scy <= 0.02) return;
  const side = view === 'side', a = lerp(-2.3, 1.1, (P.swing + 1) / 2) * (view === 'back' ? -1 : 1), ux = Math.sin(a), uy = -Math.cos(a);
  const b0 = [h[0] - ux * 10, h[1] - uy * 10], b1 = [h[0] + ux * 26, h[1] + uy * 26];
  g.save(); g.globalAlpha *= P.scy;
  g.lineCap = 'round'; g.strokeStyle = pal.haft; g.lineWidth = 2.2; line(g, [b0, b1]);
  g.strokeStyle = pal.haftHi; g.lineWidth = 0.7; line(g, [[b0[0] + 0.5, b0[1]], [b1[0] + 0.5, b1[1]]]);
  // the blade curves back from the haft's head, a crescent of cold fire
  const nx = -uy * (side ? 1 : 1), ny = ux, tip = [b1[0] - ux * 6 + nx * 18, b1[1] - uy * 6 + ny * 18];
  const bg = g.createLinearGradient(b1[0], b1[1], tip[0], tip[1]); bg.addColorStop(0, pal.blade[2]); bg.addColorStop(0.5, pal.blade[1]); bg.addColorStop(1, pal.blade[0]);
  g.fillStyle = bg; g.beginPath(); g.moveTo(b1[0], b1[1]);
  g.quadraticCurveTo(b1[0] + nx * 12 + ux * 4, b1[1] + ny * 12 + uy * 4, tip[0], tip[1]);
  g.quadraticCurveTo(b1[0] + nx * 8 - ux * 3, b1[1] + ny * 8 - uy * 3, b1[0] - ux * 3, b1[1] - uy * 3); g.closePath(); g.fill();
  lit(g, L, (b1[0] + tip[0]) / 2, (b1[1] + tip[1]) / 2, 12 + Math.sin(t * 11) * 2, pal.bladeGlow, 0.5);
  g.restore();
}

// ---------------------------------------------------------------- the painter
export function paintVesper(g, b, L, pal = VESPER_PAL) {
  const view = b.view || 'front', side = view === 'side', back = view === 'back';
  const t = b.anim || 0, ph2 = (b.phase || 1) > 1, roar = roarK(b), P = vesperPose(b), burn = burnK(b), rk = riseK(b), S = sizeOf(b);
  g.save(); g.translate(0, P.hover + P.sink);
  g.scale(S, S * (1 - P.sink * 0.012));
  g.translate(0, -24); g.rotate(side ? P.lean : P.lean * 0.3 * (b.cdx || 0)); g.translate(0, 24);
  const sh = side ? [[-1.5, -45], [3.5, -45]] : [[-9, -45], [9, -45]]; // shoulders: left/right, or far/near
  const armFor = (i, far) => arm(g, pal, sh[i][0], sh[i][1], i ? P.b : P.a, P.bend, side ? 1 : i ? 1 : -1, i ? P.reach : 0, { far, ph2, claws: ph2 });
  const wingsK = ph2 ? P.wings * rk : burn * 0.4;
  // wings behind him (from behind, they spread between us and him)
  if (wingsK > 0.02 && !back) {
    if (side) { wing(g, pal, -1, -2, -44, wingsK, t, true); wing(g, pal, -1, 1, -46, wingsK * 0.9, t, false); }
    else for (const s of [-1, 1]) wing(g, pal, s, s * 6, -44, wingsK, t, false);
  }
  let hand = null;
  if (side) armFor(0, true);
  if (ph2 || burn > 0.2) shadowBody(g, pal, L, view, t, ph2 ? rk : (burn - 0.2) / 0.8); // as the robes burn, the shadow under them
  if (!ph2) robe(g, pal, L, P, view, t, burn);
  if (!back && !ph2) ember(g, pal, L, side ? 3 : 0, -36, t, false);
  if (!back && ph2) ember(g, pal, L, side ? 3 : 0, -38, t, true);
  if (side) hand = armFor(1, false);
  else { armFor(0, false); hand = armFor(1, false); }
  g.save(); g.translate(side ? 1 : 0, -53); head(g, pal, L, P, view, t, ph2, roar, ph2 ? 1.1 : 1); g.restore();
  if (back && wingsK > 0.02) for (const s of [-1, 1]) wing(g, pal, s, s * 6, -44, wingsK, t, true);
  scythe(g, pal, L, hand, P, view, t);
  g.restore();
}

// ---------------------------------------------------------------- his crown on a borrowed form
// Where each warden's head is, in its painter's frame, and how big: the crown sits there.
function headOf(b) {
  const view = b.view || 'front', side = view === 'side';
  switch (b.borrowed) {
    case 'thornmaw': return side ? [16, -44, 1.1] : view === 'front' ? [0, -52, 1.2] : [0, -50, 1.2];
    case 'cinder': return [side ? 1 : 0, cinderHover(b) - 62, 1.1];
    case 'rime': return [side ? 1 : 0, rimeHover(b) - 66, 1];
    case 'tide': {
      const [x, y] = tideHead(b), f = side && (b.face ?? 1) < 0 ? -1 : 1; // tideHead mirrors itself; the stamp mirrors this
      return [x * f, y - 12, 1.1];
    }
  }
  return [0, -60, 1];
}
// His hollow crown floating over the warden's head, and his cold eyes under it. Drawn after the
// warden's painter, in its frame.
export function vesperCrown(g, b, L = [], pal = VESPER_PAL) {
  const [x, y, s] = headOf(b), view = b.view || 'front', t = b.anim || 0;
  g.save(); g.translate(x, y + Math.sin(t * 2.5) * 0.8);
  crown(g, pal, L, view, s * 1.15, 1.2);
  if (view !== 'back') {
    g.fillStyle = pal.eye;
    for (const ex of view === 'side' ? [3] : [-2.5, 2.5]) g.fillRect(ex * s - 0.8, 3 * s, 1.6, 1);
  }
  g.restore();
}

// ---------------------------------------------------------------- world effects
// Under him: the pool of shadow he floats over, and its cold rim.
export function vesperUnder(g, b, x, y, a = 1) {
  const t = b.anim || 0, ph2 = (b.phase || 1) > 1, r = (ph2 ? 26 : 18) * (b.state === 'step' ? 1.3 : 1);
  g.save(); g.globalAlpha = Math.max(a, b.state === 'step' ? 1 : 0);
  g.fillStyle = `rgba(${FX.pool},0.6)`; g.beginPath(); g.ellipse(x, y + 5, r, r * 0.32, 0, 0, TAU); g.fill();
  g.strokeStyle = `rgba(${FX.wisp},0.35)`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 5, r, r * 0.32, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  for (let i = 0; i < 5; i++) { // tendrils of it creeping out across the floor
    const an = (i / 5) * TAU + Math.sin(t * 0.7 + i) * 0.3, len = r * (1.1 + Math.sin(t * 1.3 + i * 2) * 0.25);
    g.strokeStyle = `rgba(${FX.pool},0.5)`; g.lineWidth = 2; g.beginPath(); g.moveTo(x + Math.cos(an) * r * 0.6, y + 5 + Math.sin(an) * r * 0.2);
    g.quadraticCurveTo(x + Math.cos(an + 0.4) * len, y + 5 + Math.sin(an + 0.4) * len * 0.3, x + Math.cos(an + 0.2) * len * 1.2, y + 5 + Math.sin(an + 0.2) * len * 0.36); g.stroke();
  }
  g.restore();
}

// Over him, drawn straight onto the world: cold flame off his robes (smoke off the shadow, gold motes
// from its cracks), a gathering glow at a casting hand, the scythe's swish, smoke wrapping him as he
// shifts or steps, the eclipse's dark halo, stun stars.
export function vesperOver(g, b, x, y, a = 1) {
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, P = vesperPose(b), S = sizeOf(b), hy = y + (P.hover + P.sink) * S, f = (b.view || 'front') === 'side' && (b.face ?? 1) < 0 ? -1 : 1;
  const timer = b.timer ?? 0, burn = burnK(b);
  if (a > 0) {
    g.save(); g.globalAlpha = a;
    if (!ph2) for (let i = 0; i < 5; i++) { // tongues of cold flame along the hem and shoulders
      const [dx, dy, h] = [[-10, -3, 6], [-4, -5, 7], [3, -4, 6], [9, -2, 5], [0, -46, 4]][i];
      flameTongue(g, x + dx * S * f, hy + (dy - (dy > -10 ? burn * 30 : 0)) * S, (h + burn * 8) * S, t, i + 3, false, burn > 0 ? FX.burn : FX.flame);
    }
    for (let i = 0; i < (ph2 ? 14 : 8); i++) { // motes rising off him
      const life = 1.3 + hash(i, 3), p = ((t + hash(i, 4) * life) % life) / life;
      const mx = x + ((hash(i, 5) - 0.5) * (ph2 ? 50 : 26) + Math.sin(t * 2 + i) * 3) * S, my = hy + (-6 - p * (40 + hash(i, 6) * 30)) * S;
      g.globalAlpha = a * Math.sin(p * Math.PI);
      g.fillStyle = ph2 && i % 3 === 0 ? `rgb(${FX.fire})` : `rgb(${FX.wisp})`; g.fillRect(Math.round(mx), Math.round(my), 1, 1 + (i % 4 === 0));
    }
    g.globalAlpha = a;
    if (ph2) for (let i = 0; i < 8; i++) { // smoke tearing off his wings' edges
      const p = (t * 0.6 + i / 8) % 1, s = i % 2 ? 1 : -1, sx = x + s * (24 + hash(i, 8) * 22 + p * 6) * S, sy = hy + (-50 - hash(i, 9) * 22 - p * 14) * S;
      g.fillStyle = `rgba(${FX.smoke},${0.22 * Math.sin(p * Math.PI)})`; g.beginPath(); g.ellipse(sx, sy, (1.5 + p * 3) * S, (1 + p * 2) * S, 0, 0, TAU); g.fill();
    }
    if (st === 'bolts' || st === 'beam') { // light gathering at the hand, or the beam drawn out of his chest
      const k = st === 'bolts' ? clamp01(1 - timer / BOLT_WIND) : clamp01(1 - (timer - BEAM) / BEAM_T);
      glow(g, x + f * 10 * S, hy - 36 * S, (8 + k * 10) * S, FX.wisp, 0.35 + 0.35 * k);
    }
    if (st === 'scythe') { // the swish of the swing, across the cone it strikes
      const k = clamp01(1 - timer / SCYTHE);
      if (k > 0.78) {
        const a0 = Math.atan2(b.cdy || 0, b.cdx || 1), e = (k - 0.78) / 0.22;
        g.globalAlpha = a * (1 - e); g.strokeStyle = FX.swish; g.lineWidth = 2;
        for (const r of [36, 48, 60]) { g.beginPath(); g.ellipse(x, y - 8, r, r * 0.75, 0, a0 - 1.15, a0 - 1.15 + 2.3 * easeOut(e * 1.6)); g.stroke(); }
        g.globalAlpha = a;
      }
    }
    if (st === 'stunned') dizzyStars(g, x, hy - (ph2 ? 80 : 66) * S, t, 4);
    g.restore();
  }
  if (st === 'shift' || st === 'step') { // smoke wrapping round him, thickest as he goes
    const k = st === 'shift' ? clamp01(1 - timer / SHIFT) : clamp01(1 - timer / STEP) * 0.7;
    for (let i = 0; i < 16; i++) {
      const an = hash(i, 11) * TAU + t * (3 + hash(i, 12) * 2), r = (10 + hash(i, 13) * 14) * (1 - k * 0.4);
      g.fillStyle = `rgba(${i % 3 ? FX.smoke : FX.wisp},${(0.25 + 0.5 * k) * (i % 3 ? 1 : 0.6)})`;
      g.beginPath(); g.ellipse(x + Math.cos(an) * r, hy - 30 + Math.sin(an) * r * 0.9 - hash(i, 14) * 20, 3 + k * 4, 2 + k * 3, 0, 0, TAU); g.fill();
    }
  }
  if (st === 'eclipse') glow(g, x, hy - 40 * S, 50 * S, FX.wisp, 0.25 + 0.1 * Math.sin(t * 6));
}

// A pillar of gloam where one struck: a column of dark fire bursting up, licked with cold flame,
// guttering out at the end.
export function drawGloamPillar(g, x, y, age) {
  const up = easeOut(age / 0.1), out = clamp01((age - (PILLAR_LIFE - 0.25)) / 0.25), h = 34 * up * (1 - out * 0.6), w = 7 * (1 - out * 0.5);
  if (h < 1) return;
  const X = Math.round(x), Y = Math.round(y) + 2;
  g.fillStyle = `rgba(${FX.pool},0.6)`; g.beginPath(); g.ellipse(X, Y, w + 6, 3.5, 0, 0, TAU); g.fill();
  const gg = g.createLinearGradient(0, Y - h, 0, Y); gg.addColorStop(0, `rgba(${FX.wisp},0.2)`); gg.addColorStop(0.4, 'rgba(90,50,140,0.9)'); gg.addColorStop(1, 'rgba(14,6,24,0.95)');
  g.fillStyle = gg; g.beginPath(); g.moveTo(X - w, Y); g.quadraticCurveTo(X - w * 0.8, Y - h * 0.6, X - 1, Y - h); g.lineTo(X + 1, Y - h); g.quadraticCurveTo(X + w * 0.8, Y - h * 0.6, X + w, Y); g.closePath(); g.fill();
  for (let k = 0; k < 3; k++) flameTongue(g, X + (k - 1) * 4, Y - h * (0.35 + k * 0.2), 6 + k * 2, age * 3, k + 20, false, FX.flame);
  glow(g, X, Y - h * 0.5, 18, FX.wisp, 0.35 * (1 - out));
}

// The rise: the warm light of the four sockets pulled out in streams that curl into his chest. k: how
// far it has come (0 still in the sockets, 1 all in him).
export function drawRiseStreams(g, sources, b, cam, k) {
  if (!sources) return;
  const tx = b.x - cam.left, ty = b.y - cam.top - 34;
  for (const [n, s] of sources.entries()) {
    const sx = s.x - cam.left, sy = s.y - cam.top, mx = (sx + tx) / 2 + (sy - ty) * 0.25, my = (sy + ty) / 2 - 30 - (sx - tx) * 0.1;
    glow(g, sx, sy, 14, FX.light, 0.6 * (1 - k));
    for (let i = 0; i < 12; i++) {
      const q = k * 1.25 - i * 0.025;
      if (q <= 0 || q >= 1) continue;
      const u = 1 - q, px = u * u * sx + 2 * u * q * mx + q * q * tx, py = u * u * sy + 2 * u * q * my + q * q * ty;
      g.fillStyle = `rgba(${FX.light},${1 - i / 14})`; g.fillRect(Math.round(px + Math.sin(i + n) * 1.5) - 1, Math.round(py) - 1, i ? 2 : 3, i ? 2 : 3);
      if (!i) glow(g, px, py, 10, FX.light, 0.5);
    }
  }
  if (k > 0.85) glow(g, tx, ty, 30 + (k - 0.85) * 200, FX.light, 0.5);
}

// ---------------------------------------------------------------- his entrance and omen
// Before he shows himself: the sockets' light gutters, shadow crawls in from the room's edges to the
// middle, and cold motes sink into it.
export function vesperOmen(g, x, y, t) {
  const k = clamp01(t / 1.4);
  g.fillStyle = `rgba(${FX.pool},${0.25 + 0.4 * k})`; g.beginPath(); g.ellipse(x, y + 6, 8 + k * 46, 3 + k * 15, 0, 0, TAU); g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const an = (i / 10) * TAU + hash(i, 1) * 0.4, r0 = 160 - k * 110 + hash(i, 2) * 20, r1 = r0 * (0.55 + 0.1 * Math.sin(t * 3 + i));
    g.strokeStyle = `rgba(${FX.pool},${0.7 * k})`; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + Math.cos(an) * r0, y + 6 + Math.sin(an) * r0 * 0.4); g.quadraticCurveTo(x + Math.cos(an + 0.3) * (r0 + r1) / 2, y + 6 + Math.sin(an + 0.3) * (r0 + r1) * 0.2, x + Math.cos(an) * r1, y + 6 + Math.sin(an) * r1 * 0.4); g.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const q = (t * 0.5 + hash(i, 3)) % 1;
    g.globalAlpha = Math.sin(q * Math.PI) * k; g.fillStyle = `rgb(${FX.wisp})`;
    g.fillRect(Math.round(x + (hash(i, 4) - 0.5) * 120 * (1 - q * 0.6)), Math.round(y - 70 + q * 76), 1, 1);
  }
  g.globalAlpha = 1;
  glow(g, x, y, 20 + k * 20, FX.wisp, 0.1 + 0.08 * Math.abs(Math.sin(t * 2)));
}

// His entrance: the shadow pools, a column of gloam boils up out of it, and he stands up out of the
// smoke as it tears away, a flash of cold light as he opens his eyes.
export function vesperEntrance(g, x, y, p, t) {
  const pool = easeOut(p / 0.3), R = 14 + pool * 44;
  g.fillStyle = `rgba(${FX.pool},${0.85 * pool})`; g.beginPath(); g.ellipse(x, y + 4, R, R * 0.33, 0, 0, TAU); g.fill();
  g.strokeStyle = `rgba(${FX.wisp},${0.5 * pool})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 4, R, R * 0.33, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  const col = clamp01((p - 0.22) / 0.12) * (1 - clamp01((p - 0.62) / 0.2));
  if (col > 0) { // the column of smoke
    const h = 110 * easeOut(clamp01((p - 0.22) / 0.2));
    for (let i = 0; i < 18; i++) {
      const q = (t * 0.8 + hash(i, 1)) % 1, w = 10 + hash(i, 2) * 14;
      g.fillStyle = `rgba(${i % 4 ? FX.smoke : '90,50,140'},${0.6 * col * (1 - q * 0.5)})`;
      g.beginPath(); g.ellipse(x + Math.sin(t * 3 + i) * 6, y - q * h, w * (0.6 + q * 0.6), w * 0.5, 0, 0, TAU); g.fill();
    }
    glow(g, x, y - h * 0.5, 30 + h * 0.3, FX.wisp, 0.35 * col);
  }
  const tear = clamp01((p - 0.55) / 0.35);
  if (tear > 0 && tear < 1) for (let i = 0; i < 26; i++) { // the smoke tearing away from him
    const an = hash(i, 4) * TAU, d = 10 + tear * (40 + hash(i, 5) * 50);
    g.fillStyle = `rgba(${FX.smoke},${0.6 * (1 - tear)})`; g.beginPath(); g.ellipse(x + Math.cos(an) * d, y - 30 + Math.sin(an) * d * 0.6, 4 + tear * 5, 3 + tear * 3, 0, 0, TAU); g.fill();
  }
  const fl = Math.max(0, 1 - Math.abs(p - 0.56) / 0.06);
  if (fl > 0) { g.fillStyle = `rgba(230,215,255,${fl * 0.6})`; g.fillRect(0, 0, 480, 270); }
}
