// Named guardians of the ward quests, and the relics their chains are built around.
import { Enemy } from './enemies.js';
import { Pickup } from './entities.js';
import { ELITES } from './quests.js';
import { R } from '../gfx/sprites.js';
import { TAU } from '../core/math.js';

const AURA = { warchief: '150,230,90', slagheart: '255,120,40', frostfang: '170,230,255' };

// A regular archetype, but bigger, tougher, always hunting, with a nameplate.
export class Elite extends Enemy {
  constructor(id, x, y, opts = {}) {
    const e = ELITES[id];
    super(e.archetype, e.biome, x, y, { ...opts, hpMult: e.hp * (opts.hpMult || 1), aggro: true, leash: 999 });
    this.eliteId = id;
    this.elite = true;
    this.name = e.name;
    this.scale = 1.6;
    this.w = Math.round(this.w * 1.3); this.h = Math.round(this.h * 1.3);
    this.mass *= 2.5;
  }
  draw(g, cam) {
    if (this.hidden) return; // burrowed: no aura or nameplate to give it away
    const x = this.x - cam.left, y = this.y - cam.top + this.h / 2;
    const c = AURA[this.eliteId] || '255,220,120';
    if (this.state !== 'dying') {
      const pulse = 0.18 + 0.08 * Math.sin(this.anim * 5);
      g.fillStyle = `rgba(${c},${pulse})`; g.beginPath(); g.ellipse(x, y - 2, this.w * 0.9, this.h * 0.55, 0, 0, TAU); g.fill();
      for (let k = 0; k < 3; k++) {
        const a = this.anim * 2 + (k * TAU) / 3, r = this.w * 0.8;
        g.fillStyle = `rgba(${c},0.8)`; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 14 - Math.sin(this.anim * 3 + k) * 6), 2, 2);
      }
    }
    // The base draw, scaled about the feet; its own little health bar is replaced by the nameplate.
    const hp = this.hp;
    g.save();
    g.translate(x, y); g.scale(this.scale, this.scale); g.translate(-x, -y);
    this.hp = this.maxHp;
    super.draw(g, cam);
    this.hp = hp;
    g.restore();
    if (this.state === 'dying') return;
    const top = Math.round(y - this.h * this.scale * 2.2 - 10), w = 34;
    g.font = 'bold 6px "Trebuchet MS", Verdana, sans-serif'; g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(this.name.split(',')[0], Math.round(x) + 1, top - 2);
    g.fillStyle = `rgb(${c})`; g.fillText(this.name.split(',')[0], Math.round(x), top - 3);
    R(g, Math.round(x - w / 2) - 1, top - 1, w + 2, 4, 'rgba(0,0,0,0.7)');
    R(g, Math.round(x - w / 2), top, Math.round(w * Math.max(0, this.hp / this.maxHp)), 2, '#e04848');
  }
}

// A bronze leaf of the Verdant Sigil, hovering over its raided shrine.
export class SigilLeaf extends Pickup {
  constructor(relic, x, y) {
    super('relic', x, y, 1, { permanent: true, id: `relic:${relic.id}` });
    this.relic = relic;
  }
  update(dt, ctx) {
    // Leaves don't drift to the player like coins; you walk up and take one.
    this.t += dt;
    const p = ctx.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 11 && !p.dead && ctx.game.collect(this)) this.dead = true;
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top - 6 + Math.sin(this.t * 2.5) * 2);
    g.fillStyle = `rgba(140,255,110,${0.2 + 0.1 * Math.sin(this.t * 4)})`; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
    g.save(); g.translate(x, y); g.rotate(Math.sin(this.t * 1.7) * 0.4);
    g.fillStyle = '#5aa04a'; g.beginPath(); g.ellipse(0, 0, 3, 5.5, 0.5, 0, TAU); g.fill();
    g.fillStyle = '#c8a050'; g.beginPath(); g.ellipse(-0.5, -0.5, 1.6, 3.6, 0.5, 0, TAU); g.fill();
    g.strokeStyle = '#2e6b2e'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-2, 3.5); g.lineTo(2, -3.5); g.stroke();
    g.restore();
    if (Math.sin(this.t * 3) > 0.7) R(g, x + 3, y - 5, 1, 1, '#ffffff');
  }
}
