// Terrain viewer debug mode: inspect each generation stage's output for any seed.
import { generateOverworld } from '../world/overworld.js';
import { T, D, BIOME_NAMES } from '../world/tiles.js';
import { BIOME_PAL } from '../gfx/palette.js';
import { makeCanvas } from '../gfx/sprites.js';
import { text, panel, SERIF } from '../gfx/ui.js';
import { UI } from '../gfx/palette.js';

const LAYERS = [
  { key: 'terrain', label: 'Terrain' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'biomes', label: 'Biomes / provinces' },
  { key: 'roads', label: 'Roads & stairs' },
  { key: 'pois', label: 'Points of interest' },
  { key: 'encounters', label: 'Encounters' },
];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class ViewerScene {
  constructor(app, seed = 'ember') {
    this.app = app;
    this.on = { terrain: true, elevation: false, biomes: false, roads: true, pois: true, encounters: false };
    this.zoom = 1.5;
    this.panX = 0; this.panY = 0;
    this.t = 0;
    this.typing = false;
    this.regenerate(seed);
    app.audio.playMusic('mountain');
  }

  regenerate(seed) {
    const t0 = performance.now();
    this.world = generateOverworld(seed);
    this.genMs = performance.now() - t0;
    this.seed = String(seed);
    this.images = {};
    const W = this.world;
    const build = (key, fn) => {
      const c = makeCanvas(W.w, W.h), g = c.getContext('2d'), img = g.createImageData(W.w, W.h);
      for (let i = 0; i < W.w * W.h; i++) {
        const col = fn(i);
        if (!col) continue;
        img.data.set([...col, 255], i * 4);
      }
      g.putImageData(img, 0, 0);
      this.images[key] = c;
    };
    build('terrain', (i) => {
      const t = W.tiles[i], b = W.biome[i];
      let c = BIOME_PAL[b].g[0];
      if (t === T.WATER || t === T.SHALLOW) c = BIOME_PAL[b].water[0];
      else if (t === T.LAVA) c = '#d05020';
      else if (t === T.CLIFF || t === T.CAVE) c = BIOME_PAL[b].cliff[1];
      else if (t === T.RIDGE || t === T.BORDER) c = BIOME_PAL[b].cliff[2];
      else if (t === T.SAND) c = BIOME_PAL[2].g[0];
      else if (t === T.SNOW || t === T.ICE) c = '#e8eef4';
      else if (W.deco[i] === D.TREE) c = BIOME_PAL[b].tree[0];
      const [r, g, bb] = hex(c), s = 0.8 + W.elev[i] * 0.07;
      return [Math.min(255, r * s), Math.min(255, g * s), Math.min(255, bb * s)];
    });
    build('elevation', (i) => { const e = W.elev[i] > 4 ? 30 : 40 + W.elev[i] * 55; return [e, e, e + 10]; });
    const provCols = W.provinces.map((p, k) => hex(BIOME_PAL[p.biome].g[k % 3]).map((v) => Math.min(255, v * (0.8 + (k % 3) * 0.12))));
    build('biomes', (i) => provCols[W.province[i]]);
    build('roads', (i) => {
      const t = W.tiles[i];
      if (t === T.ROAD || t === T.PLAZA) return [232, 208, 150];
      if (t === T.STAIRS) return [255, 120, 200];
      if (t === T.BRIDGE) return [160, 110, 60];
      if (t === T.CRACKED) return [255, 160, 60];
      if (t === T.BOULDER) return [200, 200, 200];
      if (t === T.BUILDING || t === T.DOOR || t === T.DUNGEON) return [200, 80, 60];
      return null;
    });
  }

  update(dt) {
    this.t += dt;
    const input = this.app.input;
    if (this.typing) {
      for (const ch of input.typed) {
        if (ch === 'Backspace') this.draft = this.draft.slice(0, -1);
        else if (/^[a-zA-Z0-9-]$/.test(ch) && this.draft.length < 18) this.draft += ch.toLowerCase();
      }
      if (input.keyPressed('Enter')) { this.typing = false; if (this.draft) this.regenerate(this.draft); }
      if (input.keyPressed('Escape')) this.typing = false;
      return;
    }
    if (input.keyPressed('Escape')) { this.app.toTitle(); return; }
    if (input.keyPressed('KeyN')) this.regenerate(`view${Math.floor(Math.random() * 100000)}`);
    if (input.keyPressed('KeyT')) { this.typing = true; this.draft = ''; }
    LAYERS.forEach((l, k) => { if (input.keyPressed(`Digit${k + 1}`)) this.on[l.key] = !this.on[l.key]; });
    if (input.keyPressed('Equal')) this.zoom = Math.min(5, this.zoom * 1.25);
    if (input.keyPressed('Minus')) this.zoom = Math.max(1, this.zoom / 1.25);
    const [ax, ay] = input.axis();
    this.panX += ax * dt * 120; this.panY += ay * dt * 120;
  }

  get view() {
    const z = this.zoom, W = this.world;
    return { z, ox: Math.round(170 - (W.w * z) / 2 + 10 - this.panX), oy: Math.round(135 - (W.h * z) / 2 - this.panY) };
  }

  drawWorld(g) {
    const W = this.world;
    g.fillStyle = '#0c0a10'; g.fillRect(0, 0, 480, 270);
    const { z, ox, oy } = this.view;
    const mw = W.w * z, mh = W.h * z;
    g.imageSmoothingEnabled = false;
    const base = this.on.biomes ? 'biomes' : this.on.elevation ? 'elevation' : 'terrain';
    if (this.on.terrain || this.on.biomes || this.on.elevation) g.drawImage(this.images[base], ox, oy, mw, mh);
    if (this.on.roads) g.drawImage(this.images.roads, ox, oy, mw, mh);
    const dot = (x, y, c, r = 2) => { g.fillStyle = c; g.beginPath(); g.arc(ox + (x + 0.5) * z, oy + (y + 0.5) * z, r, 0, Math.PI * 2); g.fill(); };
    if (this.on.biomes) for (const p of W.provinces) dot(p.x, p.y, '#ffffff', 2.5);
    if (this.on.encounters) {
      for (const s of W.pois.spawns) dot(s.x, s.y, 'rgba(255,80,80,0.8)', 1.2);
      for (const p of W.pois.patrols) for (const q of p.path) dot(q.x, q.y, 'rgba(255,160,60,0.6)', 0.8);
      for (const c of W.pois.camps) dot(c.x, c.y, c.quest ? '#ffff00' : '#ff4040', 2.6);
    }
    if (this.on.pois) {
      for (const s of W.settlements) { g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(ox + s.x0 * z, oy + s.y0 * z, s.w * z, s.h * z); }
      for (const d of Object.values(W.pois.dungeons)) dot(d.front.x, d.front.y, '#ff3030', 3);
      dot(W.pois.spire.front.x, W.pois.spire.front.y, '#b090ff', 3);
      for (const c of W.pois.caves) dot(c.x, c.y, '#40e0ff', 2);
      for (const s of W.pois.shrines) dot(s.x, s.y, '#ffb050', 1.6);
      for (const c of W.pois.caches) dot(c.x, c.y, '#ffff80', 1.4);
      for (const l of W.pois.lore) dot(l.x, l.y, '#80c0ff', 1.4);
      for (const gt of W.pois.gates) dot(gt.x, gt.y, gt.type === 'bombs' ? '#ff9020' : '#c0c0c0', 3);
      dot(W.pois.home.x, W.pois.home.y, '#ffffff', 3);
    }
  }

  drawUI(u) {
    const W = this.world;
    const { z, ox, oy } = this.view;
    if (this.on.pois) for (const s of W.settlements) text(u, s.name, ox + s.center.x * z, oy + s.y0 * z - 2, { size: 5.5, align: 'center' });
    // Side panel
    const px = 352;
    panel(u, px, 6, 122, 258, { fill: 'rgba(14,10,18,0.9)' });
    text(u, 'Terrain Viewer', px + 61, 18, { size: 8, align: 'center', bold: true, family: SERIF, color: UI.gold });
    text(u, `seed: ${this.typing ? this.draft + '▏' : this.seed}`, px + 6, 30, { size: 6, color: this.typing ? UI.gold : UI.text });
    text(u, `generated in ${this.genMs.toFixed(0)} ms · ${W.w}×${W.h} tiles`, px + 6, 39, { size: 5, color: UI.dim });
    LAYERS.forEach((l, k) => text(u, `${k + 1}  ${this.on[l.key] ? '■' : '□'} ${l.label}`, px + 6, 52 + k * 9, { size: 6, color: this.on[l.key] ? UI.text : UI.dim }));
    const stats = [
      `Settlements ${W.settlements.length} · NPCs ${W.npcs.length}`,
      `Buildings ${W.props.filter((p) => p.kind === 'building').length} · Roads ${W.roads.length}`,
      `Caves ${W.pois.caves.length} · Camps ${W.pois.camps.length}`,
      `Shrines ${W.pois.shrines.length} · Caches ${W.pois.caches.length}`,
      `Wild spawns ${W.pois.spawns.length} · Patrols ${W.pois.patrols.length}`,
      `Gates: ${W.pois.gates.map((g2) => g2.type).join(', ')}`,
    ];
    stats.forEach((s, k) => text(u, s, px + 6, 112 + k * 8, { size: 5.2 }));
    text(u, 'Stages: terrain → water → regions →', px + 6, 168, { size: 5, color: UI.dim });
    text(u, 'settlements → roads → content', px + 6, 175, { size: 5, color: UI.dim });
    W.regions.forEach((r, k) => text(u, `${r.name}`, px + 6, 188 + k * 7, { size: 5, color: '#c8bca0' }));
    text(u, 'N new seed · T type seed · 1-6 layers', px + 6, 240, { size: 5, color: UI.dim });
    text(u, 'arrows pan · +/- zoom · Esc title', px + 6, 248, { size: 5, color: UI.dim });
    text(u, `legend: ● dungeon ● cave ● gate ● shrine`, px + 6, 258, { size: 4.6, color: UI.dim });
  }
}

export { BIOME_NAMES };
