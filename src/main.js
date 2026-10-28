// App shell: canvases, scaling, main loop, scene switching, options.
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audio.js';
import { SaveStore, DIFFICULTY } from './game/state.js';
import { clampDt } from './game/physics.js';
import { VIEW_W, VIEW_H } from './gfx/render.js';
import { Menu, text } from './gfx/ui.js';
import { TitleScene } from './scenes/title.js';
import { GameScene } from './scenes/game.js';
import { ArenaScene } from './scenes/arena.js';
import { ViewerScene } from './scenes/viewer.js';
import { IntroScene } from './scenes/intro.js';
import { TheaterScene } from './scenes/theater.js';
import { AutoplayScene } from './scenes/autoplay.js';
import { TouchControls, HOT } from './core/touch.js';

function safeStorage() {
  try { const s = window.localStorage; s.getItem('probe'); return s; } catch { return undefined; }
}

class App {
  constructor() {
    this.display = document.getElementById('game');
    this.dctx = this.display.getContext('2d');
    this.world = document.createElement('canvas');
    this.world.width = VIEW_W; this.world.height = VIEW_H;
    this.g = this.world.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.input = new Input(window);
    this.audio = new AudioEngine();
    this.input.onKey(() => this.audio.init());
    window.addEventListener('pointerdown', () => this.audio.init());
    this.touch = new TouchControls(this);
    this.touch.attach(this.display);
    this.store = new SaveStore(safeStorage());
    this.options = this.store.loadOptions();
    this.applyOptions();
    this.facade = { input: this.input, audio: this.audio, get time() { return performance.now() / 1000; } };
    this.error = null;
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
    this.scene = new TitleScene(this);
    this.last = performance.now();
    document.getElementById('loading')?.remove();
    requestAnimationFrame((t) => this.frame(t));
    window.emberwake = this; // handy for debugging in the console
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    let scale = Math.min(w / VIEW_W, h / VIEW_H);
    if (scale >= 2) scale = Math.floor(scale * dpr) / dpr;
    this.scale = scale;
    this.display.width = Math.floor(w * dpr);
    this.display.height = Math.floor(h * dpr);
    this.display.style.width = w + 'px';
    this.display.style.height = h + 'px';
    this.dpr = dpr;
    this.ox = Math.floor((w - VIEW_W * scale) / 2);
    this.oy = Math.floor((h - VIEW_H * scale) / 2);
    // Phone held upright: the view sits at the top, leaving the bottom for thumbs.
    if (this.touch) {
      this.touch.readSafeArea();
      if (h > w && (this.touch.active || this.scene?.touchButtons)) this.oy = Math.floor(this.touch.safe.t + 8);
    }
  }

  frame(t) {
    const dt = clampDt((t - this.last) / 1000);
    this.last = t;
    try {
      if (!this.error) this.scene.update(dt);
      this.audio.update?.(dt);
      this.render();
    } catch (e) {
      console.error(e);
      this.error = e;
      this.renderError();
    }
    this.touch.endFrame(dt);
    this.input.endFrame();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  render() {
    const d = this.dctx, s = this.scale * this.dpr, ox = this.ox * this.dpr, oy = this.oy * this.dpr;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.fillStyle = '#000';
    d.fillRect(0, 0, this.display.width, this.display.height);
    // Pixel layer: drawn at 480x270, then scaled up without smoothing.
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.scene.drawWorld(this.g);
    d.imageSmoothingEnabled = false;
    d.drawImage(this.world, ox, oy, VIEW_W * s, VIEW_H * s);
    // UI layer: same 480x270 units, rendered at display resolution so text stays crisp.
    d.setTransform(s, 0, 0, s, ox, oy);
    d.imageSmoothingEnabled = false;
    HOT.length = 0;
    this.scene.drawUI(d);
    this.touch.draw(d);
  }

  renderError() {
    const d = this.dctx;
    d.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.ox * this.dpr, this.oy * this.dpr);
    d.fillStyle = 'rgba(30,0,0,0.85)'; d.fillRect(40, 90, 400, 80);
    text(d, 'Something went wrong. Your last save is safe.', 240, 115, { size: 9, align: 'center' });
    text(d, String(this.error && this.error.message).slice(0, 90), 240, 132, { size: 6, align: 'center', color: '#f0b0a0' });
    text(d, 'Press Esc to return to the title screen.', 240, 150, { size: 7, align: 'center', color: '#f0c850' });
    HOT.length = 0; HOT.push({ x: 0, y: 0, w: 480, h: 270, act: 'Escape' });
    text(d, '(or tap anywhere)', 240, 160, { size: 6, align: 'center', color: '#c0a080' });
    if (this.input.keyPressed('Escape')) { this.error = null; this.toTitle(); }
  }

  applyOptions() {
    this.audio.setMusicVolume(this.options.music);
    this.audio.setSfxVolume(this.options.sfx);
  }

  optionsMenu() {
    const o = this.options;
    const save = () => { this.applyOptions(); this.store.saveOptions(o); };
    const diffs = Object.keys(DIFFICULTY);
    const step = (k, dlt) => { o[k] = Math.round(Math.max(0, Math.min(1, o[k] + dlt)) * 10) / 10; save(); };
    return new Menu('Options', [
      { label: 'Music volume', value: () => `${Math.round(o.music * 100)}%  ◂▸`, onLeft: () => step('music', -0.1), onRight: () => step('music', 0.1) },
      { label: 'Effects volume', value: () => `${Math.round(o.sfx * 100)}%  ◂▸`, onLeft: () => { step('sfx', -0.1); this.audio.sfx('hit'); }, onRight: () => { step('sfx', 0.1); this.audio.sfx('hit'); } },
      {
        label: 'Difficulty', value: () => `${DIFFICULTY[o.difficulty].label}  ◂▸`,
        detail: () => `Damage taken ×${DIFFICULTY[o.difficulty].damageTaken}, enemy health ×${DIFFICULTY[o.difficulty].enemyHp}`,
        onLeft: () => { o.difficulty = diffs[(diffs.indexOf(o.difficulty) + diffs.length - 1) % diffs.length]; save(); },
        onRight: () => { o.difficulty = diffs[(diffs.indexOf(o.difficulty) + 1) % diffs.length]; save(); },
      },
      { label: 'Screen shake', value: () => (o.screenShake ? 'On' : 'Off'), onSelect: () => { o.screenShake = !o.screenShake; save(); }, onLeft: () => { o.screenShake = !o.screenShake; save(); }, onRight: () => { o.screenShake = !o.screenShake; save(); } },
    ], { width: 230, footer: '←→ adjust · Esc back' });
  }

  toTitle() { this.scene = new TitleScene(this); }
  startIntro(state) { this.scene = new IntroScene(this, state); }
  startGame(state) {
    this.scene = new GameScene(this, state);
    this.scene.saveGame(true);
  }
  continueGame() {
    const st = this.store.load();
    if (!st) { this.scene = new TitleScene(this); return; }
    this.scene = new GameScene(this, st);
    this.scene.toast('Welcome back.');
  }
  startArena() { this.scene = new ArenaScene(this); }
  startTheater() { this.scene = new TheaterScene(this); }
  startAutoplay(opts) { this.scene = new AutoplayScene(this, opts); }
  startViewer() { this.scene = new ViewerScene(this); }
}

window.addEventListener('DOMContentLoaded', () => new App());
