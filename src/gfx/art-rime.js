// The Rime Sovereign's art: a crystalline owl-queen floating on a gown of frost mist. The painter
// draws around her feet facing the camera (b.view 'front', the default), from behind ('back') or
// turned to the right ('side', see bossart.js); every colour comes from a palette, so another body
// can wear it. Shattered (phase 2) she bursts into shards and reforms larger: great wings of frost
// feathers, a tall crown of icicles with shards circling it, the hem of her gown broken into ice.
import { TAU, clamp01, easeOut, lerp, hash, poly, line, disc, roarK, lit, glow, dizzyStars } from './bossart.js';

// A `2` key is the Shattered colour of the key without it.
export const RIME_PAL = {
  shard: '#e6f9ff', shardB: '#ccecff', shardShade: '#76b2e0', shardShadeB: '#5a92c6', shardEdge: 'rgba(255,255,255,0.85)',
  arm: '#5a92c6', armHi: '#e6f9ff',
  // Shattered, her wings are frost feathers, root to tip; seen from behind or far side-on, darker
  plume: ['#f6fdff', '#a8dcf8', '#4a86c6'], plumeBack: ['#c4e4f6', '#78acd8', '#3a68a2'], plumeEdge: 'rgba(255,255,255,0.9)', plumeVein: 'rgba(120,180,230,0.8)',
  gown: ['#e8f9ff', '#a4d4f2', '#4a7cb2'], gown2: ['#f0fbff', '#8cc2ec', '#34609e'], gownLight: 'rgba(255,255,255,0.55)', gownShade: 'rgba(30,70,130,0.4)',
  // the train falling from her shoulders down her back, scalloped like an owl's feathers
  cape: ['#d6f0ff', '#88bfe6', '#3c6ea8'], capeFold: 'rgba(30,70,130,0.45)', capeHi: 'rgba(255,255,255,0.5)',
  facets: ['#f0fcff', '#c4eaff', '#78b2de', '#5890c4', '#8ec6ea', '#d6f2ff'], facetEdge: 'rgba(255,255,255,0.8)',
  gem: '#40c8ff', glint: '#ffffff', gemGlow: '120,210,255',
  ruff: '#a6d6f4', ruffHi: '#dff6ff', tuft: '#e4f8ff', tuftShade: '#78b2de', face: '#b4def6',
  // the back of her head: facets of clear ice
  crystal: ['#eaf9ff', '#a8d8f4', '#6aa0d2'], crystalEdge: 'rgba(255,255,255,0.75)',
  icicle: '#f2fcff', icicleShade: '#88c4ec', band: '#9ad2f2', mask: '#f6fdff', maskLine: '#7ab4de',
  socket: '#12304c', daze: '#6ab8e8', eye: '#3cc8ff', eye2: '#d8f8ff', eyeGlow: '110,210,255', brow: '#2a5a8a', beak: '#e4d48a',
  crack: '235,250,255', // light breaking through her as she shatters
  // the world: the cold glow and mist under her, frost motes and snow, skid shavings and breath, the
  // zones she puts down and her dark shard rain, the trail of a dash, her prison pillars and her bolts
  chill: '140,210,255', mist: '210,240,255', frost: '230,248,255', snow: '240,250,255', skid: '220,245,255', breath: '235,248,255',
  zone: '160,220,255', gust: '220,240,255', rain: '20,40,80', rainHi: '216,244,255', trail: '#e0f8ff', shatter: ['#c8f0ff', '#ffffff'],
  pillar: ['#7ab4e0', '#c8ecff', '#f4fcff'], pillarInk: '#0a1622', pillarGlow: '170,225,255', shot: null,
};
// Whoever runs her moves wears her world effects in their own palette.
export const rimePal = (b) => b.rimePal || RIME_PAL;

// The fight's clocks, shared with the moveset (warden-rime.js) so the poses keep time with it: the
// gust gathering and its blast, the pillars' call and their rise, the decoys' casting, the spent
// window after each Shatter attack, and how long a pillar stands.
export const GUST = 0.6, BLOW = 2, PILLARS = 1.5, RISE = 1.1, DECOYS = 1, SPENT = 1.3, PILLAR_LIFE = 0.9;
const EASE = 0.25; // seconds a pose takes to ease into the next
const BIG = 1.12; // Shattered, she reforms this much larger
const smooth = (v) => v * v * (3 - 2 * v);

// ---------------------------------------------------------------- the pose
// Wings: a fan from a0 (outermost, off the wrist) to a1 (innermost, by the shoulder), flap on top,
// arm elevation al and length arm, tw a twist one way; angles: 0 points straight up, positive sweeps
// outward. lean: toward where she is going; sway: a rock either way; sink: a drop toward the floor.
const KEYS = ['a0', 'a1', 'ln', 'flap', 'al', 'arm', 'tw', 'lean', 'sway', 'sink'];
const pose = (o) => ({ a0: 0.45, a1: 2.5, ln: 1, flap: 0, al: 0.3, arm: 12, tw: 0, lean: 0, sway: 0, sink: 0, ...o });
const mixPose = (a, b, k) => Object.fromEntries(KEYS.map((key) => [key, lerp(a[key], b[key], k)]));
const ROAR = { a0: 0.05, a1: 1.9, ln: 1.15, al: 0.75, arm: 13 };

function rawPose(b) {
  const t = b.anim || 0, st = b.state, beat = Math.sin(t * 4);
  let w = pose({ flap: beat * 0.12, al: 0.3 + beat * 0.12 });
  if (st === 'wind') w = pose({ a0: -0.15, a1: 1.5, ln: 1.05, flap: Math.sin(t * 30) * 0.03, al: 1, arm: 11, lean: -0.08, sink: 2 });
  else if (st === 'dash') w = pose({ a0: 2.55, a1: 3, ln: 0.8, al: -1.3, arm: 5, lean: 0.35 });
  else if (st === 'skid') w = pose({ a0: 0.9, a1: 2.6, ln: 0.9, flap: Math.sin(t * 20) * 0.1, al: -0.2, arm: 10, tw: 0.35, lean: -0.2, sway: Math.sin(t * 24) * 0.04, sink: 5 });
  else if (st === 'stunned') w = pose({ a0: 1.7, a1: 2.95, ln: 0.9, flap: Math.sin(t * 2) * 0.05, al: -0.7, arm: 10, sway: Math.sin(t * 2.5) * 0.12, sink: 5 });
  else if (st === 'rain') w = pose({ a0: 0.1, a1: 1.9, ln: 1.1, flap: Math.sin(t * 8) * 0.05, al: 0.85 });
  else if (st === 'spent') w = pose({ a0: 1.9, a1: 3, ln: 0.9, flap: Math.sin(t * 1.6) * 0.05, al: -0.75, arm: 10, lean: 0.1, sway: Math.sin(t * 1.3) * 0.04, sink: 7 });
  else if (st === 'transform') w = pose({ a0: 0, a1: 1.9, ln: 1.1, flap: Math.sin(t * 50) * 0.04, al: 0.9, sink: -2 });
  else if (st === 'gust') { // drawn up and back while the gust gathers, then beating it down at the player
    const hit = Math.sin(t * 18);
    const gather = pose({ a0: 0.05, a1: 1.4, ln: 1.1, flap: Math.sin(t * 30) * 0.03, al: 0.85, lean: -0.15 });
    w = mixPose(gather, pose({ a0: 0.55 + hit * 0.55, a1: 2.3 + hit * 0.3, ln: 1.1, al: 0.2 + hit * 0.45, lean: 0.12 }), smooth(clamp01((BLOW - (b.timer ?? 0)) / 0.15)));
  } else if (st === 'pillars') { // raised to call them up, then slammed down as they rise
    const q = clamp01(1 - (b.timer ?? 0) / PILLARS);
    const up = pose({ a0: 0.15, a1: 1.3, ln: 1.05, flap: Math.sin(t * 26) * 0.03, al: 0.85, lean: -0.1 });
    w = mixPose(up, pose({ a0: 1.95, a1: 2.95, al: -0.95, arm: 11, lean: 0.15, sink: 4 }), easeOut((q - RISE / PILLARS) / 0.07));
  } else if (st === 'decoys') w = pose({ a0: 0.3, a1: 2.95, ln: 1.12, flap: Math.sin(t * 14) * 0.06, al: 0.5, lean: -0.06 });
  else if (st === 'defeated' || st === 'dying') w = pose({ a0: 0.9, a1: 2.6, flap: beat * 0.12 + (st === 'dying' ? Math.sin(t * 31) * 0.06 : 0), al: beat * 0.06, arm: 11, sink: 2 });
  const roar = roarK(b);
  if (roar) for (const [k, v] of Object.entries(ROAR)) w[k] = lerp(w[k], v, roar);
  return w;
}

// The pose as drawn: when her state changes, it eases from the pose drawn then (this very frame if
// the tick hasn't seen the change yet). The death flow's states take no ticks, so they never ease:
// it sets her down 'defeated' behind its fade, in the pose she then dies in.
export function rimePose(b) {
  const w = rawPose(b), st = b.state, fresh = b.rimePoseState !== st;
  if (st === 'defeated' || st === 'dying') return w;
  const from = fresh ? b.rimePoseNow : b.rimePoseFrom, k = smooth(clamp01((fresh ? 0 : b.rimePoseT ?? 9) / EASE));
  return from && k < 1 ? mixPose(from, w, k) : w;
}
// Visual bookkeeping, once a frame from the moveset's tick.
export function rimePoseTick(b, dt) {
  if (b.rimePoseState !== b.state) { b.rimePoseState = b.state; b.rimePoseFrom = b.rimePoseNow; b.rimePoseT = 0; }
  else b.rimePoseT = (b.rimePoseT ?? 9) + dt;
  b.rimePoseNow = rimePose(b);
}

const hoverOf = (b, P) => -8 + Math.sin((b.anim || 0) * 2) * 2 + P.sink;
export const rimeHover = (b) => hoverOf(b, rimePose(b));
// How far the Shatter has come: light cracks through her over the transform, then, Shattered, she
// reforms out of the flying shards over 0.7 s.
const shatterK = (b) => ((b.phase || 1) < 2 && b.state === 'transform' ? clamp01(1 - (b.timer ?? 0) / 1.5) : 0);
const reformK = (b) => ((b.phase || 1) > 1 ? clamp01((b.phaseT ?? 9) / 0.7) : 0);
const sizeOf = (b) => ((b.phase || 1) > 1 ? lerp(0.55, BIG, easeOut(reformK(b))) : 1);

// ---------------------------------------------------------------- the wings
// A shard of ice: lit on one side of its spine, shaded on the other. flip: lit from the other side
// (her wings seen from behind); dim: both sides in shade (the far wing, side-on).
function shard(g, pal, px, py, ang, len, w, s, u, flip = false, dim = false) {
  const dx = Math.sin(ang) * s, dy = -Math.cos(ang), nx = -dy * (flip ? -1 : 1), ny = dx * (flip ? -1 : 1);
  const tx = px + dx * len, ty = py + dy * len, mx = px + dx * len * 0.38, my = py + dy * len * 0.38;
  const light = u < 0.5 ? pal.shard : pal.shardB, shade = u < 0.5 ? pal.shardShade : pal.shardShadeB;
  g.fillStyle = dim ? shade : light; poly(g, [[px, py], [mx + nx * w, my + ny * w], [tx, ty]]);
  g.fillStyle = shade; poly(g, [[px, py], [mx - nx * w, my - ny * w], [tx, ty]]);
  g.strokeStyle = pal.shardEdge; g.lineWidth = 0.7; line(g, [[mx, my], [tx, ty]]);
}

// A frost feather, Shattered: pale at the quill, deepening blue to the tip, its leading edge rimed.
function feather(g, pal, px, py, ang, len, w, s, dark) {
  const dx = Math.sin(ang) * s, dy = -Math.cos(ang), nx = -dy, ny = dx, tx = px + dx * len, ty = py + dy * len;
  const P = (q, v) => [px + dx * len * q + nx * v, py + dy * len * q + ny * v], c = dark ? pal.plumeBack : pal.plume;
  const fg = g.createLinearGradient(px, py, tx, ty); fg.addColorStop(0, c[0]); fg.addColorStop(0.55, c[1]); fg.addColorStop(1, c[2]);
  g.fillStyle = fg; g.beginPath(); g.moveTo(...P(0, w * 0.5)); g.quadraticCurveTo(...P(0.55, w * 1.2), tx, ty); g.quadraticCurveTo(...P(0.5, -w), ...P(0, -w * 0.5)); g.closePath(); g.fill();
  g.strokeStyle = pal.plumeEdge; g.lineWidth = 0.7; g.beginPath(); g.moveTo(...P(0.08, w * 0.6)); g.quadraticCurveTo(...P(0.55, w * 1.2), tx, ty); g.stroke();
  g.strokeStyle = pal.plumeVein; g.lineWidth = 0.6; g.beginPath(); g.moveTo(...P(0.04, 0)); g.lineTo(...P(0.82, w * 0.12));
  for (const q of [0.3, 0.48, 0.66]) { g.moveTo(...P(q, w * 0.05)); g.lineTo(...P(q + 0.1, -w * 0.75)); } // barbs
  g.stroke();
}

// One wing: the arm from the shoulder (sx, sy) out to the wrist, its fan (ice shards; Shattered,
// frost feathers) and a row of small shards along its leading edge. s: the way it spreads (+1 to the
// right of the picture). backs: seen from behind; far: the far wing, side-on, in shade.
function wing(g, pal, P, s, sx, sy, ph2, { backs = false, far = false } = {}) {
  const n = ph2 ? 8 : 7, arm = P.arm * (ph2 ? 1.25 : 1), wx = sx + s * Math.cos(P.al) * arm, wy = sy - Math.sin(P.al) * arm;
  for (let i = n - 1; i >= 0; i--) {
    const u = i / (n - 1), bx = lerp(wx, sx, u * 0.85), by = lerp(wy, sy, u * 0.85), a = lerp(P.a0, P.a1, u) + P.flap * (1 - u * 0.6) + P.tw * s;
    const len = (14 + 20 * Math.sin(Math.PI * (0.25 + u * 0.6))) * P.ln * (u < 0.2 ? 1.1 : 1);
    if (ph2) feather(g, pal, bx, by, a, len * 1.12, lerp(5.6, 4, u), s, backs || far);
    else shard(g, pal, bx, by, a, len, lerp(3.4, 2.4, u), s, u, backs, far);
  }
  g.lineCap = 'round'; g.strokeStyle = pal.arm; g.lineWidth = ph2 ? 3.8 : 3.2; line(g, [[sx, sy], [wx, wy]]);
  if (!far) { g.strokeStyle = pal.armHi; g.lineWidth = 1.4; line(g, [[sx, sy - 0.8], [wx, wy - 0.8]]); }
  const m = ph2 ? 4 : 3;
  for (let i = 0; i < m; i++) { const u = (i + 0.5) / m; shard(g, pal, lerp(sx, wx, u), lerp(sy, wy, u), lerp(P.a1, P.a0, u) * 0.85 + 0.25, ph2 ? 11 : 9, 2.4, s, 0.3, backs, far); }
}

// ---------------------------------------------------------------- the body, part by part
// The gown of frost mist; side-on it streams back into a train. Shattered, its hem breaks jagged
// and the broken pieces float under it.
function gown(g, pal, t, ph2, view, mvx) {
  const side = view === 'side', c = ph2 ? pal.gown2 : pal.gown, deep = ph2 ? 2.5 : 0;
  const drift = clamp01(Math.abs(mvx || 0) / 200), sway = Math.sin(t * 1.7) * 1.5 - drift * Math.sign(mvx || 0) * 3;
  const hem = side ? (i) => [7 - i * 4.3 - drift * i * 0.6, -2 - (i > 3 ? (i - 3) * 0.8 : 0) + (i % 2 ? -3 - deep : 1) + Math.sin(t * 3 + i * 1.3) * 1.5]
    : (i) => [-15 + i * 5 + sway, -3 + (i % 2 ? -3 - deep : 1 + deep * 0.4) + Math.sin(t * 3 + i * 1.3) * 1.5];
  const gg = g.createLinearGradient(0, -33, 0, 0); gg.addColorStop(0, c[0]); gg.addColorStop(0.45, c[1]); gg.addColorStop(1, c[2]);
  g.fillStyle = gg; g.beginPath();
  if (side) { g.moveTo(5, -33); g.quadraticCurveTo(8, -18, ...hem(0)); for (let i = 1; i <= 6; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(-12, -16, -5, -33); }
  else { g.moveTo(-7, -33); g.quadraticCurveTo(-11, -18, ...hem(0)); for (let i = 1; i <= 6; i++) g.lineTo(...hem(i)); g.quadraticCurveTo(11, -18, 7, -33); }
  g.closePath(); g.fill();
  g.lineWidth = 1;
  if (side) {
    g.strokeStyle = pal.gownLight; g.beginPath(); for (const k of [0, 1]) { g.moveTo(3 - k * 3, -31); g.quadraticCurveTo(1 - k * 5, -16, -2 - k * 8, -4); } g.stroke();
    g.strokeStyle = pal.gownShade; g.beginPath(); for (const k of [0, 1]) { g.moveTo(-1 - k * 2, -30); g.quadraticCurveTo(-5 - k * 4, -15, -9 - k * 6, -3); } g.stroke();
  } else {
    g.strokeStyle = pal.gownLight; g.beginPath(); for (const x of [-4, 1, 5]) { g.moveTo(x * 0.5, -31); g.quadraticCurveTo(x + sway * 0.5, -18, x * 1.8 + sway, -5); } g.stroke();
    g.strokeStyle = pal.gownShade; g.beginPath(); for (const x of [-2, 3]) { g.moveTo(x * 0.5, -30); g.quadraticCurveTo(x + sway * 0.6, -16, x * 2.2 + sway, -4); } g.stroke();
  }
  if (ph2) for (const i of [1, 3, 5]) { const [x, y] = hem(i); shard(g, pal, x, y + 7 + Math.sin(t * 2 + i) * 1.5, Math.PI, 6, 1.8, 1, hash(i, 4)); }
}

// The train down her back, from the shoulders past the hem, its foot scalloped like an owl's
// feathers (from the front, it flares out behind the gown). Side-on it hangs off her back.
// Shattered, it runs longer and its scallops end in icicles.
function cape(g, pal, t, ph2, view) {
  const sw = Math.sin(t * 1.7) * 1.2, long = ph2 ? 4 : 0, cg = g.createLinearGradient(0, -50, 0, 2 + long);
  cg.addColorStop(0, pal.cape[0]); cg.addColorStop(0.5, pal.cape[1]); cg.addColorStop(1, pal.cape[2]);
  g.fillStyle = cg;
  if (view === 'side') {
    g.beginPath(); g.moveTo(-1, -50); g.lineTo(-6, -50); g.quadraticCurveTo(-12, -28, -22 + sw, long);
    g.quadraticCurveTo(-19, long + 4, -16 + sw, long + 1); g.quadraticCurveTo(-13, long + 4, -10, long); g.quadraticCurveTo(-5, -20, -1, -33); g.closePath(); g.fill();
    g.strokeStyle = pal.capeFold; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, -46); g.quadraticCurveTo(-9, -24, -16 + sw, long); g.stroke();
    if (ph2) for (const x of [-19, -13]) shard(g, pal, x + sw, long + 2, Math.PI, 5, 1.5, 1, 0.3);
    return;
  }
  const W = 17, foot = (i) => -W + (i * 2 * W) / 6 + sw;
  g.beginPath(); g.moveTo(-9, -50); g.quadraticCurveTo(0, -53, 9, -50); g.quadraticCurveTo(14, -30, W + sw, long);
  for (let i = 6; i > 0; i--) g.quadraticCurveTo((foot(i) + foot(i - 1)) / 2, long + 6, foot(i - 1), long);
  g.quadraticCurveTo(-14, -30, -9, -50); g.closePath(); g.fill();
  if (view !== 'back') return;
  g.lineWidth = 1; g.strokeStyle = pal.capeFold; g.beginPath(); for (const x of [-9, -3, 3, 9]) { g.moveTo(x * 0.6, -47); g.quadraticCurveTo(x * 1.1 + sw * 0.5, -22, x * 1.6 + sw, long + 2); } g.stroke();
  g.strokeStyle = pal.capeHi; g.beginPath(); g.moveTo(-8, -48); g.quadraticCurveTo(-13, -28, -W + 1 + sw, long - 1); for (const x of [-6, 0, 6]) { g.moveTo(x * 0.6 + 1.5, -47); g.quadraticCurveTo(x * 1.1 + 2, -24, x * 1.6 + 2 + sw, long); } g.stroke();
  if (ph2) for (let i = 0; i < 6; i++) shard(g, pal, (foot(i) + foot(i + 1)) / 2, long + 3, Math.PI, 5 + (i % 2) * 2, 1.5, 1, hash(i, 7));
}

// The faceted crystal bodice; side-on, narrower, its heart-gem at the front edge. From behind the
// train covers it.
function bodice(g, pal, L, side, ph2, roar) {
  const V = side ? [[-5, -48], [1, -52], [6, -46.5], [5.5, -34], [0, -29.5], [-5.5, -35]] : [[-8, -47], [0, -52], [8, -47], [6.5, -33], [0, -29], [-6.5, -33]];
  const c = side ? [0.5, -40] : [0, -40];
  pal.facets.forEach((col, i) => { g.fillStyle = col; poly(g, [c, V[i], V[(i + 1) % 6]]); });
  g.strokeStyle = pal.facetEdge; g.lineWidth = 0.6; g.beginPath(); for (const v of V) { g.moveTo(...c); g.lineTo(...v); } g.stroke();
  const gx = side ? 5 : 0, r = ph2 ? 2.8 : 2, gw = side ? r * 0.55 : r;
  g.fillStyle = pal.gem; poly(g, [[gx, -40 - r - 0.5], [gx + gw, -40], [gx, -40 + r + 0.5], [gx - gw, -40]]); g.fillStyle = pal.glint; g.fillRect(gx - 0.5, -41.5, 1, 1);
  lit(g, L, gx, -40, (ph2 ? 12 : 10) + roar * 6, pal.gemGlow, 0.5);
}

// The owl ruff of ice feathers round her neck; from behind, a collar over the train.
function ruff(g, pal, view) {
  if (view === 'side') {
    for (let k = 0; k < 6; k++) { const x = -5 + k * 2; g.fillStyle = k % 2 ? pal.ruffHi : pal.ruff; poly(g, [[x - 1.8, -51.5], [x + 1.8, -51.5], [x + 0.6 + k * 0.4, -45.5 + (k > 3 ? 1.2 : 0)]]); }
    return;
  }
  const back = view === 'back';
  for (let k = 0; k < 9; k++) { const x = -10 + k * 2.5; g.fillStyle = (k % 2 === 0) !== back ? pal.ruff : pal.ruffHi; poly(g, [[x - 1.8, -51], [x + 1.8, -51], [x * 1.25, (back ? -43.5 : -45) + Math.abs(x) * 0.15]]); }
}

// The crown of icicles on its band (in the head's frame, the band at -5); Shattered, it grows tall
// and splayed, and shards circle above it. cs: its scale, k: how far it has grown back.
function crown(g, pal, L, view, ph2, cs, k, t, roar) {
  const side = view === 'side', back = view === 'back', xs = side ? 0.6 : 1, x0 = side ? 1 : 0;
  const spikes = ph2 ? [[-8, 6], [-6, 9], [-4, 13], [-2, 17], [0, 23], [2, 17], [4, 13], [6, 9], [8, 6]] : [[-6, 6], [-3, 9], [0, 14], [3, 9], [6, 6]];
  const halo = (front) => {
    if (!ph2) return;
    for (let i = 0; i < 4; i++) {
      const a = t * 1.6 + (i * TAU) / 4;
      if ((Math.sin(a) > 0) !== front) continue;
      shard(g, pal, x0 + Math.cos(a) * 13 * xs, -8 - 18 * cs * k + Math.sin(a) * 2.5, 0, 8 * k, 2.4, 1, hash(i, 9), back);
    }
  };
  halo(false);
  for (const [x, h0] of spikes) {
    const h = h0 * cs * (ph2 ? lerp(0.35, 1, k) : 1), bx = x0 + x * xs, tx = bx + (ph2 ? x * 0.06 * h * xs : 0);
    g.fillStyle = back ? pal.icicleShade : pal.icicle; poly(g, [[bx - 1.7 * xs, -5], [tx, -5 - h], [bx, -5]]);
    g.fillStyle = back ? pal.icicle : pal.icicleShade; poly(g, [[bx, -5], [tx, -5 - h], [bx + 1.7 * xs, -5]]);
  }
  const bw = (ph2 ? 17 : 14) * xs;
  g.fillStyle = pal.band; g.fillRect(x0 - bw / 2, -6.5, bw, 2);
  if (!back) { const gx = side ? x0 + bw / 2 - 1.5 : 0, r = ph2 ? 1.5 : 1; g.fillStyle = pal.gem; g.fillRect(gx - r, -6.5 - (r - 1), r * 2, r * 2); }
  lit(g, L, side ? x0 + bw / 2 - 1.5 : 0, -6, (ph2 ? 9 : 6) + roar * 6, pal.gemGlow, back ? 0.25 : 0.5);
  halo(true);
}

// The head, about its centre: ear tufts, the crown, and from the front the heart-shaped facial disc
// with its burning eyes and beak; side-on the round of the skull with the disc turned forward, one
// eye and the beak; from behind no face at all, only the back of her crystal head.
function head(g, pal, L, b, view, ph2, roar, k) {
  const t = b.anim || 0, st = b.state, stunned = st === 'stunned';
  const cs = (1 + (ph2 ? 0.28 : 0)) * (1 + roar * 0.15);
  g.save(); g.translate(0, -58); if (stunned) g.rotate(Math.sin(t * 2.5) * 0.15 - 0.12);
  const crowned = () => { g.save(); if (stunned) { g.translate(0, -5); g.rotate(-0.3); g.translate(0, 5); } crown(g, pal, L, view, ph2, cs, k, t, roar); g.restore(); };
  if (view === 'back') {
    for (const s of [-1, 1]) { g.fillStyle = pal.tuftShade; poly(g, [[s * 3, -5], [s * 10, -13], [s * 7.5, -2]]); g.fillStyle = pal.tuft; poly(g, [[s * 4, -4.6], [s * 10, -13], [s * 6.2, -3]]); }
    g.fillStyle = pal.crystal[1]; g.beginPath(); g.ellipse(0, 0, 8.2, 7.2, 0, 0, TAU); g.fill();
    g.fillStyle = pal.crystal[0]; poly(g, [[-7.4, -2.5], [-2, -6.8], [1, -1], [-3, 3]]);
    g.fillStyle = pal.crystal[2]; poly(g, [[1, -1], [7.6, -1.5], [5, 4.6], [0, 6.8], [-3, 3]]);
    g.strokeStyle = pal.crystalEdge; g.lineWidth = 0.6; line(g, [[-2, -6.8], [1, -1], [7.6, -1.5]]); line(g, [[1, -1], [-3, 3], [0, 6.8]]);
    g.strokeStyle = pal.ruffHi; g.lineWidth = 0.7; g.beginPath(); for (const x of [-4, 0, 4]) { g.moveTo(x * 0.6, 1.5); g.quadraticCurveTo(x, 4, x * 1.2, 7); } g.stroke();
    crowned();
    g.restore();
    return;
  }
  const side = view === 'side', fx = side ? 4.2 : 0, eyes = side ? [0] : [-3.4, 3.4];
  if (side) {
    g.fillStyle = pal.tuftShade; poly(g, [[-2, -5], [-8.5, -12.5], [-5, -2]]);
    g.fillStyle = pal.crystal[1]; g.beginPath(); g.ellipse(-1, 0, 7.5, 7, 0, 0, TAU); g.fill();
    g.fillStyle = pal.crystal[2]; poly(g, [[-8.2, 0.5], [-4.5, 6], [-1, 6.9], [-3, 1]]);
    g.fillStyle = pal.face; g.beginPath(); g.ellipse(2.8, 0.3, 5.4, 6.6, 0, 0, TAU); g.fill();
    g.fillStyle = pal.tuft; poly(g, [[-0.5, -5.5], [-6, -14], [-3, -3]]);
  } else {
    for (const s of [-1, 1]) { g.fillStyle = pal.tuft; poly(g, [[s * 3, -5], [s * 10, -13], [s * 7.5, -2]]); g.fillStyle = pal.tuftShade; poly(g, [[s * 5.5, -4], [s * 10, -13], [s * 7.5, -2]]); }
    g.fillStyle = pal.face; g.beginPath(); g.ellipse(0, 0, 8, 7, 0, 0, TAU); g.fill();
  }
  crowned();
  g.fillStyle = pal.mask; for (const ex of eyes) disc(g, fx + ex, -0.5, side ? 3.6 : 3.9);
  poly(g, side ? [[0.5, 0.8], [8, 0.8], [5, 6.5]] : [[-7, 0.8], [7, 0.8], [0, 6.5]]);
  g.strokeStyle = pal.maskLine; g.lineWidth = 0.6; line(g, side ? [[7.6, -3.5], [7.6, 1]] : [[0, -3.5], [0, 1]]);
  const er = 1 + roar * 0.3 + (st === 'rain' || st === 'gust' || st === 'pillars' ? 0.25 : 0) + (ph2 ? 0.15 : 0);
  for (const ex of eyes) {
    const x = fx + ex + (side ? 0.2 : 0);
    g.fillStyle = pal.socket; disc(g, x, -0.6, 2.6);
    if (stunned) { g.strokeStyle = pal.daze; g.lineWidth = 0.7; g.beginPath(); g.arc(x, -0.6, 1.5, t * 8, t * 8 + 4.5); g.stroke(); continue; }
    g.fillStyle = pal.eye; disc(g, x, -0.6, 1.9 * er);
    if (ph2) { g.fillStyle = pal.eye2; disc(g, x, -0.6, 0.9 * er); }
    g.fillStyle = pal.glint; disc(g, x - (side ? -0.4 : Math.sign(ex) * 0.4), -1, 0.85);
    lit(g, L, x, -0.6, 9 * er, pal.eyeGlow, 0.6);
  }
  g.strokeStyle = pal.brow; g.lineWidth = 1; g.beginPath();
  if (side) { g.moveTo(1, -4.4); g.lineTo(7.5, -2.8); } else for (const s of [-1, 1]) { g.moveTo(s * 7, -4.5); g.lineTo(s * 1.5, -2.6); }
  g.stroke();
  g.fillStyle = pal.beak; poly(g, side ? [[7.2, 0.4], [7.4, 3.4], [11, 2]] : [[-1.3, 1.5], [1.3, 1.5], [0, 4.8]]);
  g.restore();
}

// The light breaking through her as she shatters, spreading over the transform.
const CRACKS = [
  [[0, -40], [-3, -44], [-2, -48], [-5, -51]], [[0, -40], [4, -37], [3, -33], [6, -30]], [[0, -40], [5, -45], [8, -47]],
  [[-2, -32], [-5, -26], [-3, -19], [-7, -12], [-6, -5]], [[3, -31], [6, -24], [4, -16], [9, -8]], [[-1, -52], [1, -57], [-2, -61], [1, -65]],
  [[-6, -36], [-10, -30], [-12, -22]], [[2, -55], [5, -59], [4, -63]],
];
function cracks(g, pal, L, k, side) {
  const n = Math.ceil(k * CRACKS.length);
  g.lineCap = 'round'; g.lineJoin = 'round';
  CRACKS.slice(0, n).forEach((c, i) => {
    const run = clamp01(k * CRACKS.length - i), pts = c.slice(0, Math.max(2, Math.round(c.length * run))).map(([x, y]) => [x * (side ? 0.6 : 1), y]);
    for (const [w, a] of [[2.2, 0.45], [0.9, 1]]) { g.strokeStyle = `rgba(${pal.crack},${a})`; g.lineWidth = w; line(g, pts); }
    lit(g, L, pts[0][0], pts[0][1], 6 + k * 6, pal.crack, 0.3 + k * 0.3);
  });
}

// Shattered, the shards she burst into flying back together as she reforms.
function reform(g, pal, k) {
  const e = easeOut(k);
  for (let i = 0; i < 16; i++) {
    const a = hash(i, 31) * TAU, r = (1 - e) * (30 + hash(i, 32) * 40);
    shard(g, pal, Math.cos(a) * r, -40 + Math.sin(a) * r * 0.8, a + Math.PI / 2 + (1 - e) * 6, 11 * (1 - e * 0.6), 3, 1, hash(i, 33));
  }
}

// ---------------------------------------------------------------- the painter
export function paintRime(g, b, L, pal = RIME_PAL) {
  const view = b.view || 'front', side = view === 'side', back = view === 'back';
  const t = b.anim || 0, st = b.state, ph2 = (b.phase || 1) > 1, roar = roarK(b), P = rimePose(b);
  const sk = shatterK(b), rk = reformK(b);
  g.save(); g.translate(0, hoverOf(b, P));
  g.translate(0, -28); g.rotate((side ? P.lean : P.lean * (b.cdx || 0)) + P.sway); g.translate(0, 28);
  g.scale(sizeOf(b), sizeOf(b));
  if (st === 'wind') { g.translate(0, 2); g.scale(1, 0.95); }
  if (sk > 0) g.translate(Math.sin(t * 57) * sk * 0.9, 0); // shivering apart
  g.save();
  if (side) {
    // side-on her wings both sweep back, the far one a little higher and in shade
    wing(g, pal, P, -1, 1, -48.5, ph2, { far: true });
    cape(g, pal, t, ph2, view); gown(g, pal, t, ph2, view, b.mvx); bodice(g, pal, L, true, ph2, roar); ruff(g, pal, view);
    wing(g, pal, P, -1, -2, -46, ph2);
  } else if (back) {
    // from behind the wings spread between us and her, so they go on last
    gown(g, pal, t, ph2, view, b.mvx); cape(g, pal, t, ph2, view); ruff(g, pal, view);
  } else {
    for (const s of [-1, 1]) wing(g, pal, P, s, s * 7, -46, ph2);
    cape(g, pal, t, ph2, view); gown(g, pal, t, ph2, view, b.mvx); bodice(g, pal, L, false, ph2, roar); ruff(g, pal, view);
  }
  head(g, pal, L, b, view, ph2, roar, easeOut(rk));
  if (back) for (const s of [-1, 1]) wing(g, pal, P, s, s * 7, -46, ph2, { backs: true });
  if (sk > 0) cracks(g, pal, L, sk, side);
  g.restore();
  if (ph2 && rk < 1) reform(g, pal, rk);
  g.restore();
}

// The decoys: hollow copies of her Shattered form, smaller, paler and glassy, their eyes empty light.
export const DECOY_PAL = {
  ...RIME_PAL,
  plume: ['#ffffff', '#d4f0ff', '#90c4ea'], gown2: ['#ffffff', '#c8e8fa', '#7aaad8'], cape: ['#f0faff', '#bcdcf4', '#78a6d4'],
  eye: '#e8fbff', eye2: '#ffffff', eyeGlow: '120,190,240', socket: '#6aa6d8', gem: '#d8f6ff', gemGlow: '120,190,240',
  face: '#e2f6ff', brow: '#8cc0e6', beak: '#d4eefa', arm: '#9ccae8',
};
export const DECOY_SIZE = 0.6;
// k: how far it has formed.
export function paintDecoy(g, d, L, k = 1, pal = DECOY_PAL) {
  const s = DECOY_SIZE * lerp(0.4, 1, easeOut(k));
  g.save(); g.scale(s, s); paintRime(g, d, L, pal); g.restore();
}

// Mist trailing under the gown and a cold glow at her feet.
export function rimeUnder(g, b, x, y, scale = 1, pal = rimePal(b)) {
  const t = b.anim || 0, ph = b.phase || 1, hy = y + rimeHover(b) * scale;
  glow(g, x, y + 4 * scale, (26 + ph * 6) * scale, pal.chill, 0.16 + ph * 0.06);
  for (let i = 0; i < 7; i++) {
    const p = (t * 0.7 + i / 7) % 1, mx = x + ((hash(i, 1) - 0.5) * 22 - (b.mvx || 0) * 0.08 * p) * scale, my = hy + (-4 + p * 12) * scale;
    g.fillStyle = `rgba(${pal.mist},${0.3 * (1 - p)})`; g.beginPath(); g.ellipse(mx, my, (6 + p * 8) * scale, (2.5 + p * 2) * scale, 0, 0, TAU); g.fill();
  }
}
// Frost aura (Shattered), snow swirling in as a gust gathers, skid shavings, stun stars, and spent,
// her breath steaming.
export function rimeOver(g, b, x, y, scale = 1, pal = rimePal(b)) {
  const t = b.anim || 0, ph2 = (b.phase || 1) > 1, hy = y + rimeHover(b) * scale, roar = roarK(b), S = sizeOf(b) * scale;
  const n = ph2 ? 8 : roar ? 6 : 0;
  for (let k = 0; k < n; k++) {
    const a = t * 1.4 + (k / n) * TAU, fx = x + Math.cos(a) * 30 * S, fy = hy + (-30 + Math.sin(a) * 12 + Math.sin(t * 3 + k) * 2) * S, r = (1.6 + hash(k) * 1.2) * scale;
    g.strokeStyle = `rgba(${pal.frost},${0.6 + 0.4 * Math.sin(a)})`; g.lineWidth = Math.max(0.7, 0.7 * scale);
    g.beginPath(); for (let j = 0; j < 3; j++) { const q = a * 2 + (j * Math.PI) / 3; g.moveTo(fx - Math.cos(q) * r, fy - Math.sin(q) * r); g.lineTo(fx + Math.cos(q) * r, fy + Math.sin(q) * r); } g.stroke();
  }
  if (b.state === 'gust' && (b.timer ?? 0) > BLOW) for (let i = 0; i < 16; i++) {
    const p = (t * 1.5 + hash(i, 2)) % 1, a = hash(i, 3) * TAU + t * 3, r = (44 - p * 36) * S;
    g.fillStyle = `rgba(${pal.snow},${0.85 * p})`; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(hy + (-40 + Math.sin(a) * r * 0.5) * S), Math.max(1, Math.round(scale)), Math.max(1, Math.round(scale)));
  }
  if (b.state === 'skid') {
    const d = Math.sign(b.cdx || 1);
    g.fillStyle = `rgba(${pal.skid},0.6)`; g.fillRect(x - 14 - d * 6, y + 3, 28, 2);
    for (let k = 0; k < 6; k++) { const p = (t * 3 + k / 6) % 1; g.fillStyle = `rgba(${pal.snow},${1 - p})`; g.fillRect(Math.round(x + d * (6 + p * 10) + (hash(k) - 0.5) * 10), Math.round(y + 2 - p * 8 + p * p * 10), 1, 1); }
    g.fillStyle = `rgb(${pal.snow})`; g.fillRect(x + 9, hy - 56 * S, 2, 3); g.fillRect(x + 9.5, hy - 57 * S, 1, 1);
  }
  if (b.state === 'spent') for (let i = 0; i < 3; i++) {
    const p = (t * 0.9 + i / 3) % 1;
    g.fillStyle = `rgba(${pal.breath},${0.45 * (1 - p)})`; g.beginPath(); g.ellipse(x + (hash(i, 5) - 0.5) * 4 * scale, hy - (54 + p * 14) * S, (1.5 + p * 4) * scale, (1 + p * 2.5) * scale, 0, 0, TAU); g.fill();
  }
  if (b.state === 'stunned') dizzyStars(g, x, hy - 76 * S, t, 4);
}

// ---------------------------------------------------------------- world effects
// Her gust, down its cone: frost drawn in toward her while it gathers, then the blizzard streaming
// out along it while it blows.
export function drawGust(g, b, zones, cam, pal = rimePal(b)) {
  for (const z of zones) {
    if (z.owner !== b || !z.gust) continue;
    const x = z.x - cam.left, y = z.y - cam.top - 20, live = z.t <= 0, age = live ? -z.t : z.t0 - z.t;
    g.lineWidth = 1;
    for (let i = 0; i < (live ? 30 : 16); i++) {
      const a = z.a + (hash(i, 41) - 0.5) * 2 * z.spread * 0.9, q = (age * (live ? 1.4 : 1.1) + hash(i, 42)) % 1;
      const r0 = live ? 12 + q * z.r : z.r * 0.55 * (1 - q) + 10, len = live ? 10 + hash(i, 43) * 14 : 4;
      g.strokeStyle = `rgba(${pal.snow},${(live ? 0.8 : 0.6) * Math.sin(q * Math.PI)})`;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.8); g.lineTo(x + Math.cos(a) * (r0 + len), y + Math.sin(a) * (r0 + len) * 0.8); g.stroke();
    }
  }
}

// Frost crazing the floor where a prison will rise, closing in as the strike nears.
export function drawFrostMarks(g, b, zones, cam, pal = rimePal(b)) {
  g.lineWidth = 1;
  for (const z of zones) {
    if (z.owner !== b || !z.pillar || z.t <= 0) continue;
    const x = z.x - cam.left, y = z.y - cam.top, k = 1 - clamp01(z.t / z.t0);
    g.strokeStyle = `rgba(${pal.frost},${0.35 + 0.5 * k})`; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + hash(i, z.x) * 0.5, r = z.r * (0.4 + 0.6 * k); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6); }
    g.stroke();
  }
}

// An ice pillar where a prison struck: it bursts up, stands, then cracks before it shatters.
export function drawPillar(g, x, y, age, pal = RIME_PAL) {
  const up = easeOut(age / 0.1), crack = clamp01((age - (PILLAR_LIFE - 0.3)) / 0.3), h = 28 * up, w = 9;
  if (h < 1) return;
  const X = Math.round(x), Y = Math.round(y) + 3, top = Y - h;
  g.fillStyle = `rgba(${pal.mist},0.35)`; g.beginPath(); g.ellipse(X, Y, w + 5, 4, 0, 0, TAU); g.fill();
  g.fillStyle = pal.pillarInk; poly(g, [[X - w - 1, Y + 1], [X - w - 1, top + 2], [X, top - 4], [X + w + 1, top + 2], [X + w + 1, Y + 1], [X, Y + 4]]);
  g.fillStyle = pal.pillar[0]; poly(g, [[X - w, Y], [X - w, top + 2], [X, top + 5], [X, Y + 3]]);
  g.fillStyle = pal.pillar[1]; poly(g, [[X, Y + 3], [X, top + 5], [X + w, top + 2], [X + w, Y]]);
  g.fillStyle = pal.pillar[2]; poly(g, [[X - w, top + 2], [X, top - 3], [X + w, top + 2], [X, top + 5]]);
  g.fillStyle = `rgba(${pal.snow},0.6)`; g.fillRect(X + 2, top + 7, 1, h - 10);
  if (crack > 0) {
    g.strokeStyle = `rgba(${pal.snow},${0.5 + crack * 0.5})`; g.lineWidth = 1;
    line(g, [[X - 4, top + 6], [X - 1, top + 6 + h * 0.3 * crack], [X - 5, top + 6 + h * 0.6 * crack]]);
    line(g, [[X + 5, top + 4], [X + 2, top + 4 + h * 0.4 * crack], [X + 6, top + 4 + h * 0.7 * crack]]);
  }
  glow(g, X, top + h * 0.4, 16, pal.pillarGlow, 0.25 * (1 - crack));
}
