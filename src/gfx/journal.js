// The lore journal: every standing stone, book and warden memory you have found.
import { LORE_ENTRIES } from '../data/story.js';
import { text, wrap, panel, SERIF } from './ui.js';
import { UI } from './palette.js';
import { hot } from '../core/touch.js';

const HINTS = {
  'Standing stone': 'Standing stones wait beside the old roads, carved with blue runes. Read one with E.',
  Book: 'Some bookshelves hold more than dust. Try the shelves in houses, shops and your own home.',
  'Warden\'s memory': 'Quiet a warden, and its spirit will tell you what it remembers.',
};

export class LoreJournal {
  constructor(game) {
    this.game = game;
    this.sel = 0;
    this.done = false;
    this.blocking = true;
    this.skip = true;
  }

  update(dt, game) {
    if (this.skip) { this.skip = false; return; }
    const input = game.input, n = LORE_ENTRIES.length;
    if (input.pressed('up')) { this.sel = (this.sel + n - 1) % n; game.audio.sfx('menu'); }
    if (input.pressed('down')) { this.sel = (this.sel + 1) % n; game.audio.sfx('menu'); }
    if (input.pressed('cancel') || input.pressed('pause') || input.pressed('inventory')) { this.done = true; game.audio.sfx('menu'); }
  }

  draw(u, game) {
    const found = game.state.progress.lore || [];
    u.fillStyle = 'rgba(0,0,0,0.45)'; u.fillRect(0, 0, 480, 270);
    const x = 18, y = 12, w = 444, h = 246;
    panel(u, x, y, w, h);
    text(u, 'Lore Journal', x + w / 2, y + 16, { size: 11, bold: true, align: 'center', family: SERIF, color: UI.gold });
    text(u, `${found.length} of ${LORE_ENTRIES.length} pages found`, x + w / 2, y + 27, { size: 6, align: 'center', color: UI.dim });
    u.fillStyle = 'rgba(200,160,96,0.35)'; u.fillRect(x + 168, y + 36, 1, h - 52);
    let kind = null;
    let ly = y + 42;
    LORE_ENTRIES.forEach((e, k) => {
      if (e.kind !== kind) { kind = e.kind; text(u, kind === 'Book' ? 'Books' : kind === 'Standing stone' ? 'Standing stones' : 'Warden memories', x + 10, ly, { size: 5.5, color: UI.dim, bold: true }); ly += 8; }
      const has = found.includes(e.id), sel = k === this.sel;
      if (sel) { u.fillStyle = 'rgba(240,200,80,0.16)'; u.fillRect(x + 6, ly - 7, 158, 9); }
      hot(x + 6, ly - 7, 158, 9, () => { this.sel = k; });
      text(u, `${sel ? '▸ ' : '  '}${has ? e.title : '· · ·'}`, x + 10, ly, { size: 6.5, color: sel ? UI.gold : has ? UI.text : UI.dim });
      ly += 9;
    });
    const e = LORE_ENTRIES[this.sel];
    const has = found.includes(e.id);
    const rx = x + 180, rw = w - 194;
    text(u, has ? e.title : 'Not yet found', rx, y + 52, { size: 10, family: SERIF, color: has ? '#f4dcb0' : UI.dim });
    text(u, e.kind, rx, y + 62, { size: 5.5, color: UI.dim });
    const body = has ? e.text : HINTS[e.kind];
    wrap(u, body, rw, 7.5).forEach((l, k) => text(u, l, rx, y + 80 + k * 11, { size: 7.5, family: has ? SERIF : undefined, color: has ? UI.text : UI.dim }));
    text(u, '↑↓ choose · Esc close', x + w / 2, y + h - 6, { size: 5.5, align: 'center', color: UI.dim });
  }
}
