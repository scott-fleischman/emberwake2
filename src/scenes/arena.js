// Combat arena debug mode: spawn archetypes/bosses on demand and review a balance log.
import { GameScene, controlsMenu } from './game.js';
import { Area } from '../game/areas.js';
import { Enemy } from '../game/enemies.js';
import { createBoss } from '../game/bosses.js';
import { newGameState, derivedStats } from '../game/state.js';
import { TileMap } from '../world/tilemap.js';
import { T, TILE, BIOME_NAMES } from '../world/tiles.js';
import { RoomRenderer } from '../gfx/render.js';
import { THEMES } from '../gfx/palette.js';
import { text, panel, Menu } from '../gfx/ui.js';
import { UI } from '../gfx/palette.js';
import { CLASS_ORDER, CLASSES } from '../data/classes.js';

const AW = 28, AH = 16;
const ARCH = ['brute', 'lunger', 'skirmisher', 'ranged'];
const BOSSES = ['thornmaw', 'cinder', 'rime'];

export class ArenaArea extends Area {
  constructor(game) {
    super(game, 'arena');
    this.map = new TileMap(AW, AH, T.DFLOOR);
    for (let x = 0; x < AW; x++) { this.map.tiles[x] = T.DWALL; this.map.tiles[(AH - 1) * AW + x] = T.DWALL; }
    for (let y = 0; y < AH; y++) { this.map.tiles[y * AW] = T.DWALL; this.map.tiles[y * AW + AW - 1] = T.DWALL; }
    for (const [x, y] of [[7, 5], [20, 5], [7, 10], [20, 10]]) this.map.tiles[y * AW + x] = T.DWALL;
    this.renderer = new RoomRenderer(this.map, { ...THEMES.verdant, kind: 'dungeon' });
    this.name = 'Arena';
  }
  drawGround(g, cam) { this.renderer.draw(g, cam); }
  onBossDefeated(boss) { this.game.log(`${boss.name.split(',')[0]} defeated in ${(this.time - boss.spawnT).toFixed(1)}s`); this.boss = null; }
  enemyKilled(e) {
    const ttk = this.time - e.spawnT;
    this.game.log(`${e.name} (${e.archetype}) defeated · ${ttk.toFixed(1)}s`);
    const s = this.game.stats;
    s.kills++;
    (s.ttk[e.archetype] = s.ttk[e.archetype] || []).push(ttk);
  }
}

export class ArenaScene extends GameScene {
  constructor(app) {
    const st = newGameState('arena', 'swordsman');
    super(app, st);
    this.biome = 0;
    this.clsIdx = 0;
    this.bossIdx = 0;
    this.showLog = true;
    this.entries = [];
    this.stats = { dealt: 0, taken: 0, hitsTaken: 0, blocks: 0, kills: 0, ttk: {}, combatTime: 0 };
    this.outfit();
    this.log('Arena ready. 1-4 spawn archetypes, 5 squad, 6 boss.');
    app.audio.playMusic('dungeon');
  }

  restoreLocation() {
    this.setArea(new ArenaArea(this));
    this.placePlayer(AW * 8, AH * 8 + 32, 'up');
  }

  outfit() {
    const s = this.state;
    s.gear.items = [...CLASSES[s.classId].items, 'bombs'];
    if (!s.gear.items.includes('bow')) s.gear.items.push('bow');
    s.tools.bombs = true;
    s.gear.owned = [s.gear.weapon];
    this.refreshDerived();
    const d = derivedStats(s);
    Object.assign(s.player, { hp: d.maxHp, mana: d.maxMana, stamina: d.maxStamina, arrows: d.maxArrows, knives: d.maxKnives, bombs: d.maxBombs, food: 5 });
  }

  log(t) {
    this.entries.push({ t: this.area ? this.area.time : 0, text: t });
    if (this.entries.length > 12) this.entries.shift();
  }

  spawn(archetype) {
    const a = this.area, p = this.player;
    const ang = Math.random() * Math.PI * 2;
    const e = new Enemy(archetype, this.biome, Math.max(40, Math.min(AW * 16 - 40, p.x + Math.cos(ang) * 110)), Math.max(40, Math.min(AH * 16 - 40, p.y + Math.sin(ang) * 70)), { aggro: true, leash: 999, hpMult: this.diff.enemyHp });
    this.track(e);
    a.spawnEnemy(e);
  }

  track(e) {
    e.spawnT = this.area.time;
    const orig = e.damage.bind(e);
    e.damage = (amt, src, ctx, opts) => {
      const before = e.hp;
      const ok = orig(amt, src, ctx, opts);
      if (ok) this.stats.dealt += before - Math.max(0, e.hp);
      return ok;
    };
  }

  damagePlayer(dmg, src, opts) {
    const r = super.damagePlayer(dmg, src, opts);
    if (r === 'hit') { this.stats.taken += dmg * this.diff.damageTaken; this.stats.hitsTaken++; this.log(`Took ${dmg} from ${src?.name || src?.kind || 'hazard'}`); }
    if (r === 'blocked') { this.stats.blocks++; this.log(`Blocked ${src?.name || 'a projectile'}`); }
    return r;
  }

  die() {
    this.log('You fell — revived.');
    const d = this.derived;
    this.state.player.hp = d.maxHp;
    this.player.iframes = 2;
  }

  update(dt) {
    const input = this.input;
    if (!this.uiStack.length) {
      for (let k = 0; k < 4; k++) if (input.keyPressed(`Digit${k + 1}`)) { this.spawn(ARCH[k]); this.log(`Spawned ${ARCH[k]}`); }
      if (input.keyPressed('Digit5')) { for (const a of ['brute', 'lunger', 'ranged', 'skirmisher']) this.spawn(a); this.log('Spawned a mixed squad'); }
      if (input.keyPressed('Digit6')) {
        if (!this.area.boss || this.area.boss.dead) {
          const kind = BOSSES[this.bossIdx++ % 3];
          const b = createBoss(kind, AW * 8, AH * 8 - 30, this.diff.enemyHp);
          this.track(b);
          this.area.boss = b;
          this.area.spawnEnemy(b);
          this.audio.playMusic('boss');
          this.log(`Boss: ${b.name}`);
        }
      }
      if (input.keyPressed('Digit7')) { this.biome = (this.biome + 1) % 6; this.log(`Enemy family: ${BIOME_NAMES[this.biome]}`); }
      if (input.keyPressed('Digit8')) {
        this.clsIdx = (this.clsIdx + 1) % 4;
        const keep = this.state.seed;
        this.state = newGameState(keep, CLASS_ORDER[this.clsIdx]);
        this.player.look = undefined;
        this.player = new (this.player.constructor)(this, this.player.x, this.player.y);
        this.outfit();
        this.log(`Class: ${CLASSES[this.state.classId].name}`);
      }
      if (input.keyPressed('Digit9')) { this.outfit(); this.log('Healed and restocked'); }
      if (input.keyPressed('Digit0')) { for (const e of this.area.enemyList) e.dead = true; this.area.boss = null; this.log('Cleared enemies'); this.audio.playMusic('dungeon'); }
      if (input.keyPressed('Backquote')) this.showLog = !this.showLog;
      if (this.area.enemyList.length) this.stats.combatTime += dt;
    }
    super.update(dt);
  }

  openPause() {
    const m = new Menu('Arena', [
      { label: 'Resume', onSelect: () => { m.done = true; } },
      { label: 'Reset log', onSelect: () => { this.stats = { dealt: 0, taken: 0, hitsTaken: 0, blocks: 0, kills: 0, ttk: {}, combatTime: 0 }; this.entries = []; m.done = true; } },
      { label: 'Options', onSelect: () => this.pushUI(this.app.optionsMenu()) },
      { label: 'Controls', onSelect: () => this.pushUI(controlsMenu()) },
      { label: 'Back to title', onSelect: () => this.app.toTitle() },
    ], { width: 180 });
    this.pushUI(m);
  }

  saveGame() { this.toast('Saving is disabled in the arena.'); return false; }
  updateObjective() { this.objective = `Arena · ${CLASSES[this.state.classId].name} vs ${BIOME_NAMES[this.biome ?? 0]} family`; this.subObjective = '1-4 spawn · 5 squad · 6 boss · 7 family · 8 class · 9 restock · 0 clear · ` log'; }

  drawUI(u) {
    super.drawUI(u);
    if (!this.showLog) return;
    const s = this.stats;
    const x = 330, y = 26, w = 146;
    panel(u, x, y, w, 196, { fill: 'rgba(14,10,18,0.82)' });
    text(u, 'Balance review', x + 6, y + 10, { size: 7, bold: true, color: UI.gold });
    const dps = s.combatTime > 0 ? s.dealt / s.combatTime : 0;
    const lines = [
      `Damage dealt ${s.dealt.toFixed(0)} · DPS ${dps.toFixed(2)}`,
      `Damage taken ${s.taken.toFixed(1)} over ${s.hitsTaken} hits`,
      `Blocks ${s.blocks} · Kills ${s.kills}`,
      `Hits taken per kill ${(s.kills ? s.hitsTaken / s.kills : 0).toFixed(2)}`,
      ...ARCH.map((a) => { const v = s.ttk[a]; return `${a.padEnd(10)} avg TTK ${v ? (v.reduce((p, q) => p + q, 0) / v.length).toFixed(1) + 's' : '—'} (${v ? v.length : 0})`; }),
    ];
    lines.forEach((l, k) => text(u, l, x + 6, y + 22 + k * 8, { size: 5.5 }));
    text(u, 'Log', x + 6, y + 96, { size: 6, bold: true, color: UI.gold });
    this.entries.slice(-10).forEach((e, k) => text(u, `${e.t.toFixed(1).padStart(5)}  ${e.text}`, x + 6, y + 106 + k * 8.5, { size: 5, color: '#d8ccb8' }));
  }
}
