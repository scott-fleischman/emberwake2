// Title screen, new-game class selection with seed entry.
import { CLASSES, CLASS_ORDER } from '../data/classes.js';
import { WEAPONS, USE_ITEMS, SHIELDS } from '../data/items.js';
import { newGameState } from '../game/state.js';
import { humanSprite, LOOKS } from '../gfx/sprites.js';
import { text, panel, SERIF, Menu } from '../gfx/ui.js';
import { UI } from '../gfx/palette.js';
import { DIFFICULTY } from '../game/state.js';
import { controlsMenu } from './game.js';

const randomSeed = () => {
  const words = ['ember', 'hollow', 'thorn', 'ash', 'rime', 'wake', 'spire', 'fen', 'dune', 'crag', 'hearth', 'cinder'];
  return words[Math.floor(Math.random() * words.length)] + Math.floor(Math.random() * 900 + 100);
};

function drawBackdrop(g, t, sparks) {
  const grd = g.createLinearGradient(0, 0, 0, 270);
  grd.addColorStop(0, '#120c18'); grd.addColorStop(0.6, '#2a1420'); grd.addColorStop(1, '#3a1a14');
  g.fillStyle = grd; g.fillRect(0, 0, 480, 270);
  // distant ridges
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = ['#1e1424', '#24141c', '#2c1614'][layer];
    g.beginPath(); g.moveTo(0, 270);
    for (let x = 0; x <= 480; x += 8) g.lineTo(x, 170 + layer * 22 + Math.sin(x * 0.02 + layer * 2) * (18 - layer * 4) + Math.sin(x * 0.07 + layer) * 6);
    g.lineTo(480, 270); g.fill();
  }
  // hearth glow
  const gl = g.createRadialGradient(240, 250, 4, 240, 250, 140 + Math.sin(t * 2) * 6);
  gl.addColorStop(0, 'rgba(255,170,80,0.55)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gl; g.fillRect(0, 0, 480, 270);
  for (const s of sparks) {
    s.y -= s.v * 0.016; s.x += Math.sin(t * s.f + s.p) * 0.3;
    if (s.y < -5) { s.y = 275; s.x = 160 + Math.random() * 160; }
    g.fillStyle = `rgba(255,${150 + Math.floor(s.p * 30) % 100},60,${Math.min(1, s.y / 200)})`;
    g.fillRect(s.x, s.y, s.s, s.s);
  }
}

export class TitleScene {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.sparks = Array.from({ length: 60 }, () => ({ x: 160 + Math.random() * 160, y: Math.random() * 270, v: 10 + Math.random() * 30, f: 1 + Math.random() * 2, p: Math.random() * 6, s: Math.random() < 0.3 ? 2 : 1 }));
    this.mode = 'menu';
    this.ui = [];
    this.buildMenu();
    app.audio.playMusic('title');
  }

  buildMenu() {
    const app = this.app;
    const items = [];
    if (app.store.has()) items.push({ label: 'Continue', onSelect: () => app.continueGame() });
    items.push({ label: 'New Game', onSelect: () => { this.enterSelect(); } });
    items.push({ label: 'Combat Arena (debug)', onSelect: () => app.startArena() });
    items.push({ label: 'Terrain Viewer (debug)', onSelect: () => app.startViewer() });
    items.push({ label: 'Options', onSelect: () => this.ui.push(app.optionsMenu()) });
    items.push({ label: 'Controls', onSelect: () => this.ui.push(controlsMenu()) });
    this.items = items;
    this.sel = 0;
  }

  enterSelect() {
    this.mode = 'select';
    this.cls = 0;
    this.row = 0;
    this.seed = randomSeed();
    this.confirmOverwrite = false;
  }

  update(dt) {
    this.t += dt;
    const input = this.app.input, audio = this.app.audio;
    const top = this.ui[this.ui.length - 1];
    if (top) { top.update(dt, this.app.facade); if (top.done) this.ui.pop(); return; }
    if (this.mode === 'menu') {
      if (input.pressed('up')) { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('menu'); }
      if (input.pressed('down')) { this.sel = (this.sel + 1) % this.items.length; audio.sfx('menu'); }
      if (input.keyPressed('Enter') || input.keyPressed('KeyE') || input.keyPressed('KeyJ') || input.keyPressed('Space') || input.keyPressed('KeyZ')) { audio.sfx('select'); this.items[this.sel].onSelect(); }
      return;
    }
    // class select
    if (input.keyPressed('Escape')) { this.mode = 'menu'; audio.sfx('menu'); return; }
    if (this.confirmOverwrite) {
      if (input.keyPressed('KeyY') || input.keyPressed('Enter')) this.begin(true);
      else if (input.keyPressed('KeyN') || input.keyPressed('Backspace')) this.confirmOverwrite = false;
      return;
    }
    if (this.row === 1) {
      // Seed entry: type to edit, Enter rerolls, arrows move between rows.
      for (const ch of input.typed) {
        if (ch === 'Backspace') this.seed = this.seed.slice(0, -1);
        else if (/^[a-zA-Z0-9-]$/.test(ch) && this.seed.length < 18) this.seed += ch.toLowerCase();
      }
      if (input.keyPressed('Enter')) { this.seed = randomSeed(); audio.sfx('menu'); }
      if (input.keyPressed('ArrowUp')) { this.row = 0; audio.sfx('menu'); }
      if (input.keyPressed('ArrowDown')) { this.row = 2; audio.sfx('menu'); }
      return;
    }
    if (input.pressed('up')) { this.row = Math.max(0, this.row - 1); audio.sfx('menu'); }
    if (input.pressed('down')) { this.row = Math.min(3, this.row + 1); audio.sfx('menu'); }
    if (this.row === 0) {
      if (input.pressed('left')) { this.cls = (this.cls + 3) % 4; audio.sfx('menu'); }
      if (input.pressed('right')) { this.cls = (this.cls + 1) % 4; audio.sfx('menu'); }
      if (input.keyPressed('Enter') || input.keyPressed('KeyJ') || input.keyPressed('Space')) { this.row = 3; audio.sfx('select'); }
    } else if (this.row === 2) {
      const o = this.app.options, keys = Object.keys(DIFFICULTY);
      const step = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
      if (step) { o.difficulty = keys[(keys.indexOf(o.difficulty) + step + keys.length) % keys.length]; this.app.store.saveOptions(o); audio.sfx('menu'); }
      if (input.keyPressed('Enter') || input.keyPressed('KeyJ') || input.keyPressed('Space')) { this.row = 3; audio.sfx('select'); }
    } else if (this.row === 3 && (input.keyPressed('Enter') || input.keyPressed('KeyJ') || input.keyPressed('Space') || input.keyPressed('KeyE'))) {
      this.begin(false);
    }
  }

  begin(confirmed) {
    if (!confirmed && this.app.store.has()) { this.confirmOverwrite = true; return; }
    this.app.audio.sfx('levelup');
    const seed = this.seed.trim() || randomSeed();
    this.app.startIntro(newGameState(seed, CLASS_ORDER[this.cls]));
  }

  drawWorld(g) { drawBackdrop(g, this.t, this.sparks); }

  drawUI(u) {
    if (this.mode === 'menu') {
      text(u, 'Emberwake', 240, 78, { size: 34, align: 'center', family: SERIF, color: '#f4dcb0' });
      text(u, 'The Hearth Ember gutters. The wards awaken.', 240, 94, { size: 7, align: 'center', color: UI.dim });
      this.items.forEach((it, k) => {
        const sel = k === this.sel;
        text(u, (sel ? '▸  ' : '') + it.label + (sel ? '  ◂' : ''), 240, 128 + k * 13, { size: 8, align: 'center', color: sel ? UI.gold : UI.text, bold: sel });
      });
      text(u, '↑↓ choose · Enter select · procedural world, four classes, three wardens', 240, 258, { size: 5.5, align: 'center', color: UI.dim });
    } else this.drawSelect(u);
    for (const ui of this.ui) ui.draw(u, this.app.facade);
  }

  drawSelect(u) {
    text(u, 'Choose your path', 240, 26, { size: 13, align: 'center', family: SERIF, color: '#f4dcb0' });
    const w = 106, gap = 8, x0 = (480 - (w * 4 + gap * 3)) / 2;
    CLASS_ORDER.forEach((id, k) => {
      const c = CLASSES[id];
      const x = x0 + k * (w + gap), y = 38;
      const sel = k === this.cls;
      panel(u, x, y, w, 152, { edge: sel ? UI.gold : '#6a5a48', lw: sel ? 1.5 : 0.8, fill: sel ? 'rgba(40,28,24,0.92)' : 'rgba(20,16,24,0.8)' });
      const spr = humanSprite(LOOKS[id], 'down', sel ? Math.floor(this.t * 6) % 4 : 0, `p${id}`);
      u.imageSmoothingEnabled = false;
      u.drawImage(spr, x + w / 2 - 16, y + 8, 32, 40);
      text(u, c.name, x + w / 2, y + 60, { size: 8.5, align: 'center', bold: true, color: sel ? UI.gold : UI.text, family: SERIF });
      const stat = (label, v, max, yy, col) => {
        text(u, label, x + 8, yy, { size: 5.5, color: UI.dim });
        u.fillStyle = 'rgba(0,0,0,0.5)'; u.fillRect(x + 40, yy - 4, 58, 3.5);
        u.fillStyle = col; u.fillRect(x + 40, yy - 4, 58 * Math.min(1, v / max), 3.5);
      };
      stat('Health', c.maxHp, 12, y + 72, UI.hp);
      stat('Mana', c.maxMana, 40, y + 80, UI.mana);
      stat('Stamina', c.maxStamina, 110, y + 88, UI.stamina);
      stat('Speed', c.speed - 60, 30, y + 96, '#d0d0d0');
      const gear = [WEAPONS[c.weapon].name, c.shield ? SHIELDS[c.shield].name : null, ...c.items.map((i) => USE_ITEMS[i].name)].filter(Boolean).join(', ');
      wrapInto(u, gear, x + 8, y + 108, w - 14, 5.5, '#e8dcc0');
      wrapInto(u, c.blurb, x + 8, y + 126, w - 14, 5.2, UI.dim);
    });
    const ry = 200;
    text(u, 'World seed:', 170, ry, { size: 7, color: this.row === 1 ? UI.gold : UI.text, align: 'right' });
    panel(u, 176, ry - 9, 130, 13, { r: 2, edge: this.row === 1 ? UI.gold : '#6a5a48' });
    text(u, this.seed + (this.row === 1 && Math.floor(this.t * 2) % 2 ? '▏' : ''), 181, ry, { size: 7 });
    text(u, this.row === 1 ? 'type to edit · Enter = random' : 'same seed = same world', 312, ry, { size: 5.5, color: UI.dim });
    const diff = DIFFICULTY[this.app.options.difficulty] || DIFFICULTY.normal;
    text(u, 'Difficulty:', 170, 216, { size: 7, color: this.row === 2 ? UI.gold : UI.text, align: 'right' });
    text(u, `◂ ${diff.label} ▸`, 181, 216, { size: 7, bold: this.row === 2, color: this.row === 2 ? UI.gold : UI.text });
    text(u, { story: 'just the tale: foes barely scratch you', gentle: 'forgiving: half damage taken', normal: 'the intended challenge', hard: 'foes hit harder and last longer' }[this.app.options.difficulty] || '', 232, 216, { size: 5.5, color: UI.dim });
    text(u, this.row === 3 ? '▸  Begin the journey  ◂' : 'Begin the journey', 240, 236, { size: 9, align: 'center', bold: this.row === 3, color: this.row === 3 ? UI.gold : UI.text, family: SERIF });
    text(u, '←→ class · ↑↓ rows · Enter confirm · Esc back', 240, 258, { size: 5.5, align: 'center', color: UI.dim });
    if (this.confirmOverwrite) {
      panel(u, 130, 110, 220, 44);
      text(u, 'Starting anew will overwrite your saved journey.', 240, 126, { size: 6.5, align: 'center' });
      text(u, 'Y / Enter: overwrite      N: go back', 240, 142, { size: 6.5, align: 'center', color: UI.gold });
    }
  }
}

function wrapInto(u, s, x, y, w, size, color) {
  u.font = `${size}px "Trebuchet MS", Verdana, sans-serif`;
  let line = '', yy = y;
  for (const word of s.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (u.measureText(t).width > w && line) { text(u, line, x, yy, { size, color }); line = word; yy += size + 2; } else line = t;
  }
  if (line) text(u, line, x, yy, { size, color });
}

export { Menu };
