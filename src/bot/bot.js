// Autoplay: a bot that plays Emberwake through the real input system, the way a practiced
// speedrunner would. It reads the world (the map, quest markers, enemy telegraphs) and presses
// keys every frame: no teleporting, no invincibility. Tasks are generators that yield once per
// frame; combat and dialogs interrupt them, and death restarts the route from the current state.
import { TILE, T } from '../world/tiles.js';
import { ROOM_W, ROOM_H } from '../world/dungeons.js';
import { WEAPONS, USE_ITEMS } from '../data/items.js';
import { RIDDLES } from '../data/sidequests.js';
import { Dialog, Menu } from '../gfx/ui.js';
import { Cutscene } from '../gfx/cutscene.js';
import { fullMethods } from './full.js';
import { zoneDanger, inZone, HIT_PAD } from '../game/zones.js';
import { moveActor } from '../game/physics.js';
import { DODGE_SPEED, DODGE_TIME } from '../game/player.js';
import { findPath, reachMap, walkable, tileOf, center, besideTile, standableNear, isBush } from './nav.js';

const K = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack: 'KeyJ', item: 'KeyK', shield: 'KeyL', dodge: 'Space', sprint: 'ShiftLeft', interact: 'KeyE', cycle: 'KeyQ', lock: 'KeyR', eat: 'KeyF', confirm: 'Enter', back: 'Escape' };
const TELEGRAPH = new Set(['windup', 'slam', 'crouch', 'lunge', 'dart', 'special']);
const IN_ROOM_PUZZLES = new Set(['switches', 'ordered', 'push']);
const INNER = { n: { x: 11, y: 1 }, s: { x: 11, y: 13 }, w: { x: 1, y: 7 }, e: { x: 22, y: 7 } };
const OUT = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

// Speedrun splits: the moment the main quest moves past each stage.
export const SPLITS = {
  scout: 'Spoke with the elder', lookout: 'Found the scout', camp: 'Watchtower', sigil: 'Warband camp cleared', leaves: 'Scout\'s tale',
  thornwall: 'Sigil leaves', vault: 'Thornwall withered', smith: 'Thornmaw quieted', ashpass: 'Bomb Satchel', ridge: 'Ash captain',
  cinderwatch: 'Ridge blasted', vents: 'Cinderwatch', slagheart: 'Vents capped', reliquary: 'Firewall fallen', frostpass: 'Cinder Warden quieted',
  boulder: 'Mountain keeper', rimewatch: 'Boulder lifted', windcrest: 'Rimewatch', beacons: 'Windcrest', frostfang: 'Beacons lit',
  sanctuary: 'Ice wall shattered', hearth: 'Rime Sovereign quieted', fenkeep: 'Hearth rekindled', belfry: 'Swamp keeper',
  bells: 'Drowned Belfry', bogking: 'Tide Bells rung', fane: 'Tidewall drained', kindle: 'Tidewarden quieted', end: 'Spire opened',
};

const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

export class Bot {
  constructor(game, mode = 'any') {
    this.g = game;
    this.mode = mode; // 'any' | 'full'
    this.input = game.input;
    this.want = new Set();
    this.taps = [];
    this.pending = [];
    this.task = null;
    this.time = 0;
    this.dt = 1 / 60;
    this.status = 'Starting';
    this.done = false;
    this.splits = [];
    this.lastStage = game.state.quest.main;
    this.lastR = -1; this.lastEat = -9; this.lastDodge = -9;
    this.uiTop = null; this.uiT = 0;
    this.stuckT = 0; this.stuckAt = null;
    this.sprinting = false;
    this.log = [];
  }

  // ---------------------------------------------------------------- input plumbing
  move(ax, ay) {
    if (ax < 0) this.want.add(K.left); else if (ax > 0) this.want.add(K.right);
    if (ay < 0) this.want.add(K.up); else if (ay > 0) this.want.add(K.down);
  }
  tap(code) { this.taps.push(code); }

  step(dt) {
    const inp = this.input;
    for (const c of this.pending) inp.release(c);
    this.pending = [];
    this.want.clear();
    this.taps = [];
    this.dt = dt;
    this.time += dt;
    if (!this.done) { this.think(); this.shakeOff(); }
    for (const c of [...inp.down]) if (!this.want.has(c)) inp.release(c);
    for (const c of this.want) if (!inp.down.has(c)) inp.press(c);
    for (const c of this.taps) { inp.press(c); this.pending.push(c); }
  }

  note(msg) { this.log.push(`[${this.clock()}] ${msg}`); if (this.log.length > 200) this.log.shift(); }
  clock() { const s = Math.floor(this.time); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  // ---------------------------------------------------------------- the frame
  think() {
    const g = this.g, p = g.player;
    this.trackSplits();
    const top = g.uiStack[g.uiStack.length - 1];
    if (g.deathT > 0 || p.mode === 'dead') { this.restart = true; this.status = 'Fell. The Ember carries you back...'; if (top) this.handleUI(top); return; }
    if (top) { this.handleUI(top); return; }
    this.uiTop = null;
    if (this.restart) { this.restart = false; this.task = null; this.note('Restarting route after a fall'); }
    if (this.combat()) return;
    this.tidyUp();
    if (this.grabPickups()) return;
    if (!this.task) this.task = this.mode === 'full' ? this.fullRoute() : this.anyRoute();
    const r = this.task.next();
    if (r.done) { this.task = null; if (g.state.quest.main === 'end') this.done = true; }
  }

  trackSplits() {
    const st = this.g.state.quest.main;
    if (st !== this.lastStage) {
      this.lastStage = st;
      if (SPLITS[st]) { this.splits.push({ label: SPLITS[st], t: this.time }); this.note(`Split: ${SPLITS[st]}`); }
    }
  }

  // Eat when hurt, drop a stale lock-on.
  tidyUp() {
    const g = this.g, p = g.player, res = g.state.player;
    if (p.lock && this.time - this.lastR > 0.3) { this.tap(K.lock); this.lastR = this.time; }
    if (res.hp < g.derived.maxHp * 0.6 && res.food > 0 && p.regenPool <= 0 && this.time - this.lastEat > 3) { this.tap(K.eat); this.lastEat = this.time; }
  }

  // Status effects, after the frame's moves are chosen so a roll can go the way we're already heading:
  // mash out of a freeze, swing out of a snare, roll out of a fire or out from under a clinging leech.
  // Poison needs nothing here: the eat rules in tidyUp and fight already fire below half health and
  // eating cures it.
  shakeOff() {
    const g = this.g, p = g.player, res = g.state.player, fx = p.effects;
    if (g.uiStack.length || g.deathT > 0 || p.mode === 'dead') return;
    if (fx.freeze || fx.snare) this.tap(K.attack);
    const leech = g.area.enemyList.some((e) => e.latched);
    if ((fx.burn || leech) && p.mode === 'normal' && !fx.snare && res.stamina >= g.derived.dodgeCost && this.time - this.lastDodge > 0.45) {
      const ax = (this.want.has(K.right) ? 1 : 0) - (this.want.has(K.left) ? 1 : 0), ay = (this.want.has(K.down) ? 1 : 0) - (this.want.has(K.up) ? 1 : 0);
      if (this.safeRoll(ax || ay ? [ax, ay] : [Math.cos(p.aim), Math.sin(p.aim)])) {
        // A swing pressed this frame would win over the roll and swallow it.
        this.taps = this.taps.filter((c) => c !== K.attack);
        this.tap(K.dodge); this.lastDodge = this.time;
      }
    }
  }

  // ---------------------------------------------------------------- dialogs, cutscenes, menus
  handleUI(top) {
    if (top !== this.uiTop) {
      this.uiTop = top; this.uiT = 0; this.uiCount = (this.uiCount || 0) + 1;
      const who = this.g.area.npcs().find((n) => n.talking);
      if (who) this.lastTalked = who.data.id;
    }
    this.uiT += this.dt;
    if (top instanceof Cutscene) {
      // Speedrun etiquette: skip story scenes (Esc arms the skip, Esc again skips).
      if (this.uiT > 0.35) { this.tap(K.back); this.uiT = 0.05; }
      return;
    }
    if (top instanceof Dialog) {
      const page = top.page;
      if (!page) return;
      if (top.chars < page.text.length) { if (this.uiT > 0.12) { this.tap(K.confirm); this.uiT = 0; } return; }
      if (page.options && page.options.length) {
        const want = this.chooseOption(page);
        if (top.sel !== want) { if (this.uiT > 0.08) { this.tap(want > top.sel ? K.down : K.up); this.uiT = 0; } return; }
        if (this.uiT > 0.3) { this.tap(K.confirm); this.uiT = 0; }
        return;
      }
      if (this.uiT > 0.45) { this.tap(K.confirm); this.uiT = 0; }
      return;
    }
    if (top instanceof Menu && top.title === 'General Goods' && this.shopping) { this.shop(top); return; }
    if (top instanceof Menu && top.title === 'The Ember Rekindled') {
      if (this.mode === 'full' || this.g.state.quest.main === 'end') { this.done = true; this.status = 'Run complete!'; }
      return;
    }
    if (this.uiT > 0.2) { this.tap(K.back); this.uiT = 0; }
  }

  chooseOption(page) {
    const labels = page.options.map((o) => o.label);
    const riddle = /^Riddle \d of 3: (.*)$/.exec(page.text);
    if (riddle) { const r = RIDDLES.find((q) => q[0] === riddle[1]); return Math.max(0, labels.indexOf(r && r[1])); }
    if (this.shopping && labels.includes('Browse wares')) return labels.indexOf('Browse wares');
    const accept = labels.findIndex((l) => l === 'I\'ll do it.' || l === 'I love riddles.');
    if (accept >= 0) return this.mode === 'full' ? accept : Math.max(0, labels.indexOf('Not right now.'));
    return labels.length - 1;
  }

  // ---------------------------------------------------------------- supplies
  // Walk over useful drops once a fight is done: ammo, food, and hearts when hurt.
  grabPickups() {
    const g = this.g, p = g.player, s = g.state, d = g.derived;
    if (g.area.kind === 'dungeon' && g.area.portalActive) return false;
    const want = (k) => k.kind === 'heart' ? s.player.hp < d.maxHp : k.kind === 'arrows' ? s.gear.items.includes('bow') && s.player.arrows < d.maxArrows
      : k.kind === 'knives' ? s.gear.items.includes('knives') && s.player.knives < d.maxKnives : k.kind === 'food' || k.kind === 'coin' || (k.kind === 'mana' && s.player.mana < d.maxMana);
    const pk = g.area.entities.filter((e) => e.kind && e.value !== undefined && e.life !== undefined && e.life < Infinity && !e.dead && want(e) && Math.hypot(e.x - p.x, e.y - p.y) < 90)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!pk) return false;
    this.status = 'Picking up supplies';
    const step = this.chaseStep(pk) || [Math.sign(Math.round(pk.x - p.x)), Math.sign(Math.round(pk.y - p.y))];
    this.move(step[0], step[1]);
    return true;
  }

  // What the merchant should sell us right now: [shop label, still needed?, price].
  // Bombs the main quest still needs: the ridge, then one per uncapped vent (plus a spare).
  bombsNeeded() {
    const s = this.g.state, W = this.g.world, st = s.quest.main;
    if (!s.tools.bombs || !['ashpass', 'ridge', 'cinderwatch', 'vents'].includes(st)) return 0;
    const vents = W.pois.relics.vents.filter((v) => !s.progress.relics.includes(v.id)).length;
    return vents + 1 + (s.progress.gates.includes('volcanic') ? 0 : 1);
  }

  shoppingList() {
    const s = this.g.state, p = s.player, d = this.g.derived;
    return [
      ['Bombs ×4', () => p.bombs < this.bombsNeeded() && p.bombs < d.maxBombs - 3, 20],
      // Food before ammo: topping up arrows can spend the coins that would have kept us alive.
      ['Ration', () => p.food < 3, 10],
      ['Arrows ×10', () => s.gear.items.includes('bow') && p.arrows < d.maxArrows - 9, 15],
      ['Throwing knives ×5', () => s.gear.items.includes('knives') && p.knives < d.maxKnives - 4, 15],
    ].filter(([, need, price]) => need() && p.coins >= price);
  }

  needsSupplies() {
    const s = this.g.state, p = s.player;
    const low = (s.gear.items.includes('bow') && p.arrows < 15) || (s.gear.items.includes('knives') && p.knives < 8) || p.food < 2 || p.bombs < this.bombsNeeded();
    return low && this.shoppingList().length > 0;
  }

  // Stop at the nearest merchant we can reach and stock up.
  *resupply() {
    const g = this.g, W = g.world, map = g.overworldMap;
    const here = g.overworldPos();
    if (!map || !here) return;
    const reach = reachMap(map, here);
    const merchants = W.npcs.filter((n) => n.role === 'merchant' && n.buildingId).map((n) => {
      const b = W.props.find((q) => q.id === n.buildingId);
      const r = b ? reach[(b.door.y + 1) * map.w + b.door.x] : -1;
      return { n, r };
    }).filter((m) => m.r >= 0).sort((a, b) => a.r - b.r);
    if (!merchants.length) return;
    this.status = 'Restocking supplies';
    this.note(this.status);
    this.shopping = true;
    yield* this.talkTo(merchants[0].n.id);
    this.shopping = false;
  }

  shop(menu) {
    const list = this.shoppingList();
    if (!list.length) { if (this.uiT > 0.2) { this.tap(K.back); this.uiT = 0; } return; }
    const idx = menu.items.findIndex((it) => it.label === list[0][0]);
    if (idx < 0 || (menu.items[idx].disabled && menu.items[idx].disabled())) { this.shopping = false; this.tap(K.back); return; }
    if (this.uiT < 0.15) return;
    this.uiT = 0;
    if (menu.sel !== idx) this.tap(idx > menu.sel ? K.down : K.up);
    else this.tap(K.confirm);
  }

  // ---------------------------------------------------------------- combat
  threats() {
    const g = this.g, a = g.area, p = g.player;
    const ignore = this.ignore || (this.ignore = new Map());
    const list = a.enemyList.filter((e) => !e.dead && e.hp > 0 && e.state !== 'dying');
    if (a.kind === 'dungeon') return a.shut || a.shutPending || a.boss ? list : list.filter((e) => (ignore.get(e) || 0) <= this.time);
    // Only fight what we can walk up to, and give up on anything we can't hurt for a while.
    if (!this.reach || this.reach.area !== a || this.time - this.reach.t > 0.5) {
      this.reach = { area: a, t: this.time, map: reachMap(a.map, tileOf(p.x, p.y)) };
    }
    // Fights are leashed to where they began, so kiting foes can't drag us across the map.
    const at = this.fightAt && this.time - this.fightAt.t < 1.5 ? this.fightAt : { x: p.x, y: p.y };
    return list.filter((e) => {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if ((ignore.get(e) || 0) > this.time) return false;
      if (!e.elite && Math.hypot(e.x - at.x, e.y - at.y) > 165) return false;
      if (e === this.engaged && d < 120) return true; // stay on a target once engaged
      if (!e.aggro || d > (e.elite ? 170 : 110)) return false;
      const t = tileOf(e.x, e.y), r = this.reach.map[t.y * a.map.w + t.x];
      return e.flying ? d < 70 : r >= 0 && r < 14;
    });
  }

  // Track progress against the current target; shrug off fights that go nowhere.
  engage(e) {
    if (this.engaged !== e) { this.engaged = e; this.engageHp = e.hp; this.engageT = 0; this.engageTotal = 0; return; }
    this.engageTotal += this.dt;
    const a = this.g.area, locked = a.kind === 'dungeon' && (a.shut || a.shutPending);
    // A chip of damage now and then shouldn't keep us brawling forever with something we can't finish.
    if (!e.boss && !e.elite && !locked && this.engageTotal > 40) { this.ignore.set(e, this.time + 40); this.engaged = null; this.note(`Leaving a ${e.archetype} be`); return; }
    if (e.hp < this.engageHp) { this.engageHp = e.hp; this.engageT = 0; return; }
    this.engageT += this.dt;
    // A guardian that won't take damage is usually across a cliff: back off briefly and walk round.
    if (e.elite && this.engageT > 8) { this.ignore.set(e, this.time + 5); this.engaged = null; this.note(`Circling round to ${e.name}`); return; }
    if (!e.boss && !e.elite && this.engageT > 8) { this.ignore.set(e, this.time + 40); this.engaged = null; this.note(`Giving up on a ${e.archetype}`); }
  }

  combat() {
    const list = this.threats();
    if (!list.length) { this.calm = null; return false; }
    const p = this.g.player;
    this.fightAt = this.fightAt && this.time - this.fightAt.t < 1.5 ? { ...this.fightAt, t: this.time } : { x: p.x, y: p.y, t: this.time };
    // Juggling several foes resets each give-up timer; if nobody takes damage for a while, move on.
    // Each foe is measured against itself, so a newcomer's health can't hide the damage being done.
    const a = this.g.area, was = this.calm?.hp;
    if (!was || list.some((e) => was.has(e) && e.hp < was.get(e))) this.calm = { hp: new Map(list.map((e) => [e, e.hp])), t: 0 };
    else {
      for (const e of list) if (!was.has(e)) was.set(e, e.hp);
      if (!(a.kind === 'dungeon' && (a.shut || a.shutPending || a.boss)) && (this.calm.t += this.dt) > 15) {
        for (const e of list) this.ignore.set(e, this.time + 20);
        this.engaged = null; this.calm = null; this.note('Breaking off a fight that goes nowhere');
        return false;
      }
    }
    this.fight(list);
    return true;
  }

  // A special glows as the pose 'special' while it winds up, then takes the pose of what it does.
  attackWindow(e) {
    if (e.boss) return e.vulnerable;
    return !e.untargetable && !TELEGRAPH.has(e.pose ?? e.state);
  }

  // Danger at a point: {lv 0..3, block: can a shield stop it, shot: the projectile (or the wave or
  // ring, as {vx, vy}: the way it comes) about to land, if that's what the danger is}.
  danger(x, y, list) {
    let lv = 0, block = true, shot = null, wave = null;
    const bump = (v, blockable) => { if (v > lv) { lv = v; block = blockable; } else if (v === lv && !blockable) block = false; };
    for (const e of list) {
      if (e.boss) {
        const de = Math.hypot(x - e.x, y - e.y);
        if (!e.vulnerable && e.state !== 'intro' && de < 28) bump(1, false);
        if ((e.state === 'wind' || e.state === 'charge' || e.state === 'dash') && e.cdx !== undefined) {
          if (segDist(x, y, e.x, e.y, e.x + e.cdx * 300, e.y + e.cdy * 300) < 24) bump(e.state === 'wind' ? 2 : 3, false);
        }
        continue;
      }
      switch (e.state) {
        case 'windup': case 'slam': {
          const hx = e.x + Math.cos(e.slamA) * 15, hy = e.y + Math.sin(e.slamA) * 15;
          if (Math.hypot(x - hx, y - hy) < 23) bump(e.timer < 0.3 || e.state === 'slam' ? 2 : 1, true);
          break;
        }
        case 'crouch': case 'lunge':
          if (segDist(x, y, e.x, e.y, e.x + e.dirX * 85, e.y + e.dirY * 85) < 15) bump(e.state === 'lunge' || e.timer < 0.2 ? 2 : 1, true);
          break;
        case 'dart':
          if (segDist(x, y, e.x, e.y, e.x + e.dirX * 30, e.y + e.dirY * 30) < 13) bump(2, true);
          break;
        case 'aim':
          if (segDist(x, y, e.x, e.y, e.x + Math.cos(e.shotA) * 220, e.y + Math.sin(e.shotA) * 220) < 10) bump(1, true);
          break;
        // Where a special will land shows as zones once it starts; while it glows, keep off the body.
        case 'special':
          if (e.sub === 'windup' && Math.hypot(x - e.x, y - e.y) < 36) bump(1, false);
          break;
      }
    }
    for (const z of this.g.area.zones) {
      const v = zoneDanger(z, x, y, HIT_PAD);
      if (!v) continue;
      bump(v, z.blockable);
      // A wave (a line on the move) or a ring on its way is crossed like a shot, rolling against the way
      // it comes; a filled pool spreading, or a line widening in place, has no far side to roll to.
      const ring = z.shape === 'ring' && z.grow > 0, line = z.shape === 'segment' && (z.vx || z.vy);
      if (v === 2 && z.t <= 0 && (ring || line) && !inZone(z, x, y, HIT_PAD)) wave = ring ? { vx: x - z.x, vy: y - z.y, wave: true } : { vx: z.vx, vy: z.vy, wave: true };
    }
    for (const pr of this.g.area.entities) {
      if (pr.team !== 'enemy' || pr.vx === undefined || pr.dead || !pr.hitSet || pr.lob) continue; // a lob's landing is a zone
      // A shot in our lane is a warning to step aside or raise a shield; one about to land is the
      // moment to roll, so the roll's brief invulnerability covers it rather than running out first.
      // A rolling boulder hits as a zone a shield can't stop.
      const r = pr.rolling ? pr.zone.w / 2 + 8 : 12, lane = (k) => segDist(x, y, pr.x, pr.y, pr.x + pr.vx * k, pr.y + pr.vy * k) < r;
      if (lane(0.22)) { if (lv <= 2) shot = pr; bump(2, !pr.rolling); } else if (lane(0.45)) bump(1, !pr.rolling);
    }
    // Mire poisons whoever stands in it: ground to leave, never to fight on.
    if (this.g.area.map.tileAtPixel(x, y + 2) === T.MIRE) bump(1, false);
    return { lv, block, shot: lv === 2 ? shot || wave : null };
  }

  fight(list) {
    const g = this.g, p = g.player, a = g.area, res = g.state.player, d = g.derived;
    const near = (e) => Math.hypot(e.x - p.x, e.y - p.y);
    const minions = list.filter((e) => !e.boss).sort((x, y) => near(x) - near(y));
    const boss = list.find((e) => e.boss);
    let target = minions.find((e) => !e.untargetable) || minions[0];
    // A decoy breaks at one blow, so it's worth the walk; anything else only when it's close.
    if (boss && (!target || near(target) > (target.decoy ? 130 : 56) || boss.vulnerable)) target = boss;
    this.status = `Fighting ${target.boss ? target.name.split(',')[0] : target.name || target.archetype}`;
    if (!this.ignore) this.ignore = new Map();
    this.engage(target);
    if (res.hp <= d.maxHp * 0.5 && res.food > 0 && p.regenPool <= 0 && this.time - this.lastEat > 2) { this.tap(K.eat); this.lastEat = this.time; }
    if ((!p.lock || p.lock.dead || p.lock.hp <= 0 || p.lock.state === 'dying') && this.time - this.lastR > 0.35 && near(target) < 145) { this.tap(K.lock); this.lastR = this.time; }
    else if (p.lock && p.lock !== target && near(target) < 40 && near(p.lock) > 64 && this.time - this.lastR > 0.35) { this.tap(K.lock); this.lastR = this.time; }
    // Fight with a real ranged item, not the bombs left selected from blasting rock.
    const items = g.state.gear.items;
    if (items[g.state.gear.selected % Math.max(1, items.length)] === 'bombs' && items.some((i) => i !== 'bombs') && this.time - (this.lastCycle || 0) > 0.2) { this.tap(K.cycle); this.lastCycle = this.time; }
    const focus = p.lock && !p.lock.dead ? p.lock : target;
    const w = WEAPONS[g.state.gear.weapon];
    const reach = w.reach + Math.max(focus.w, focus.h) / 2 - 3;
    const dist = Math.hypot(focus.x - p.x, focus.y - (p.y - 2));
    const open = this.attackWindow(focus);
    const here = this.danger(p.x, p.y, list);
    const shieldOk = !!g.state.gear.shield && res.stamina > 18;
    const shield = shieldOk && here.lv > 0 && here.block && !(open && dist <= reach);
    const desired = open ? reach - 6 : focus.boss ? 56 : 40;
    // The path knows walls, not zones: a step onto a live patch is left to bestMove to walk around.
    let chase = dist > desired + 14 && here.lv === 0 ? this.chaseStep(focus) : null;
    if (chase && a.zones.some((z) => z.t <= 0 && zoneDanger(z, p.x + chase[0] * 8, p.y + chase[1] * 8, HIT_PAD))) chase = null;
    // A charge's lane is wider than any one step bestMove weighs: leave it square to the side. So is
    // a wide zone: leave it the shortest way, unless that throws away an opening.
    const out = (here.lv >= 2 && this.laneEscape(list)) || (here.lv > 0 && !open && this.zoneEscape(list)) || null;
    const mv = out || chase || this.bestMove(list, focus, desired, here);
    if (mv) this.move(mv[0], mv[1]);
    if (shield) this.want.add(K.shield);
    // Sprinting into an opening, not into what's still flying at us, and not with the stamina a roll needs.
    if (open && focus.boss && dist > reach + 12 && here.lv === 0 && res.stamina > d.dodgeCost * 2) this.want.add(K.sprint);
    if ((!shield && here.lv >= 2) || here.lv >= 3) {
      // Roll through a shot, not away from it: a roll is quick enough to cross a volley's whole wave
      // before its invulnerability runs out, where rolling off leaves the wave to catch us after.
      // Not through a warden's thorn ring, though: that roll ends up against its body. A wave on its
      // way is the zone we'd walk out of: the way out is through it, wherever the walk was heading.
      const s = here.shot, l = s && (Math.hypot(s.vx, s.vy) || 1), into = s && [Math.round(-s.vx / l), Math.round(-s.vy / l)];
      const roll = into && (!out || s.wave) && this.safeRoll(into) && !this.rollsOntoBoss(into, list) ? into : mv || [Math.cos(p.aim), Math.sin(p.aim)];
      if (res.stamina >= d.dodgeCost && p.mode === 'normal' && this.time - this.lastDodge > 0.45 && this.safeRoll(roll)) {
        if (roll === into) { for (const k of [K.left, K.right, K.up, K.down]) this.want.delete(k); this.move(into[0], into[1]); }
        this.tap(K.dodge); this.lastDodge = this.time;
      }
    }
    // A swing pressed with the roll would win over it and swallow it.
    if (this.lastDodge === this.time) return;
    if (open && dist <= reach && p.cool <= 0 && p.mode === 'normal' && !shield) this.tap(K.attack);
    else if (dist > reach + 2 && dist < 160 && !shield && p.mode === 'normal' && this.rangedReady(focus)) this.tap(K.item);
  }

  // A dodge carries us ~46px, far past the step bestMove checked; landing in lava hurts more than the
  // blow, and so does sliding round a corner into a pocket we can't walk back out of, or stopping in
  // mire. So the roll is played out frame by frame, sliding along walls as the real one will.
  safeRoll([dx, dy]) {
    const p = this.g.player, a = this.g.area, map = a.map, l = Math.hypot(dx, dy) || 1, reach = this.reach?.area === a ? this.reach.map : null;
    const q = { x: p.x, y: p.y, w: p.w, h: p.h }, step = DODGE_SPEED / 60;
    for (let s = 0; s < DODGE_SPEED * DODGE_TIME; s += step) {
      moveActor(map, q, (dx / l) * step, (dy / l) * step, { slide: 4 });
      const t = tileOf(q.x, q.y);
      if (!walkable(map, t.x, t.y) || (reach && reach[t.y * map.w + t.x] < 0)) return false;
    }
    return map.tileAtPixel(q.x, q.y + 2) !== T.MIRE;
  }

  // Square out of a warden's charge lane, to the side we're already on unless that side is wall.
  laneEscape(list) {
    const p = this.g.player, map = this.g.area.map;
    for (const e of list) {
      if (!e.boss || e.cdx === undefined || !['wind', 'charge', 'dash'].includes(e.state)) continue;
      if (segDist(p.x, p.y, e.x, e.y, e.x + e.cdx * 300, e.y + e.cdy * 300) >= 24) continue;
      const side = Math.sign((p.x - e.x) * -e.cdy + (p.y - e.y) * e.cdx) || 1;
      for (const k of [side, -side]) {
        const dir = [Math.round(-e.cdy * k), Math.round(e.cdx * k)], t = tileOf(p.x + dir[0] * 16, p.y + dir[1] * 16);
        if ((dir[0] || dir[1]) && walkable(map, t.x, t.y)) return dir;
      }
    }
    return null;
  }

  // Out of a zone too wide for bestMove's short probes (they all land inside it): the way that
  // reaches safe ground in the fewest steps.
  zoneEscape(list) {
    const g = this.g, p = g.player, map = g.area.map, reach = this.reach?.area === g.area ? this.reach.map : null;
    if (!g.area.zones.some((z) => zoneDanger(z, p.x, p.y, HIT_PAD))) return null;
    let best = null, bd = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const l = Math.hypot(dx, dy);
      for (let s = 6; s < Math.min(bd, 60); s += 6) {
        const x = p.x + (dx / l) * s, y = p.y + (dy / l) * s, t = tileOf(x, y);
        if (!walkable(map, t.x, t.y) || (reach && reach[t.y * map.w + t.x] < 0)) break;
        if (!this.danger(x, y, list).lv) { bd = s; best = [dx, dy]; break; }
      }
    }
    return best;
  }

  // Whether a roll would end against a warden that can't be hit yet (its body hurts to touch).
  rollsOntoBoss([dx, dy], list) {
    const p = this.g.player, l = Math.hypot(dx, dy) || 1, x = p.x + (dx / l) * 46, y = p.y + (dy / l) * 46;
    return list.some((e) => e.boss && !e.vulnerable && Math.hypot(e.x - x, e.y - y) < 30);
  }

  // One step along an A* path toward an enemy, for when walls or hazards stand between us.
  chaseStep(e) {
    const g = this.g, p = g.player, map = g.area.map;
    const from = tileOf(p.x, p.y), to = tileOf(e.x, e.y);
    if (!this.chase || this.chase.e !== e || this.time - this.chase.t > 0.4) {
      const portal = this.portalTile();
      this.chase = { e, t: this.time, path: findPath(map, from, to, portal ? new Set([portal.y * map.w + portal.x]) : null) };
    }
    const path = this.chase.path;
    if (!path || path.length < 3) return null;
    const k = path.findIndex((q) => q.x === from.x && q.y === from.y);
    if (k < 0) { this.chase = null; return null; }
    const nx = center(path[Math.min(path.length - 1, k + 1)]);
    const dx = nx.x - p.x, dy = nx.y - p.y;
    return [Math.abs(dx) > 1.5 ? Math.sign(dx) : 0, Math.abs(dy) > 1.5 ? Math.sign(dy) : 0];
  }

  // Mana refills on its own; arrows and knives don't, so save a reserve for wardens and for
  // things the blade can't reach.
  rangedReady(target) {
    const g = this.g, items = g.state.gear.items;
    const id = items[g.state.gear.selected % Math.max(1, items.length)];
    const it = USE_ITEMS[id];
    if (!it || id === 'bombs') return false;
    if (it.mana) return g.state.player.mana >= g.derived.fireboltCost + 4;
    const ammo = g.state.player[it.ammo];
    if (ammo <= 0) return false;
    if (target && target.boss) return target.vulnerable || ammo > 8;
    const unreachable = target && (target.flying || (this.engaged === target && this.engageT > 3));
    return unreachable || ammo > 18;
  }

  // The return seal ends the dungeon the moment you touch it; only step on it on purpose.
  portalTile() {
    const a = this.g.area;
    if (a.kind !== 'dungeon' || !a.portalActive) return null;
    return a.room.objects.find((o) => o.type === 'portal') || null;
  }

  bestMove(list, focus, desired, here) {
    const g = this.g, p = g.player, map = g.area.map;
    const portal = this.portalTile();
    // Ground we can walk back from: a diagonal step can clip a lava corner into a pocket we can't leave.
    const reach = this.reach?.area === g.area ? this.reach.map : null;
    let best = null, bs = -Infinity;
    const step = 7;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const l = Math.hypot(dx, dy) || 1;
      const qx = p.x + (dx / l) * step, qy = p.y + (dy / l) * step;
      const qt = tileOf(qx, qy);
      if ((dx || dy) && (!walkable(map, qt.x, qt.y) || (reach && reach[qt.y * map.w + qt.x] < 0))) continue;
      // A diagonal crosses one of its straight neighbours first: no cutting a pit's corner.
      if (dx && dy && [tileOf(qx, p.y), tileOf(p.x, qy)].some((t) => !walkable(map, t.x, t.y) && !map.isSolid(t.x, t.y))) continue;
      if (portal && Math.hypot(qx - (portal.x * TILE + 8), qy - (portal.y * TILE + 8)) < 14) continue;
      const dz = this.danger(qx, qy, list);
      let s = -dz.lv * 12;
      // Brambles prick from beside the tile too (Player's contact probes), not only underfoot.
      if ([[-7, 0], [7, 0], [0, -6], [0, 6]].some(([ox, oy]) => map.tileAtPixel(qx + ox, qy + oy) === T.THORNS)) s -= 8;
      const under = map.tileAtPixel(qx, qy + 2);
      if (under === T.BOG) s -= 4;
      s -= Math.abs(Math.hypot(focus.x - qx, focus.y - (qy - 2)) - desired) * 0.25;
      for (const e of list) if (e !== focus && Math.hypot(e.x - qx, e.y - qy) < 22) s -= 1.5;
      if (g.area.kind === 'dungeon') s -= Math.hypot(qx - ROOM_W * 8, qy - ROOM_H * 8) * 0.006;
      if (!dx && !dy) s += here.lv ? 0 : 0.3;
      if (s > bs) { bs = s; best = [dx, dy]; }
    }
    return best && (best[0] || best[1]) ? best : null;
  }

  // ---------------------------------------------------------------- movement
  *wait(seconds) { for (let t = 0; t < seconds; t += this.dt) yield; }

  // Walk to a tile in the current area. Returns true on arrival, false on failure or area change.
  *walkTo(goal, opts = {}) {
    const near = opts.near || 0;
    const area = this.g.area;
    let path = null, repath = 0, idx = 0, bestLeft = Infinity, sinceBest = 0;
    this.stuckAt = null;
    for (let t = 0; t < (opts.timeout || 150); t += this.dt) {
      const g = this.g, p = g.player, map = g.area.map;
      if (g.area !== area) return false;
      if (opts.until && opts.until()) return true;
      const cur = tileOf(p.x, p.y);
      const md = Math.abs(cur.x - goal.x) + Math.abs(cur.y - goal.y);
      const c = center(goal);
      if (near > 0 ? md <= near : Math.hypot(c.x - p.x, c.y - (p.y + (opts.feet || 0))) <= (opts.exact ? 2.5 : 5)) return true;
      repath -= this.dt;
      if (!path || repath <= 0) {
        const avoid = new Set(opts.avoid || []);
        const portal = this.portalTile();
        if (portal && (portal.x !== goal.x || portal.y !== goal.y)) avoid.add(portal.y * map.w + portal.x);
        for (const n of g.area.npcs()) {
          // Every tile whose centre we'd bump the villager from.
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const tx = Math.floor(n.x / TILE) + dx, ty = Math.floor(n.y / TILE) + dy;
            if (Math.abs(tx * TILE + 8 - n.x) < 13 && Math.abs(ty * TILE + 8 - n.y) < 11 && (tx !== goal.x || ty !== goal.y) && (tx !== cur.x || ty !== cur.y)) avoid.add(ty * map.w + tx);
          }
        }
        path = findPath(map, cur, goal, avoid);
        if (!path && avoid.size) path = findPath(map, cur, goal, opts.avoid);
        repath = 2.5; idx = 0;
        if (!path) { this.status = `No path to ${goal.x},${goal.y}`; this.note(this.status); yield; return false; }
      }
      let k = -1;
      for (let j = idx; j < Math.min(path.length, idx + 8); j++) if (path[j].x === cur.x && path[j].y === cur.y) { k = j; break; }
      if (k < 0) { path = null; yield; continue; }
      idx = k;
      // Progress check: jittering in place counts as stuck too.
      if (path.length - k < bestLeft) { bestLeft = path.length - k; sinceBest = 0; } else if ((sinceBest += this.dt) > 2.5) {
        sinceBest = 0; bestLeft = Infinity; path = null;
        if (g.area.npcs().some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 26)) yield* this.giveWay(goal); else yield;
        continue;
      }
      const next = path[Math.min(path.length - 1, k + 1)];
      if (isBush(map, next.x, next.y)) {
        // Hack through: face the bush and swing.
        this.status = 'Cutting through the brush';
        this.move(next.x - cur.x, next.y - cur.y);
        if (p.cool <= 0 && p.mode === 'normal' && Math.floor(this.time * 10) % 3 === 0) { this.want.clear(); this.tap(K.attack); }
        this.stuckAt = null;
        yield;
        continue;
      }
      const tc = center(next);
      let dx = tc.x - p.x, dy = tc.y - p.y;
      if (k + 1 >= path.length - 1 && near === 0) { dx = c.x - p.x; dy = c.y - p.y; }
      this.move(Math.abs(dx) > 1.5 ? Math.sign(dx) : 0, Math.abs(dy) > 1.5 ? Math.sign(dy) : 0);
      this.sprint(path.length - k, opts.sprint);
      if (this.unstick()) {
        path = null;
        if (g.area.npcs().some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 20)) { yield* this.giveWay(goal); continue; }
      }
      yield;
    }
    return false;
  }

  sprint(remaining, force) {
    const st = this.g.state.player.stamina;
    if (this.sprinting ? st < 10 : st > 45) this.sprinting = !this.sprinting;
    if ((force && st > 2) || (this.sprinting && remaining > 5)) this.want.add(K.sprint);
  }

  // Villagers stop and stare while you're close, so one standing in a doorway never moves aside.
  // Back off out of their sight for a few seconds and let them wander.
  *giveWay(spot) {
    const g = this.g, c = center(spot);
    const blocker = g.area.npcs && g.area.npcs().find((n) => Math.hypot(n.x - c.x, n.y - c.y) < 30);
    if (!blocker) { yield* this.wait(0.3); return; }
    this.status = `Waiting for ${blocker.data.name} to step aside`;
    const p = g.player, away = Math.atan2(p.y - blocker.y, p.x - blocker.x);
    const target = standableNear(g.area.map, tileOf(blocker.x + Math.cos(away) * 80, blocker.y + Math.sin(away) * 80), tileOf(p.x, p.y), 4);
    if (target) yield* this.walkTo(target, { near: 1, timeout: 4 });
    yield* this.wait(3);
  }

  // Detect getting wedged and wiggle free. Returns true when a re-path is warranted.
  unstick() {
    const p = this.g.player;
    if (!this.stuckAt || Math.hypot(p.x - this.stuckAt.x, p.y - this.stuckAt.y) > 4) { this.stuckAt = { x: p.x, y: p.y }; this.stuckT = 0; return false; }
    this.stuckT += this.dt;
    if (this.stuckT > 0.8) {
      this.want.clear();
      const a = Math.floor(this.time * 3) % 4;
      this.move([1, -1, 0, 0][a], [0, 0, 1, -1][a]);
      if (this.stuckT > 1.2) { this.stuckAt = null; return true; }
    }
    return false;
  }

  // Press a direction briefly so the hero faces it.
  *face(dx, dy) { for (let i = 0; i < 2; i++) { this.move(dx, dy); yield; } }

  // ---------------------------------------------------------------- travel between areas
  at(place) {
    const a = this.g.area, p = this.g.player;
    switch (place.kind) {
      case 'interior': return a.kind === 'interior' && a.building.id === place.id;
      case 'cave': return a.kind === 'cave' && a.cave.id === place.id;
      case 'dungeon': return a.kind === 'dungeon' && a.id === place.id;
      default: { if (a.kind !== 'overworld') return false; const t = tileOf(p.x, p.y); return Math.abs(t.x - place.x) + Math.abs(t.y - place.y) <= (place.near || 0); }
    }
  }

  entryFor(place) {
    const W = this.g.world;
    if (place.kind === 'interior') { const b = W.props.find((q) => q.id === place.id); return b && { tile: { x: b.door.x, y: b.door.y + 1 }, enter: b.door }; }
    if (place.kind === 'cave') { const c = W.pois.caves.find((q) => q.id === place.id); return c && { tile: c.front, enter: { x: c.x, y: c.y } }; }
    if (place.kind === 'dungeon') { const d = W.pois.dungeons[place.id]; return d && { tile: d.front, enter: d.door }; }
    return { tile: { x: place.x, y: place.y }, enter: null };
  }

  *goTo(place) {
    for (let tries = 0; tries < 12; tries++) {
      if (this.at(place)) return true;
      const a = this.g.area;
      if (a.kind === 'interior' || a.kind === 'cave') { this.status = 'Heading outside'; yield* this.walkTo(a.layout.exit, { feet: 3 }); yield* this.wait(0.1); continue; }
      if (a.kind === 'dungeon') { yield* this.leaveDungeon(); continue; }
      const ent = this.entryFor(place);
      if (!ent) return false;
      const p = this.g.player;
      const goal = ent.enter ? ent.tile : standableNear(a.map, ent.tile, tileOf(p.x, p.y), Math.max(4, place.near || 0));
      if (!goal) { this.status = `Can't reach ${place.kind} ${place.id || `${place.x},${place.y}`}`; this.note(this.status); yield* this.wait(1); return false; }
      const ok = yield* this.walkTo(goal, { near: ent.enter ? 0 : Math.min(place.near || 0, 1) });
      if (!ok) { yield* this.giveWay(goal); continue; }
      if (ent.enter) {
        for (let t = 0; t < 2 && this.g.area === a; t += this.dt) { const c = center(ent.enter); const p = this.g.player; this.move(Math.sign(Math.round(c.x - p.x)), -1); yield; }
      }
      if (place.kind === 'overworld') return true;
      yield;
    }
    return this.at(place) || (place.kind === 'overworld' && this.g.area.kind === 'overworld');
  }

  // ---------------------------------------------------------------- talking and interacting
  *talkTo(npcId) {
    const W = this.g.world, n = W.npcs.find((x) => x.id === npcId);
    if (!n) return false;
    this.status = `Talking to ${n.name}`;
    for (let tries = 0; tries < 6; tries++) {
      if (n.buildingId) { if (!(yield* this.goTo({ kind: 'interior', id: n.buildingId }))) continue; }
      else if (this.g.area.kind !== 'overworld' || !this.g.area.npcs().some((e) => e.data.id === npcId && Math.hypot(e.x - this.g.player.x, e.y - this.g.player.y) < 160)) {
        if (!(yield* this.goTo({ kind: 'overworld', x: n.x, y: n.y, near: 3 }))) continue;
      }
      const ent = () => this.g.area.npcs().find((e) => e.data.id === npcId);
      if (!ent()) { yield; continue; }
      if (yield* this.approachAndPress(ent, this.g.area.talkRange ? 30 : 16)) return true;
    }
    return false;
  }

  // Walk next to an entity, face it and press interact until a dialog opens.
  *approachAndPress(getEnt, range) {
    let wrong = null;
    for (let tries = 0; tries < 8; tries++) {
      const e = getEnt();
      if (!e) return false;
      const g = this.g, p = g.player, map = g.area.map;
      if (wrong) {
        // Someone else keeps answering: go round to the far side so our person stands between us.
        const ux = e.x - wrong.x, uy = e.y - wrong.y, l = Math.hypot(ux, uy) || 1;
        const spot = standableNear(map, tileOf(e.x + (ux / l) * 18, e.y + (uy / l) * 18), tileOf(p.x, p.y), 2);
        if (spot) yield* this.walkTo(spot, { exact: true, timeout: 8 });
      } else if (Math.hypot(e.x - p.x, e.y - p.y) > range) {
        const et = tileOf(e.x, e.y), cur = tileOf(p.x, p.y);
        const reach = reachMap(map, cur);
        let best = null, bd = Infinity;
        const others = g.area.npcs().filter((o) => o !== e);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const x = et.x + dx, y = et.y + dy;
          if ((!dx && !dy) || !walkable(map, x, y) || reach[y * map.w + x] < 0) continue;
          const c = center({ x, y }), dt = Math.hypot(c.x - e.x, c.y - e.y);
          // Stand where our person is clearly the nearest, so nobody else answers.
          const crowd = others.some((o) => Math.hypot(c.x - o.x, c.y - o.y) < dt + 10);
          const dd = Math.hypot(dx, dy) * 10 + Math.hypot(x - cur.x, y - cur.y) * 0.3 + (crowd ? 80 : 0);
          if (dd < bd) { bd = dd; best = { x, y }; }
        }
        if (!best) return false;
        yield* this.walkTo(best, { timeout: 12 });
      }
      const e2 = getEnt();
      if (!e2) return false;
      const fx = e2.x - this.g.player.x, fy = e2.y - this.g.player.y;
      yield* this.face(Math.abs(fx) > Math.abs(fy) * 0.5 ? Math.sign(fx) : 0, Math.abs(fy) > Math.abs(fx) * 0.5 ? Math.sign(fy) : 0);
      const seen = this.uiCount || 0;
      this.lastTalked = null;
      this.tap(K.interact);
      yield;
      // The dialog may open and close while this task is suspended, so count dialogs rather than look,
      // and make sure it was the right person who answered.
      for (let t = 0; t < 0.3 && (this.uiCount || 0) === seen; t += this.dt) yield;
      if ((this.uiCount || 0) > seen && (!this.lastTalked || this.lastTalked === e2.data?.id || !e2.data)) return true;
      if ((this.uiCount || 0) > seen && this.lastTalked) wrong = g.area.npcs().find((n) => n.data.id === this.lastTalked) || null;
    }
    return false;
  }

  // Stand beside a tile, face it and press interact (stones, boulders, shelves).
  *useTile(t, opts = {}) {
    for (let tries = 0; tries < 4; tries++) {
      const g = this.g, map = g.area.map, p = g.player;
      const cur = tileOf(p.x, p.y);
      const spot = opts.from || besideTile(map, t, cur, reachMap(map, cur));
      if (!spot) return false;
      if (!(yield* this.walkTo(spot, { exact: true, timeout: 40 }))) continue;
      const fx = t.x - spot.x, fy = t.y - spot.y;
      yield* this.face(Math.sign(fx), Math.sign(fy));
      if (opts.then) { yield* opts.then(); return true; }
      this.tap(K.interact);
      yield;
      yield* this.wait(0.1);
      while (this.g.uiStack.length) yield;
      return true;
    }
    return false;
  }

  // Walk to a chest and open it.
  *openChest(ch) {
    if (ch.opened || ch.hidden) return true;
    const map = this.g.area.map, t = tileOf(ch.x, ch.y);
    const spot = besideTile(map, t, tileOf(this.g.player.x, this.g.player.y), reachMap(map, tileOf(this.g.player.x, this.g.player.y)));
    if (!spot) return false;
    yield* this.walkTo(spot, { exact: true, timeout: 30 });
    for (let k = 0; k < 4 && !ch.opened; k++) {
      for (let i = 0; i < 6; i++) { this.move(Math.sign(Math.round(ch.x - this.g.player.x)), Math.sign(Math.round(ch.y - this.g.player.y))); yield; }
      this.tap(K.interact); yield;
      yield* this.wait(0.15);
    }
    return ch.opened;
  }

  // ---------------------------------------------------------------- tools on the overworld
  *selectItem(id) {
    const gear = this.g.state.gear;
    for (let k = 0; k < 8 && gear.items[gear.selected % gear.items.length] !== id; k++) { this.tap(K.cycle); yield; yield; }
  }

  // Throw a bomb at a cracked tile, then back off until it blows.
  *bombTile(t) {
    const before = this.g.area.map.get(t.x, t.y);
    for (let tries = 0; tries < 4 && this.g.area.map.get(t.x, t.y) === before; tries++) {
      if (this.g.state.player.bombs <= 0) { this.status = 'Out of bombs'; return false; }
      yield* this.selectItem('bombs');
      yield* this.useTile(t, {
        then: function* then() {
          this.tap(K.item);
          yield;
          const p = this.g.player, back = { x: Math.round((p.x - Math.cos(p.aim) * 48) / TILE - 0.5), y: Math.round((p.y - Math.sin(p.aim) * 48) / TILE - 0.5) };
          yield* this.walkTo(back, { timeout: 2 });
          yield* this.wait(1.6);
        }.bind(this),
      });
    }
    return this.g.area.map.get(t.x, t.y) !== before;
  }

  // ---------------------------------------------------------------- dungeons
  *runDungeon(id, full = false) {
    this.status = `Entering ${id}`;
    if (!(yield* this.goTo({ kind: 'dungeon', id }))) return false;
    for (let guard = 0; guard < 200; guard++) {
      const a = this.g.area;
      if (a.kind !== 'dungeon' || a.id !== id) return true;
      yield* this.roomTasks(full);
      if (this.g.area !== a) continue;
      if (!full && this.g.state.progress.bosses.includes(id)) { yield* this.leaveDungeon(); return true; }
      const plan = this.planDungeon(full);
      if (!plan) { yield* this.leaveDungeon(); return true; }
      this.status = `${a.name}: heading ${plan.dir} to room ${plan.to}`;
      yield* this.exitRoom(plan.dir);
    }
    return false;
  }

  *roomTasks(full) {
    const a = this.g.area, room = a.room, pr = this.g.state.progress;
    // Rooms lock their doors once you step inside; walk in so the fight (and any hidden chest) starts.
    if (a.enemyList.some((e) => !e.dead && e.hp > 0) && !pr.cleared.includes(`d:${a.key()}`)) {
      this.status = 'Clearing the room';
      const mid = standableNear(a.map, { x: 12, y: 7 }, tileOf(this.g.player.x, this.g.player.y), 6);
      if (mid) yield* this.walkTo(mid, { near: 2, timeout: 8 });
    }
    while (this.g.area === a && (a.shut || a.shutPending) && a.enemyList.some((e) => !e.dead)) yield;
    // A dying warden still hides its shard chest until it is gone.
    while (this.g.area === a && a.enemyList.some((e) => !e.dead && e.state === 'dying')) yield;
    if (this.g.area !== a) return;
    for (const ch of a.entities.filter((e) => e.contents && !e.opened && !e.hidden)) {
      if (full || ch.contents === 'key') yield* this.openChest(ch);
    }
    if (room.role === 'bossdoor' && this.g.state.player.hp < this.g.derived.maxHp) {
      const f = room.objects.find((o) => o.type === 'fountain');
      if (f) { this.status = 'Drinking from the fountain'; yield* this.useTile({ x: f.x, y: f.y }); }
    }
    // A tide room never counts as solved: its water is crossed afresh, whenever the way on is cut off.
    if (room.puzzle?.kind === 'tide') {
      const on = this.onwardDir(), p = this.g.player;
      if (on && reachMap(a.map, tileOf(p.x, p.y))[INNER[on].y * ROOM_W + INNER[on].x] < 0) yield* this.solveTide(on);
    } else if (room.puzzle && !pr.solved.includes(`${a.id}:${room.id}`)) yield* this.solvePuzzle();
  }

  // The door on to the next room of this one's chain (the parent's door has the lower id).
  onwardDir() {
    const r = this.g.area.room;
    return Object.keys(r.doors).filter((d) => r.doors[d].to > r.id).sort((x, y) => r.doors[x].to - r.doors[y].to)[0] ?? null;
  }

  planDungeon(full) {
    const a = this.g.area, pr = this.g.state.progress, id = a.id;
    const keys = pr.keys[id] || 0;
    const bossDone = pr.bosses.includes(id);
    const opened = new Set(pr.opened);
    const chestLeft = (r) => r.objects.some((o) => o.type === 'chest' && !opened.has(`d:${id}:${r.id}:chest`) && (full ? (o.contents !== 'shard' || bossDone) : o.contents === 'key'));
    const solved = (r) => pr.solved.includes(`${id}:${r.id}`);
    const visited = new Set(pr.visited[id] || []);
    const pass = (r, door, useKeys) => {
      if (door.to === null || door.to === undefined) return false;
      const pz = door.type === 'sealed' ? a.puzzleRoomFor(door) : door.type === 'locked' ? a.puzzleRoomFor(door, IN_ROOM_PUZZLES) : null;
      if (pz && !solved(pz) && pz.id !== r.id) return false;
      if (door.type === 'locked' && !pr.unlocked.includes(`${id}:${door.id}`)) return useKeys && keys > 0;
      return true;
    };
    const bfs = (useKeys) => {
      const prev = new Map([[a.roomId, null]]);
      const q = [a.roomId];
      while (q.length) {
        const rid = q.shift(), r = a.byId.get(rid);
        for (const [dir, door] of Object.entries(r.doors)) {
          if (prev.has(door.to) || !pass(r, door, useKeys)) continue;
          prev.set(door.to, { from: rid, dir });
          q.push(door.to);
        }
      }
      return prev;
    };
    const firstStep = (prev, target) => {
      let cur = target, step = null;
      while (cur !== a.roomId) { const p = prev.get(cur); step = { dir: p.dir, to: cur }; cur = p.from; }
      return step;
    };
    const pick = (prev, test) => {
      let best = null, bd = Infinity;
      for (const rid of prev.keys()) {
        if (rid === a.roomId || !test(a.byId.get(rid))) continue;
        let n = 0; for (let c = rid; c !== a.roomId; c = prev.get(c).from) n++;
        if (n < bd) { bd = n; best = rid; }
      }
      return best === null ? null : firstStep(prev, best);
    };
    const strict = bfs(false), loose = bfs(true);
    const boss = a.dungeon.bossId;
    return pick(strict, chestLeft)
      || (!bossDone && loose.has(boss) ? firstStep(loose, boss) : null)
      || pick(strict, (r) => r.puzzle && r.puzzle.kind !== 'tide' && !solved(r))
      || pick(loose, (r) => !visited.has(r.id))
      || (full ? pick(loose, chestLeft) : null);
  }

  *exitRoom(dir) {
    const a = this.g.area, start = a.roomId;
    if (a.room.puzzle?.kind === 'tide') yield* this.solveTide(dir);
    yield* this.walkTo(INNER[dir], { timeout: 20 });
    const [ox, oy] = OUT[dir];
    for (let t = 0; t < 3 && this.g.area === a && a.roomId === start; t += this.dt) {
      const p = this.g.player;
      const cx = dir === 'n' || dir === 's' ? 12 * TILE : p.x, cy = dir === 'w' || dir === 'e' ? 7.5 * TILE : p.y;
      this.move(ox || Math.sign(Math.round(cx - p.x)), oy || Math.sign(Math.round(cy - p.y)));
      yield;
    }
  }

  *leaveDungeon() {
    for (let guard = 0; guard < 60; guard++) {
      const a = this.g.area;
      if (a.kind !== 'dungeon') return;
      this.status = 'Leaving the dungeon';
      const portal = a.room.objects.find((o) => o.type === 'portal');
      if (portal && a.portalActive) { yield* this.walkTo({ x: portal.x, y: portal.y }, { exact: true, timeout: 15 }); yield; continue; }
      if (a.roomId === a.dungeon.entranceId) { yield* this.exitRoom('s'); yield; continue; }
      const prev = new Map([[a.roomId, null]]), q = [a.roomId];
      while (q.length) {
        const r = a.byId.get(q.shift());
        for (const [dir, door] of Object.entries(r.doors)) {
          if (door.to === null || prev.has(door.to) || !a.isDoorOpen(r, door)) continue;
          prev.set(door.to, { from: r.id, dir }); q.push(door.to);
        }
      }
      let cur = a.dungeon.entranceId, step = null;
      if (!prev.has(cur)) return;
      while (cur !== a.roomId) { const p = prev.get(cur); step = p.dir; cur = p.from; }
      yield* this.exitRoom(step);
    }
  }

  // ---------------------------------------------------------------- puzzles
  *solvePuzzle() {
    const a = this.g.area, kind = a.room.puzzle.kind;
    this.status = `Solving the ${{ switches: 'floor plates', ordered: 'crystals', push: 'block', timed: 'timed gate' }[kind]}`;
    for (let tries = 0; tries < 6 && this.g.area === a && !a.solved; tries++) {
      if (kind === 'switches') yield* this.solvePlates();
      else if (kind === 'ordered') yield* this.solveCrystals();
      else if (kind === 'push') yield* this.solveBlock();
      else yield* this.solveTimed();
    }
  }

  *solvePlates() {
    const a = this.g.area, links = a.room.puzzle.links;
    const plates = a.room.objects.filter((o) => o.type === 'plate');
    const tileSet = new Set(plates.map((o) => o.y * ROOM_W + o.x));
    for (let guard = 0; guard < 10 && !a.solved; guard++) {
      const st = a.plateState();
      let mask = -1;
      for (let m = 1; m < 16; m++) {
        const s = st.slice();
        for (let i = 0; i < 4; i++) if (m & (1 << i)) for (const j of links[i]) s[j] = !s[j];
        if (s.every(Boolean) && (mask < 0 || popcount(m) < popcount(mask))) mask = m;
      }
      if (mask < 0) return;
      const p = this.g.player, cur = tileOf(p.x, p.y);
      if (tileSet.has(cur.y * ROOM_W + cur.x)) {
        const off = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy })).find((q) => walkable(a.map, q.x, q.y) && !tileSet.has(q.y * ROOM_W + q.x));
        if (off) yield* this.walkTo(off, { exact: true, timeout: 5 });
        continue;
      }
      const i = [0, 1, 2, 3].find((k) => mask & (1 << k));
      const plate = plates.find((o) => o.index === i);
      const avoid = new Set([...tileSet].filter((t) => t !== plate.y * ROOM_W + plate.x));
      yield* this.walkTo({ x: plate.x, y: plate.y }, { avoid, exact: true, timeout: 20 });
      yield* this.wait(0.1);
    }
  }

  *solveCrystals() {
    const a = this.g.area;
    for (let guard = 0; guard < 12 && !a.solved && this.g.area === a; guard++) {
      const c = a.room.objects.find((o) => o.type === 'crystal' && o.order === a.nextOrder);
      if (!c) return;
      const before = a.nextOrder;
      yield* this.useTile({ x: c.x, y: c.y }, {
        then: function* strike() {
          for (let t = 0; t < 1 && a.nextOrder === before && !a.solved; t += this.dt) {
            if (this.g.player.cool <= 0 && this.g.player.mode === 'normal') this.tap(K.attack);
            yield;
          }
        }.bind(this),
      });
    }
  }

  *solveBlock() {
    const a = this.g.area;
    const blk = a.objs.find((o) => o.obj.type === 'block'), tg = a.room.objects.find((o) => o.type === 'blockTarget');
    for (let guard = 0; guard < 12 && !a.solved && this.g.area === a; guard++) {
      const dx = Math.sign(tg.x - blk.bx), dy = Math.sign(tg.y - blk.by);
      if (!dx && !dy) { yield; continue; }
      const stand = { x: blk.bx - dx, y: blk.by - dy };
      yield* this.walkTo(stand, { exact: true, timeout: 20 });
      const bx = blk.bx, by = blk.by;
      for (let t = 0; t < 1.5 && blk.bx === bx && blk.by === by; t += this.dt) { this.move(dx, dy); yield; }
      yield* this.wait(0.25);
    }
  }

  *solveTimed() {
    const a = this.g.area, room = a.room;
    const sw = room.objects.find((o) => o.type === 'timedSwitch');
    const gate = room.puzzle.gate;
    if (!sw || !gate.length) return;
    const horiz = gate[0].y === gate[gate.length - 1].y;
    const exitDir = horiz ? (gate[0].y < 7 ? 'n' : 's') : (gate[0].x > 12 ? 'e' : 'w');
    const p = this.g.player;
    const onSwitch = () => tileOf(p.x, p.y).x === sw.x && tileOf(p.x, p.y).y === sw.y;
    if (onSwitch() || a.gateTimer > 0) {
      const off = besideTile(a.map, { x: sw.x, y: sw.y }, tileOf(p.x, p.y));
      if (off) yield* this.walkTo(off, { exact: true, timeout: 4 });
      while (a.gateTimer > 0) yield;
    }
    // Rest up so the sprint lasts, then step on the switch and break for the nearest gap.
    while (this.g.state.player.stamina < this.g.derived.maxStamina * 0.9) yield;
    yield* this.walkTo({ x: sw.x, y: sw.y }, { timeout: 25, until: () => a.gateTimer > 0 });
    for (let t = 0; t < 0.3 && a.gateTimer <= 0; t += this.dt) yield;
    if (a.gateTimer <= 0) return;
    const [ox, oy] = OUT[exitDir];
    const reach = reachMap(a.map, tileOf(p.x, p.y));
    let best = null, bd = Infinity;
    for (const gt of gate) {
      const b = { x: gt.x + ox, y: gt.y + oy };
      const r = walkable(a.map, b.x, b.y) ? reach[b.y * ROOM_W + b.x] : -1;
      if (r >= 0 && r < bd) { bd = r; best = b; }
    }
    if (!best) return;
    yield* this.walkTo(best, { sprint: true, near: 0, timeout: a.room.puzzle.duration + 1, until: () => a.solved });
  }

  // Cross a tide room to the door `dir`: plan over (tile, tide), walk each dry stretch, and throw the
  // levers on the way. Re-plans after every throw, so a tide left anyhow is no trouble.
  *solveTide(dir = this.onwardDir()) {
    const a = this.g.area;
    if (a.room.puzzle?.kind !== 'tide' || !dir) return false;
    const goal = INNER[dir];
    for (let throws = 0; throws < 8 && this.g.area === a; throws++) {
      const plan = this.tidePlan(goal);
      if (!plan) { this.status = 'No way across the water'; this.note(this.status); return false; }
      if (!plan.length) { this.status = 'Wading across'; return yield* this.walkTo(goal, { timeout: 30 }); }
      this.status = 'Turning the tide';
      const before = a.tide;
      yield* this.useTile(plan[0].lever, { from: plan[0].from });
      for (let t = 0; t < 0.3 && a.tide === before; t += this.dt) yield;
    }
    return false;
  }

  // The (tile, tide) BFS through our own walkable(): a tide tile is open when its set is dry at that
  // tide, and a lever is thrown from a tile beside it. Returns the throws in order ({lever, from}),
  // [] when the goal is already a walk away, or null when it can't be reached.
  tidePlan(goal) {
    const a = this.g.area, map = a.map, pz = a.room.puzzle, p = this.g.player, W = map.w;
    // A state is tile * 2 + tide (0: 'a', 1: 'b').
    const side = new Map([...pz.a.map((c) => [c.y * W + c.x, 0]), ...pz.b.map((c) => [c.y * W + c.x, 1])]);
    const throwAt = new Map();
    for (const l of pz.levers) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) throwAt.set((l.y + dy) * W + l.x + dx, l);
    const open = (x, y, s) => { const k = side.get(y * W + x); return k === undefined ? walkable(map, x, y) : k === s; };
    const cur = tileOf(p.x, p.y), start = (cur.y * W + cur.x) * 2 + (a.tide === 'a' ? 0 : 1);
    const prev = new Map([[start, -1]]), q = [start];
    for (let h = 0; h < q.length; h++) {
      const st = q[h], i = st >> 1, s = st & 1, x = i % W, y = (i / W) | 0;
      if (x === goal.x && y === goal.y) {
        const throws = [];
        for (let k = st; prev.get(k) >= 0; k = prev.get(k)) {
          const j = prev.get(k) >> 1;
          if (j === k >> 1) throws.unshift({ lever: throwAt.get(j), from: { x: j % W, y: (j / W) | 0 } });
        }
        return throws;
      }
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy, s)).map(([dx, dy]) => ((y + dy) * W + x + dx) * 2 + s);
      if (throwAt.has(i)) next.push(st ^ 1);
      for (const n of next) if (!prev.has(n)) { prev.set(n, st); q.push(n); }
    }
    return null;
  }

  // ---------------------------------------------------------------- the any% route
  npc(settlementId, role) { return this.g.world.npcs.find((n) => n.settlementId === settlementId && n.role === role); }

  *anyRoute() {
    for (let guard = 0; guard < 400 && this.g.state.quest.main !== 'end'; guard++) {
      yield* this.mainStep(false);
      yield;
    }
  }

  *clearCamp(camp) {
    if (!camp) return;
    this.status = 'Clearing the warband camp';
    const g = this.g, pr = g.state.progress;
    for (let tries = 0; tries < 6 && !pr.cleared.includes(camp.id); tries++) {
      yield* this.goTo({ kind: 'overworld', x: camp.x, y: camp.y, near: 2 });
      yield* this.wait(1.5);
      // Archers keep their distance and brawls drift past the fight leash, so a lull doesn't mean the camp
      // is empty. Go after whoever is left: walking out lets the warband muster again at full strength.
      for (let k = 0; k < 30 && !pr.cleared.includes(camp.id); k++) {
        const p = g.player, far = (e) => Math.hypot(e.x - p.x, e.y - p.y);
        const left = g.area.enemyList.filter((e) => e.spawnId === camp.id && !e.dead && e.hp > 0);
        // The camp tallies its dead a beat after the last one falls.
        if (!left.length) { for (let t = 0; t < 0.6 && !pr.cleared.includes(camp.id); t += this.dt) yield; break; }
        const e = left.filter((x) => ((this.ignore && this.ignore.get(x)) || 0) <= this.time).sort((a, b) => far(a) - far(b))[0];
        if (e) yield* this.walkTo(tileOf(e.x, e.y), { near: 1, timeout: 3, until: () => e.hp <= 0 }); else yield* this.wait(0.5);
      }
      if (pr.cleared.includes(camp.id)) break;
      // The warband musters as you approach; if it hasn't, walk out and back in.
      const W = this.g.world, home = W.settlements.find((s) => s.id === 'outpost').center;
      const away = { x: Math.round(camp.x + (home.x - camp.x) * 0.5), y: Math.round(camp.y + (home.y - camp.y) * 0.5) };
      yield* this.goTo({ kind: 'overworld', x: away.x, y: away.y, near: 3 });
    }
  }

  *climbLookout(id) {
    const l = this.g.world.pois.lookouts.find((x) => x.id === id);
    if (!l) return;
    this.status = { lookout: 'Climbing the watchtower', windcrest: 'Climbing the Windcrest', belfry: 'Climbing the Drowned Belfry' }[id];
    yield* this.goTo({ kind: 'overworld', x: l.x, y: l.y + 1, near: 1 });
    if (this.g.state.quest.main === id && this.g.area.kind === 'overworld' && !this.g.uiStack.length) yield* this.useTile({ x: l.x, y: l.y });
    yield* this.wait(0.5);
  }

  *gatherRelics(kind) {
    const g = this.g, W = g.world, pr = g.state.progress, stage = g.state.quest.main;
    for (let guard = 0; guard < 12 && g.state.quest.main === stage; guard++) {
      const here = g.overworldPos() || W.pois.home;
      const left = W.pois.relics[kind].filter((r) => !pr.relics.includes(r.id)).sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
      if (!left.length) return;
      const r = left[0], done = () => pr.relics.includes(r.id);
      if (kind === 'leaves') { this.status = 'Recovering a leaf of the Sigil'; yield* this.collectAt({ x: r.x, y: r.y }, done); }
      else if (kind === 'vents') {
        if (g.state.player.bombs <= 0) { yield* this.resupply(); if (g.state.player.bombs <= 0) return; }
        this.status = 'Capping a magma vent';
        yield* this.goTo({ kind: 'overworld', x: r.x, y: r.y, near: 3 });
        if (g.area.kind === 'overworld' && !done()) yield* this.bombTile({ x: r.x, y: r.y });
      } else if (kind === 'bells') {
        // Out over the water: freeze a path first, then ring from the ice in front of the bell.
        this.status = 'Ringing a Tide Bell';
        yield* this.goTo({ kind: 'overworld', x: r.x, y: r.y, near: 4 });
        if (g.area.kind === 'overworld' && !done()) yield* this.freezePoolAt(r);
        if (g.area.kind === 'overworld' && !done()) yield* this.useTile({ x: r.x, y: r.y });
      } else {
        this.status = 'Lighting a signal beacon';
        yield* this.goTo({ kind: 'overworld', x: r.x, y: r.y + 1, near: 2 });
        if (g.area.kind === 'overworld' && !done()) yield* this.useTile({ x: r.x, y: r.y });
      }
      yield;
    }
  }

  // Stand on the nearest dry tile with the bell's pool straight ahead and hold the Rime Charm over it.
  *freezePoolAt(bell) {
    const g = this.g, map = g.area.map;
    const frozen = () => !bell.pool.some((q) => map.get(q.x, q.y) === T.FLOOD);
    for (let tries = 0; tries < 4 && !frozen(); tries++) {
      const cur = tileOf(g.player.x, g.player.y), reach = reachMap(map, cur);
      let best = null;
      for (const q of bell.pool) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = q.x - dx, y = q.y - dy, d = reach[y * map.w + x];
        if (map.get(q.x, q.y) === T.FLOOD && walkable(map, x, y) && d >= 0 && (!best || d < best.d)) best = { x, y, d, water: q };
      }
      if (!best) return false;
      this.status = 'Freezing a flooded pool';
      yield* this.useTile(best.water, { from: best });
    }
    return frozen();
  }

  // Walk up to a seal's arena: the thornwall ritual triggers there, and the elites climb out there.
  *atSeal(key, label) {
    const g = this.g, seal = g.world.pois.seals[key], stage = g.state.quest.main;
    if (!seal) return;
    this.status = label;
    yield* this.goTo({ kind: 'overworld', x: seal.arena.x, y: seal.arena.y, near: 1 });
    // Guardians don't path around obstacles, so go to them.
    for (let t = 0; t < 12 && g.state.quest.main === stage && g.area.kind === 'overworld'; t++) {
      const e = g.area.enemyList.find((x) => x.elite && !x.dead && x.state !== 'dying');
      if (e) yield* this.walkTo(tileOf(e.x, e.y), { near: 1, timeout: 3 });
      else yield* this.wait(0.5);
    }
  }

  *openGate(region) {
    const gate = this.g.world.pois.gates.find((q) => q.region === region);
    this.status = region === 'volcanic' ? 'Blasting the cracked ridge' : 'Heaving the boulder aside';
    yield* this.goTo({ kind: 'overworld', x: gate.x, y: gate.y, near: 3 });
    if (this.g.area.kind !== 'overworld') return;
    const t = { x: gate.x, y: gate.y };
    if (region === 'volcanic') yield* this.bombTile(t);
    else yield* this.useTile(t);
  }

}

// The 100% route and its job runners live in full.js.
Object.assign(Bot.prototype, fullMethods);

function popcount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
