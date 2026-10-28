// HUD, dungeon minimap, and world map screen (UI layer).
import { UI, BIOME_PAL } from './palette.js';
import { text, panel, setFont, SERIF } from './ui.js';
import { USE_ITEMS } from '../data/items.js';
import { T, D } from '../world/tiles.js';
import { makeCanvas, signBoard, SIGN_ICONS } from './sprites.js';

export const FOG_CELL = 4;

// Each trade building's sign, drawn small over its door so the map tells the smithy from the inn.
// Returns the top edge of each settlement's highest icon, so its name can sit above them.
function drawShopIcons(u, W, seen, at, k) {
  const tops = {};
  for (const b of W.props) {
    if (b.kind !== 'building' || !SIGN_ICONS.has(b.type) || !seen(b.door.x, b.door.y)) continue;
    const [x, y] = at(b.door.x + 0.5, b.door.y - 0.6), top = Math.round((y - 6.5 * k) * 4) / 4;
    u.drawImage(signBoard(b.type), Math.round((x - 7.5 * k) * 4) / 4, top, 15 * k, 13 * k);
    tops[b.settlementId] = Math.min(tops[b.settlementId] ?? Infinity, top);
  }
  return tops;
}

function heart(u, x, y, fill) {
  const path = () => {
    u.beginPath();
    u.moveTo(x + 3.5, y + 6.5);
    u.bezierCurveTo(x - 1, y + 3.5, x - 0.5, y - 0.5, x + 1.8, y);
    u.bezierCurveTo(x + 2.8, y + 0.2, x + 3.5, y + 1, x + 3.5, y + 1.6);
    u.bezierCurveTo(x + 3.5, y + 1, x + 4.2, y + 0.2, x + 5.2, y);
    u.bezierCurveTo(x + 7.5, y - 0.5, x + 8, y + 3.5, x + 3.5, y + 6.5);
    u.closePath();
  };
  path(); u.fillStyle = UI.hpDark; u.fill();
  if (fill > 0) {
    u.save(); path(); u.clip();
    u.fillStyle = UI.hp; u.fillRect(x - 1, y - 1, fill >= 2 ? 10 : 4.5, 9);
    u.fillStyle = 'rgba(255,255,255,0.45)'; u.fillRect(x + 1, y + 0.8, 1.5, 1.2);
    u.restore();
  }
  path(); u.strokeStyle = 'rgba(0,0,0,0.6)'; u.lineWidth = 0.6; u.stroke();
}

function bar(u, x, y, w, h, frac, color, label) {
  u.fillStyle = 'rgba(0,0,0,0.55)'; u.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  u.fillStyle = color; u.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  u.fillStyle = 'rgba(255,255,255,0.25)'; u.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, 1);
  if (label) text(u, label, x + w + 3, y + h, { size: 5, color: UI.dim });
}

export function itemIcon(u, id, x, y) {
  u.save(); u.translate(x, y);
  switch (id) {
    case 'bow': u.strokeStyle = '#c08a4a'; u.lineWidth = 1.4; u.beginPath(); u.arc(-1, 0, 5, -1.2, 1.2); u.stroke(); u.fillStyle = '#e0e0e0'; u.fillRect(-1, -4.5, 0.6, 9); u.fillRect(-3, -0.3, 8, 0.6); break;
    case 'knives': u.fillStyle = '#d8dce4'; u.fillRect(-4, -2, 7, 1.2); u.fillRect(-4, 1, 7, 1.2); u.fillStyle = '#6a4a2a'; u.fillRect(-5, -2, 2, 4.2); break;
    case 'firebolt': u.fillStyle = '#ff8030'; u.beginPath(); u.arc(0, 0, 3.5, 0, Math.PI * 2); u.fill(); u.fillStyle = '#fff0b0'; u.beginPath(); u.arc(0.5, -0.5, 1.4, 0, Math.PI * 2); u.fill(); break;
    case 'bombs': u.fillStyle = '#2a2a32'; u.beginPath(); u.arc(0, 1, 4, 0, Math.PI * 2); u.fill(); u.fillStyle = '#a08050'; u.fillRect(0, -5, 1, 3); u.fillStyle = '#ffd040'; u.fillRect(-0.5, -6, 2, 1.5); break;
  }
  u.restore();
}

export function drawHUD(u, game) {
  const s = game.state, p = s.player, d = game.derived;
  u.fillStyle = 'rgba(10,8,14,0.45)';
  u.fillRect(0, 0, 480, 22);
  const hearts = Math.ceil(d.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const fill = Math.max(0, Math.min(2, Math.ceil(p.hp) - i * 2));
    heart(u, 6 + (i % 12) * 9, 3 + Math.floor(i / 12) * 8, fill);
  }
  const by = hearts > 12 ? 19 : 12;
  bar(u, 6, by, 54, 3, p.mana / d.maxMana, UI.mana);
  bar(u, 6, by + 5, 54, 2.5, p.stamina / d.maxStamina, p.stamina < d.dodgeCost ? '#c8a03a' : UI.stamina);

  // Resources
  let rx = 120;
  const res = (icon, val, color) => {
    u.fillStyle = color; u.beginPath(); u.arc(rx, 9, 2.8, 0, Math.PI * 2); u.fill();
    if (icon === 'food') { u.fillStyle = '#4a9a3a'; u.fillRect(rx, 5, 2, 1.5); }
    text(u, String(val), rx + 5, 11.5, { size: 7, bold: true });
    rx += 12 + String(val).length * 4.5;
  };
  res('coin', p.coins, UI.gold);
  res('food', p.food, '#e07a3a');
  if (game.area?.kind === 'dungeon') res('key', s.progress.keys[game.area.id] || 0, '#f0d050');

  // Selected item
  const items = s.gear.items;
  const id = items[s.gear.selected % Math.max(1, items.length)];
  panel(u, 446, 2, 30, 18, { r: 3, fill: 'rgba(20,16,24,0.8)' });
  text(u, 'K', 449, 8, { size: 4.5, color: UI.dim });
  if (id) {
    itemIcon(u, id, 457, 11);
    const it = USE_ITEMS[id];
    const n = it.mana ? `${it.mana === 6 ? d.fireboltCost : it.mana}✦` : String(p[it.ammo] ?? 0);
    text(u, n, 474, 18, { size: 5.5, align: 'right', bold: true, color: it.mana && p.mana < d.fireboltCost ? UI.danger : UI.text });
    text(u, 'I', 449, 18, { size: 4.5, color: UI.dim });
  }
  // Objective
  if (game.objective) text(u, `◆ ${game.objective}`, 288, 9, { size: 5.5, align: 'center', color: '#ffe48a' });
  if (game.subObjective) text(u, game.subObjective, 288, 17, { size: 5, align: 'center', color: UI.dim });

  // Boss bar
  const boss = game.area?.boss;
  if (boss && !boss.dead && boss.state !== 'intro') {
    const w = 220, x = 130, y = 254;
    text(u, boss.name, 240, y - 3, { size: 6.5, align: 'center', bold: true, color: '#f0d0a0', family: SERIF });
    bar(u, x, y, w, 4, boss.hp / boss.maxHp, boss.vulnerable ? '#ffd060' : '#c83a3a');
  }

  // Region banner
  if (game.banner && game.banner.t > 0) {
    const a = Math.min(1, game.banner.t, (game.banner.max - game.banner.t) * 2 + 0.2);
    u.globalAlpha = Math.max(0, Math.min(1, a));
    text(u, game.banner.title, 240, 62, { size: 14, align: 'center', family: SERIF, color: '#f4ead8' });
    if (game.banner.sub) text(u, game.banner.sub, 240, 74, { size: 6.5, align: 'center', color: UI.dim });
    u.globalAlpha = 1;
  }
  // Toasts
  game.toasts.forEach((t, k) => {
    u.globalAlpha = Math.min(1, t.t);
    text(u, t.text, 8, 262 - (game.toasts.length - 1 - k) * 9, { size: 6.5 });
  });
  u.globalAlpha = 1;
}

// ---------------------------------------------------------------- dungeon minimap
export function drawMinimap(u, area, game, big = false) {
  const d = area.dungeon;
  const visited = new Set(game.state.progress.visited[d.id] || []);
  const hasMap = game.state.progress.dungeonMaps.includes(d.id);
  const cols = Math.max(...d.rooms.map((r) => r.gx)) + 1, rows = Math.max(...d.rooms.map((r) => r.gy)) + 1;
  const known = new Set(visited);
  for (const r of d.rooms) if (visited.has(r.id)) for (const door of Object.values(r.doors)) if (door.to !== null) known.add(door.to);
  const cw = big ? Math.min(30, Math.floor(300 / cols)) : Math.max(4, Math.min(7, Math.floor(42 / cols)));
  const ch = big ? Math.min(20, Math.floor(180 / rows)) : Math.max(3, Math.min(5, Math.floor(70 / rows)));
  const ox = big ? 240 - (cols * cw) / 2 : 455 - (cols * cw) / 2, oy = big ? 60 : 34;
  if (big) {
    u.fillStyle = 'rgba(0,0,0,0.55)'; u.fillRect(0, 0, 480, 270);
    panel(u, ox - 20, oy - 34, cols * cw + 40, rows * ch + 70);
    text(u, d.name, 240, oy - 18, { size: 10, align: 'center', bold: true, family: SERIF, color: UI.gold });
  } else {
    text(u, d.name.split(' ')[1] || d.name, 455, 29, { size: 5, align: 'center', color: UI.dim });
  }
  const bossDone = game.state.progress.bosses.includes(d.id);
  for (const r of d.rooms) {
    const isKnown = known.has(r.id) || hasMap;
    if (!isKnown) continue;
    const x = ox + r.gx * cw, y = oy + r.gy * ch;
    const cur = r.id === area.roomId;
    u.fillStyle = cur ? (Math.floor(game.time * 3) % 2 ? '#f0c850' : '#c89a30') : visited.has(r.id) ? '#8a8aa0' : 'rgba(120,120,140,0.35)';
    u.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    if (r.role === 'boss' && (hasMap || known.has(r.id))) { u.fillStyle = bossDone ? '#60c060' : '#e04040'; u.fillRect(x + cw / 2 - 1, y + ch / 2 - 1, 2, 2); }
    if (r.role === 'boss' && !bossDone && game.objectiveDungeon === d.id && !(hasMap || known.has(r.id))) { u.strokeStyle = 'rgba(120,120,140,0.5)'; u.lineWidth = 0.5; u.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1); }
    if (r.role === 'entrance') { u.fillStyle = '#80e080'; u.fillRect(x + cw / 2 - 1, y + ch - 1.5, 2, 2); }
    for (const [dir, door] of Object.entries(r.doors)) {
      if (door.to === null) continue;
      const c = area.isDoorSealed(door) ? '#b070ff'
        : door.type === 'locked' && !game.state.progress.unlocked.includes(`${d.id}:${door.id}`) ? '#f0d050' : '#d0d0e0';
      u.fillStyle = c;
      if (dir === 'n') u.fillRect(x + cw / 2 - 0.5, y - 0.5, 1, 1.5);
      if (dir === 's') u.fillRect(x + cw / 2 - 0.5, y + ch - 1, 1, 1.5);
      if (dir === 'w') u.fillRect(x - 0.5, y + ch / 2 - 0.5, 1.5, 1);
      if (dir === 'e') u.fillRect(x + cw - 1, y + ch / 2 - 0.5, 1.5, 1);
    }
  }
  // Quest pin: the warden's room pulses when your tracked quest leads here.
  if (game.objectiveDungeon === d.id && !bossDone) {
    const br = d.rooms.find((r) => r.role === 'boss');
    questPulse(u, ox + (br.gx + 0.5) * cw, oy + (br.gy + 0.5) * ch, game.time, big ? 1.6 : 0.8);
  }
  if (big) {
    const ly = oy + rows * ch + 14;
    text(u, '■ you   ■ exit   ■ boss   ▪ locked   ▪ sealed', 240, ly, { size: 6, align: 'center', color: UI.dim });
    text(u, hasMap ? 'Vault map found: every room is shown.' : 'Find the vault map to reveal unexplored rooms.', 240, ly + 10, { size: 6, align: 'center', color: UI.dim });
  }
}

// ---------------------------------------------------------------- world map
let mapCache = null;
export function worldImage(W) {
  if (mapCache && mapCache.seed === W.seed) return mapCache.canvas;
  const c = makeCanvas(W.w, W.h);
  const g = c.getContext('2d');
  const img = g.createImageData(W.w, W.h);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (let i = 0; i < W.w * W.h; i++) {
    const t = W.tiles[i], b = W.biome[i];
    let col = BIOME_PAL[b].g[0];
    if (t === T.WATER || t === T.SHALLOW) col = BIOME_PAL[b].water[0];
    else if (t === T.LAVA) col = '#d05020';
    else if (t === T.CLIFF || t === T.CAVE) col = BIOME_PAL[b].cliff[1];
    else if (t === T.RIDGE || t === T.BORDER) col = BIOME_PAL[b].cliff[2];
    else if (t === T.ROAD || t === T.STAIRS || t === T.BRIDGE || t === T.PLAZA) col = '#d8c090';
    else if (t === T.BUILDING || t === T.DUNGEON || t === T.DOOR) col = '#a05040';
    else if (t === T.SAND) col = BIOME_PAL[2].g[0];
    else if (t === T.SNOW || t === T.ICE) col = '#e8eef4';
    else if (t === T.CRACKED) col = '#ffb070';
    else if (t === T.BOULDER) col = '#b0b0b0';
    else if (W.deco[i] === D.TREE) col = BIOME_PAL[b].tree[0];
    const [r, gg, bb] = hex(col);
    const shade = 0.82 + W.elev[i] * 0.06;
    img.data[i * 4] = Math.min(255, r * shade); img.data[i * 4 + 1] = Math.min(255, gg * shade); img.data[i * 4 + 2] = Math.min(255, bb * shade); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  mapCache = { seed: W.seed, canvas: c };
  return c;
}

export function drawWorldMap(u, game) {
  const W = game.world;
  const scale = 1.4;
  const mw = W.w * scale, mh = W.h * scale;
  const ox = 16, oy = (270 - mh) / 2 + 4;
  u.fillStyle = 'rgba(0,0,0,0.6)'; u.fillRect(0, 0, 480, 270);
  panel(u, ox - 6, oy - 14, mw + 12, mh + 20);
  text(u, 'Map of the Realm', ox + mw / 2, oy - 4, { size: 8, align: 'center', family: SERIF, bold: true, color: UI.gold });
  u.imageSmoothingEnabled = false;
  u.drawImage(foggedWorld(game), ox, oy, mw, mh);
  const fw = Math.ceil(W.w / FOG_CELL);
  const seen = (x, y) => game.fog[Math.floor(y / FOG_CELL) * fw + Math.floor(x / FOG_CELL)];
  const revealed = new Set(game.state.progress.revealed || []);
  const mark = (x, y, color, shape = 'dot', size = 2.2) => {
    const px = ox + (x + 0.5) * scale, py = oy + (y + 0.5) * scale;
    u.fillStyle = color;
    if (shape === 'dot') { u.beginPath(); u.arc(px, py, size, 0, Math.PI * 2); u.fill(); }
    else if (shape === 'diamond') { u.beginPath(); u.moveTo(px, py - size - 1); u.lineTo(px + size + 1, py); u.lineTo(px, py + size + 1); u.lineTo(px - size - 1, py); u.closePath(); u.fill(); }
    else u.fillRect(px - size, py - size, size * 2, size * 2);
    u.strokeStyle = 'rgba(0,0,0,0.7)'; u.lineWidth = 0.6; u.stroke();
  };
  const signTops = drawShopIcons(u, W, seen, (x, y) => [ox + x * scale, oy + y * scale], 0.45);
  for (const s of W.settlements) {
    if (!seen(s.center.x, s.center.y)) continue;
    mark(s.center.x, s.center.y, '#f4ead8', 'square', 2.4);
    text(u, s.name, ox + s.center.x * scale, Math.min(oy + s.center.y * scale - 5, (signTops[s.id] ?? Infinity) - 1.5), { size: 5, align: 'center' });
  }
  for (const sh of W.pois.shrines) if (seen(sh.x, sh.y)) mark(sh.x, sh.y, '#ffb050', 'dot', 1.4);
  for (const c of W.pois.caves) if (seen(c.x, c.y) || revealed.has(`cave:${c.id}`)) mark(c.x, c.y, '#5a4a3a', 'dot', 1.8);
  for (const [k, dn] of Object.entries(W.pois.dungeons)) {
    if (seen(dn.front.x, dn.front.y) || revealed.has(`dungeon:${k}`)) mark(dn.front.x, dn.front.y, game.state.progress.bosses.includes(k) ? '#60c060' : '#c04040', 'diamond', 2.4);
  }
  if (seen(W.pois.spire.front.x, W.pois.spire.front.y)) mark(W.pois.spire.front.x, W.pois.spire.front.y, '#b090ff', 'diamond', 2.4);
  for (const g of W.pois.gates) if (seen(g.x, g.y) || revealed.has(`gate:${g.region}`)) mark(g.x, g.y, game.state.progress.gates.includes(g.region) ? '#a0a0a0' : '#ffa040', 'square', 1.6);
  for (const cp of W.pois.camps) if (seen(cp.x, cp.y) && !game.state.progress.cleared.includes(cp.id)) mark(cp.x, cp.y, '#e06040', 'dot', 1.4);
  // Unbroken ward seals ring their doors; the relics the quest is after show once it names them.
  const pr = game.state.progress, stage = game.state.quest.main;
  for (const [k, seal] of Object.entries(W.pois.seals || {})) {
    if (pr.seals.includes(k) || !(seen(seal.center.x, seal.center.y) || revealed.has(`dungeon:${k}`))) continue;
    u.strokeStyle = { verdant: '#7a5a3a', ashen: '#ff6a20', frost: '#b8ecff' }[k]; u.lineWidth = 1.2;
    u.beginPath(); u.arc(ox + (seal.center.x + 0.5) * scale, oy + (seal.center.y + 0.5) * scale, Math.max(3, seal.r * scale), 0, Math.PI * 2); u.stroke();
  }
  const kind = { leaves: 'leaves', vents: 'vents', beacons: 'beacons' }[stage];
  if (kind) for (const r of W.pois.relics[kind]) if (!pr.relics.includes(r.id)) mark(r.x, r.y, { leaves: '#8aff6a', vents: '#ff6a20', beacons: '#b8ecff' }[kind], 'diamond', 1.6);
  for (const l of W.pois.lookouts || []) if (seen(l.x, l.y) || stage === l.id) mark(l.x, l.y, '#e8c050', 'square', 1.3);
  // Quest markers: faint for other quests, a pulsing pin for the tracked one.
  for (const m of game.otherMarkers || []) {
    u.fillStyle = 'rgba(255,220,90,0.45)';
    u.beginPath(); u.arc(ox + (m.x + 0.5) * scale, oy + (m.y + 0.5) * scale, 1.6, 0, Math.PI * 2); u.fill();
  }
  if (game.objectiveMarker) questPulse(u, ox + (game.objectiveMarker.x + 0.5) * scale, oy + (game.objectiveMarker.y + 0.5) * scale, game.time, 1.6);
  const blink = Math.floor(game.time * 3) % 2;
  const pp = game.overworldPos();
  if (pp) mark(pp.x, pp.y, blink ? '#ffffff' : '#4ae0ff', 'dot', 2.6);
  // Legend
  const lx = ox + mw + 14;
  panel(u, lx - 7, oy - 14, 480 - lx, mh + 20);
  text(u, 'Tracking', lx, oy + 6, { size: 7, bold: true, color: UI.gold });
  const lines = [game.objectiveTitle ? `◆ ${game.objectiveTitle}` : '', ...wrapLines(u, game.objective || '', 480 - lx - 10)].filter(Boolean);
  lines.forEach((l, k) => text(u, l, lx, oy + 16 + k * 8, { size: 6, color: k === 0 ? '#ffe48a' : UI.text }));
  let ly = oy + 18 + lines.length * 8;
  if ((game.otherMarkers || []).length) { text(u, 'Q: track next quest', lx, ly, { size: 5.5, color: UI.dim }); ly += 8; }
  ly += 6;
  for (const [c, label, shape] of [['#f4ead8', 'Settlement', 'square'], ['#ffb050', 'Shrine (save)', 'dot'], ['#c04040', 'Dungeon', 'diamond'], ['#5a4a3a', 'Cave', 'dot'], ['#e06040', 'Enemy camp', 'dot'], ['#ffa040', 'Sealed pass', 'square'], ['#ffd23a', 'Tracked quest', 'ring']]) {
    if (shape === 'ring') { u.strokeStyle = c; u.beginPath(); u.arc(lx + 2, ly - 2, 2.5, 0, Math.PI * 2); u.stroke(); }
    else { u.fillStyle = c; u.fillRect(lx, ly - 4, 4, 4); }
    text(u, label, lx + 8, ly, { size: 6 });
    ly += 9;
  }
  ly += 4;
  for (const r of W.regions) { text(u, r.name, lx, ly, { size: 5.5, color: UI.dim }); ly += 7; }
  text(u, 'M / Esc to close', lx, oy + mh - 2, { size: 5.5, color: UI.dim });
}

function wrapLines(u, s, w) {
  setFont(u, 6);
  const out = []; let line = '';
  for (const word of s.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (u.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// ---------------------------------------------------------------- quest pin & fogged map
export function questPulse(u, x, y, time, size = 1) {
  const k = (time % 1.3) / 1.3;
  u.strokeStyle = `rgba(255,214,58,${0.9 * (1 - k)})`;
  u.lineWidth = 1 * size;
  u.beginPath(); u.arc(x, y, (2 + k * 7) * size, 0, Math.PI * 2); u.stroke();
  u.fillStyle = 'rgba(40,24,0,0.8)';
  u.beginPath(); u.arc(x, y, 2.6 * size, 0, Math.PI * 2); u.fill();
  u.fillStyle = '#ffd23a';
  u.beginPath(); u.arc(x, y, (1.8 + 0.3 * Math.sin(time * 6)) * size, 0, Math.PI * 2); u.fill();
}

// The world image with undiscovered cells blacked out; repaints only cells revealed since last time.
let fogged = null;
export function foggedWorld(game) {
  const W = game.world;
  const fw = Math.ceil(W.w / FOG_CELL), fh = Math.ceil(W.h / FOG_CELL);
  if (!fogged || fogged.game !== game) {
    const c = makeCanvas(W.w, W.h), g = c.getContext('2d');
    g.drawImage(worldImage(W), 0, 0);
    g.fillStyle = '#1a1620';
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (!game.fog[y * fw + x]) g.fillRect(x * FOG_CELL, y * FOG_CELL, FOG_CELL, FOG_CELL);
    fogged = { game, canvas: c, g };
    game.fogNew.length = 0;
  }
  if (game.fogNew.length) {
    const img = worldImage(W);
    for (const i of game.fogNew.splice(0)) {
      const x = (i % fw) * FOG_CELL, y = Math.floor(i / fw) * FOG_CELL;
      fogged.g.drawImage(img, x, y, FOG_CELL, FOG_CELL, x, y, FOG_CELL, FOG_CELL);
    }
  }
  return fogged.canvas;
}

// Circular overworld minimap. The tracked quest pulses where it is, or pins to the rim
// pointing toward it when it lies beyond the minimap's reach.
const MM = { x: 448, y: 56, r: 26, zoom: 1.15 };
export function drawOverworldMinimap(u, game) {
  const W = game.world;
  const outside = game.area.kind === 'overworld';
  const pos = outside ? { x: game.player.x / 16, y: game.player.y / 16 } : game.overworldPos() && { x: game.overworldPos().x + 0.5, y: game.overworldPos().y + 0.5 };
  if (!pos) return;
  const { x: cx, y: cy, r, zoom } = MM;
  u.save();
  u.beginPath(); u.arc(cx, cy, r, 0, Math.PI * 2);
  u.fillStyle = '#1a1620'; u.fill();
  u.clip();
  u.imageSmoothingEnabled = false;
  u.drawImage(foggedWorld(game), cx - pos.x * zoom, cy - pos.y * zoom, W.w * zoom, W.h * zoom);
  if (!outside) { u.fillStyle = 'rgba(10,8,14,0.45)'; u.fillRect(cx - r, cy - r, r * 2, r * 2); }
  // Shrines you've seen, as small warm dots.
  const fw = Math.ceil(W.w / FOG_CELL);
  for (const sh of W.pois.shrines) {
    if (!game.fog[Math.floor(sh.y / FOG_CELL) * fw + Math.floor(sh.x / FOG_CELL)]) continue;
    const sx = cx + (sh.x + 0.5 - pos.x) * zoom, sy = cy + (sh.y + 0.5 - pos.y) * zoom;
    u.fillStyle = '#ffb050'; u.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6);
  }
  drawShopIcons(u, W, (x, y) => game.fog[Math.floor(y / FOG_CELL) * fw + Math.floor(x / FOG_CELL)] && Math.hypot(x - pos.x, y - pos.y) * zoom < r + 4, (x, y) => [cx + (x - pos.x) * zoom, cy + (y - pos.y) * zoom], 0.36);
  u.restore();
  // Frame and compass tick.
  u.strokeStyle = 'rgba(0,0,0,0.7)'; u.lineWidth = 2.2; u.beginPath(); u.arc(cx, cy, r + 0.6, 0, Math.PI * 2); u.stroke();
  u.strokeStyle = UI.panelEdge; u.lineWidth = 0.9; u.beginPath(); u.arc(cx, cy, r, 0, Math.PI * 2); u.stroke();
  text(u, 'N', cx, cy - r + 5, { size: 4.5, align: 'center', bold: true, color: '#f4ead8' });
  // You.
  u.save();
  u.translate(cx, cy);
  if (outside) {
    u.rotate(game.player.aim + Math.PI / 2);
    u.fillStyle = '#ffffff'; u.strokeStyle = 'rgba(0,0,0,0.8)'; u.lineWidth = 0.6;
    u.beginPath(); u.moveTo(0, -3.2); u.lineTo(2.3, 2.4); u.lineTo(0, 1.2); u.lineTo(-2.3, 2.4); u.closePath(); u.fill(); u.stroke();
  } else {
    u.fillStyle = '#c8c0d8'; u.fillRect(-1.5, -1.5, 3, 3);
  }
  u.restore();
  if (!outside) text(u, 'outside', cx, cy + r + 6, { size: 4.5, align: 'center', color: UI.dim });
  // Tracked quest.
  const m = game.objectiveMarker;
  if (!m) return;
  const dx = (m.x + 0.5 - pos.x) * zoom, dy = (m.y + 0.5 - pos.y) * zoom, d = Math.hypot(dx, dy);
  if (d <= r - 4) { questPulse(u, cx + dx, cy + dy, game.time, 0.9); return; }
  // Off the edge: pin to the rim and point the way.
  const ang = Math.atan2(dy, dx);
  const ex = cx + Math.cos(ang) * (r - 0.5), ey = cy + Math.sin(ang) * (r - 0.5);
  const k = (game.time % 1.3) / 1.3;
  u.fillStyle = `rgba(255,214,58,${0.35 * (1 - k)})`;
  u.beginPath(); u.arc(ex, ey, 3 + k * 4, 0, Math.PI * 2); u.fill();
  u.save();
  u.translate(ex, ey); u.rotate(ang);
  u.fillStyle = '#ffd23a'; u.strokeStyle = 'rgba(40,24,0,0.9)'; u.lineWidth = 0.7;
  u.beginPath(); u.moveTo(4, 0); u.lineTo(-2.5, -3); u.lineTo(-1.2, 0); u.lineTo(-2.5, 3); u.closePath(); u.fill(); u.stroke();
  u.restore();
  const tiles = Math.round(d / zoom);
  text(u, `${tiles}`, cx, cy + r + (outside ? 6 : 12), { size: 4.8, align: 'center', color: '#ffe48a' });
}
