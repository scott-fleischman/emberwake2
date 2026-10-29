// Status effect visuals: icons over the player's head, HUD chips, the blind vignette, and the
// ground patches monsters leave behind. Nothing here calls Math.random: flicker comes from the
// clock and a hash of each spot, so redrawing a frame gives the same frame.
import { TAU, clamp } from '../core/math.js';
import { tileHash } from '../core/rng.js';
import { EFFECTS } from '../game/effects.js';
import { UI } from './palette.js';
import { text, panel } from './ui.js';
import { R } from './sprites.js';

// ---------------------------------------------------------------- icons
// 7x7 pixels: o body, l light, d outline, x accent.
const ICONS = {
  snare: { px: ['..ddd..', '.dolod.', 'do...od', 'dl...ld', 'do...od', '.dolod.', '..ddd..'], pal: { o: '#b08848', l: '#e8c880', d: '#4a3418' } },
  poison: { px: ['...d...', '..dod..', '..dod..', '.dolod.', 'doolood', 'doooood', '.ddddd.'], pal: { o: '#7ac040', l: '#d4f890', d: '#2a4a14' } },
  mud: { px: ['.......', '..ddd..', '.dolod.', 'doooood', 'doolood', '.ddodd.', '..d.d..'], pal: { o: '#8a6238', l: '#b88c58', d: '#3a2410' } },
  blind: { px: ['......x', '.ddddxd', 'dlllxld', 'dllxold', 'dlxolld', '.xdddd.', 'x......'], pal: { o: '#6a5aa0', l: '#f0f0ff', d: '#2a2040', x: '#ff5050' } },
  chill: { px: ['...l...', '.l.o.l.', '..ooo..', 'loolool', '..ooo..', '.l.o.l.', '...l...'], pal: { o: '#8cd0ff', l: '#ffffff' } },
  freeze: { px: ['.ddddd.', 'dllllod', 'dlooood', 'dlooood', 'doooood', 'doooood', '.ddddd.'], pal: { o: '#a8dcf8', l: '#f0fcff', d: '#3a6a9a' } },
  burn: { px: ['...o...', '..oo...', '..ooo.o', '.oolloo', '.ollllo', '.dolod.', '..ddd..'], pal: { o: '#ff7a1c', l: '#ffe070', d: '#8a2a0c' } },
};

function drawIcon(g, kind, x, y) {
  const { px, pal } = ICONS[kind];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (px[r][c] !== '.') R(g, x + c, y + r, 1, 1, pal[px[r][c]]);
}

// Over the head, bobbing; an effect about to end blinks.
export function drawEffectIcons(g, p, cam, time) {
  const kinds = Object.keys(p.effects);
  if (!kinds.length) return;
  const cx = p.x - cam.left, top = Math.round(p.y - cam.top) - 30;
  kinds.forEach((k, i) => {
    if (p.effects[k].t < 1 && Math.floor(time * 8) % 2) return;
    drawIcon(g, k, Math.round(cx - (kinds.length * 9 - 2) / 2 + i * 9), top + Math.round(Math.sin(time * 4 + i * 1.7)));
  });
}

// name, and what to do about it
const LABEL = { snare: ['Snared', 'Attack'], poison: ['Poisoned', 'Eat'], mud: ['Mired', 'Roll'], blind: ['Blinded', ''], chill: ['Chilled', ''], freeze: ['Frozen', 'Mash'], burn: ['Burning', 'Roll'] };

// A row of chips going right from (x, y): icon, name and seconds left, and the way out.
export function drawEffectChips(u, p, x, y) {
  let cx = x;
  for (const [k, e] of Object.entries(p.effects)) {
    const rgb = EFFECTS[k].rgb, [name, hint] = LABEL[k];
    panel(u, cx, y, 54, 14, { r: 2, fill: 'rgba(20,16,24,0.82)', edge: `rgba(${rgb},0.9)` });
    drawIcon(u, k, cx + 3, y + 3);
    text(u, `${name} ${Math.ceil(e.t)}s`, cx + 13, y + 6, { size: 5, bold: true, color: `rgb(${rgb})` });
    if (hint) text(u, e.need ? `${hint} ${e.n}/${e.need}` : hint, cx + 13, y + 11.5, { size: 4.5, color: UI.dim });
    cx += 57;
  }
}

// Darkness closing in on the player: a clear circle that shrinks from 120 px to 28 px as k goes 0 to 1,
// with a stepped edge to keep the pixel look.
export function drawBlind(g, p, cam, k) {
  const x = Math.round(p.x - cam.left), y = Math.round(p.y - cam.top), r = 120 - 92 * clamp(k, 0, 1);
  g.save();
  g.fillStyle = 'rgba(6,4,12,0.42)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.rect(0, 0, 480, 270); g.arc(x, y, r + i * 6, 0, TAU); g.fill('evenodd'); }
  g.restore();
}

// ---------------------------------------------------------------- zone outlines
// The open stretches of a ring between its gaps, as [from, to] angles within [0, TAU].
function openArcs(gaps) {
  const cuts = [];
  for (const [a, hw] of gaps) {
    if (hw >= Math.PI) return [];
    const lo = (((a - hw) % TAU) + TAU) % TAU, hi = lo + hw * 2;
    if (hi > TAU) cuts.push([lo, TAU], [0, hi - TAU]); else cuts.push([lo, hi]);
  }
  cuts.sort((m, n) => m[0] - n[0]);
  const arcs = [];
  let at = 0;
  for (const [lo, hi] of cuts) { if (lo > at) arcs.push([at, lo]); at = Math.max(at, hi); }
  if (at < TAU) arcs.push([at, TAU]);
  return arcs;
}

// Traces a zone's outline for zones.js (telegraphs) and for the patches below.
export function shapePath(g, z, ox, oy) {
  g.beginPath();
  switch (z.shape) {
    case 'circle': g.arc(z.x - ox, z.y - oy, Math.max(0, z.r), 0, TAU); break;
    case 'segment': {
      const dx = z.x2 - z.x1, dy = z.y2 - z.y1, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * z.w / 2, ny = (dx / l) * z.w / 2;
      g.moveTo(z.x1 - ox + nx, z.y1 - oy + ny); g.lineTo(z.x2 - ox + nx, z.y2 - oy + ny);
      g.lineTo(z.x2 - ox - nx, z.y2 - oy - ny); g.lineTo(z.x1 - ox - nx, z.y1 - oy - ny); g.closePath();
      break;
    }
    case 'ring': {
      const cx = z.x - ox, cy = z.y - oy, ro = z.r + z.width / 2, ri = Math.max(0, z.r - z.width / 2);
      for (const [a0, a1] of openArcs(z.gaps)) { g.moveTo(cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro); g.arc(cx, cy, ro, a0, a1); g.arc(cx, cy, ri, a1, a0, true); g.closePath(); }
      break;
    }
    case 'cone':
      g.moveTo(z.x - ox, z.y - oy); g.arc(z.x - ox, z.y - oy, z.r, z.a - z.spread, z.a + z.spread); g.closePath();
      break;
  }
}

// ---------------------------------------------------------------- ground patches
// One mark per art, drawn at a screen point. a and b are that spot's stable hashes in [0, 1).
const MARKS = {
  thorns: (g, x, y, a) => {
    const l = 4 + Math.floor(a * 3);
    for (const [dx, dh] of [[0, 0], [-2, 2], [2, 1]]) { R(g, x + dx, y - l + dh, 1, l - dh, '#2e4a1a'); R(g, x + dx, y - l + dh, 1, 1, '#d8e8a0'); }
    R(g, x - 2, y, 5, 1, '#1a2a10');
  },
  roots: (g, x, y, a) => {
    const s = a < 0.5 ? 1 : -1;
    R(g, x, y, 5, 1, '#6a4a2a'); R(g, x + 4, y + 1, 1, 3, '#6a4a2a'); R(g, x + 4 + s, y + 3, 1, 2, '#4a3018'); R(g, x + 1, y - 1, 3, 1, '#9a7442');
  },
  mud: (g, x, y, a, b, time) => {
    R(g, x, y, 5, 2, '#46301a'); R(g, x + 1, y, 3, 1, '#7a5a34');
    const ph = (time * 0.7 + b) % 1;
    if (ph < 0.3) R(g, x + 2, y - 1 - Math.floor(ph * 8), 2, 2, '#9a7a4c');
  },
  poison: (g, x, y, a, b, time) => {
    R(g, x - 1, y + 2, 5, 2, '#2e5a1c');
    const ph = (time * 0.9 + a) % 1;
    R(g, x + Math.round(b * 3), y - Math.floor(ph * 9), 2, 2, ph < 0.5 ? '#9ad044' : ph < 0.8 ? '#c8f090' : '#e8ffc8');
  },
  dust: (g, x, y, a, b, time) => {
    R(g, x, y + 1, 2, 1, '#8a6e48');
    R(g, x + Math.round(Math.sin(time * 2 + a * 6) * 3), y - Math.round(Math.cos(time * 1.5 + b * 6) * 2), 2, 1, '#f0e0b8');
  },
  fire: (g, x, y, a, b, time) => {
    const h = Math.round(4 + a * 2 + Math.sin(time * 12 + b * 9) * 1.6), k = Math.round(h * 0.6);
    R(g, x - 2, y, 5, 1, '#a02808'); R(g, x - 1, y - h + 1, 3, h - 1, '#ff6a18');
    R(g, x, y - h, 1, h, '#ff8a28'); R(g, x, y - k, 1, k, '#ffe070');
  },
  fissure: (g, x, y, a, b, time) => {
    const c = Math.sin(time * 3 + a * 6) > 0 ? '#ffb040' : '#c8480c';
    R(g, x - 1, y - 1, 6, 3, '#0a0606'); R(g, x + 3, y + 1, 3, 4, '#0a0606');
    R(g, x, y, 4, 1, c); R(g, x + 3, y + 1, 1, 3, c); R(g, x + 3, y + 3, 3, 1, c);
  },
  // sand heaving in little crescents over something digging below
  ripple: (g, x, y, a, b, time) => {
    const h = Math.sin(time * 9 + a * 7) > 0 ? 1 : 0;
    R(g, x - 2, y - h, 5, 1, '#f0dca8'); R(g, x - 3, y + 1 - h, 1, 1, '#c8a060'); R(g, x + 3, y + 1 - h, 1, 1, '#c8a060');
    R(g, x - 2, y + 1, 5, 1, '#8a6a3a');
  },
  frost: (g, x, y, a, b, time) => {
    R(g, x, y - 2, 1, 5, '#ffffff'); R(g, x - 2, y, 5, 1, '#d8f4ff'); R(g, x - 1, y - 1, 3, 3, '#a8dcf8'); R(g, x, y, 1, 1, '#ffffff');
    if (Math.sin(time * 5 + a * 20) > 0.8) R(g, x + 2, y - 3, 1, 1, '#ffffff');
  },
};
// Ground stain colour (r,g,b) and rim.
const STAIN = {
  thorns: ['46,66,30', '#8cb04a'], roots: ['70,48,28', '#a07a48'], mud: ['84,58,32', '#9a7444'], poison: ['58,110,36', '#b4e860'],
  dust: ['176,142,92', '#e8d6a8'], fire: ['120,38,16', '#ffa038'], fissure: ['22,14,12', '#ff7a28'], frost: ['150,200,230', '#f0fcff'],
  ripple: ['160,120,68', '#e0c890'],
};
const CELL = 10;

function bounds(z) {
  switch (z.shape) {
    case 'segment': { const h = z.w / 2; return [Math.min(z.x1, z.x2) - h, Math.min(z.y1, z.y2) - h, Math.max(z.x1, z.x2) + h, Math.max(z.y1, z.y2) + h]; }
    case 'ring': { const r = z.r + z.width / 2; return [z.x - r, z.y - r, z.x + r, z.y + r]; }
    default: return [z.x - z.r, z.y - z.r, z.x + z.r, z.y + z.r];
  }
}

// A ground patch that has gone live: a stain in its art's colours, scattered with marks. Marks sit on
// a world grid, so they hold still as the camera moves. It fades in as it lands and out as it expires.
export function drawPatch(g, z, cam, time) {
  const mark = MARKS[z.art], [stain, rim] = STAIN[z.art] || [];
  const fade = clamp(Math.min(-z.t / 0.25, (z.life + z.t) / 0.6), 0, 1);
  if (!mark || fade <= 0) return;
  const ox = cam.left, oy = cam.top, [x0, y0, x1, y1] = bounds(z);
  g.save();
  g.globalAlpha = fade;
  shapePath(g, z, ox, oy);
  g.fillStyle = `rgba(${stain},0.6)`; g.fill();
  g.strokeStyle = rim; g.lineWidth = 1; g.stroke();
  g.clip();
  for (let cy = Math.floor(y0 / CELL); cy * CELL <= y1; cy++) for (let cx = Math.floor(x0 / CELL); cx * CELL <= x1; cx++) {
    const a = tileHash(cx, cy, 1), b = tileHash(cx, cy, 2);
    mark(g, Math.round((cx + 0.15 + a * 0.7) * CELL - ox), Math.round((cy + 0.15 + b * 0.7) * CELL - oy), a, b, time);
  }
  g.restore();
}
