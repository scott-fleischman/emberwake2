// UI layer helpers and components. Drawn on the crisp display canvas in 480x270 "game pixel" units.
import { UI } from './palette.js';
import { hot } from '../core/touch.js';

export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
export const SERIF = 'Georgia, "Palatino Linotype", "Times New Roman", serif';

export function setFont(u, size, bold = false, family = FONT) { u.font = `${bold ? 'bold ' : ''}${size}px ${family}`; }

export function text(u, s, x, y, o = {}) {
  setFont(u, o.size || 7, o.bold, o.family);
  u.textAlign = o.align || 'left';
  u.textBaseline = o.baseline || 'alphabetic';
  if (o.shadow !== false) { u.fillStyle = 'rgba(0,0,0,0.75)'; u.fillText(s, x + 0.6, y + 0.6); }
  u.fillStyle = o.color || UI.text;
  u.fillText(s, x, y);
}

export function wrap(u, s, maxW, size = 7, bold = false) {
  setFont(u, size, bold);
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (u.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

export function panel(u, x, y, w, h, o = {}) {
  const r = o.r ?? 4;
  u.beginPath();
  u.moveTo(x + r, y); u.lineTo(x + w - r, y); u.quadraticCurveTo(x + w, y, x + w, y + r);
  u.lineTo(x + w, y + h - r); u.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  u.lineTo(x + r, y + h); u.quadraticCurveTo(x, y + h, x, y + h - r);
  u.lineTo(x, y + r); u.quadraticCurveTo(x, y, x + r, y); u.closePath();
  u.fillStyle = o.fill || UI.panel; u.fill();
  u.strokeStyle = o.edge || UI.panelEdge; u.lineWidth = o.lw || 1; u.stroke();
}

// ---------------------------------------------------------------- dialog
export class Dialog {
  // pages: [{speaker, text, options:[{label, onSelect}]}]
  constructor(pages, opts = {}) {
    this.pages = pages.filter(Boolean);
    this.i = 0; this.chars = 0; this.sel = 0; this.blip = 0;
    this.onClose = opts.onClose || null;
    this.done = false;
    this.blocking = true;
  }
  get page() { return this.pages[this.i]; }
  update(dt, game) {
    const page = this.page;
    if (!page) { this.close(game); return; }
    const input = game.input;
    const full = page.text.length;
    if (this.chars < full) {
      const before = Math.floor(this.chars);
      this.chars = Math.min(full, this.chars + dt * 70);
      if (Math.floor(this.chars / 3) > Math.floor(before / 3)) game.audio.sfx('talk');
      if (input.pressed('confirm')) this.chars = full;
      return;
    }
    const opts = page.options;
    if (opts && opts.length) {
      if (input.pressed('up')) { this.sel = (this.sel + opts.length - 1) % opts.length; game.audio.sfx('menu'); }
      if (input.pressed('down')) { this.sel = (this.sel + 1) % opts.length; game.audio.sfx('menu'); }
      if (input.pressed('confirm')) {
        game.audio.sfx('select');
        const o = opts[this.sel];
        const res = o.onSelect ? o.onSelect() : null;
        if (res && res.pages) { this.pages = res.pages; this.i = 0; this.chars = 0; this.sel = 0; return; }
        if (res === 'stay') { this.chars = 0; return; }
        this.close(game);
      } else if (input.pressed('cancel')) { this.close(game); }
      return;
    }
    if (input.pressed('confirm') || input.pressed('cancel')) {
      this.i++; this.chars = 0; this.sel = 0;
      if (this.i >= this.pages.length) this.close(game);
    }
  }
  close(game) {
    if (this.done) return;
    this.done = true;
    if (this.onClose) this.onClose(game);
  }
  draw(u, game) {
    const page = this.page;
    if (!page) return;
    const x = 24, y = 188, w = 432, h = 74;
    hot(0, 0, 480, 270, 'Enter'); // tap anywhere to read on
    panel(u, x, y, w, h);
    if (page.speaker) {
      setFont(u, 7, true);
      const sw = u.measureText(page.speaker).width + 12;
      panel(u, x + 8, y - 9, sw, 13, { fill: '#3a2a20', r: 3 });
      text(u, page.speaker, x + 14, y, { size: 7, bold: true, color: UI.gold });
    }
    const opts = page.options || [];
    const textW = opts.length ? w - 150 : w - 20;
    const lines = wrap(u, page.text.slice(0, Math.floor(this.chars)), textW, 7.5);
    lines.slice(0, 6).forEach((l, k) => text(u, l, x + 10, y + 16 + k * 10, { size: 7.5 }));
    if (this.chars >= page.text.length) {
      if (opts.length) {
        const ox = x + w - 136;
        opts.forEach((o, k) => {
          const sel = k === this.sel;
          if (sel) { u.fillStyle = 'rgba(240,200,80,0.18)'; u.fillRect(ox - 4, y + 7 + k * 11, 132, 11); }
          hot(ox - 4, y + 7 + k * 11, 132, 11, () => { this.sel = k; return 'Enter'; });
          text(u, (sel ? '▸ ' : '  ') + o.label, ox, y + 16 + k * 11, { size: 7, color: o.disabled ? UI.dim : sel ? UI.gold : UI.text });
        });
      } else if (Math.floor(game.time * 3) % 2 === 0) text(u, '▾', x + w - 12, y + h - 6, { size: 8, color: UI.gold });
    }
  }
}

// ---------------------------------------------------------------- menu
export class Menu {
  // items: [{label, value?:()=>string, detail?:string|fn, onSelect?, onLeft?, onRight?, disabled?:()=>bool}]
  constructor(title, items, opts = {}) {
    this.title = title; this.items = items; this.sel = 0;
    this.lines = opts.lines || null;
    this.width = opts.width || 240;
    this.onCancel = opts.onCancel || null;
    this.footer = opts.footer || null;
    this.done = false;
    this.blocking = true;
    this.skipFirst = true;
  }
  update(dt, game) {
    const input = game.input;
    if (this.skipFirst) { this.skipFirst = false; return; }
    const n = this.items.length;
    if (n) {
      if (input.pressed('up')) { this.sel = (this.sel + n - 1) % n; game.audio.sfx('menu'); }
      if (input.pressed('down')) { this.sel = (this.sel + 1) % n; game.audio.sfx('menu'); }
      const it = this.items[this.sel];
      if (input.pressed('left') && it.onLeft) { it.onLeft(); game.audio.sfx('menu'); }
      if (input.pressed('right') && it.onRight) { it.onRight(); game.audio.sfx('menu'); }
      if ((input.keyPressed('Enter') || input.keyPressed('KeyE') || input.keyPressed('KeyJ') || input.keyPressed('KeyZ') || input.keyPressed('Space')) && it.onSelect) {
        if (it.disabled && it.disabled()) { game.audio.sfx('deny'); return; }
        game.audio.sfx('select');
        it.onSelect();
        return;
      }
    }
    if (input.keyPressed('Escape') || input.keyPressed('Backspace') || input.keyPressed('KeyX') || input.keyPressed('KeyK') || (!n && input.pressed('confirm'))) {
      game.audio.sfx('menu');
      this.done = true;
      if (this.onCancel) this.onCancel();
    }
  }
  draw(u) {
    const lineH = 11;
    const extra = this.lines ? this.lines.length * 9 + 6 : 0;
    const h = 34 + this.items.length * lineH + extra;
    const w = this.width, x = (480 - w) / 2, y = Math.max(8, (270 - h) / 2);
    u.fillStyle = 'rgba(0,0,0,0.35)'; u.fillRect(0, 0, 480, 270);
    if (!this.items.length) hot(0, 0, 480, 270, 'Enter');
    panel(u, x, y, w, h);
    text(u, this.title, x + w / 2, y + 15, { size: 9, bold: true, align: 'center', color: UI.gold, family: SERIF });
    let cy = y + 28;
    if (this.lines) {
      for (const l of this.lines) { text(u, l.text ?? l, x + 12, cy, { size: 6.5, color: l.color || UI.text }); cy += 9; }
      cy += 6;
    }
    this.items.forEach((it, k) => {
      const sel = k === this.sel;
      const dis = it.disabled && it.disabled();
      if (sel) { u.fillStyle = 'rgba(240,200,80,0.16)'; u.fillRect(x + 6, cy - 8, w - 12, lineH); }
      // A tap selects and confirms; on a ◂▸ setting, its left and right thirds step the value.
      const third = (w - 12) / 3;
      if (it.onLeft || it.onRight) {
        hot(x + 6, cy - 8, third, lineH, () => { this.sel = k; return it.onLeft ? 'ArrowLeft' : 'Enter'; });
        hot(x + 6 + third * 2, cy - 8, third, lineH, () => { this.sel = k; return it.onRight ? 'ArrowRight' : 'Enter'; });
        hot(x + 6 + third, cy - 8, third, lineH, () => { this.sel = k; return 'Enter'; });
      } else hot(x + 6, cy - 8, w - 12, lineH, () => { this.sel = k; return 'Enter'; });
      text(u, (sel ? '▸ ' : '   ') + it.label, x + 10, cy, { size: 7, color: dis ? UI.dim : sel ? UI.gold : UI.text });
      const v = typeof it.value === 'function' ? it.value() : it.value;
      if (v !== undefined) text(u, v, x + w - 12, cy, { size: 7, align: 'right', color: dis ? UI.dim : UI.text });
      cy += lineH;
    });
    const it = this.items[this.sel];
    const detail = it && (typeof it.detail === 'function' ? it.detail() : it.detail);
    const footer = typeof this.footer === 'function' ? this.footer() : this.footer;
    if (detail || footer) text(u, detail || footer, x + w / 2, y + h - 6, { size: 6, align: 'center', color: UI.dim });
  }
}
