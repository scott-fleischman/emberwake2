// Touch and mouse support (iPhone and iPad first).
//  - Widgets register tappable "hot" regions as they draw, in 480x270 UI units; a tap presses
//    the key they name (or runs their function), so menus, dialogs and cutscenes all just work.
//  - Scenes may offer a bar of buttons (touchButtons()), drawn at finger size in screen pixels.
//  - On a touch screen, play gets a floating stick (left) and action buttons (right).
import { FONT } from '../gfx/ui.js';

export const HOT = [];
export const TOUCH = { active: false }; // read by widgets that show touch-only hints
// act: a key code to tap, or a function that may return one.
export function hot(x, y, w, h, act) { HOT.push({ x, y, w, h, act }); }

const ACTIONS = [
  { id: 'attack', key: 'KeyJ', label: 'HIT', dx: 1.25, dy: 1.3, r: 1.3 },
  { id: 'item', key: 'KeyK', label: 'ITEM', dx: 3.85, dy: 0.95, r: 1 },
  { id: 'dodge', key: 'Space', label: 'ROLL', dx: 1.05, dy: 4.05, r: 0.9 },
  { id: 'shield', key: 'KeyL', label: 'GUARD', dx: 3.55, dy: 3.45, r: 0.9 },
  { id: 'use', key: 'KeyE', label: 'USE', dx: 6.1, dy: 1.15, r: 0.85 },
];
const SYSTEM = [['Menu', 'Escape'], ['Map', 'KeyM'], ['Bag', 'KeyI'], ['Swap', 'KeyQ'], ['Eat', 'KeyF'], ['Lock', 'KeyR']];
const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft'];

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.active = false;     // a finger has touched the screen (and no real key since)
    this.ptrs = new Map();   // pointerId -> {kind, key?, ...}
    this.stick = null;       // {id, cx, cy, x, y}
    this.dirs = new Set();
    this.taps = [];          // keys pressed by a tap, released after one frame
    this.lit = new Map();    // control id -> glow timer
    this.safe = { t: 0, r: 0, b: 0, l: 0 };
    this.mode = 'menu';
  }

  attach(el) {
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opt);
    el.addEventListener('pointermove', (e) => this.move(e), opt);
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (e) => this.up(e), opt);
    // No double-tap zoom, magnifier, callouts or pinch on the canvas.
    el.addEventListener('touchstart', (e) => e.preventDefault(), opt);
    el.addEventListener('touchend', (e) => { e.preventDefault(); this.app.audio.init(); }, opt);
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opt);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.app.input.onKey(() => { if (this.active) { this.active = TOUCH.active = false; this.releaseAll(); this.app.resize(); } });
    this.readSafeArea();
  }

  // The notch and home bar: env() only resolves inside real properties, so measure a probe's padding.
  readSafeArea() {
    if (typeof getComputedStyle !== 'function' || !document.body) return;
    if (!this.probe) {
      this.probe = document.createElement('div');
      this.probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(this.probe);
    }
    const cs = getComputedStyle(this.probe), v = (k) => parseFloat(cs[k]) || 0;
    this.safe = { t: v('paddingTop'), r: v('paddingRight'), b: v('paddingBottom'), l: v('paddingLeft') };
  }

  // ------------------------------------------------ pointers
  toUI(e) { const a = this.app; return { x: (e.clientX - a.ox) / a.scale, y: (e.clientY - a.oy) / a.scale }; }

  down(e) {
    e.preventDefault();
    this.app.audio.init();
    const touch = e.pointerType !== 'mouse';
    if (touch && !this.active) { this.active = TOUCH.active = true; this.app.resize(); }
    if (!touch && e.button !== 0) return;
    const px = e.clientX, py = e.clientY;
    const bar = this.barHit(px, py);
    if (bar) { this.tapAct(bar.act); this.lit.set(bar.id, 0.2); return; }
    if (touch && this.mode === 'play') {
      const c = this.controlAt(px, py);
      if (c) { this.ptrs.set(e.pointerId, { kind: 'btn', key: c.key, id: c.id }); this.app.input.press(c.key); this.lit.set(c.id, 1); return; }
      if (px < innerWidth * 0.5) {
        this.stick = { id: e.pointerId, cx: px, cy: py, x: px, y: py };
        this.ptrs.set(e.pointerId, { kind: 'stick' });
        return;
      }
    }
    if (touch && this.mode !== 'play' && this.mode !== 'menu') {
      const b = this.backRect();
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { this.tapAct(this.app.scene.touchBack || 'Escape'); this.lit.set('back', 0.2); return; }
    }
    const u = this.toUI(e);
    for (let k = HOT.length - 1; k >= 0; k--) {
      const h = HOT[k];
      if (u.x >= h.x && u.x <= h.x + h.w && u.y >= h.y && u.y <= h.y + h.h) { this.tapAct(h.act); return; }
    }
  }

  move(e) {
    if (!this.stick || this.stick.id !== e.pointerId) return;
    e.preventDefault();
    this.stick.x = e.clientX; this.stick.y = e.clientY;
    this.updateStick();
  }

  up(e) {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!p) return;
    if (p.kind === 'btn') { this.app.input.release(p.key); this.lit.set(p.id, 0.15); }
    if (p.kind === 'stick') { this.stick = null; this.updateStick(); }
  }

  tapAct(act) {
    const key = typeof act === 'function' ? act() : act;
    if (!key) return;
    this.app.input.press(key);
    this.taps.push(key);
  }

  updateStick() {
    const want = new Set();
    const s = this.stick;
    if (s) {
      const R = this.unit() * 1.6;
      let dx = s.x - s.cx, dy = s.y - s.cy;
      const d = Math.hypot(dx, dy);
      // The base follows a finger that drags past its rim, so the stick never "runs out".
      if (d > R) { s.cx += (dx / d) * (d - R); s.cy += (dy / d) * (d - R); dx = s.x - s.cx; dy = s.y - s.cy; }
      const nx = dx / R, ny = dy / R, m = Math.hypot(nx, ny);
      if (m > 0.28) {
        if (nx < -0.38) want.add('ArrowLeft');
        if (nx > 0.38) want.add('ArrowRight');
        if (ny < -0.38) want.add('ArrowUp');
        if (ny > 0.38) want.add('ArrowDown');
      }
      if (m > 0.95) want.add('ShiftLeft'); // push to the rim to sprint
    }
    for (const k of DIRS) {
      if (want.has(k) && !this.dirs.has(k)) this.app.input.press(k);
      if (!want.has(k) && this.dirs.has(k)) this.app.input.release(k);
    }
    this.dirs = want;
  }

  releaseAll() {
    for (const p of this.ptrs.values()) if (p.kind === 'btn') this.app.input.release(p.key);
    this.ptrs.clear();
    this.stick = null;
    this.updateStick();
  }

  // Called after the scene has seen this frame's input.
  endFrame(dt) {
    for (const k of this.taps) this.app.input.release(k);
    this.taps.length = 0;
    for (const [k, t] of this.lit) { if (t - dt <= 0) this.lit.delete(k); else this.lit.set(k, t - dt); }
    const mode = this.app.scene.touchMode ? this.app.scene.touchMode() : 'menu';
    if (mode !== this.mode) { if (this.mode === 'play') this.releaseAll(); this.mode = mode; }
  }

  // ------------------------------------------------ layout (CSS pixels)
  unit() { return Math.max(20, Math.min(32, Math.min(innerWidth, innerHeight) * 0.07)); }
  gameRect() { const a = this.app; return { x: a.ox, y: a.oy, w: 480 * a.scale, h: 270 * a.scale }; }
  portrait() { return innerHeight > innerWidth; }

  controls() {
    const U = this.unit(), s = this.safe;
    const bx = innerWidth - s.r - 12, by = innerHeight - s.b - 12;
    const acts = ACTIONS.map((a) => ({ ...a, x: bx - a.dx * U, y: by - a.dy * U, r: a.r * U }));
    const g = this.gameRect(), pw = Math.max(44, U * 1.7), ph = Math.max(28, U * 1.05);
    let sys;
    if (this.portrait()) {
      const y = Math.min(g.y + g.h + 10, innerHeight - s.b - U * 9);
      sys = SYSTEM.map(([label, key], k) => ({ id: label, label, key, x: s.l + 10 + k * (pw + 6), y, w: pw, h: ph }));
    } else {
      const x = Math.max(s.l + 6, Math.min(g.x - pw - 6, s.l + 6)), y0 = innerHeight * 0.2;
      sys = SYSTEM.map(([label, key], k) => ({ id: label, label, key, x, y: y0 + k * (ph + 6), w: pw, h: ph }));
    }
    return { acts, sys };
  }

  controlAt(px, py) {
    const { acts, sys } = this.controls();
    for (const b of sys) if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    let best = null, bd = Infinity;
    for (const a of acts) { const d = Math.hypot(px - a.x, py - a.y); if (d < a.r * 1.25 && d < bd) { bd = d; best = a; } }
    return best;
  }

  backRect() { const s = this.safe; return { x: s.l + 10, y: s.t + 10, w: 64, h: 32 }; }

  // Scene buttons, laid out in a centered row: under the game in portrait, else at the scene's edge.
  bar() {
    const sc = this.app.scene;
    const items = sc.touchButtons ? sc.touchButtons() : null;
    if (!items || !items.length) return null;
    const g = this.gameRect(), s = this.safe;
    const h = 36, gap = 6, font = 13;
    const widths = items.map((b) => Math.max(h, measure(b.label, font) + 22));
    const total = widths.reduce((a, w) => a + w, 0) + gap * (items.length - 1);
    const rows = total > innerWidth - s.l - s.r - 16 ? 2 : 1;
    const per = Math.ceil(items.length / rows);
    const out = [];
    let y;
    if (this.portrait() && innerHeight - (g.y + g.h) > 60 + rows * (h + gap)) y = g.y + g.h + 12;
    else y = sc.touchBarAt === 'top' ? s.t + 6 : innerHeight - s.b - 6 - rows * (h + gap);
    for (let r = 0; r < rows; r++) {
      const row = items.slice(r * per, (r + 1) * per), ws = widths.slice(r * per, (r + 1) * per);
      const rw = ws.reduce((a, w) => a + w, 0) + gap * (row.length - 1);
      let x = sc.touchBarAlign === 'right' && !this.portrait() ? innerWidth - s.r - 10 - rw : (innerWidth - rw) / 2;
      row.forEach((b, k) => { out.push({ ...b, id: `bar:${b.label}`, x, y: y + r * (h + gap), w: ws[k], h, font }); x += ws[k] + gap; });
    }
    return out;
  }

  barHit(px, py) {
    const bar = this.bar();
    return bar && bar.find((b) => !b.disabled && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
  }

  // ------------------------------------------------ drawing (on the display canvas)
  draw(d) {
    const dpr = this.app.dpr;
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bar = this.bar();
    if (bar) for (const b of bar) pill(d, b.x, b.y, b.w, b.h, b.label, { font: b.font, on: b.on || this.lit.has(b.id), dim: b.disabled });
    if (!this.active) return;
    if (this.mode === 'play') {
      const { acts, sys } = this.controls();
      for (const b of sys) pill(d, b.x, b.y, b.w, b.h, b.label, { font: 11, on: this.held(b.key) });
      for (const a of acts) {
        const on = this.held(a.key);
        d.fillStyle = on ? 'rgba(240,200,110,0.55)' : 'rgba(16,12,22,0.42)';
        d.beginPath(); d.arc(a.x, a.y, a.r, 0, Math.PI * 2); d.fill();
        d.strokeStyle = on ? 'rgba(255,230,160,0.95)' : 'rgba(240,210,150,0.55)'; d.lineWidth = 2; d.stroke();
        label(d, a.label, a.x, a.y, Math.round(a.r * 0.42), on ? '#1a1208' : 'rgba(255,240,210,0.9)');
      }
      const U = this.unit(), s = this.stick;
      const cx = s ? s.cx : this.safe.l + U * 3.2, cy = s ? s.cy : innerHeight - this.safe.b - U * 3.4;
      d.fillStyle = 'rgba(16,12,22,0.32)'; d.beginPath(); d.arc(cx, cy, U * 1.6, 0, Math.PI * 2); d.fill();
      d.strokeStyle = 'rgba(240,210,150,0.4)'; d.lineWidth = 2; d.stroke();
      const kx = s ? s.x : cx, ky = s ? s.y : cy;
      d.fillStyle = s ? 'rgba(240,200,110,0.7)' : 'rgba(240,210,150,0.3)'; d.beginPath(); d.arc(kx, ky, U * 0.7, 0, Math.PI * 2); d.fill();
    } else if (this.mode !== 'menu') {
      const b = this.backRect();
      pill(d, b.x, b.y, b.w, b.h, '‹ Back', { font: 12, on: this.lit.has('back') });
    }
  }

  held(key) { return this.app.input.down.has(key); }
}

function measure(s, size) {
  const c = measure.ctx || (measure.ctx = document.createElement('canvas').getContext('2d'));
  c.font = `bold ${size}px ${FONT}`;
  return c.measureText(s).width;
}

function label(d, s, x, y, size, color) {
  d.font = `bold ${size}px ${FONT}`; d.textAlign = 'center'; d.textBaseline = 'middle';
  d.fillStyle = color; d.fillText(s, x, y + 0.5);
}

function pill(d, x, y, w, h, s, o = {}) {
  const r = Math.min(h / 2, 10);
  d.beginPath();
  d.moveTo(x + r, y); d.arcTo(x + w, y, x + w, y + h, r); d.arcTo(x + w, y + h, x, y + h, r); d.arcTo(x, y + h, x, y, r); d.arcTo(x, y, x + w, y, r); d.closePath();
  d.fillStyle = o.on ? 'rgba(240,200,110,0.85)' : 'rgba(16,12,22,0.62)'; d.fill();
  d.strokeStyle = o.dim ? 'rgba(160,150,140,0.35)' : 'rgba(240,210,150,0.65)'; d.lineWidth = 1.5; d.stroke();
  label(d, s, x + w / 2, y + h / 2, o.font || 12, o.on ? '#1a1208' : o.dim ? 'rgba(200,190,180,0.5)' : '#f4ead8');
}
