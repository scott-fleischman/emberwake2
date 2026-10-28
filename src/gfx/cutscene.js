// Cutscene player. Works as a UI-stack overlay inside GameScene (in-engine, letterboxed shots
// over a frozen world) or wrapped by IntroScene (full-screen painted panels).
// Shot fields: see src/data/story.js.
import { ART, drawSpirit, tendrils, eyes } from './cinema.js';
import { drawDarkness } from './render.js';
import { text, wrap, SERIF } from './ui.js';
import { UI } from './palette.js';

const CPS = 42;           // typewriter characters per second
const FADE = 0.35;        // seconds to fade between panels
const INPUT_GRACE = 0.25; // ignore the key press that opened the scene

export class Cutscene {
  constructor(shots, opts = {}) {
    this.shots = shots.filter(Boolean);
    this.i = 0;
    this.t = 0;
    this.total = 0;
    this.chars = 0;
    this.done = false;
    this.blocking = true;
    this.cinematic = true;
    this.onDone = opts.onDone || null;
    this.music = opts.music || null;
    this.ctx = opts.ctx || {};
    this.letterbox = !!opts.letterbox;
    this.autoplay = !!opts.autoplay; // movie mode: dialogue advances on its own
    this.liveFx = !!opts.liveFx;     // keep particles moving in the frozen world
    this.hint = opts.hint || 'Enter: next · Esc: skip';
    this.bars = 0;
    this.leaving = 0;     // >0 while fading out of the current shot
    this.skipArm = 0;     // >0 after the first Esc press
    this.started = false;
    this.spiritA = 0;
  }

  get shot() { return this.shots[this.i]; }
  get typed() { const s = this.shot; return !s || !s.text || this.chars >= s.text.length; }

  holdTime(s) {
    if (this.autoplay && s.wait) return 1.6 + (s.text ? s.text.length * 0.035 : 1);
    if (s.hold !== undefined) return s.hold;
    return 1.5 + (s.text ? s.text.length * 0.03 : 1);
  }

  enter(game) {
    const s = this.shot;
    this.t = 0;
    this.chars = 0;
    if (!s) return;
    if (s.sfx) game.audio.sfx(s.sfx);
    if (s.music) game.audio.playMusic(s.music);
    if (s.run) s.run(game);
    if (s.shake && !s.art && game.cam && this.ctx.shake !== false) game.cam.shake(s.shake, 0.8);
  }

  advance(game) {
    const cur = this.shot, nxt = this.shots[this.i + 1];
    if (!this.letterbox && nxt && cur && nxt.art && nxt.art !== cur.art) { this.leaving = FADE; return; }
    this.next(game);
  }

  next(game) {
    this.i++;
    if (this.i >= this.shots.length) { this.finish(game); return; }
    this.enter(game);
  }

  finish(game) {
    if (this.done) return;
    this.done = true;
    if (this.onDone) this.onDone(game);
  }

  update(dt, game) {
    if (!this.started) {
      this.started = true;
      if (this.music) game.audio.playMusic(this.music);
      this.enter(game);
    }
    const input = game.input;
    this.total += dt;
    this.bars = Math.min(1, this.bars + dt * 3);
    if (this.skipArm > 0) this.skipArm -= dt;
    if (input.keyPressed('Escape') && this.total > INPUT_GRACE) {
      if (this.skipArm > 0) { game.audio.sfx('menu'); this.finish(game); return; }
      this.skipArm = 2.5;
    }
    if (this.leaving > 0) {
      this.leaving -= dt;
      if (this.leaving <= 0) { this.leaving = 0; this.next(game); }
      return;
    }
    const s = this.shot;
    if (!s) { this.finish(game); return; }
    this.t += dt;
    // In-engine shots can steer the camera: a slow pan toward `look` (world pixels).
    if (s.look && game.cam && game.area?.map) game.cam.follow(s.look.x, s.look.y, game.area.map.pixelW, game.area.map.pixelH, dt * 0.22);
    if (s.spirit) this.spiritA = Math.min(1, this.spiritA + dt * (s.fadeSpirit ? 0 : 1.2));
    if (s.fadeSpirit) this.spiritA = Math.max(0, this.spiritA - dt * 0.8);
    if (s.text && this.chars < s.text.length) {
      const before = Math.floor(this.chars / 4);
      this.chars = Math.min(s.text.length, this.chars + dt * CPS);
      if (s.speaker && Math.floor(this.chars / 4) > before) game.audio.sfx('talk');
    }
    const pressed = this.t > INPUT_GRACE && input.pressed('confirm');
    if (pressed) {
      if (!this.typed) this.chars = s.text.length;
      else this.advance(game);
      return;
    }
    if (this.typed && (!s.wait || this.autoplay) && this.t > (s.text ? s.text.length / CPS : 0) + this.holdTime(s)) this.advance(game);
  }

  // Pixel layer: painted panels, or effects over the frozen world.
  drawWorld(g, game) {
    const s = this.shot;
    if (!s) return;
    if (s.art && ART[s.art]) {
      const sh = s.shake && this.ctx.shake !== false ? Math.max(0, 1 - this.t / 2) * s.shake : 0;
      g.save();
      if (sh) g.translate(Math.round((Math.random() - 0.5) * sh * 2), Math.round((Math.random() - 0.5) * sh * 2));
      ART[s.art](g, this.t, s, this.ctx);
      g.restore();
      const prev = this.shots[this.i - 1];
      const fadeIn = !this.letterbox && (!prev || prev.art !== s.art) ? Math.max(0, 1 - this.t / FADE) : 0;
      const fadeOut = this.leaving > 0 ? 1 - this.leaving / FADE : 0;
      const a = Math.max(fadeIn, fadeOut);
      if (a > 0) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, 480, 270); }
      return;
    }
    const cam = game.cam;
    if (s.spotlight && game.area?.boss) drawDarkness(g, cam, [{ x: game.area.boss.x, y: game.area.boss.y - 6, r: 64 }], 0.72 * this.bars);
    if (s.glow && game.player && cam) {
      const r = 18 + Math.min(1, this.t) * 26 + Math.sin(this.total * 6) * 3;
      g.fillStyle = `rgba(${s.glow},0.22)`; g.beginPath(); g.arc(game.player.x - cam.left, game.player.y - cam.top - 10, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(${s.glow},0.5)`; g.beginPath(); g.arc(game.player.x - cam.left, game.player.y - cam.top - 18, 4 + Math.sin(this.total * 9), 0, Math.PI * 2); g.fill();
    }
    if (s.gloam) {
      g.fillStyle = 'rgba(24,6,36,0.55)'; g.fillRect(0, 0, 480, 270);
      tendrils(g, this.total, 0.45, 0.9);
      eyes(g, 240, 70, Math.min(1, this.t * 2), 1.6, 0.55);
    }
    if (s.spirit && s.focus && cam) {
      if (!s.gloam) { g.fillStyle = `rgba(8,4,10,${0.45 * this.spiritA})`; g.fillRect(0, 0, 480, 270); }
      drawSpirit(g, s.spirit, s.focus.x - cam.left, s.focus.y - cam.top - 14, this.total, this.spiritA);
    }
  }

  // UI layer: bars, title cards and text.
  draw(u, game) {
    const s = this.shot;
    if (this.letterbox) {
      const bh = 34 * this.bars;
      u.fillStyle = '#000'; u.fillRect(0, 0, 480, bh); u.fillRect(0, 270 - bh, 480, bh);
    }
    if (!s) return;
    const shown = s.text ? s.text.slice(0, Math.floor(this.chars)) : '';
    if (s.title) {
      const a = Math.min(1, this.t / 0.8);
      u.globalAlpha = a;
      const big = !this.letterbox;
      text(u, s.title, 240, big ? 128 : 66, { size: big ? 36 : 22, align: 'center', family: SERIF, color: big ? '#f4dcb0' : s.color || UI.text });
      if (s.sub) text(u, s.sub, 240, big ? 146 : 79, { size: big ? 8 : 7, align: 'center', color: UI.dim });
      u.globalAlpha = 1;
    }
    if (shown) {
      const size = s.small ? 6.5 : 8;
      const lines = wrap(u, s.text, s.speaker ? 400 : 420, size);
      // Reveal characters into the final line layout so words never jump between lines.
      let left = shown.length;
      const shownLines = [];
      for (const l of lines) { if (left <= 0) break; shownLines.push(l.slice(0, left)); left -= l.length + 1; }
      const lh = size + 3.5;
      const top = 270 - (this.letterbox ? 10 : 18) - lines.length * lh;
      if (!this.letterbox) {
        const grd = u.createLinearGradient(0, top - 26, 0, 270);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.35, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0.75)');
        u.fillStyle = grd; u.fillRect(0, top - 26, 480, 270 - top + 26);
      } else if (top < 270 - 34) {
        u.fillStyle = 'rgba(0,0,0,0.7)'; u.fillRect(0, top - 14, 480, 270 - 34 - top + 14);
      }
      if (s.speaker) text(u, s.speaker, 240, top - 4, { size: 7, bold: true, align: 'center', color: s.color || UI.gold });
      shownLines.forEach((l, k) => {
        const jx = s.shakeText ? (Math.random() - 0.5) * 0.8 : 0, jy = s.shakeText ? (Math.random() - 0.5) * 0.8 : 0;
        text(u, l, 240 + jx, top + 8 + k * lh + jy, { size, align: 'center', family: s.speaker ? undefined : SERIF, color: s.speaker ? UI.text : s.color || '#f4ead8' });
      });
      if (this.typed && s.wait && !this.autoplay && Math.floor(this.total * 3) % 2 === 0) text(u, '▾', 452, 262, { size: 8, color: UI.gold });
    }
    if (this.skipArm > 0) text(u, 'Press Esc again to skip', 472, 12, { size: 6.5, align: 'right', color: UI.gold });
    else if (this.total < 4) { u.globalAlpha = 0.6; text(u, this.hint, 472, 12, { size: 5.5, align: 'right', color: UI.dim }); u.globalAlpha = 1; }
  }
}
