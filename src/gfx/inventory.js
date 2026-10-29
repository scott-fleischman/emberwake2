// Item subscreen: pick which item the use-item button fires, swap weapons, review key items.
import { USE_ITEMS, WEAPONS, SHIELDS, ARTIFACTS } from '../data/items.js';
import { UI } from './palette.js';
import { panel, text, wrap, SERIF } from './ui.js';
import { itemIcon } from './hud.js';
import { hot } from '../core/touch.js';

// Grid order. Unowned items still get a slot so players can see what is left to find.
export const ITEM_SLOTS = ['bow', 'knives', 'firebolt', 'bombs'];

const ITEM_TEXT = {
  bow: { desc: 'Looses arrows that strike from afar. 2 damage per arrow.', hint: 'Rangers start with one; others may find a Hunter\'s Bow in a cave chest.' },
  knives: { desc: 'Quick, light throws for harrying skirmishers. 1 damage each.', hint: 'A rogue\'s tool, carried from the start.' },
  firebolt: { desc: 'A bolt of ember-fire. 3 damage, costs mana.', hint: 'Mages know it; an Ember Tome hidden in a cave could teach anyone.' },
  bombs: { desc: 'Throw, then step clear. Shatters cracked rock and scatters crowds.', hint: 'The village smith could pack powder... given enough heat.' },
};

const WEAPON_TEXT = {
  sword: 'Balanced and steady. Wide arc.',
  steelsword: 'A finer blade. Hits harder than iron.',
  staff: 'Slow, heavy swings that knock foes far back.',
  dagger: 'Short reach, quick jabs.',
  twinblades: 'Lightning-fast strikes with a chance to crit.',
};

export function ownedItems(state) {
  return ITEM_SLOTS.filter((id) => state.gear.items.includes(id));
}

// Equip a use-item for the item button. Returns false if the item isn't owned.
export function equipItem(state, id) {
  const i = state.gear.items.indexOf(id);
  if (i < 0) return false;
  state.gear.selected = i;
  return true;
}

function weaponIcon(u, id, x, y, s = 1) {
  u.save(); u.translate(x, y); u.scale(s, s); u.rotate(-Math.PI / 4);
  const steel = id === 'steelsword' ? '#cfe4fa' : '#d8dce4';
  switch (id) {
    case 'staff': u.fillStyle = '#8a5a2a'; u.fillRect(-1, -7, 2, 14); u.fillStyle = '#b080e0'; u.beginPath(); u.arc(0, -7, 2.4, 0, Math.PI * 2); u.fill(); break;
    case 'dagger': u.fillStyle = steel; u.fillRect(-1, -6, 2, 7); u.fillStyle = '#c8a050'; u.fillRect(-2.5, 1, 5, 1.2); u.fillStyle = '#5a3a20'; u.fillRect(-0.8, 2.2, 1.6, 3); break;
    case 'twinblades':
      for (const off of [-2.5, 2.5]) { u.fillStyle = steel; u.fillRect(off - 0.8, -5, 1.6, 6); u.fillStyle = '#5a3a20'; u.fillRect(off - 0.8, 1.5, 1.6, 2.5); }
      break;
    default: u.fillStyle = steel; u.fillRect(-1, -8, 2, 10); u.fillStyle = '#ffffff'; u.fillRect(-1, -8, 0.8, 10); u.fillStyle = '#c8a050'; u.fillRect(-3.5, 2, 7, 1.4); u.fillStyle = '#5a3a20'; u.fillRect(-0.8, 3.4, 1.6, 3.5);
  }
  u.restore();
}

function artifactIcon(u, id, x, y) {
  u.save(); u.translate(x, y);
  switch (id) {
    case 'verdantSigil': u.fillStyle = '#5ab04a'; u.beginPath(); u.ellipse(0, 0, 3, 5, 0.6, 0, Math.PI * 2); u.fill(); u.strokeStyle = '#2e6b2e'; u.lineWidth = 0.6; u.beginPath(); u.moveTo(-2, 3); u.lineTo(2, -3); u.stroke(); break;
    case 'satchel': u.fillStyle = '#8a5a2a'; u.fillRect(-4, -2, 8, 6); u.fillStyle = '#6a4220'; u.fillRect(-4, -3, 8, 2); u.fillStyle = '#24242c'; u.beginPath(); u.arc(1.5, 1, 1.8, 0, Math.PI * 2); u.fill(); break;
    case 'gloves': u.fillStyle = '#c8a050'; u.fillRect(-3.5, -1, 7, 5); u.fillRect(-3.5, -4, 1.6, 3); u.fillRect(-1.5, -4.5, 1.6, 3.5); u.fillRect(0.5, -4.5, 1.6, 3.5); u.fillRect(2.4, -4, 1.4, 3); u.fillStyle = '#8a6a30'; u.fillRect(-3.5, 3, 7, 1.2); break;
    case 'charm': u.strokeStyle = '#c8a050'; u.lineWidth = 0.6; u.beginPath(); u.arc(0, -3, 2.2, Math.PI, 0); u.stroke(); u.fillStyle = '#a8e4ff'; u.beginPath(); u.moveTo(0, -3); u.lineTo(3, 1); u.lineTo(0, 5); u.lineTo(-3, 1); u.closePath(); u.fill(); u.fillStyle = '#ffffff'; u.fillRect(-1, -1, 1, 3); break;
    default: u.fillStyle = '#f0c850'; u.fillRect(-2, -2, 4, 4);
  }
  u.restore();
}

function shieldIcon(u, id, x, y) {
  const kite = id === 'kite';
  u.fillStyle = '#7a5a3a'; u.beginPath();
  if (kite) { u.moveTo(x - 4, y - 5); u.lineTo(x + 4, y - 5); u.lineTo(x + 4, y + 1); u.lineTo(x, y + 6); u.lineTo(x - 4, y + 1); } else u.arc(x, y, 4.5, 0, Math.PI * 2);
  u.closePath(); u.fill();
  u.fillStyle = kite ? '#3a68b0' : '#a8acb4'; u.beginPath(); u.arc(x, y - (kite ? 1 : 0), 2.6, 0, Math.PI * 2); u.fill();
  u.fillStyle = '#f0c850'; u.fillRect(x - 0.8, y - 0.8 - (kite ? 1 : 0), 1.6, 1.6);
}

export class ItemMenu {
  constructor(game) {
    this.game = game;
    this.done = false;
    this.blocking = true;
    this.skip = true;
    this.row = 0;
    const s = game.state;
    const current = s.gear.items[s.gear.selected];
    this.col = Math.max(0, ITEM_SLOTS.indexOf(current));
    this.wcol = Math.max(0, s.gear.owned.indexOf(s.gear.weapon));
  }

  update(dt, game) {
    if (this.skip) { this.skip = false; return; }
    const input = game.input, s = game.state;
    if (input.pressed('inventory') || input.keyPressed('Escape') || input.keyPressed('Enter') || input.keyPressed('Backspace')) {
      this.done = true;
      game.audio.sfx('select');
      return;
    }
    const dx = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
    const dy = (input.pressed('down') ? 1 : 0) - (input.pressed('up') ? 1 : 0);
    if (dy && s.gear.owned.length > 1) { this.row = (this.row + 2 + dy) % 2; game.audio.sfx('menu'); }
    if (!dx) return;
    if (this.row === 0) {
      // Step to the next owned item, skipping empty slots, and equip it straight away.
      const owned = ownedItems(s);
      if (!owned.length) { game.audio.sfx('deny'); return; }
      for (let k = 1; k <= ITEM_SLOTS.length; k++) {
        const c = (this.col + dx * k + ITEM_SLOTS.length * 4) % ITEM_SLOTS.length;
        if (owned.includes(ITEM_SLOTS[c])) { this.col = c; equipItem(s, ITEM_SLOTS[c]); break; }
      }
      game.audio.sfx('menu');
    } else {
      const owned = s.gear.owned;
      this.wcol = (this.wcol + dx + owned.length) % owned.length;
      s.gear.weapon = owned[this.wcol];
      game.audio.sfx('menu');
    }
  }

  draw(u, game) {
    const s = game.state, p = s.player, d = game.derived;
    const t = game.time;
    u.fillStyle = 'rgba(6,4,10,0.6)'; u.fillRect(0, 0, 480, 270);
    const X = 40, Y = 28, Wd = 400, H = 214;
    panel(u, X, Y, Wd, H);
    text(u, 'Items', X + 14, Y + 17, { size: 11, bold: true, family: SERIF, color: UI.gold });
    text(u, 'K uses the highlighted item', X + 62, Y + 16, { size: 6, color: UI.dim });

    // ---- use items grid
    const slot = 34, gap = 8, gx = X + 14, gy = Y + 28;
    ITEM_SLOTS.forEach((id, k) => {
      const x = gx + k * (slot + gap), y = gy;
      const owned = s.gear.items.includes(id);
      const sel = this.row === 0 && k === this.col;
      const equipped = owned && s.gear.items[s.gear.selected] === id;
      if (owned) hot(x, y, slot, slot, () => { this.row = 0; this.col = k; equipItem(s, id); game.audio.sfx('menu'); });
      u.fillStyle = owned ? 'rgba(50,36,30,0.95)' : 'rgba(30,26,36,0.9)';
      u.fillRect(x, y, slot, slot);
      u.strokeStyle = sel ? UI.gold : '#5a4a3a'; u.lineWidth = sel ? 1.4 : 0.7;
      u.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1);
      if (sel) { u.strokeStyle = `rgba(255,214,58,${0.35 + 0.3 * Math.sin(t * 6)})`; u.lineWidth = 2.5; u.strokeRect(x - 1.5, y - 1.5, slot + 3, slot + 3); }
      if (owned) {
        u.save(); u.translate(x + slot / 2, y + slot / 2 - 2); u.scale(2, 2); itemIcon(u, id, 0, 0); u.restore();
        const it = USE_ITEMS[id];
        const count = it.mana ? `${id === 'firebolt' ? d.fireboltCost : it.mana}✦` : `${p[it.ammo]}`;
        text(u, count, x + slot - 3, y + slot - 3, { size: 6, align: 'right', bold: true, color: !it.mana && p[it.ammo] === 0 ? UI.danger : UI.text });
        if (equipped) text(u, 'K', x + 3, y + 8, { size: 5.5, bold: true, color: UI.gold });
      } else {
        text(u, '?', x + slot / 2, y + slot / 2 + 4, { size: 12, align: 'center', color: 'rgba(160,150,180,0.35)', family: SERIF });
      }
    });

    // ---- description of the highlighted entry
    const dy = gy + slot + 14;
    if (this.row === 0) {
      const id = ITEM_SLOTS[this.col];
      const owned = s.gear.items.includes(id);
      const it = USE_ITEMS[id];
      text(u, owned ? it.name : 'Not yet found', gx, dy, { size: 8, bold: true, color: owned ? '#ffe48a' : UI.dim });
      const body = owned ? ITEM_TEXT[id].desc + (it.ammo ? `  Carrying ${p[it.ammo]} / ${it.ammo === 'arrows' ? d.maxArrows : it.ammo === 'knives' ? d.maxKnives : d.maxBombs}.` : `  Mana ${Math.floor(p.mana)} / ${d.maxMana}.`) : ITEM_TEXT[id].hint;
      wrap(u, body, 160, 6).forEach((l, k) => text(u, l, gx, dy + 10 + k * 8, { size: 6 }));
    } else {
      const w = WEAPONS[s.gear.weapon];
      text(u, w.name, gx, dy, { size: 8, bold: true, color: '#ffe48a' });
      wrap(u, `${WEAPON_TEXT[s.gear.weapon] || ''}  ${w.dmg} damage per hit.`, 160, 6).forEach((l, k) => text(u, l, gx, dy + 10 + k * 8, { size: 6 }));
    }

    // ---- weapons row
    const wy = Y + 140;
    text(u, 'Weapon', gx, wy - 4, { size: 6.5, bold: true, color: UI.gold });
    if (s.gear.owned.length > 1) text(u, '↑↓ to switch between items and weapons', gx, wy + 36, { size: 5.5, color: UI.dim });
    s.gear.owned.forEach((id, k) => {
      const x = gx + k * 30, y = wy;
      const sel = this.row === 1 && k === this.wcol, on = s.gear.weapon === id;
      hot(x, y, 26, 26, () => { this.row = 1; this.wcol = k; s.gear.weapon = id; game.audio.sfx('menu'); });
      u.fillStyle = 'rgba(50,36,30,0.95)'; u.fillRect(x, y, 26, 26);
      u.strokeStyle = sel ? UI.gold : on ? '#a08050' : '#5a4a3a'; u.lineWidth = sel ? 1.4 : 0.7; u.strokeRect(x + 0.5, y + 0.5, 25, 25);
      weaponIcon(u, id, x + 13, y + 13, 1.3);
      if (on) text(u, 'J', x + 22, y + 23, { size: 5.5, bold: true, color: UI.gold, align: 'right' });
    });
    const sx = gx + s.gear.owned.length * 30 + 10;
    text(u, 'Shield', sx, wy - 4, { size: 6.5, bold: true, color: UI.gold });
    u.fillStyle = 'rgba(50,36,30,0.95)'; u.fillRect(sx, wy, 26, 26);
    u.strokeStyle = '#5a4a3a'; u.lineWidth = 0.7; u.strokeRect(sx + 0.5, wy + 0.5, 25, 25);
    if (s.gear.shield) { u.save(); u.translate(sx + 13, wy + 13); u.scale(1.5, 1.5); shieldIcon(u, s.gear.shield, 0, 0); u.restore(); }
    else text(u, '—', sx + 13, wy + 17, { size: 8, align: 'center', color: UI.dim });
    text(u, s.gear.shield ? SHIELDS[s.gear.shield].name : 'No shield', sx + 32, wy + 16, { size: 6, color: s.gear.shield ? UI.text : UI.dim });

    // ---- right column: key items, shards, supplies
    const rx = X + 222;
    u.strokeStyle = 'rgba(200,160,96,0.35)'; u.lineWidth = 0.6; u.beginPath(); u.moveTo(rx - 10, Y + 26); u.lineTo(rx - 10, Y + H - 18); u.stroke();
    text(u, 'Key items', rx, Y + 32, { size: 6.5, bold: true, color: UI.gold });
    const keyItems = ['verdantSigil', 'satchel', 'gloves', 'charm'];
    keyItems.forEach((id, k) => {
      const have = s.artifacts.includes(id);
      const y = Y + 46 + k * 13;
      if (have) artifactIcon(u, id, rx + 5, y - 2);
      else { u.fillStyle = 'rgba(160,150,180,0.25)'; u.fillRect(rx + 2, y - 5, 6, 6); }
      text(u, have ? ARTIFACTS[id].name : '???', rx + 14, y, { size: 6, color: have ? UI.text : UI.dim });
    });
    text(u, 'Ember Shards', rx, Y + 100, { size: 6.5, bold: true, color: UI.gold });
    for (let k = 0; k < 4; k++) {
      const x = rx + 6 + k * 14, y = Y + 114, lit = k < s.progress.shards;
      u.fillStyle = lit ? '#ff9a40' : 'rgba(160,150,180,0.25)';
      u.beginPath(); u.moveTo(x, y - 6); u.lineTo(x + 4, y); u.lineTo(x, y + 6); u.lineTo(x - 4, y); u.closePath(); u.fill();
      if (lit) { u.fillStyle = '#fff0c0'; u.fillRect(x - 0.8, y - 3, 1.6, 2.5); }
    }
    text(u, 'Supplies', rx, Y + 140, { size: 6.5, bold: true, color: UI.gold });
    const rows = [
      [`Coins`, `${p.coins}`],
      [`Rations (F to eat)`, `${p.food}`],
      [`Heart pieces`, `${s.upgrades.heartPieces} / 2`],
      [`Talent points`, `${s.talents.points}`],
    ];
    if (game.area?.kind === 'dungeon') rows.push([`Small keys here`, `${s.progress.keys[game.area.id] || 0}`]);
    rows.forEach(([a, b], k) => {
      text(u, a, rx, Y + 152 + k * 9, { size: 6 });
      text(u, b, X + Wd - 14, Y + 152 + k * 9, { size: 6, align: 'right', bold: true });
    });

    text(u, '←→ choose   ·   I / Esc close   ·   Q quick-swaps items in play', X + Wd / 2, Y + H - 6, { size: 5.8, align: 'center', color: UI.dim });
  }
}
