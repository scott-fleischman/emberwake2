// Watch the bot play: a speedrun-style overlay (timer, splits, speed controls) over a real game
// driven by the autoplay bot's own input device. Never touches the player's save.
import { GameScene } from './game.js';
import { newGameState } from '../game/state.js';
import { Input } from '../core/input.js';
import { Bot } from '../bot/bot.js';
import { CLASSES } from '../data/classes.js';
import { text, panel, SERIF } from '../gfx/ui.js';
import { UI } from '../gfx/palette.js';

const SPEEDS = [1, 2, 4, 8, 16, 32];
const STEP = 1 / 60;

export const fmtTime = (t, cs = true) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}${cs ? `.${String(c).padStart(2, '0')}` : ''}`;
};

export class AutoplayScene {
  constructor(app, { mode = 'any', classId = 'swordsman', seed } = {}) {
    this.app = app;
    this.opts = { mode, classId };
    this.seed = seed || `run${Math.floor(Math.random() * 9000 + 1000)}`;
    const game = new GameScene(app, newGameState(this.seed, classId));
    game.input = new Input();
    game.saveGame = () => true;
    // Quiet the sound effects when fast-forwarding.
    const audio = app.audio;
    game.audio = { sfx: (...a) => { if (this.speed <= 2) audio.sfx(...a); }, playMusic: (k) => audio.playMusic(k), stopMusic: () => audio.stopMusic(), get cur() { return audio.cur; } };
    this.game = game;
    this.bot = new Bot(game, mode);
    this.speed = 2;
    this.paused = false;
    this.acc = 0;
  }

  update(dt) {
    const input = this.app.input;
    if (input.keyPressed('Escape')) { this.app.toTitle(); return; }
    if (input.keyPressed('BracketRight') || input.keyPressed('Equal') || input.keyPressed('ArrowRight')) this.speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed) + 1)];
    if (input.keyPressed('BracketLeft') || input.keyPressed('Minus') || input.keyPressed('ArrowLeft')) this.speed = SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed) - 1)];
    if (input.keyPressed('Space') || input.keyPressed('KeyP')) this.paused = !this.paused;
    if (this.bot.done) {
      if (input.keyPressed('Enter')) this.app.startAutoplay(this.opts);
      return;
    }
    if (this.paused) return;
    this.acc = Math.min(this.acc + dt * this.speed, STEP * 64);
    while (this.acc >= STEP && !this.bot.done) {
      this.acc -= STEP;
      this.bot.step(STEP);
      this.game.update(STEP);
      this.game.input.endFrame();
    }
  }

  drawWorld(g) { this.game.drawWorld(g); }

  drawUI(u) {
    this.game.drawUI(u);
    const b = this.bot, s = this.game.state;
    const title = this.opts.mode === 'full' ? '100% RUN' : 'ANY% SPEEDRUN';
    // Timer card
    panel(u, 6, 228, 170, 36, { fill: 'rgba(10,8,14,0.82)', r: 3 });
    text(u, `AUTOPLAY · ${title}`, 12, 238, { size: 6, bold: true, color: UI.gold });
    text(u, fmtTime(b.time), 12, 254, { size: 14, family: SERIF, color: b.done ? '#90ff90' : '#ffffff' });
    text(u, `${CLASSES[this.opts.classId].name} · seed ${this.seed}`, 170, 238, { size: 5.5, align: 'right', color: UI.dim });
    text(u, `${this.paused ? 'PAUSED' : `${this.speed}×`} · falls ${s.stats.deaths}`, 170, 254, { size: 6, align: 'right', color: this.paused ? UI.gold : UI.text });
    // Status line
    if (!b.done) text(u, b.status, 182, 262, { size: 6, color: UI.dim });
    // Splits (and, for 100%, a completion header)
    const splits = b.splits.slice(-6);
    const rows = splits.map((sp) => [sp.label.length > 18 ? sp.label.slice(0, 17) + '…' : sp.label, fmtTime(sp.t, false), UI.text]);
    if (this.opts.mode === 'full') { const pr = b.progress(); rows.unshift(['Completion', `${pr.done}/${pr.total} · ${Math.floor((pr.done / pr.total) * 100)}%`, UI.gold]); }
    if (rows.length) {
      panel(u, 380, 96, 94, 10 + rows.length * 9, { fill: 'rgba(10,8,14,0.75)', r: 3 });
      rows.forEach(([label, value, color], k) => {
        text(u, label, 384, 106 + k * 9, { size: 5.5, color });
        text(u, value, 470, 106 + k * 9, { size: 5.5, align: 'right', color: UI.gold });
      });
    }
    text(u, '←→ speed · Space pause · Esc quit', 472, 266, { size: 5, align: 'right', color: UI.dim });
    if (b.done) {
      u.fillStyle = 'rgba(0,0,0,0.55)'; u.fillRect(0, 0, 480, 270);
      panel(u, 120, 50, 240, 150);
      text(u, 'Run complete', 240, 74, { size: 16, align: 'center', family: SERIF, color: '#f4dcb0' });
      text(u, fmtTime(b.time), 240, 100, { size: 20, align: 'center', family: SERIF, color: '#90ff90' });
      text(u, `${title} · ${CLASSES[this.opts.classId].name} · ${s.stats.deaths} falls · ${s.stats.kills} foes`, 240, 114, { size: 6, align: 'center', color: UI.dim });
      b.splits.slice(-6).forEach((sp, k) => {
        text(u, sp.label, 140, 130 + k * 9, { size: 6, color: UI.text });
        text(u, fmtTime(sp.t, false), 340, 130 + k * 9, { size: 6, align: 'right', color: UI.gold });
      });
      text(u, 'Enter: new seed · Esc: title', 240, 192, { size: 6.5, align: 'center', color: UI.gold });
    }
  }
}
