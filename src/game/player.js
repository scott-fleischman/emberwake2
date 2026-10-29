// The player: movement, sprint, shield, dodge, lock-on, melee swings, items, food, hazards.
import { Actor, Projectile, Bomb, Particles } from './entities.js';
import { moveActor } from './physics.js';
import { canUseItem, lockOnTarget } from './combat.js';
import { WEAPONS, USE_ITEMS, SHIELDS } from '../data/items.js';
import { TILE, TILE_INFO, T } from '../world/tiles.js';
import { humanSprite, idleLife, LOOKS, R } from '../gfx/sprites.js';
import { drawShadow } from '../gfx/render.js';
import { drawEffectIcons } from '../gfx/effects.js';
import { EFFECTS, moveMult, blocked, shakeEffects } from './effects.js';
import { normalize, facingFromVector, TAU } from '../core/math.js';

const SPRINT_MULT = 1.55;
export const DODGE_SPEED = 255;
export const DODGE_TIME = 0.18;
const CHARGE_TIME = 0.5;  // hold attack this long after a swing to ready a spin
const SPIN_TIME = 0.32;

export class Player extends Actor {
  constructor(game, x, y) {
    super(x, y, 10, 8);
    this.game = game;
    this.mode = 'normal';
    this.modeT = 0;
    this.cool = 0;
    this.itemCool = 0;
    this.staminaDelay = 0;
    this.lock = null;
    this.regenPool = 0;
    this.regenTick = 0;
    this.lastSafe = { x, y };
    this.safeT = 0;
    this.swingDir = 1;
    this.shootT = 0;
    this.moving = false;
    this.shielding = false;
    this.sprinting = false;
    this.charge = 0;
    this.team = 'player';
    this.effects = {}; // status effects, see effects.js
    this.controlImmune = 0;
    this.look = LOOKS[game.state.classId];
  }

  get res() { return this.game.state.player; }

  update(dt, ctx) {
    const { game } = this;
    const { input } = game;
    const d = game.derived;
    const res = this.res;
    const map = ctx.map;
    this.tickTimers(dt);
    this.anim += dt;
    if (this.mode === 'dead') return;
    this.cool -= dt; this.itemCool -= dt; this.shootT -= dt;

    // Regeneration
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && !this.sprinting && !this.shielding) res.stamina = Math.min(d.maxStamina, res.stamina + 40 * dt);
    res.mana = Math.min(d.maxMana, res.mana + d.manaRegen * dt);
    if (this.regenPool > 0) {
      this.regenTick -= dt;
      if (this.regenTick <= 0) { this.regenTick = 0.45; this.regenPool--; res.hp = Math.min(d.maxHp, res.hp + 1); }
    }

    if (this.knockStep(dt, map)) { this.mode = 'normal'; this.checkHazards(dt, ctx); return; }

    // Frozen: nothing works but mashing buttons.
    if (blocked(this, 'all')) {
      this.mode = 'normal'; this.moving = this.shielding = this.sprinting = false; this.charge = 0;
      if (input.justDown.size) this.shake('press');
      this.checkHazards(dt, ctx);
      return;
    }

    // Lock-on
    if (this.lock && (this.lock.dead || this.lock.hp <= 0 || this.lock.untargetable || Math.hypot(this.lock.x - this.x, this.lock.y - this.y) > 210)) this.lock = null;
    if (input.pressed('lock')) {
      this.lock = this.lock ? null : lockOnTarget(this.x, this.y, ctx.area.targetables(), 150);
      game.audio.sfx(this.lock ? 'select' : 'menu');
    }

    let [ax, ay] = input.axis();
    [ax, ay] = normalize(ax, ay);
    const wish = ax !== 0 || ay !== 0;
    this.moving = wish && !blocked(this, 'move'); // a snared player can still turn
    const hasShield = !!game.state.gear.shield;
    this.shielding = hasShield && input.held('shield') && this.mode !== 'dodge';
    this.sprinting = input.held('sprint') && this.moving && res.stamina > 1 && !this.shielding && this.mode === 'normal';

    if (this.lock) {
      this.aim = Math.atan2(this.lock.y - this.y, this.lock.x - this.x);
      this.facing = facingFromVector(Math.cos(this.aim), Math.sin(this.aim));
    } else if (wish && !this.shielding && this.mode !== 'attack') {
      this.aim = Math.atan2(ay, ax);
      this.facing = facingFromVector(ax, ay, this.facing);
    }

    if (this.mode === 'dodge') {
      this.modeT -= dt;
      moveActor(map, this, this.dodgeX * DODGE_SPEED * dt, this.dodgeY * DODGE_SPEED * dt, { slide: 4 });
      if (Math.random() < 0.5) ctx.area.spawn(new Particles(this.x, this.y + 4, { count: 1, color: '#d8d0c0', speed: 10, life: 0.3, layer: -1 }));
      if (this.modeT <= 0) this.mode = 'normal';
      this.checkHazards(dt, ctx);
      return;
    }

    let speed = d.speed * (TILE_INFO[map.tileAtPixel(this.x, this.y + 2)]?.slow ?? 1) * moveMult(this);
    if (this.sprinting) { speed *= SPRINT_MULT; res.stamina = Math.max(0, res.stamina - 24 * dt); this.staminaDelay = 0.6; }
    if (this.shielding) { speed *= 0.5; this.staminaDelay = Math.max(this.staminaDelay, 0.3); }
    if (this.mode === 'attack' || this.mode === 'spin') speed *= 0.35;
    else if (this.charge > 0.15) speed *= 0.7;
    if (this.moving) moveActor(map, this, ax * speed * dt, ay * speed * dt, { slide: 6 });

    // Melee
    if (this.mode === 'spin') {
      const w = WEAPONS[game.state.gear.weapon];
      this.modeT -= dt;
      if (!this.swingHit && this.modeT <= SPIN_TIME * 0.55) {
        this.swingHit = true;
        ctx.area.meleeStrike(this, { angle: this.swingAngle, reach: w.reach + 6, arc: TAU, dmg: (w.dmg + d.meleeBonus) * 2, knock: w.knock * 1.3, crit: false, shadow: false }, ctx);
      }
      if (this.modeT <= 0) this.mode = 'normal';
    } else if (this.mode === 'attack') {
      const w = WEAPONS[game.state.gear.weapon];
      this.modeT -= dt;
      if (!this.swingHit && this.modeT <= w.swing * 0.6) {
        this.swingHit = true;
        const crit = (w.crit && Math.random() < w.crit);
        ctx.area.meleeStrike(this, { angle: this.swingAngle, reach: w.reach, arc: w.arc, dmg: w.dmg + d.meleeBonus, knock: w.knock, crit, shadow: d.shadow }, ctx);
      }
      if (this.modeT <= 0) this.mode = 'normal';
    } else if (input.pressed('attack') && this.cool <= 0) {
      const w = WEAPONS[game.state.gear.weapon];
      this.mode = 'attack';
      this.modeT = w.swing;
      this.cool = w.cooldown;
      this.swingAngle = this.aim;
      this.swingHit = false;
      this.swingDir *= -1;
      game.audio.sfx('swing', { pitch: w.kind === 'stab' ? 1.3 : w.kind === 'bash' ? 0.8 : 1 });
      this.shake('attack');
    }

    // Charged spin: keep holding attack after a swing; let go once the blade glows.
    if (input.held('attack') && (this.mode === 'normal' || this.mode === 'attack')) {
      if (this.mode === 'normal') {
        const before = this.charge;
        this.charge += dt;
        if (before < CHARGE_TIME && this.charge >= CHARGE_TIME) {
          game.audio.sfx('select', { pitch: 1.4 });
          ctx.area.spawn(new Particles(this.x, this.y - 6, { count: 8, color: ['#ffffff', '#ffe080'], speed: 40, life: 0.3 }));
        }
      }
    } else {
      if (this.charge >= CHARGE_TIME && this.mode === 'normal') {
        this.mode = 'spin';
        this.modeT = SPIN_TIME;
        this.swingAngle = this.aim;
        this.swingHit = false;
        this.cool = 0.3;
        game.audio.sfx('swing', { pitch: 0.7 });
        game.audio.sfx('dash', { pitch: 1.3 });
        this.shake('attack');
      }
      this.charge = 0;
    }

    if (this.mode === 'normal') {
      if (input.pressed('dodge')) this.tryDodge(ax, ay, ctx);
      else if (input.pressed('item')) this.useItem(ctx);
    }
    if (input.pressed('cycle')) {
      const items = game.state.gear.items;
      if (items.length) { game.state.gear.selected = (game.state.gear.selected + 1) % items.length; game.audio.sfx('menu'); }
    }
    if (input.pressed('eat')) this.eat();
    this.checkHazards(dt, ctx);
  }

  // Asks the status effects whether this action shakes any off; a snare or freeze breaking rings out.
  shake(action) {
    const gone = shakeEffects(this, action);
    if (gone.some((k) => EFFECTS[k].control)) this.game.audio.sfx('fx_break', { pitch: gone.includes('freeze') ? 1 : 0.6 });
  }

  tryDodge(ax, ay, ctx) {
    const res = this.res, d = this.game.derived;
    if (blocked(this, 'roll')) { this.game.audio.sfx('deny'); return; }
    if (res.stamina < d.dodgeCost) { this.game.audio.sfx('deny'); return; }
    res.stamina -= d.dodgeCost;
    this.staminaDelay = 0.7;
    if (!ax && !ay) { ax = Math.cos(this.aim); ay = Math.sin(this.aim); }
    this.dodgeX = ax; this.dodgeY = ay;
    this.mode = 'dodge';
    this.modeT = DODGE_TIME;
    this.iframes = Math.max(this.iframes, 0.24 + (d.shadow ? 0.12 : 0));
    this.game.audio.sfx('dash');
    ctx.area.spawn(new Particles(this.x, this.y + 4, { count: 6, color: '#d8d0c0', speed: 30, life: 0.35, layer: -1 }));
    this.shake('roll');
  }

  useItem(ctx) {
    const { game } = this;
    if (this.itemCool > 0) return;
    const items = game.state.gear.items;
    const id = items[game.state.gear.selected % Math.max(1, items.length)];
    if (!id) { game.audio.sfx('deny'); game.toast('No item equipped.'); return; }
    const item = USE_ITEMS[id];
    const check = canUseItem(this.res, id, game.derived);
    if (!check.ok) {
      game.audio.sfx('deny');
      game.toast(check.reason === 'mana' ? 'Not enough mana.' : `Out of ${item.ammo}.`);
      return;
    }
    if (check.kind === 'mana') this.res.mana -= check.cost; else if (check.kind) this.res[check.kind] -= check.cost;
    this.itemCool = item.cooldown;
    const cx = Math.cos(this.aim), cy = Math.sin(this.aim);
    if (id === 'bombs') {
      ctx.area.spawn(new Bomb(this.x + cx * 10, this.y + cy * 10, this));
      game.audio.sfx('bomb');
      return;
    }
    const dmg = item.dmg + game.derived.rangedBonus;
    const pierce = id === 'bow' && game.derived.pierce ? 1 : 0;
    ctx.area.spawn(new Projectile(item.projectile, this.x + cx * 8, this.y - 3 + cy * 8, this.aim, item.speed, dmg, 'player', { pierce }));
    this.shootT = 0.2;
    game.audio.sfx(id === 'firebolt' ? 'spell' : 'arrow');
  }

  eat() {
    const res = this.res, d = this.game.derived;
    if (res.food <= 0) { this.game.audio.sfx('deny'); this.game.toast('No food left.'); return; }
    if (res.hp >= d.maxHp && this.regenPool <= 0) { this.game.toast('You are not hungry.'); return; }
    res.food--;
    this.regenPool += d.foodHeal;
    this.shake('eat');
    this.game.audio.sfx('eat');
    this.game.toast(`Ate a ration (+${d.foodHeal / 2} hearts over time).`);
  }

  checkHazards(dt, ctx) {
    const map = ctx.map;
    const t = map.tileAtPixel(this.x, this.y);
    const info = TILE_INFO[t] || TILE_INFO[0];
    this.safeT -= dt;
    if (t === T.PIT) {
      this.game.audio.sfx('death', { pitch: 1.6, volume: 0.5 });
      this.x = this.lastSafe.x; this.y = this.lastSafe.y;
      this.game.damagePlayer(1, null, { noKnock: true, ignoreIframes: true });
      this.iframes = 1;
      return;
    }
    if (info.damage && this.iframes <= 0 && this.mode !== 'dodge') {
      this.game.damagePlayer(info.damage, null, { noKnock: true });
      this.knock((this.lastSafe.x - this.x) * 6, (this.lastSafe.y - this.y) * 6, 0.15);
      return;
    }
    // Thorn brambles hurt on contact.
    for (const [ox, oy] of [[-7, 0], [7, 0], [0, -6], [0, 6]]) {
      if (map.tileAtPixel(this.x + ox, this.y + oy) === T.THORNS && this.iframes <= 0) {
        this.game.damagePlayer(1, { x: this.x + ox * 2, y: this.y + oy * 2 });
        return;
      }
    }
    if (!info.damage && t !== T.PIT && !info.water && this.safeT <= 0 && this.kbT <= 0) {
      this.lastSafe = { x: this.x, y: this.y };
      this.safeT = 0.25;
    }
  }

  frontTile() {
    const cx = Math.cos(this.aim), cy = Math.sin(this.aim);
    const f = this.facing;
    const dx = f === 'left' ? -1 : f === 'right' ? 1 : 0, dy = f === 'up' ? -1 : f === 'down' ? 1 : 0;
    return { x: Math.floor((this.x + dx * 11) / TILE), y: Math.floor((this.y + dy * 10) / TILE), cx, cy };
  }

  draw(g, cam) {
    if (this.mode === 'dead') return;
    // The hit flicker hides the body but not the icons: they're how you read what's wrong.
    if (!(this.iframes > 0 && this.mode !== 'dodge' && Math.floor(this.iframes * 20) % 2 === 0)) this.drawBody(g, cam);
    drawEffectIcons(g, this, cam, this.game.time ?? this.anim);
  }

  drawBody(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    drawShadow(g, x, y + 4, 5, 2);
    const frame = this.moving ? Math.floor(this.anim * (this.sprinting ? 12 : 8)) % 4 : 0;
    const idle = !this.moving && this.mode === 'normal' && !this.shielding && this.shootT <= 0 && this.charge <= 0.15;
    const behind = this.facing === 'up';
    if (behind) this.drawGear(g, x, y);
    g.drawImage(humanSprite(this.look, this.facing, frame, `p${this.game.state.classId}`, idle ? idleLife(this.game.time ?? this.anim, 0.37) + 'dd' : ''), x - 8, y + 5 - 20);
    if (!behind) this.drawGear(g, x, y);
    if (this.mode === 'dodge') {
      g.globalAlpha = 0.3;
      g.drawImage(humanSprite(this.look, this.facing, frame, `p${this.game.state.classId}`), x - 8 - this.dodgeX * 6, y + 5 - 20 - this.dodgeY * 6);
      g.globalAlpha = 1;
    }
  }

  drawGear(g, x, y) {
    const gear = this.game.state.gear;
    const hy = y - 4;
    if (this.mode === 'spin') {
      const w = WEAPONS[gear.weapon];
      const p = 1 - this.modeT / SPIN_TIME;
      const a = this.swingAngle + TAU * p * this.swingDir;
      g.save(); g.translate(x, hy);
      g.globalAlpha = 0.35 * (1 - p * 0.5);
      g.strokeStyle = '#fff4c0'; g.lineWidth = 5;
      g.beginPath(); g.arc(0, 0, w.reach + 2, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      g.rotate(a);
      R(g, 1, -2, 3, 4, '#c8a050');
      R(g, 4, -1, w.reach, 3, '#fff8e0'); R(g, 4, -1, w.reach, 1, '#ffffff');
      g.restore();
    } else if (this.charge > 0.15 && this.mode === 'normal') {
      const ready = this.charge >= CHARGE_TIME;
      const cx = x + Math.cos(this.aim) * 8, cy = hy + Math.sin(this.aim) * 6;
      const pulse = ready ? 0.6 + 0.4 * Math.sin(this.anim * 20) : Math.min(1, this.charge / CHARGE_TIME) * 0.5;
      g.fillStyle = `rgba(255,240,180,${pulse * 0.6})`;
      g.beginPath(); g.arc(cx, cy, ready ? 5 : 3, 0, TAU); g.fill();
      R(g, Math.round(cx) - 1, Math.round(cy) - 1, 2, 2, ready ? '#ffffff' : '#ffe0a0');
    }
    if (this.mode === 'attack') {
      const w = WEAPONS[gear.weapon];
      const p = Math.min(1, 1 - this.modeT / w.swing);
      g.save();
      g.translate(x, hy);
      if (w.kind === 'stab') {
        const ext = Math.sin(p * Math.PI) * w.reach;
        g.rotate(this.swingAngle);
        R(g, 2, -1, 3, 2, '#5a3a20');
        R(g, 5, -1, 4 + ext * 0.6, 2, '#e0e4ec');
        R(g, 5, -1, 4 + ext * 0.6, 1, '#ffffff');
        if (gear.weapon === 'twinblades') { R(g, 3, 3, 3 + ext * 0.4, 1, '#d0d4dc'); }
        g.globalAlpha = 0.35; R(g, 8, -2, ext, 4, '#ffffff'); g.globalAlpha = 1;
      } else {
        const eased = 1 - (1 - p) * (1 - p);
        const a0 = this.swingAngle - (w.arc / 2) * this.swingDir;
        const a = a0 + w.arc * eased * this.swingDir;
        g.globalAlpha = 0.3;
        g.strokeStyle = '#ffffff'; g.lineWidth = 4;
        g.beginPath();
        g.arc(0, 0, w.reach - 3, Math.min(a0, a), Math.max(a0, a));
        g.stroke();
        g.globalAlpha = 1;
        g.rotate(a);
        if (w.kind === 'bash') {
          R(g, 0, -1, w.reach - 2, 3, '#8a5a2a');
          R(g, w.reach - 5, -3, 5, 6, '#b080e0');
          R(g, w.reach - 4, -2, 2, 2, '#ffffff');
        } else {
          R(g, 1, -2, 3, 4, '#c8a050');
          R(g, 4, -1, w.reach - 4, 3, gear.weapon === 'steelsword' ? '#c8e0f8' : '#d8dce4');
          R(g, 4, -1, w.reach - 4, 1, '#ffffff');
          R(g, w.reach - 1, 0, 2, 1, '#ffffff');
        }
      }
      g.restore();
    }
    if (this.shielding) {
      const s = SHIELDS[gear.shield];
      const cx = Math.cos(this.aim), cy = Math.sin(this.aim);
      const sx = x + cx * 7, sy = hy + cy * 6 + 2;
      const big = s === SHIELDS.kite;
      R(g, Math.round(sx - 3), Math.round(sy - (big ? 5 : 4)), 6, big ? 10 : 8, '#7a5a3a');
      R(g, Math.round(sx - 2), Math.round(sy - (big ? 4 : 3)), 4, big ? 8 : 6, big ? '#3a68b0' : '#a8acb4');
      R(g, Math.round(sx - 1), Math.round(sy - 1), 2, 2, '#f0c850');
    }
    if (this.shootT > 0) {
      const id = gear.items[gear.selected];
      g.save(); g.translate(x, hy); g.rotate(this.aim);
      if (id === 'bow') { g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.beginPath(); g.arc(4, 0, 6, -1.2, 1.2); g.stroke(); R(g, 4, -5, 1, 10, '#e0e0e0'); }
      else if (id === 'firebolt') { g.fillStyle = 'rgba(255,150,50,0.6)'; g.beginPath(); g.arc(8, 0, 4, 0, TAU); g.fill(); }
      g.restore();
    }
  }
}
