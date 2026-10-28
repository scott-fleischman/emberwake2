// Procedural pixel art. Everything is drawn with rectangles into cached offscreen canvases.
import { T, D, TILE, BIOME } from '../world/tiles.js';
import { BIOME_PAL, THEMES } from './palette.js';
import { tileHash } from '../core/rng.js';

const cache = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) {
    c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g, w, h);
    cache.set(key, c);
  }
  return c;
}

// White silhouette of a sprite, used for hit flashes and telegraphs.
export function flashOf(sprite, key) {
  return cached('flash:' + key, sprite.width, sprite.height, (g) => {
    g.drawImage(sprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, sprite.width, sprite.height);
  });
}

export const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const P = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const circle = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const ellipse = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };

// ------------------------------------------------------------------ overworld ground
const WALKISH = new Set([T.GRASS, T.ROAD, T.SAND, T.SNOW, T.ASH, T.MUD, T.TALLGRASS, T.PLAZA, T.STAIRS, T.BRIDGE, T.ICE, T.SHALLOW, T.DOOR, T.DUNGEON, T.BUILDING]);
const ROADISH = new Set([T.ROAD, T.PLAZA, T.STAIRS, T.BRIDGE, T.DOOR, T.DUNGEON]);
const ROCKISH = new Set([T.RIDGE, T.BORDER, T.CRACKED]);

function groundColors(m, i, t) {
  const pal = BIOME_PAL[m.biome[i]];
  if (t === T.MUD) return pal.mud || pal.g;
  if (t === T.GRASS && m.biome[i] === BIOME.DESERT) return pal.oasis;
  if (t === T.SAND) return BIOME_PAL[BIOME.DESERT].g;
  if (t === T.SNOW) return BIOME_PAL[BIOME.SNOW].g;
  if (t === T.ASH) return BIOME_PAL[BIOME.VOLCANIC].g;
  if (t === T.GRASS && m.biome[i] !== BIOME.FOREST && m.biome[i] !== BIOME.MOUNTAIN && m.biome[i] !== BIOME.SWAMP) return BIOME_PAL[BIOME.FOREST].g;
  return pal.g;
}

function drawGround(g, m, x, y, px, py, ox = 0, oy = 0, w = 16, h = 16, tileOverride) {
  const i = y * m.w + x;
  const t = tileOverride ?? m.ground?.[i] ?? m.tiles[i];
  const cols = groundColors(m, i, t === T.CLIFF || t === T.RIDGE ? (m.ground ? m.ground[i] : T.GRASS) : t);
  const hsh = tileHash(x, y, 1);
  R(g, px + ox, py + oy, w, h, cols[0]);
  for (let k = 0; k < 5; k++) {
    const sx = Math.floor(tileHash(x, y, 10 + k) * 16), sy = Math.floor(tileHash(x, y, 20 + k) * 16);
    if (sx >= ox && sx < ox + w && sy >= oy && sy < oy + h) R(g, px + sx, py + sy, k % 2 ? 2 : 1, 1, cols[k % 2 ? 1 : 2]);
  }
  if (hsh < 0.3) R(g, px + ox + 2, py + oy + Math.min(h - 3, 9), 3, 1, cols[1]);
  if (t === T.TALLGRASS) {
    const dark = BIOME_PAL[m.biome[i]].tall;
    for (let k = 0; k < 6; k++) {
      const bx = Math.floor(tileHash(x, y, 30 + k) * 14) + 1, by = Math.floor(tileHash(x, y, 40 + k) * 11) + 3;
      R(g, px + bx, py + by, 1, 3, dark);
      P(g, px + bx + 1, py + by + 1, dark);
    }
  }
}

export function drawOverworldTile(g, m, x, y, px, py) {
  const i = y * m.w + x;
  const t = m.tiles[i];
  const b = m.biome[i];
  const pal = BIOME_PAL[b];
  const el = (ax, ay) => (ax < 0 || ay < 0 || ax >= m.w || ay >= m.h ? 9 : m.elev[ay * m.w + ax]);
  const tile = (ax, ay) => (ax < 0 || ay < 0 || ax >= m.w || ay >= m.h ? T.BORDER : m.tiles[ay * m.w + ax]);
  const e = el(x, y);
  const hsh = tileHash(x, y, 2);

  switch (t) {
    case T.ROAD: {
      drawGround(g, m, x, y, px, py);
      R(g, px, py, 16, 16, pal.path[0]);
      for (let k = 0; k < 4; k++) P(g, px + Math.floor(tileHash(x, y, 50 + k) * 15), py + Math.floor(tileHash(x, y, 60 + k) * 15), pal.path[k % 2 ? 1 : 2]);
      const gc = groundColors(m, i, m.ground ? m.ground[i] : T.GRASS)[0];
      const edge = (dx, dy, fx, fy, fw, fh) => {
        if (ROADISH.has(tile(x + dx, y + dy))) return;
        R(g, px + fx, py + fy, fw, fh, gc);
        for (let k = 0; k < 4; k++) {
          const o = Math.floor(tileHash(x, y, 70 + k + dx * 3 + dy * 7) * 14);
          if (fw > fh) R(g, px + o, py + fy + (fy ? -1 : fh), 2, 1, gc); else R(g, px + fx + (fx ? -1 : fw), py + o, 1, 2, gc);
        }
      };
      edge(0, -1, 0, 0, 16, 2); edge(0, 1, 0, 14, 16, 2); edge(-1, 0, 0, 0, 2, 16); edge(1, 0, 14, 0, 2, 16);
      break;
    }
    case T.PLAZA:
      R(g, px, py, 16, 16, '#a39c8a');
      R(g, px, py + 7, 16, 1, '#8a8372');
      R(g, px, py + 15, 16, 1, '#8a8372');
      R(g, px + ((x + y) % 2 ? 4 : 11), py, 1, 7, '#8a8372');
      R(g, px + ((x + y) % 2 ? 11 : 4), py + 8, 1, 7, '#8a8372');
      if (hsh < 0.3) R(g, px + 2, py + 2, 2, 1, '#b8b2a0');
      break;
    case T.WATER: case T.SHALLOW: case T.LAVA: {
      const lava = t === T.LAVA;
      const wc = lava ? ['#a02810', '#e8641e', '#ffb040'] : t === T.SHALLOW ? [shade(pal.water[0], 0.25), pal.water[1], pal.water[2]] : pal.water;
      R(g, px, py, 16, 16, wc[0]);
      for (let k = 0; k < 3; k++) R(g, px + Math.floor(tileHash(x, y, 80 + k) * 12), py + Math.floor(tileHash(x, y, 90 + k) * 14), lava ? 3 : 4, 1, wc[1]);
      const isLiquid = (q) => q === T.WATER || q === T.SHALLOW || q === T.LAVA || q === T.BRIDGE;
      const foam = lava ? '#ffd070' : wc[2];
      if (!isLiquid(tile(x, y - 1))) R(g, px, py, 16, 2, foam);
      if (!isLiquid(tile(x, y + 1))) R(g, px, py + 15, 16, 1, foam);
      if (!isLiquid(tile(x - 1, y))) R(g, px, py, 1, 16, foam);
      if (!isLiquid(tile(x + 1, y))) R(g, px + 15, py, 1, 16, foam);
      if (t === T.SHALLOW) for (let k = 0; k < 3; k++) R(g, px + Math.floor(tileHash(x, y, 95 + k) * 13), py + Math.floor(tileHash(x, y, 99 + k) * 13), 2, 2, pal.dark);
      break;
    }
    case T.ICE:
      R(g, px, py, 16, 16, '#c4e2f4');
      R(g, px + 2, py + 3, 6, 1, '#eaf7ff'); R(g, px + 8, py + 9, 5, 1, '#eaf7ff');
      if (hsh < 0.5) R(g, px + 4, py + 12, 7, 1, '#a4c8e0');
      break;
    case T.CLIFF: case T.CAVE: {
      const face = el(x, y + 1) < e || t === T.CAVE;
      if (face) {
        drawGround(g, m, x, y, px, py, 0, 0, 16, 4);
        R(g, px, py + 3, 16, 1, pal.rim);
        R(g, px, py + 4, 16, 12, pal.cliff[0]);
        for (let k = 0; k < 4; k++) {
          const sx = (Math.floor(hsh * 16) + k * 5) % 16;
          R(g, px + sx, py + 5 + (k % 2), 1, 8, pal.cliff[1]);
          R(g, px + ((sx + 2) % 16), py + 6 + k * 2, 2, 1, pal.rim);
        }
        R(g, px, py + 14, 16, 2, pal.cliff[2]);
        if (el(x - 1, y) < e && tile(x - 1, y) !== T.CLIFF) R(g, px, py + 4, 1, 12, pal.cliff[2]);
        if (el(x + 1, y) < e && tile(x + 1, y) !== T.CLIFF) R(g, px + 15, py + 4, 1, 12, pal.cliff[2]);
        if (t === T.CAVE) {
          R(g, px + 3, py + 7, 10, 9, '#120e0a');
          R(g, px + 4, py + 5, 8, 2, '#120e0a');
          R(g, px + 2, py + 7, 1, 9, pal.cliff[2]); R(g, px + 13, py + 7, 1, 9, pal.cliff[2]);
          R(g, px + 4, py + 4, 8, 1, pal.cliff[2]);
        }
      } else {
        drawGround(g, m, x, y, px, py);
        const band = (fx, fy, fw, fh) => { R(g, px + fx, py + fy, fw, fh, pal.cliff[0]); };
        if (el(x, y - 1) < e) { band(0, 0, 16, 4); R(g, px, py, 16, 1, pal.cliff[2]); R(g, px, py + 4, 16, 1, pal.rim); }
        if (el(x - 1, y) < e) { band(0, 0, 4, 16); R(g, px, py, 1, 16, pal.cliff[2]); R(g, px + 4, py, 1, 16, pal.rim); }
        if (el(x + 1, y) < e) { band(12, 0, 4, 16); R(g, px + 15, py, 1, 16, pal.cliff[2]); R(g, px + 11, py, 1, 16, pal.rim); }
        if (el(x - 1, y + 1) < e && el(x - 1, y) >= e && el(x, y + 1) >= e) R(g, px, py + 12, 4, 4, pal.cliff[1]);
        if (el(x + 1, y + 1) < e && el(x + 1, y) >= e && el(x, y + 1) >= e) R(g, px + 12, py + 12, 4, 4, pal.cliff[1]);
        if (el(x - 1, y - 1) < e) R(g, px, py, 3, 3, pal.cliff[1]);
        if (el(x + 1, y - 1) < e) R(g, px + 13, py, 3, 3, pal.cliff[1]);
        R(g, px + 5 + Math.floor(hsh * 6), py + 7, 3, 2, pal.cliff[1]);
      }
      break;
    }
    case T.STAIRS: {
      drawGround(g, m, x, y, px, py);
      const vertical = el(x, y - 1) !== el(x, y + 1) || !WALKISH.has(tile(x - 1, y)) || !WALKISH.has(tile(x + 1, y));
      R(g, px, py, 16, 16, pal.cliff[1]);
      if (vertical) {
        for (let k = 0; k < 4; k++) { R(g, px + 1, py + k * 4, 14, 3, pal.rim); R(g, px + 1, py + k * 4 + 3, 14, 1, pal.cliff[2]); }
        R(g, px, py, 1, 16, pal.cliff[2]); R(g, px + 15, py, 1, 16, pal.cliff[2]);
      } else {
        for (let k = 0; k < 4; k++) { R(g, px + k * 4, py + 1, 3, 14, pal.rim); R(g, px + k * 4 + 3, py + 1, 1, 14, pal.cliff[2]); }
        R(g, px, py, 16, 1, pal.cliff[2]); R(g, px, py + 15, 16, 1, pal.cliff[2]);
      }
      break;
    }
    case T.BRIDGE: {
      R(g, px, py, 16, 16, pal.water[0]);
      const ns = tile(x - 1, y) === T.WATER || tile(x + 1, y) === T.WATER || tile(x - 1, y) === T.SHALLOW || tile(x + 1, y) === T.SHALLOW || tile(x - 1, y) === T.CLIFF;
      if (ns) {
        R(g, px + 2, py, 12, 16, '#8a6038');
        for (let k = 0; k < 4; k++) R(g, px + 2, py + k * 4 + 3, 12, 1, '#5e3e22');
        R(g, px + 1, py, 1, 16, '#5e3e22'); R(g, px + 14, py, 1, 16, '#5e3e22');
      } else {
        R(g, px, py + 2, 16, 12, '#8a6038');
        for (let k = 0; k < 4; k++) R(g, px + k * 4 + 3, py + 2, 1, 12, '#5e3e22');
        R(g, px, py + 1, 16, 1, '#5e3e22'); R(g, px, py + 14, 16, 1, '#5e3e22');
      }
      break;
    }
    case T.RIDGE: case T.BORDER: case T.CRACKED: {
      const c = t === T.BORDER ? [shade(pal.cliff[1], -0.2), shade(pal.cliff[2], -0.2), shade(pal.cliff[0], -0.15)] : [pal.cliff[1], pal.cliff[2], pal.cliff[0]];
      R(g, px, py, 16, 16, c[0]);
      for (let k = 0; k < 5; k++) R(g, px + Math.floor(tileHash(x, y, 110 + k) * 13), py + Math.floor(tileHash(x, y, 120 + k) * 10), 3, 2, c[2]);
      for (let k = 0; k < 3; k++) R(g, px + Math.floor(tileHash(x, y, 130 + k) * 14), py + Math.floor(tileHash(x, y, 140 + k) * 12), 2, 3, c[1]);
      if (!ROCKISH.has(tile(x, y + 1))) {
        R(g, px, py + 9, 16, 7, c[2 === 2 ? 2 : 0]);
        R(g, px, py + 9, 16, 1, pal.rim);
        for (let k = 0; k < 4; k++) R(g, px + ((Math.floor(hsh * 16) + k * 4) % 16), py + 10, 1, 5, c[1]);
        R(g, px, py + 15, 16, 1, c[1]);
      }
      if (t === T.CRACKED) {
        const cc = '#f4dcb0';
        R(g, px + 7, py + 3, 1, 3, cc); R(g, px + 8, py + 6, 1, 3, cc); R(g, px + 6, py + 9, 2, 1, cc); R(g, px + 5, py + 10, 1, 3, cc);
        R(g, px + 9, py + 8, 3, 1, cc); R(g, px + 11, py + 9, 1, 2, cc);
        R(g, px + 3, py + 4, 2, 1, cc);
      }
      break;
    }
    case T.BOULDER:
      drawGround(g, m, x, y, px, py, 0, 0, 16, 16, m.ground ? m.ground[i] : T.GRASS);
      ellipse(g, px + 8, py + 13, 7, 2.5, 'rgba(0,0,0,0.25)');
      circle(g, px + 8, py + 8, 7, '#7e7a74');
      circle(g, px + 7, py + 7, 5, '#9a958e');
      R(g, px + 4, py + 4, 3, 2, '#c0bab0');
      R(g, px + 9, py + 11, 4, 1, '#5e5a54');
      R(g, px + 10, py + 5, 2, 2, '#6a8a4a');
      break;
    default:
      drawGround(g, m, x, y, px, py);
  }
  // Flat decoration baked into the ground chunk.
  const d = m.deco[i];
  if (d === D.FLOWER) {
    for (let k = 0; k < 3; k++) {
      const fx = 2 + Math.floor(tileHash(x, y, 150 + k) * 11), fy = 2 + Math.floor(tileHash(x, y, 160 + k) * 11);
      R(g, px + fx, py + fy, 2, 2, pal.flower[Math.floor(tileHash(x, y, 170 + k) * 4)]);
      P(g, px + fx, py + fy + 2, pal.dark);
    }
  } else if (d === D.REED) {
    for (let k = 0; k < 4; k++) {
      const fx = 2 + Math.floor(tileHash(x, y, 180 + k) * 12);
      R(g, px + fx, py + 5 + k, 1, 9 - k, '#4a6a30');
      R(g, px + fx, py + 4 + k, 1, 2, '#8a6a3a');
    }
  }
  // Soft shadow cast by a cliff face or rock to the north.
  if (WALKISH.has(t) && (el(x, y - 1) > e || ROCKISH.has(tile(x, y - 1)))) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(px, py, 16, 3);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(px, py + 3, 16, 2);
  }
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); gg = f(gg); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
}

// ------------------------------------------------------------------ tall overworld props
export function decoSprite(d, biome, x, y, groundTile) {
  const v = Math.floor(tileHash(x, y, 5) * 3);
  const pal = BIOME_PAL[biome];
  switch (d) {
    case D.TREE: {
      if (biome === BIOME.DESERT) return groundTile === T.GRASS ? palmSprite(v) : cactusSprite(v);
      if (biome === BIOME.MOUNTAIN || biome === BIOME.SNOW) return pineSprite(biome, v);
      if (biome === BIOME.VOLCANIC) return deadTreeSprite(v);
      return oakSprite(biome, v);
    }
    case D.BUSH: return cached(`bush${biome}`, 16, 16, (g) => {
      ellipse(g, 8, 13, 6, 2, 'rgba(0,0,0,0.25)');
      circle(g, 8, 9, 6, pal.tree[0]); circle(g, 6, 8, 4, pal.tree[1]); circle(g, 10, 9, 3.5, pal.tree[1]);
      R(g, 5, 6, 2, 1, pal.tree[2]); R(g, 9, 7, 1, 1, pal.tree[2]);
      if (biome === BIOME.FOREST) { P(g, 4, 10, '#d04040'); P(g, 11, 8, '#d04040'); }
    });
    case D.ROCK: return cached(`rock${biome}${v}`, 16, 16, (g) => {
      ellipse(g, 8, 13, 6, 2, 'rgba(0,0,0,0.25)');
      R(g, 3, 6 + v, 10, 7 - v, pal.cliff[0]); R(g, 4, 5 + v, 8, 1, pal.cliff[0]);
      R(g, 4, 6 + v, 4, 2, pal.rim); R(g, 3, 12, 10, 1, pal.cliff[2]);
    });
    case D.RUIN: return cached('ruin', 16, 28, (g) => {
      ellipse(g, 8, 25, 6, 2, 'rgba(0,0,0,0.3)');
      R(g, 4, 6, 8, 19, '#9a948a'); R(g, 4, 6, 2, 19, '#b4aea2'); R(g, 10, 6, 2, 19, '#7a756c');
      R(g, 3, 23, 10, 3, '#8a847a'); R(g, 4, 4, 5, 2, '#9a948a'); R(g, 9, 5, 3, 1, '#9a948a');
      R(g, 6, 12, 3, 4, '#5e8a3e'); R(g, 5, 18, 2, 3, '#5e8a3e');
    });
    case D.TENT: return cached(`tent${biome}`, 20, 18, (g) => {
      ellipse(g, 10, 16, 9, 2, 'rgba(0,0,0,0.3)');
      const c = biome === BIOME.SNOW ? '#7a8aa0' : biome === BIOME.DESERT ? '#b06a3a' : biome === BIOME.VOLCANIC ? '#5a3030' : '#8a6a42';
      g.fillStyle = c; g.beginPath(); g.moveTo(10, 1); g.lineTo(19, 16); g.lineTo(1, 16); g.closePath(); g.fill();
      g.fillStyle = shade(c, -0.3); g.beginPath(); g.moveTo(10, 1); g.lineTo(19, 16); g.lineTo(10, 16); g.closePath(); g.fill();
      R(g, 8, 9, 4, 7, '#1e140c');
      R(g, 9, 0, 2, 3, '#4a3020');
    });
    case D.SIGN: return cached('sign', 16, 18, (g) => {
      R(g, 7, 7, 2, 10, '#5e3e22'); R(g, 2, 3, 12, 7, '#a07a48'); R(g, 2, 9, 12, 1, '#6e4e2a');
      R(g, 4, 5, 8, 1, '#5e3e22'); R(g, 4, 7, 6, 1, '#5e3e22');
    });
    case D.LORE: return cached('lore', 16, 24, (g) => {
      ellipse(g, 8, 22, 6, 2, 'rgba(0,0,0,0.3)');
      R(g, 3, 4, 10, 18, '#6e6a74'); R(g, 4, 2, 8, 2, '#6e6a74'); R(g, 3, 4, 2, 18, '#8a8692'); R(g, 11, 4, 2, 18, '#55525a');
      R(g, 7, 7, 2, 7, '#7ae0ff'); R(g, 5, 9, 6, 1, '#7ae0ff'); R(g, 6, 13, 4, 1, '#7ae0ff');
    });
    case D.WELL: return cached('well', 16, 24, (g) => {
      ellipse(g, 8, 21, 7, 2, 'rgba(0,0,0,0.3)');
      R(g, 2, 13, 12, 8, '#8a8478'); R(g, 2, 13, 12, 2, '#a8a294'); R(g, 4, 14, 8, 2, '#203040');
      R(g, 2, 4, 1, 10, '#5e3e22'); R(g, 13, 4, 1, 10, '#5e3e22'); R(g, 1, 2, 14, 3, '#8a3a2a'); R(g, 7, 5, 2, 4, '#7a5a3a');
    });
    case D.STUMP: return cached('stump', 16, 16, (g) => {
      ellipse(g, 8, 13, 5, 2, 'rgba(0,0,0,0.3)'); R(g, 4, 8, 8, 5, pal.trunk); R(g, 4, 7, 8, 2, '#b08a5a');
    });
    case D.SHRINE: return cached('shrine', 16, 28, (g) => {
      ellipse(g, 8, 25, 7, 2, 'rgba(0,0,0,0.3)');
      R(g, 2, 20, 12, 5, '#7a7488'); R(g, 2, 20, 12, 1, '#a49eb4');
      R(g, 4, 10, 8, 10, '#8a849a'); R(g, 4, 10, 2, 10, '#a49eb4'); R(g, 10, 10, 2, 10, '#625e70');
      R(g, 3, 8, 10, 3, '#a49eb4'); R(g, 7, 13, 2, 4, '#f0a040');
    });
    default: return null;
  }
}

function oakSprite(biome, v) {
  const pal = BIOME_PAL[biome];
  return cached(`oak${biome}${v}`, 20, 30, (g) => {
    ellipse(g, 10, 27, 7, 2.5, 'rgba(0,0,0,0.3)');
    R(g, 8, 17, 4, 10, pal.trunk); R(g, 8, 17, 1, 10, shade(pal.trunk, 0.2));
    if (biome === BIOME.SWAMP) { R(g, 6, 25, 2, 2, pal.trunk); R(g, 12, 25, 2, 2, pal.trunk); }
    const cy = 11 - v;
    circle(g, 10, cy, 9, shade(pal.tree[0], -0.25));
    circle(g, 10, cy, 8, pal.tree[0]);
    circle(g, 8, cy - 1, 6, pal.tree[1]);
    circle(g, 13, cy + 1, 4, pal.tree[1]);
    circle(g, 7, cy - 3, 3, pal.tree[2]);
    R(g, 12, cy - 4, 2, 1, pal.tree[2]);
    if (biome === BIOME.SWAMP) for (let k = 0; k < 4; k++) R(g, 3 + k * 4, cy + 4, 1, 6 + (k % 2) * 3, pal.tree[0]);
  });
}

function pineSprite(biome, v) {
  const pal = BIOME_PAL[biome];
  return cached(`pine${biome}${v}`, 18, 32, (g) => {
    ellipse(g, 9, 29, 6, 2.5, 'rgba(0,0,0,0.3)');
    R(g, 8, 23, 3, 6, pal.trunk);
    for (let k = 0; k < 3; k++) {
      const top = 2 + k * 7 - v, half = 4 + k * 2;
      g.fillStyle = k % 2 ? pal.tree[0] : pal.tree[1];
      g.beginPath(); g.moveTo(9, top); g.lineTo(9 + half, top + 10); g.lineTo(9 - half, top + 10); g.closePath(); g.fill();
      if (biome === BIOME.SNOW) { R(g, 9 - half + 1, top + 9, half * 2 - 2, 1, pal.tree[2]); R(g, 8, top, 2, 2, pal.tree[2]); }
      else R(g, 9 - half + 2, top + 9, 3, 1, pal.tree[2]);
    }
  });
}

function palmSprite(v) {
  return cached(`palm${v}`, 22, 30, (g) => {
    ellipse(g, 11, 27, 6, 2, 'rgba(0,0,0,0.3)');
    for (let k = 0; k < 18; k++) R(g, 10 + Math.round(Math.sin(k / 6) * 2), 9 + k, 3, 1, k % 3 ? '#8a6a3a' : '#6e522a');
    g.fillStyle = '#3e8a34';
    for (const [dx, dy] of [[-9, 2], [9, 2], [-6, -3], [6, -3], [0, -5]]) { g.beginPath(); g.moveTo(11, 9); g.lineTo(11 + dx, 9 + dy); g.lineTo(11 + dx * 0.6, 9 + dy + 3); g.closePath(); g.fill(); }
    R(g, 9, 8, 4, 3, '#5a3a1a');
  });
}

function cactusSprite(v) {
  return cached(`cactus${v}`, 16, 24, (g) => {
    ellipse(g, 8, 22, 5, 2, 'rgba(0,0,0,0.3)');
    R(g, 6, 5 + v, 4, 17 - v, '#3e8a3a'); R(g, 6, 5 + v, 1, 17 - v, '#5aa850');
    R(g, 2, 10, 2, 6, '#3e8a3a'); R(g, 2, 15, 4, 2, '#3e8a3a');
    if (v !== 1) { R(g, 12, 8, 2, 6, '#3e8a3a'); R(g, 10, 13, 4, 2, '#3e8a3a'); }
    P(g, 8, 7 + v, '#f0e0a0');
  });
}

function deadTreeSprite(v) {
  return cached(`dead${v}`, 18, 26, (g) => {
    ellipse(g, 9, 24, 5, 2, 'rgba(0,0,0,0.35)');
    R(g, 8, 8, 3, 16, '#2a2020'); R(g, 4, 10, 4, 1, '#2a2020'); R(g, 3, 7, 1, 4, '#2a2020');
    R(g, 11, 12, 4, 1, '#2a2020'); R(g, 14, 9, 1, 4, '#2a2020'); R(g, 9, 4, 1, 4, '#2a2020');
    P(g, 9, 14, '#ff7030');
  });
}

// ------------------------------------------------------------------ buildings & landmarks
export function buildingSprite(b) {
  const W = b.w * TILE, H = b.h * TILE + 10;
  return cached(`bld:${b.id}`, W, H, (g) => {
    const wallRows = 2, roofH = (b.h - wallRows) * TILE + 10;
    ellipse(g, W / 2, H - 2, W / 2, 4, 'rgba(0,0,0,0.25)');
    // walls
    const wall = b.type === 'smith' ? '#8a7a6a' : b.type === 'seer' ? '#7a6a8a' : '#d8c8a0';
    R(g, 1, roofH - 2, W - 2, wallRows * TILE + 2, wall);
    for (let k = 0; k < b.w; k++) R(g, 1 + k * TILE, roofH - 2, 1, wallRows * TILE + 2, shade(wall, -0.15));
    R(g, 1, H - 3, W - 2, 3, shade(wall, -0.35));
    // roof (gabled, with mass)
    const rc = b.roof;
    R(g, 0, 0, W, roofH, rc);
    for (let y = 2; y < roofH - 2; y += 4) R(g, 0, y, W, 1, shade(rc, -0.2));
    R(g, 0, roofH - 3, W, 3, shade(rc, -0.4));
    R(g, 0, 0, W, 2, shade(rc, 0.2));
    R(g, (W >> 1) - 1, 0, 2, roofH - 3, shade(rc, -0.3));
    if (b.type === 'smith' || b.type === 'inn' || b.type === 'home') { R(g, W - 14, -1, 6, 8, '#6e5e54'); R(g, W - 14, -1, 6, 2, '#4a3e38'); }
    // door + windows
    const doorX = (b.door.x - b.x) * TILE + 3;
    R(g, doorX, H - 3 - 14, 10, 14, '#5a3a20'); R(g, doorX + 1, H - 3 - 13, 8, 13, '#7a5030'); P(g, doorX + 7, H - 10, '#f0c050');
    for (let k = 0; k < b.w; k++) {
      const wx = k * TILE + 4;
      if (Math.abs(wx - doorX) < 12) continue;
      R(g, wx, roofH + 5, 8, 7, '#3a2a1a'); R(g, wx + 1, roofH + 6, 6, 5, '#f0d890'); R(g, wx + 4, roofH + 6, 1, 5, '#3a2a1a');
    }
    // trade sign
    const icon = { smith: '#c0c0c8', shop: '#e0c040', inn: '#e08040', seer: '#b080ff', hall: '#c03030', lodge: '#40a040' }[b.type];
    if (icon) { R(g, doorX + 12, roofH + 2, 8, 7, '#6e4e2a'); R(g, doorX + 14, roofH + 4, 4, 3, icon); }
  });
}

const LANDMARK_STYLE = {
  verdant: { stone: '#6e7a5e', dark: '#4a5440', light: '#94a07e', glow: '#8aff6a', moss: '#4e8a34' },
  ashen: { stone: '#3e3434', dark: '#241c1c', light: '#5e5050', glow: '#ff6a2a', moss: '#7a2a1a' },
  frost: { stone: '#9ab4cc', dark: '#6a84a0', light: '#d0e4f4', glow: '#a8f0ff', moss: '#e8f4ff' },
  drowned: { stone: '#4e6a66', dark: '#2e4442', light: '#6e8a84', glow: '#5adcc8', moss: '#3a6a4a' },
  spire: { stone: '#7a7488', dark: '#4e4a5a', light: '#a49eb4', glow: '#ffb060', moss: '#5e5a6a' },
};

export function landmarkSprite(lm) {
  const st = LANDMARK_STYLE[lm.id];
  const W = lm.w * TILE, baseH = lm.h * TILE;
  const extra = lm.id === 'spire' ? 96 : 20;
  const H = baseH + extra;
  return cached(`lm:${lm.id}`, W, H, (g) => {
    ellipse(g, W / 2, H - 3, W / 2, 5, 'rgba(0,0,0,0.3)');
    if (lm.id === 'spire') {
      R(g, 16, 6, W - 32, H - 20, st.stone);
      R(g, 16, 6, 6, H - 20, st.light); R(g, W - 22, 6, 6, H - 20, st.dark);
      for (let y = 14; y < H - 20; y += 12) R(g, 16, y, W - 32, 1, st.dark);
      g.fillStyle = st.dark; g.beginPath(); g.moveTo(W / 2, -2); g.lineTo(W - 12, 10); g.lineTo(12, 10); g.closePath(); g.fill();
      circle(g, W / 2, 26, 5, st.glow);
      R(g, 4, H - 34, W - 8, 30, st.stone); R(g, 4, H - 34, W - 8, 3, st.light);
    } else {
      R(g, 2, extra - 4, W - 4, H - extra + 2, st.stone);
      R(g, 8, 6, W - 16, extra, st.stone);
      R(g, 14, 0, W - 28, 8, st.light);
      R(g, 2, extra - 4, W - 4, 3, st.light); R(g, 8, 6, W - 16, 2, st.light);
      for (let k = 0; k < 4; k++) R(g, 6 + k * 20, extra, 4, H - extra - 6, st.dark);
      circle(g, W / 2, extra + 6, 5, st.glow); circle(g, W / 2, extra + 6, 2, '#ffffff');
      for (let k = 0; k < 8; k++) R(g, Math.floor(tileHash(k, 3, 7) * (W - 6)), extra + Math.floor(tileHash(k, 4, 7) * (H - extra - 8)), 4, 2, st.moss);
    }
    const dx = (lm.door.x - lm.x) * TILE - 2;
    R(g, dx, H - 3 - 22, 20, 22, st.dark); R(g, dx + 2, H - 3 - 20, 16, 20, '#0c0a0c');
    R(g, dx - 2, H - 3 - 24, 24, 3, st.light);
    if (lm.id === 'drowned' || lm.id === 'spire') {
      R(g, dx + 2, H - 15, 16, 2, '#8a8a90'); R(g, dx + 2, H - 21, 16, 2, '#8a8a90'); circle(g, dx + 10, H - 14, 3, st.glow);
    }
  });
}

// ------------------------------------------------------------------ characters
export const LOOKS = {
  swordsman: { skin: '#f0c8a0', hair: '#6a4020', tunic: '#3a68b0', pants: '#4a3a2a', accent: '#c8ccd4', hat: 'none' },
  mage: { skin: '#f0c8a0', hair: '#e0e0e8', tunic: '#6a3a9a', pants: '#4a2a6a', accent: '#f0c850', hat: 'wizard', robe: true, hatColor: '#4e2a7a' },
  ranger: { skin: '#e8b890', hair: '#8a5a2a', tunic: '#3a7a3a', pants: '#5a4a32', accent: '#a07a48', hat: 'hood', hatColor: '#2e5e2e' },
  rogue: { skin: '#e8c0a0', hair: '#2a2028', tunic: '#3c3c48', pants: '#2a2a32', accent: '#c03030', hat: 'hood', hatColor: '#26262e', scarf: true },
  elder: { skin: '#e8c0a0', hair: '#f0f0f0', tunic: '#8a7a5a', pants: '#5a4e3a', accent: '#c0a060', hat: 'none', robe: true, beard: '#f0f0f0' },
  smith: { skin: '#d8a078', hair: '#3a2a1a', tunic: '#5a4a3a', pants: '#3a3028', accent: '#8a8a8a', hat: 'none', beard: '#3a2a1a', apron: true },
  merchant: { skin: '#f0c8a0', hair: '#7a4a2a', tunic: '#c08a30', pants: '#5a3a22', accent: '#e8d070', hat: 'cap', hatColor: '#8a3a2a' },
  seer: { skin: '#e0b8a0', hair: '#3a2a4a', tunic: '#5a3a7a', pants: '#3a2a4a', accent: '#c0a0ff', hat: 'hood', hatColor: '#3e2a5a', robe: true },
  scout: { skin: '#e8b890', hair: '#a06a3a', tunic: '#4a6a3a', pants: '#4a3a2a', accent: '#8a6a3a', hat: 'hood', hatColor: '#3a5a2e' },
  keeper: { skin: '#e0b090', hair: '#5a4a3a', tunic: '#8a2a2a', pants: '#3a3030', accent: '#c0c4cc', hat: 'helm', hatColor: '#9aa0a8' },
  innkeeper: { skin: '#f0c8a0', hair: '#c08040', tunic: '#7a5a3a', pants: '#4a3a2a', accent: '#f0f0e8', hat: 'none', apron: true },
};
const VILLAGER_TUNICS = ['#a04a4a', '#4a7aa0', '#7a9a4a', '#a0804a', '#7a5a9a', '#4a9a8a', '#b07050', '#6a6a8a'];
const HAIRS = ['#3a2a1a', '#7a4a2a', '#c09050', '#1a1a1a', '#a03a1a', '#d0d0c0', '#5a3a2a', '#e0c080'];

export function npcLook(role, lookIndex) {
  if (LOOKS[role]) return LOOKS[role];
  const t = VILLAGER_TUNICS[lookIndex % 8];
  return { skin: lookIndex % 3 === 0 ? '#c89070' : '#f0c8a0', hair: HAIRS[(lookIndex * 3) % 8], tunic: t, pants: shade(t, -0.45), accent: '#e0d0a0', hat: lookIndex % 4 === 1 ? 'cap' : 'none', hatColor: shade(t, -0.3), robe: lookIndex % 5 === 2 };
}

// 16x20 humanoid, feet at the bottom row. facing: down|up|left|right. frame 0..3 (walk)
export function humanSprite(look, facing, frame, key) {
  return cached(`hum:${key}:${facing}:${frame}`, 16, 20, (g) => {
    const step = frame % 2 === 1 ? (frame === 1 ? 1 : -1) : 0;
    const side = facing === 'left' || facing === 'right';
    // legs
    if (!look.robe) {
      R(g, 5, 15, 2, 4 - Math.max(0, step), look.pants);
      R(g, 9, 15, 2, 4 - Math.max(0, -step), look.pants);
      R(g, 5, 18 - Math.max(0, step), 2, 1, '#2a1e14'); R(g, 9, 18 - Math.max(0, -step), 2, 1, '#2a1e14');
    } else {
      R(g, 4, 15, 8, 4, look.tunic); R(g, 4, 18, 8, 1, shade(look.tunic, -0.3));
      R(g, 5 + step, 19, 2, 1, '#2a1e14'); R(g, 9 - step, 19, 2, 1, '#2a1e14');
    }
    // body
    R(g, 4, 9, 8, 7, look.tunic);
    R(g, 4, 9, 8, 1, shade(look.tunic, 0.2));
    if (look.apron) R(g, 5, 11, 6, 5, look.accent);
    R(g, 4, 14, 8, 1, shade(look.tunic, -0.35));
    if (!look.apron) P(g, 8, 14, look.accent);
    // arms
    const armSwing = side ? 0 : step;
    R(g, 3, 10 + armSwing, 1, 4, look.tunic); R(g, 12, 10 - armSwing, 1, 4, look.tunic);
    P(g, 3, 14 + armSwing, look.skin); P(g, 12, 14 - armSwing, look.skin);
    // head
    R(g, 5, 3, 6, 6, look.skin);
    if (facing === 'up') R(g, 5, 3, 6, 6, look.hair);
    else {
      R(g, 5, 3, 6, 2, look.hair);
      if (facing === 'down') { R(g, 5, 5, 1, 2, look.hair); R(g, 10, 5, 1, 2, look.hair); P(g, 6, 6, '#20160e'); P(g, 9, 6, '#20160e'); }
      else if (facing === 'left') { R(g, 9, 4, 2, 4, look.hair); P(g, 6, 6, '#20160e'); }
      else { R(g, 5, 4, 2, 4, look.hair); P(g, 9, 6, '#20160e'); }
    }
    if (look.beard && facing !== 'up') R(g, 6, 7, 4, 3, look.beard);
    if (look.scarf) R(g, 5, 8, 6, 2, look.accent);
    // headwear
    const hc = look.hatColor || look.hair;
    if (look.hat === 'wizard') {
      R(g, 4, 3, 8, 2, hc);
      g.fillStyle = hc; g.beginPath(); g.moveTo(5, 3); g.lineTo(11, 3); g.lineTo(facing === 'left' ? 6 : 10, -1); g.closePath(); g.fill();
      P(g, 8, 2, look.accent);
    } else if (look.hat === 'hood') {
      R(g, 4, 2, 8, 3, hc); R(g, 4, 4, 1, 5, hc); R(g, 11, 4, 1, 5, hc);
      if (facing === 'up') R(g, 4, 2, 8, 8, hc);
    } else if (look.hat === 'cap') {
      R(g, 5, 2, 6, 2, hc); if (facing !== 'up') R(g, facing === 'left' ? 3 : facing === 'right' ? 9 : 5, 4, facing === 'down' ? 6 : 4, 1, hc);
    } else if (look.hat === 'helm') {
      R(g, 4, 2, 8, 3, hc); R(g, 4, 2, 8, 1, shade(hc, 0.3)); if (facing === 'down') R(g, 7, 4, 2, 3, hc);
    }
  });
}

// ------------------------------------------------------------------ enemies
export function enemySprite(archetype, pal, pose, frame, key) {
  const [main, dark, accent] = pal;
  switch (archetype) {
    case 'brute': return cached(`brute:${key}:${pose}:${frame}`, 24, 24, (g) => {
      const raise = pose === 'windup' ? -4 : pose === 'slam' ? 3 : 0;
      const bob = frame % 2;
      R(g, 6, 18, 4, 5, dark); R(g, 14, 18, 4, 5, dark);
      R(g, 4, 8 + bob, 16, 12, main); R(g, 5, 7 + bob, 14, 1, main);
      R(g, 7, 13 + bob, 10, 6, shade(main, 0.15));
      R(g, 4, 18 + bob, 16, 2, dark);
      R(g, 7, 10 + bob, 2, 2, '#ffe060'); R(g, 15, 10 + bob, 2, 2, '#ffe060');
      R(g, 8, 15 + bob, 1, 2, '#f0f0e0'); R(g, 15, 15 + bob, 1, 2, '#f0f0e0');
      R(g, 1, 10 + raise, 3, 7, dark); R(g, 20, 10 + raise, 3, 7, dark);
      if (pose === 'windup') { R(g, 0, 2, 4, 9, accent); R(g, 20, 2, 4, 9, accent); }
      R(g, 6, 5 + bob, 3, 3, accent); R(g, 15, 5 + bob, 3, 3, accent);
    });
    case 'lunger': return cached(`lunger:${key}:${pose}:${frame}`, 22, 16, (g) => {
      const crouch = pose === 'crouch' ? 2 : 0, stretch = pose === 'lunge' ? 3 : 0;
      const leg = frame % 2 ? 1 : 0;
      R(g, 3, 6 + crouch, 13 + stretch, 6 - crouch, main);
      R(g, 3, 6 + crouch, 13 + stretch, 1, shade(main, 0.2));
      R(g, 14 + stretch, 3 + crouch, 6, 6, main);
      R(g, 19 + stretch, 6 + crouch, 3, 2, dark);
      P(g, 17 + stretch, 5 + crouch, accent); P(g, 18 + stretch, 5 + crouch, '#200');
      R(g, 15 + stretch, 2 + crouch, 2, 2, dark);
      R(g, 0, 5 + crouch, 3, 2, dark);
      R(g, 4 + leg, 12, 2, 3 - crouch / 2, dark); R(g, 8 - leg, 12, 2, 3, dark);
      R(g, 11 + leg + stretch, 12, 2, 3, dark); R(g, 14 - leg + stretch, 12, 2, 3, dark);
    });
    case 'skirmisher': return cached(`skirm:${key}:${pose}:${frame}`, 16, 16, (g) => {
      const flap = frame % 2;
      g.globalAlpha = 0.35; circle(g, 8, 8, 7, accent); g.globalAlpha = 1;
      R(g, 1, 5 - flap * 2, 4, 3 + flap, shade(main, 0.3)); R(g, 11, 5 - flap * 2, 4, 3 + flap, shade(main, 0.3));
      circle(g, 8, 8, 4, main); circle(g, 7, 7, 2, shade(main, 0.35));
      P(g, 6, 8, dark); P(g, 9, 8, dark);
      if (pose === 'dart') R(g, 7, 12, 2, 3, accent);
    });
    case 'ranged': default: return cached(`ranged:${key}:${pose}:${frame}`, 16, 20, (g) => {
      const step = frame % 2;
      R(g, 5, 15, 2, 4 - step, dark); R(g, 9, 15, 2, 3 + step, dark);
      R(g, 4, 8, 8, 8, main); R(g, 4, 8, 8, 1, shade(main, 0.25));
      R(g, 4, 2, 8, 7, dark); R(g, 5, 4, 6, 4, '#1a1410');
      P(g, 6, 6, '#ff5040'); P(g, 9, 6, '#ff5040');
      R(g, 12, 6, 1, 10, accent); R(g, 13, 7, 1, 8, '#e0e0d0');
      if (pose === 'aim') { R(g, 13, 10, 3, 1, '#f0f0f0'); }
    });
  }
}
