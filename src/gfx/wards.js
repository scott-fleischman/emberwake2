// Art for the ward quests: the living seals, lookouts, leaf-shrines, magma vents, signal beacons, and
// the Tide Bells in their flooded pools. Everything animates, so it is drawn each frame (props into the
// y-sorted list, pools over the ground) rather than baked into chunks.
import { T, D, TILE } from '../world/tiles.js';
import { R, cached } from './sprites.js';
import { tileHash } from '../core/rng.js';
import { drawCampfire } from './render.js';

const TAU = Math.PI * 2;
const SEAL_KIND = { verdant: 'thorn', ashen: 'fire', frost: 'ice', drowned: 'tide' };

// Which seal each barrier tile belongs to: a ring can stray across biomes, but keeps its own look.
const sealOf = new WeakMap();
function sealAt(W, i) {
  let m = sealOf.get(W.pois.seals);
  if (!m) {
    m = new Map();
    for (const seal of Object.values(W.pois.seals)) for (const q of seal.tiles) m.set(q.y * W.w + q.x, seal);
    sealOf.set(W.pois.seals, m);
  }
  return m.get(i);
}

export function collectWardProps(list, cam, time, m, W, pr) {
  const L = cam.left, Tp = cam.top;
  const x0 = Math.max(0, Math.floor(L / TILE) - 1), x1 = Math.min(m.w - 1, Math.floor((L + cam.vw) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(Tp / TILE) - 1), y1 = Math.min(m.h - 1, Math.floor((Tp + cam.vh) / TILE) + 3);
  const starving = W.pois.relics.vents.length && W.pois.relics.vents.every((v) => pr.relics.includes(v.id));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * m.w + x, t = m.tiles[i], d = m.deco[i];
    const px = x * TILE - L, py = y * TILE - Tp, sortY = y * TILE + 14;
    if (t === T.SEAL) {
      const seal = sealAt(W, i), kind = SEAL_KIND[seal?.key] || 'thorn';
      list.push({ y: sortY, draw: (g) => SEAL_ART[kind](g, px, py, time, x, y, starving, seal) });
    } else if (t === T.VENT) list.push({ y: sortY, draw: (g) => drawVent(g, px, py, time, x, y) });
    if (d === D.LOOKOUT) {
      const id = W.pois.lookouts.find((l) => l.x === x && l.y === y)?.id;
      const spr = id === 'windcrest' ? cairnSprite() : id === 'belfry' ? belfrySprite() : towerSprite();
      list.push({ y: sortY, draw: (g) => {
        if (id === 'belfry') drawSunkFooting(g, px, py, time, false);
        g.drawImage(spr, px + 8 - (spr.width >> 1), py + 16 - spr.height);
        if (id === 'belfry') drawSunkFooting(g, px, py, time, true);
        if (id === 'windcrest') drawBanner(g, px + 8, py + 16 - spr.height + 2, time);
      } });
    } else if (d === D.BELL) {
      const rung = W.pois.relics.bells.some((r) => r.x === x && r.y === y && pr.relics.includes(r.id));
      list.push({ y: sortY, draw: (g) => drawBell(g, px, py, time, rung, x) });
    } else if (d === D.ALTAR) {
      const done = W.pois.relics.leaves.some((r) => r.x === x && r.y === y && pr.relics.includes(r.id));
      list.push({ y: sortY - 6, draw: (g) => drawAltar(g, px, py, time, done) });
    } else if (d === D.BEACON) {
      const lit = W.pois.relics.beacons.some((r) => r.x === x && r.y === y && pr.relics.includes(r.id));
      list.push({ y: sortY, draw: (g) => drawBeacon(g, px, py, time, lit) });
    }
  }
}

// ------------------------------------------------------------------ seals
const SEAL_ART = {
  thorn(g, px, py, t, x, y) {
    const h = tileHash(x, y, 31), breathe = Math.sin(t * 1.6 + h * 6) * 1.5;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(px + 8, py + 14, 9, 3, 0, 0, TAU); g.fill();
    // Twisted trunks, thickest at the root.
    for (let k = 0; k < 4; k++) {
      const bx = px + 2 + k * 4 + Math.round(tileHash(x, y, 40 + k) * 2), top = py - 14 - Math.round(tileHash(x, y, 50 + k) * 8) - breathe;
      const sway = Math.sin(t * 1.3 + k + h * 5) * 1.5;
      g.strokeStyle = k % 2 ? '#2a1e14' : '#3a2a1a'; g.lineWidth = 3 - k * 0.3;
      g.beginPath(); g.moveTo(bx, py + 14); g.quadraticCurveTo(bx + (k % 2 ? 5 : -5), py + 2, bx + sway, top); g.stroke();
      g.strokeStyle = '#4e3a24'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bx - 1, py + 13); g.quadraticCurveTo(bx + (k % 2 ? 4 : -6), py + 2, bx + sway - 1, top + 2); g.stroke();
      // Thorns along the vine.
      for (let s = 0; s < 4; s++) {
        const ty = top + 4 + s * 6, tx = bx + sway * (1 - s / 4) + (k % 2 ? 2 : -2) * (s / 3);
        g.fillStyle = '#d8c8a0'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + (s % 2 ? 4 : -4), ty - 2); g.lineTo(tx, ty + 2); g.fill();
      }
    }
    // Dark leaves and a pulsing red bud.
    for (let k = 0; k < 3; k++) R(g, px + Math.floor(tileHash(x, y, 60 + k) * 13), py - 6 - Math.floor(tileHash(x, y, 70 + k) * 14), 3, 2, '#2e4a1e');
    if (h > 0.55) {
      const r = 1.8 + Math.max(0, Math.sin(t * 3 + h * 9)) * 1.2;
      g.fillStyle = '#c03050'; g.beginPath(); g.arc(px + 4 + h * 8, py - 4 - h * 10, r, 0, TAU); g.fill();
      g.fillStyle = '#ff90a0'; g.fillRect(Math.round(px + 3.5 + h * 8), Math.round(py - 5 - h * 10), 1, 1);
    }
  },
  fire(g, px, py, t, x, y, starving) {
    const h = tileHash(x, y, 33), size = starving ? 0.55 : 1;
    g.fillStyle = 'rgba(255,110,30,0.16)'; g.beginPath(); g.ellipse(px + 8, py + 6, 14, 18 * size, 0, 0, TAU); g.fill();
    R(g, px, py + 10, 16, 6, '#2a1c1c'); R(g, px, py + 10, 16, 1, '#5a2a1a');
    for (let k = 0; k < 4; k++) R(g, px + Math.floor(tileHash(x, y, 80 + k) * 14), py + 11 + (k % 2) * 2, 2, 1, '#ff6020');
    // Tongues of flame, licking up out of the ground.
    for (let k = 0; k < 4; k++) {
      const fx = px + 2 + k * 4, ph = t * (7 + k) + h * 10 + k * 1.7;
      const fh = (16 + Math.sin(ph) * 5 + tileHash(x, y, 90 + k) * 8) * size;
      g.fillStyle = '#c02a10'; g.beginPath(); g.moveTo(fx - 3, py + 12); g.quadraticCurveTo(fx - 3 + Math.sin(ph * 0.7) * 2, py + 12 - fh * 0.6, fx + Math.sin(ph) * 2, py + 12 - fh); g.quadraticCurveTo(fx + 3, py + 12 - fh * 0.5, fx + 3, py + 12); g.fill();
      g.fillStyle = '#ff7a20'; g.beginPath(); g.moveTo(fx - 2, py + 12); g.quadraticCurveTo(fx - 1, py + 12 - fh * 0.45, fx + Math.sin(ph) * 1.5, py + 12 - fh * 0.75); g.quadraticCurveTo(fx + 2, py + 12 - fh * 0.35, fx + 2, py + 12); g.fill();
      g.fillStyle = '#ffe070'; g.beginPath(); g.moveTo(fx - 1, py + 12); g.lineTo(fx + Math.sin(ph) * 1, py + 12 - fh * 0.4); g.lineTo(fx + 1, py + 12); g.fill();
    }
    // Rising sparks.
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.8 + tileHash(x, y, 100 + k)) % 1;
      R(g, Math.round(px + 3 + tileHash(x, y, 110 + k) * 10 + Math.sin(ph * 9) * 2), Math.round(py + 4 - ph * 34 * size), 1, 1, ph < 0.5 ? '#ffe070' : '#ff8030');
    }
  },
  ice(g, px, py, t, x, y) {
    const h = tileHash(x, y, 35);
    g.fillStyle = 'rgba(0,20,40,0.25)'; g.beginPath(); g.ellipse(px + 8, py + 14, 9, 3, 0, 0, TAU); g.fill();
    // Crystal shards of different heights, faceted light and dark.
    for (let k = 0; k < 3; k++) {
      const bx = px + 1 + k * 5, w = 6, top = py - 10 - Math.round(tileHash(x, y, 120 + k) * 14), lean = (tileHash(x, y, 130 + k) - 0.5) * 4;
      g.fillStyle = '#7ab0d8'; g.beginPath(); g.moveTo(bx, py + 14); g.lineTo(bx + w / 2 + lean, top); g.lineTo(bx + w, py + 14); g.closePath(); g.fill();
      g.fillStyle = '#c8ecff'; g.beginPath(); g.moveTo(bx, py + 14); g.lineTo(bx + w / 2 + lean, top); g.lineTo(bx + w / 2, py + 14); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(Math.round(bx + 1 + lean * 0.5), Math.round(top + 6), 1, 5);
    }
    // A glint that travels up the wall.
    const ph = (t * 0.5 + h) % 2.5;
    if (ph < 1) { g.fillStyle = `rgba(255,255,255,${0.9 - ph * 0.8})`; g.fillRect(Math.round(px + 3 + h * 10), Math.round(py + 10 - ph * 22), 2, 2); }
    g.fillStyle = 'rgba(200,240,255,0.18)'; g.beginPath(); g.ellipse(px + 8, py + 2, 11, 14, 0, 0, TAU); g.fill();
  },
  tide(g, px, py, t, x, y, starving, seal) {
    // The wall wheels around the Fane like a whirlpool: eastward along its north side, west along its south.
    const dir = seal && y > seal.center.y ? -1 : 1, h = tileHash(x, y, 39);
    const top = py - 15 - Math.sin(t * 2.4 + (x + y) * 0.8) * 3;
    g.fillStyle = 'rgba(8,24,32,0.4)'; g.beginPath(); g.ellipse(px + 8, py + 13, 10, 4, 0, 0, TAU); g.fill();
    g.fillStyle = '#1f4a58'; g.beginPath(); g.moveTo(px - 1, py + 14); g.lineTo(px - 1, top + 5); g.quadraticCurveTo(px + 8, top - 3, px + 17, top + 5); g.lineTo(px + 17, py + 14); g.closePath(); g.fill();
    g.fillStyle = 'rgba(70,150,165,0.5)'; g.beginPath(); g.moveTo(px + 1, py + 13); g.lineTo(px + 1, top + 6); g.quadraticCurveTo(px + 5, top + 2, px + 8, top + 3); g.lineTo(px + 6, py + 13); g.closePath(); g.fill();
    // Streaks of churning water, phased by world position so they run on unbroken from tile to tile.
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const by = top + 7 + k * 6;
      g.strokeStyle = k % 2 ? 'rgba(150,220,225,0.55)' : 'rgba(210,245,245,0.75)';
      g.beginPath();
      for (let sx = 0; sx <= 16; sx += 2) {
        const wy = by + Math.sin((x * 16 + sx) * 0.35 - t * 5 * dir + k * 1.7) * 1.6 + sx * 0.12 * dir;
        if (sx) g.lineTo(px + sx, wy); else g.moveTo(px, wy);
      }
      g.stroke();
    }
    // A cap of foam, and spray flung off the crest.
    for (let k = 0; k < 3; k++) {
      const fx = px + 2 + k * 6 + Math.sin(t * 4 * dir + k + x) * 1.5;
      g.fillStyle = k === 1 ? '#e8fbf8' : '#b8e8e4'; g.beginPath(); g.arc(fx, top + 4 + (k % 2), 2.4, 0, TAU); g.fill();
    }
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.9 + tileHash(x, y, 150 + k)) % 1;
      R(g, Math.round(px + 4 + tileHash(x, y, 160 + k) * 8 + ph * 6 * dir), Math.round(top + 2 - Math.sin(ph * Math.PI) * 9), 1, 1, '#d8f8f4');
    }
    g.fillStyle = `rgba(150,215,215,${0.1 + 0.05 * Math.sin(t * 3 + h * 6)})`; g.beginPath(); g.ellipse(px + 8, top + 2, 11, 6, 0, 0, TAU); g.fill();
  },
};

// ------------------------------------------------------------------ props
function towerSprite() {
  return cached('ward:tower', 22, 52, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(11, 49, 10, 3, 0, 0, TAU); g.fill();
    const wood = '#7a5432', dark = '#4e3420', light = '#a07448';
    R(g, 3, 18, 2, 32, dark); R(g, 17, 18, 2, 32, dark); R(g, 6, 20, 2, 29, wood); R(g, 14, 20, 2, 29, wood);
    for (let k = 0; k < 3; k++) { g.strokeStyle = dark; g.lineWidth = 1; g.beginPath(); g.moveTo(4, 22 + k * 9); g.lineTo(18, 30 + k * 9); g.moveTo(18, 22 + k * 9); g.lineTo(4, 30 + k * 9); g.stroke(); }
    for (let k = 0; k < 7; k++) R(g, 9, 21 + k * 4, 4, 1, light); // ladder rungs
    R(g, 9, 20, 1, 29, dark); R(g, 12, 20, 1, 29, dark);
    R(g, 1, 14, 20, 5, wood); R(g, 1, 14, 20, 1, light); R(g, 1, 18, 20, 1, dark); // platform
    R(g, 1, 8, 1, 7, dark); R(g, 20, 8, 1, 7, dark); R(g, 1, 9, 20, 1, wood); // railing
    g.fillStyle = '#8a3a2a'; g.beginPath(); g.moveTo(-1, 6); g.lineTo(11, 0); g.lineTo(23, 6); g.closePath(); g.fill();
    R(g, 0, 6, 22, 1, '#5a2418');
    R(g, 10, 1, 2, 2, '#f0c850');
  });
}

function cairnSprite() {
  return cached('ward:cairn', 18, 40, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(9, 37, 8, 3, 0, 0, TAU); g.fill();
    const stones = [[2, 28, 14, 9, '#8a8e9a'], [3, 21, 12, 8, '#9aa0ac'], [4, 15, 10, 7, '#a8aeba'], [5, 10, 8, 6, '#b4bac6']];
    for (const [x, y, w, h, c] of stones) { R(g, x, y, w, h, c); R(g, x, y, w, 2, '#e8eef4'); R(g, x + w - 2, y + 2, 2, h - 2, '#6a6e7a'); }
    R(g, 8, 0, 2, 11, '#5a4a3a'); // banner pole
  });
}

// The Drowned Belfry: a stone bell tower leaning on a footing the fen has swallowed. Its bell is gone.
function belfrySprite() {
  return cached('ward:belfry', 28, 60, (g) => {
    const stone = '#58726c', dark = '#2e4442', light = '#7c968e', moss = '#3e6a48', gap = '#121c1c';
    const lean = (y) => Math.round((54 - y) * 0.07);
    for (let y = 14; y < 55; y++) {
      const ox = 6 + lean(y);
      R(g, ox, y, 16, 1, stone); R(g, ox, y, 2, 1, light); R(g, ox + 14, y, 2, 1, dark);
      if (y % 5 === 0) R(g, ox, y, 16, 1, dark);
      else if (Math.floor(y / 5) % 2) R(g, ox + 8, y, 1, 1, dark);
      else { R(g, ox + 4, y, 1, 1, dark); R(g, ox + 12, y, 1, 1, dark); }
    }
    // The open belfry, an empty yoke and a frayed rope where the bell hung.
    const bx = 6 + lean(22);
    g.fillStyle = gap; g.beginPath(); g.arc(bx + 8, 20, 4, Math.PI, 0); g.fill(); R(g, bx + 4, 20, 8, 8, gap);
    R(g, bx + 4, 19, 8, 1, '#4a3a28'); R(g, bx + 8, 20, 1, 4, '#8a7a5a'); R(g, bx + 3, 28, 10, 2, light);
    R(g, 6 + lean(39) + 7, 37, 2, 5, gap); // window slit
    // A slate roof, caved in on one side.
    const rx = 6 + lean(8);
    g.fillStyle = '#3a4650'; g.beginPath(); g.moveTo(rx - 2, 14); g.lineTo(rx + 8, 1); g.lineTo(rx + 18, 14); g.closePath(); g.fill();
    g.fillStyle = '#4e5c66'; g.beginPath(); g.moveTo(rx - 2, 14); g.lineTo(rx + 8, 1); g.lineTo(rx + 5, 14); g.closePath(); g.fill();
    g.fillStyle = gap; g.beginPath(); g.moveTo(rx + 11, 14); g.lineTo(rx + 13, 8); g.lineTo(rx + 16, 14); g.closePath(); g.fill();
    R(g, rx - 2, 13, 20, 2, '#26303a'); R(g, rx + 8, 0, 1, 2, '#7a6a4a');
    // Weed and moss climbing out of the water, and the dark tidemark.
    for (let k = 0; k < 7; k++) R(g, 7 + lean(48) + ((k * 5) % 14), 38 + ((k * 7) % 13), 1, 3 + (k % 3) * 2, moss);
    R(g, 6 + lean(52), 51, 16, 3, '#2a4436');
  });
}

// The fen water the Belfry stands in: the far half before the tower, a ripple across its foot after.
function drawSunkFooting(g, px, py, t, front) {
  if (!front) {
    g.fillStyle = '#2c4e54'; g.beginPath(); g.ellipse(px + 8, py + 10, 14, 5, 0, 0, TAU); g.fill();
    g.fillStyle = '#3e6a6c'; g.beginPath(); g.ellipse(px + 8, py + 9, 11, 3, 0, 0, TAU); g.fill();
    return;
  }
  const r = (t * 5) % 6;
  g.strokeStyle = `rgba(170,215,210,${0.7 - r * 0.1})`; g.lineWidth = 1;
  g.beginPath(); g.ellipse(px + 8, py + 10, 9 + r, 2 + r * 0.4, 0, 0.15, Math.PI - 0.15); g.stroke();
  R(g, px - 1, py + 10, 3, 1, '#8ab8b0'); R(g, px + 14, py + 11, 3, 1, '#8ab8b0');
}

function drawBanner(g, x, y, t) {
  for (let k = 0; k < 8; k++) {
    const wave = Math.sin(t * 6 - k * 0.8) * 1.5;
    R(g, Math.round(x + 1 + k), Math.round(y + wave * (k / 8)), 1, 5 - (k > 5 ? 1 : 0), k % 3 === 0 ? '#e8c050' : '#c03030');
  }
}

function drawAltar(g, px, py, t, done) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(px + 8, py + 13, 7, 2.5, 0, 0, TAU); g.fill();
  R(g, px + 3, py + 6, 10, 7, '#7a7a6a'); R(g, px + 2, py + 4, 12, 3, '#9a9a88'); R(g, px + 2, py + 4, 12, 1, '#b4b4a0');
  R(g, px + 4, py + 8, 3, 2, '#4e7a34'); R(g, px + 10, py + 10, 2, 2, '#4e7a34'); R(g, px + 3, py + 12, 10, 1, '#5a5a4e');
  g.strokeStyle = done ? '#5a5a4e' : '#8aff6a'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(px + 8, py + 9, 1.5, 2.5, 0.5, 0, TAU); g.stroke();
  if (!done) { g.fillStyle = `rgba(140,255,110,${0.15 + 0.1 * Math.sin(t * 3)})`; g.beginPath(); g.arc(px + 8, py + 4, 9, 0, TAU); g.fill(); }
  else { R(g, px + 5, py + 3, 2, 1, '#6a5a3a'); R(g, px + 10, py + 2, 1, 2, '#6a5a3a'); } // broken thorns where the beasts nested
}

function drawVent(g, px, py, t, x, y) {
  const h = tileHash(x, y, 37);
  g.fillStyle = 'rgba(255,90,20,0.18)'; g.beginPath(); g.ellipse(px + 8, py + 6, 13, 12, 0, 0, TAU); g.fill();
  R(g, px + 1, py + 7, 14, 8, '#2a1e1e'); R(g, px + 3, py + 4, 10, 4, '#3a2a28'); R(g, px + 1, py + 7, 14, 1, '#5a3a30');
  R(g, px + 5, py + 4, 6, 3, '#ff5010'); R(g, px + 6, py + 4, 4, 2, '#ffd060');
  for (let k = 0; k < 3; k++) R(g, px + 2 + Math.floor(tileHash(x, y, 140 + k) * 11), py + 9 + k * 2, 3, 1, '#d04010');
  // A column of fire and smoke that surges every few seconds.
  const surge = Math.max(0, Math.sin(t * 1.4 + h * 6));
  const fh = 10 + surge * 22;
  for (let k = 0; k < 3; k++) {
    const ph = t * 9 + k * 2.1;
    g.fillStyle = ['#c02a10', '#ff7a20', '#ffe070'][k];
    const w = 4 - k;
    g.beginPath(); g.moveTo(px + 8 - w, py + 5); g.quadraticCurveTo(px + 8 + Math.sin(ph) * 3, py + 5 - fh * (1 - k * 0.25) * 0.6, px + 8 + Math.sin(ph * 1.3) * 2, py + 5 - fh * (1 - k * 0.25)); g.quadraticCurveTo(px + 8 + w, py + 5 - fh * 0.3, px + 8 + w, py + 5); g.fill();
  }
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.5 + k / 3 + h) % 1;
    g.fillStyle = `rgba(60,50,50,${0.5 * (1 - ph)})`; g.beginPath(); g.arc(px + 8 + Math.sin(ph * 5 + k) * 4, py - fh - ph * 18, 3 + ph * 5, 0, TAU); g.fill();
  }
}

function drawBeacon(g, px, py, t, lit) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(px + 8, py + 14, 8, 3, 0, 0, TAU); g.fill();
  R(g, px + 4, py - 2, 8, 16, '#6a6e7a'); R(g, px + 4, py - 2, 2, 16, '#8a8e9a'); R(g, px + 10, py - 2, 2, 16, '#4e525c');
  R(g, px + 1, py - 6, 14, 5, '#7a7e8a'); R(g, px + 1, py - 6, 14, 1, '#a8aeba'); R(g, px + 2, py + 12, 12, 2, '#5a5e68');
  if (lit) {
    g.fillStyle = `rgba(255,170,70,${0.2 + 0.06 * Math.sin(t * 7)})`; g.beginPath(); g.arc(px + 8, py - 10, 22, 0, TAU); g.fill();
    drawCampfire(g, px, py - 18, t);
    drawCampfire(g, px + 0.5, py - 22, t + 0.37);
  } else {
    // A slab of ancient ice capping the basin.
    R(g, px, py - 14, 16, 9, '#a8d8f0'); R(g, px, py - 14, 16, 2, '#e8f8ff'); R(g, px + 11, py - 12, 5, 7, '#7ab0d8');
    R(g, px + 3, py - 11, 1, 4, '#ffffff'); R(g, px + 8, py - 12, 2, 1, '#ffffff');
    if (Math.sin(t * 2) > 0.92) R(g, px + 5, py - 13, 1, 1, '#ffffff');
  }
}

// A Tide Bell on its island: bronze gone green under the floodwater, rung clean and gleaming.
function drawBell(g, px, py, t, rung, x) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(px + 8, py + 14, 8, 3, 0, 0, TAU); g.fill();
  g.fillStyle = '#54482e'; g.beginPath(); g.ellipse(px + 8, py + 12, 8, 4, 0, 0, TAU); g.fill();
  g.fillStyle = '#6a5e3e'; g.beginPath(); g.ellipse(px + 8, py + 11, 6, 2.5, 0, 0, TAU); g.fill();
  for (const [rx, rh] of [[1, 6], [2, 4], [14, 5]]) { R(g, px + rx, py + 12 - rh, 1, rh, '#4a6a30'); R(g, px + rx, py + 11 - rh, 1, 2, '#8a6a3a'); }
  // A frame of two posts and a beam, black with damp.
  R(g, px + 1, py - 16, 2, 28, '#33281c'); R(g, px + 13, py - 16, 2, 28, '#33281c');
  R(g, px, py - 18, 16, 3, '#4a3a28'); R(g, px, py - 18, 16, 1, '#6a5438'); R(g, px + 7, py - 15, 2, 2, '#2a2016');
  const swing = rung ? Math.sin(t * 5) * 0.3 : Math.sin(t * 1.3 + x) * 0.05;
  g.save(); g.translate(px + 8, py - 13); g.rotate(swing);
  g.fillStyle = rung ? '#c48c2c' : '#8a7040';
  g.beginPath(); g.moveTo(-3, 0); g.quadraticCurveTo(-4, 6, -6, 11); g.lineTo(6, 11); g.quadraticCurveTo(4, 6, 3, 0); g.quadraticCurveTo(0, -2, -3, 0); g.fill();
  R(g, -6, 10, 12, 2, rung ? '#e8b048' : '#6a5630'); R(g, -2, 2, 1, 7, rung ? '#ffe090' : '#b49860');
  if (!rung) { R(g, 1, 3, 2, 2, '#62b896'); R(g, -4, 7, 2, 2, '#4ea484'); R(g, 2, 8, 3, 1, '#78ccaa'); R(g, -1, 10, 3, 1, '#62b896'); }
  R(g, -1, 11, 2, 2, '#2a2016');
  g.restore();
  if (rung) {
    // Its note still hangs in the air.
    for (let k = 0; k < 2; k++) {
      const r = (t * 16 + k * 11) % 22;
      g.strokeStyle = `rgba(255,220,140,${0.5 * (1 - r / 22)})`; g.lineWidth = 1;
      g.beginPath(); g.arc(px + 8, py - 7, 6 + r, 0, TAU); g.stroke();
    }
  } else if (Math.sin(t * 1.7 + x) > 0.96) R(g, px + 6, py - 9, 1, 1, '#ffffff');
}

// ------------------------------------------------------------------ flooded pools
// Drawn over the ground each frame by the overworld renderer. (cx, cy) is the bell's island relative to
// this tile, in pixels, so the ripples of every tile in a pool wheel around the same spot.
export function drawFlood(g, m, x, y, px, py, t, cx, cy) {
  const pool = (ax, ay) => m.get(ax, ay) === T.FLOOD;
  R(g, px, py, 16, 16, '#24566a');
  R(g, px + Math.floor(tileHash(x, y, 46) * 9), py + 3 + Math.floor(tileHash(x, y, 47) * 9), 6, 2, '#1c4656');
  g.save(); g.beginPath(); g.rect(px, py, 16, 16); g.clip();
  const ox = px + cx + 8, oy = py + cy + 8;
  g.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const r = 9 + ((t * 6 + k * 9) % 27), a = t * 0.8 + k * 2.1;
    g.strokeStyle = `rgba(160,225,225,${0.65 - r / 60})`;
    g.beginPath(); g.arc(ox, oy, r, a, a + 2.2); g.stroke();
    g.beginPath(); g.arc(ox, oy, r, a + Math.PI, a + Math.PI + 1.3); g.stroke();
  }
  g.restore();
  // Banks wherever the pool meets dry ground, the island's included.
  if (!pool(x, y - 1)) { R(g, px, py, 16, 2, '#4a4030'); R(g, px, py + 2, 16, 1, '#a8dcd4'); }
  if (!pool(x, y + 1)) R(g, px, py + 15, 16, 1, '#a8dcd4');
  if (!pool(x - 1, y)) R(g, px, py, 1, 16, '#a8dcd4');
  if (!pool(x + 1, y)) R(g, px + 15, py, 1, 16, '#a8dcd4');
  const h = tileHash(x, y, 41);
  if ((t * 0.7 + h * 5) % 3 < 0.4) R(g, px + 3 + Math.floor(h * 9), py + 5 + Math.floor(tileHash(x, y, 42) * 7), 2, 1, 'rgba(220,255,250,0.8)');
}

// The same pool frozen by the Rime Charm: thick white ice with the dark water still showing through.
export function drawPoolIce(g, m, x, y, px, py, t) {
  const pool = (ax, ay) => m.get(ax, ay) === T.ICE;
  const h = tileHash(x, y, 43);
  R(g, px, py, 16, 16, '#b4dcec');
  R(g, px + 1 + Math.floor(h * 7), py + 4 + Math.floor(tileHash(x, y, 44) * 6), 7, 4, '#8ab8cc');
  R(g, px + 9 - Math.floor(h * 5), py + 1 + Math.floor(tileHash(x, y, 45) * 9), 4, 3, '#96c4d6');
  // Cracks.
  let cx = px + 2 + Math.floor(tileHash(x, y, 48) * 12), cy = py;
  for (let k = 0; k < 5; k++) { const dx = tileHash(x, y, 50 + k) < 0.5 ? -1 : 1; R(g, cx, cy, 1, 3, '#eaf8ff'); cx += dx; cy += 3; }
  R(g, px + 3, py + 11, 4, 1, '#7aa8c0'); R(g, px + 10, py + 6, 3, 1, '#7aa8c0');
  // Rime where the ice meets the bank.
  if (!pool(x, y - 1)) { R(g, px, py, 16, 2, '#4a4030'); R(g, px, py + 2, 16, 1, '#ffffff'); }
  if (!pool(x, y + 1)) R(g, px, py + 15, 16, 1, '#ffffff');
  if (!pool(x - 1, y)) R(g, px, py, 1, 16, '#ffffff');
  if (!pool(x + 1, y)) R(g, px + 15, py, 1, 16, '#ffffff');
  const ph = (t * 0.6 + h * 4) % 4;
  if (ph < 1) R(g, Math.round(px + 1 + ph * 13), Math.round(py + 3 + h * 9), 2, 1, 'rgba(255,255,255,0.9)');
}
