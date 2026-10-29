// Areas: the overworld, building interiors and caves (dungeons live in dungeon.js).
import { TileMap } from '../world/tilemap.js';
import { T, D, TILE, BIOME, BIOME_MUSIC, BIOME_NAMES } from '../world/tiles.js';
import { generateInterior } from '../world/interiors.js';
import { generateCave } from '../world/caves.js';
import { OverworldRenderer, RoomRenderer, drawDarkness, drawCampfire, drawEmberGlow } from '../gfx/render.js';
import { THEMES, CAVE_THEMES } from '../gfx/palette.js';
import { R } from '../gfx/sprites.js';
import { NPC, Chest, Cache, Pickup, Particles, Explosion, FloatText, Critter, DigSpot, Poof } from './entities.js';
import { HERBS } from '../data/sidequests.js';
import { bookFor } from '../data/story.js';
import { Enemy } from './enemies.js';
import { meleeTargets, knockbackVector, isBehind } from './combat.js';
import { findFreeSpot, rectSolid } from './physics.js';
import { makeRng } from '../core/rng.js';
import { openSeal, freezePool, WARDS } from '../world/wards.js';
import { stageElite, stageRelics, ELITE_SEAL, MAIN_STAGES } from './quests.js';
import { Elite, SigilLeaf } from './elites.js';
import { collectWardProps } from '../gfx/wards.js';
import { tickZones, drawZones } from './zones.js';
import { Lever } from './puzzles.js';

const overlap = (a, b, pad = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;

export class Area {
  constructor(game, kind) {
    this.game = game;
    this.kind = kind;
    this.entities = [];
    this.enemyList = [];
    this.zones = []; // telegraphed hazards, see zones.js
    this.tokens = new Set();
    this.tokenMax = 2;
    this.time = 0;
    this.ctxObj = { game, area: this, map: null, player: null, time: 0 };
  }
  get ctx() {
    const c = this.ctxObj;
    c.map = this.map; c.player = this.game.player; c.time = this.time;
    return c;
  }
  spawn(e) { this.entities.push(e); return e; }
  spawnEnemy(e) { this.entities.push(e); this.enemyList.push(e); return e; }
  targetables() { return this.enemyList.filter((e) => !e.dead && e.hp > 0 && e.state !== 'dying' && !e.untargetable); }
  npcs() { return this.entities.filter((e) => e instanceof NPC); }
  // Would the player standing here be carried out of the area? Nothing may shove them into it.
  exitsAt(x, y) { return this.map.tileAtPixel(x, y + 3) === T.EXIT; }
  canStand(a, x, y) { return !this.exitsAt(x, y) && !rectSolid(this.map, x, y, a.w, a.h, (tx, ty) => this.map.isSolid(tx, ty)); }

  update(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const p = this.game.player;
    p.update(dt, ctx);
    for (const e of this.entities) if (!e.dead) e.update(dt, ctx);
    // NPCs are solid to the player: shoved out along the shallower overlap, else sideways, else not at
    // all. Never into a wall or a doorway: a villager on a door's exit spot would shove whoever stepped
    // out back in.
    for (const n of this.entities) {
      if (!(n instanceof NPC) || !overlap(n, p)) continue;
      const ox = (n.w + p.w) / 2 - Math.abs(p.x - n.x), oy = (n.h + p.h) / 2 - Math.abs(p.y - n.y);
      const dx = Math.sign(p.x - n.x || 1) * ox, dy = Math.sign(p.y - n.y || 1) * oy;
      const shove = (ox < oy ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]]).find(([sx, sy]) => this.canStand(p, p.x + sx, p.y + sy));
      if (shove) { p.x += shove[0]; p.y += shove[1]; }
    }
    this.entities = this.entities.filter((e) => !e.dead);
    this.enemyList = this.enemyList.filter((e) => !e.dead);
    this.zones = tickZones(this.zones, dt, ctx);
    for (const t of this.tokens) if (t.dead) this.tokens.delete(t);
    this.afterUpdate(dt, ctx);
  }
  afterUpdate() {}
  // Effects only (sparks, dust, smoke): keeps a cutscene's world alive while everything else waits.
  updateFx(dt) {
    const ctx = this.ctx;
    for (const e of this.entities) if (!e.dead && (e instanceof Particles || e instanceof Explosion || e instanceof FloatText || e instanceof Poof)) e.update(dt, ctx);
    this.entities = this.entities.filter((e) => !e.dead);
  }

  draw(g, cam) {
    this.drawGround(g, cam);
    drawZones(g, cam, this.zones, this.time);
    const list = [];
    this.collectTall(list, cam);
    const ctx = this.ctx;
    for (const e of this.entities) list.push({ y: e.sortY, draw: (gg) => e.draw(gg, cam, ctx) });
    const p = this.game.player;
    list.push({ y: p.sortY, draw: (gg) => p.draw(gg, cam) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.draw(g);
    this.drawOverlay(g, cam);
    if (p.lock && !p.lock.dead) {
      const x = p.lock.x - cam.left, y = p.lock.y - cam.top - 4, s = 9 + Math.sin(this.time * 8);
      g.strokeStyle = '#ffd040'; g.lineWidth = 1;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath(); g.moveTo(x + sx * s, y + sy * (s - 4)); g.lineTo(x + sx * s, y + sy * s); g.lineTo(x + sx * (s - 4), y + sy * s); g.stroke();
      }
    }
  }
  drawGround() {}
  collectTall() {}
  drawOverlay() {}

  meleeStrike(player, o, ctx) {
    const ox = player.x, oy = player.y - 2;
    let hit = false;
    for (const e of meleeTargets(ox, oy, o.angle, o.reach, o.arc, this.targetables())) {
      const crit = o.crit || (o.shadow && isBehind(e, player.x, player.y));
      const dmg = crit ? o.dmg * 2 : o.dmg;
      e.damage(dmg, player, ctx, { knock: knockbackVector(player.x, player.y, e.x, e.y, o.knock) });
      this.spawn(new Particles((e.x + ox) / 2, (e.y + oy) / 2, { count: 6, color: ['#ffffff', '#ffe0a0'], speed: 70, life: 0.2 }));
      if (crit) this.spawn(new FloatText(e.x, e.y - 14, 'Critical!', '#ffd040'));
      hit = true;
    }
    this.strikeWorld(player, o, ctx);
    if (hit) { this.game.hitstop = 0.05; this.game.cam.shake(1, 0.08); }
  }
  strikeWorld() {}

  resolveProjectile(p, ctx) {
    if (p.team === 'player') {
      for (const e of this.targetables()) {
        if (p.hitSet.has(e) || !overlap(p, e, 2)) continue;
        e.damage(p.dmg, p, ctx, { knock: [p.vx * 0.5, p.vy * 0.5] });
        p.hitSet.add(e);
        this.spawn(new Particles(p.x, p.y, { count: 5, color: '#ffffff', speed: 50, life: 0.2 }));
        if (p.pierce-- <= 0) { p.dead = true; return; }
      }
      this.projectileObjects(p, ctx);
    } else {
      const pl = ctx.player;
      if (pl.mode !== 'dead' && overlap(p, pl, 1)) {
        const r = this.game.damagePlayer(p.dmg, p, { projectile: true, effect: p.effect });
        if (r === 'blocked') {
          // Shields bat projectiles back.
          p.team = 'player'; p.vx *= -1.1; p.vy *= -1.1; p.angle += Math.PI; p.life = 1.2; p.reflected = true;
        } else if (r !== 'ignored') p.dead = true;
      }
    }
  }
  projectileObjects() {}

  explode(x, y, r, dmg, ctx) {
    this.spawn(new Explosion(x, y, r));
    this.spawn(new Particles(x, y, { count: 18, color: ['#ffb040', '#ff7020', '#6a5a50'], speed: 90, life: 0.6 }));
    this.game.audio.sfx('explode');
    this.game.cam.shake(4, 0.3);
    for (const e of this.targetables()) {
      if (Math.hypot(e.x - x, e.y - y) < r + e.w / 2) e.damage(dmg, { x, y }, ctx, { knock: knockbackVector(x, y, e.x, e.y, 200) });
    }
    const p = ctx.player;
    if (Math.hypot(p.x - x, p.y - y) < r * 0.8) this.game.damagePlayer(2, { x, y });
    this.explodeWorld(x, y, r, ctx);
  }
  explodeWorld() {}

  onEnemyKilled(e, ctx) {
    this.dropLoot(e.x, e.y, e.archetype === 'brute' ? 1.4 : 1);
    this.game.onEnemyKilled(e);
    this.enemyKilled(e, ctx);
  }
  enemyKilled() {}

  dropLoot(x, y, mult = 1) {
    const g = this.game, s = g.state, d = g.derived;
    if (Math.random() > (0.55 + d.scavenge) * mult) return;
    const low = s.player.hp < d.maxHp * 0.4;
    const table = [['coin', 5], ['heart', low ? 5 : 2], ['food', 0.6]];
    if (s.gear.items.includes('firebolt')) table.push(['mana', 1.5]);
    if (s.gear.items.includes('bow')) table.push(['arrows', 1.5]);
    if (s.gear.items.includes('knives')) table.push(['knives', 1.5]);
    if (s.tools.bombs) table.push(['bombs', 0.8]);
    const total = table.reduce((a, t) => a + t[1], 0);
    let r = Math.random() * total, kind = 'coin';
    for (const [k, w] of table) { if ((r -= w) < 0) { kind = k; break; } }
    const value = kind === 'coin' ? (Math.random() < 0.2 ? 5 : 1) : kind === 'arrows' ? 5 : kind === 'knives' ? 3 : kind === 'bombs' ? 2 : 1;
    this.spawn(new Pickup(kind, x, y, value, { pop: true }));
  }

  // Interact with whatever is in front of the player. Subclasses add their own targets first.
  interact() {
    const p = this.game.player;
    const npc = this.npcInFront(p, this.talkRange || 24);
    if (npc) { this.game.talk(npc); return true; }
    const chest = this.entities.find((e) => e instanceof Chest && !e.opened && !e.hidden && Math.hypot(e.x - p.x, e.y - p.y) < 20);
    if (chest) { this.game.openChest(chest); return true; }
    const lever = this.entities.find((e) => e instanceof Lever && Math.hypot(e.x - p.x, e.y - p.y) < 22);
    if (lever) { lever.use(this.game); return true; }
    return false;
  }
  npcInFront(p, range) {
    let best = null, bd = range;
    for (const n of this.npcs()) {
      const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy);
      if (d > bd) continue;
      if (d > 10 && (dx * Math.cos(p.aim) + dy * Math.sin(p.aim)) / d < 0.2) continue;
      best = n; bd = d;
    }
    return best;
  }
}

// ------------------------------------------------------------------ overworld
const GATED_REGION = { [BIOME.VOLCANIC]: 'volcanic', [BIOME.SNOW]: 'snow' };
const ELITE_RISE = {
  slagheart: { color: ['#ff7030', '#ffd060', '#3a2a2a'], sub: 'Guardian of the firewall' },
  frostfang: { color: ['#e0f8ff', '#ffffff', '#a8c8e0'], sub: 'Leader of the pale pack' },
  bogking: { color: ['#6a8a4a', '#a0e0d0', '#2a4a3a'], sub: 'King of the drowned fens' },
};
const LOOKOUT_TEXT = {
  lookout: ['The old watchtower creaks in the wind. From the top you can see clear to the Vault.', 'Watchtower'],
  windcrest: ['A Kindler cairn on the Windcrest, its banner snapping in the wind. You can see the whole north from here.', 'The Windcrest'],
  belfry: ['A bell tower sunk to its knees in the fen, its great bell long gone. Water laps at the stair, but the top is still dry.', 'Drowned Belfry'],
};

export class OverworldArea extends Area {
  constructor(game) {
    super(game, 'overworld');
    const W = game.world;
    this.W = W;
    if (!game.overworldMap) game.overworldMap = TileMap.fromWorld(W);
    this.map = game.overworldMap;
    this.renderer = new OverworldRenderer(this.map, W);
    this.applyProgress();
    for (const n of W.npcs) if (n.x !== null && n.buildingId === null) this.spawn(new NPC(n, n.x * TILE + 8, n.y * TILE + 8, { wander: n.role === 'villager' }));
    for (const c of W.pois.caches) if (!game.state.progress.caches.includes(c.id)) this.spawn(new Cache(c));
    this.groups = new Map();
    this.groupT = 0;
    this.regionKey = null;
    this.spawnQuestItems();
    this.spawnWardItems();
    for (const camp of W.pois.camps) {
      if (game.state.progress.cleared.includes(camp.id) && !game.state.progress.opened.includes(`campchest:${camp.id}`)) this.spawnCampChest(camp);
    }
  }

  applyProgress() {
    const W = this.W, pr = this.game.state.progress;
    for (const key of pr.seals) openSeal(W, this.map, key);
    for (const id of pr.frozen) freezePool(W, this.map, id);
    for (const v of W.pois.relics.vents) if (pr.relics.includes(v.id) && this.map.get(v.x, v.y) === T.VENT) this.map.set(v.x, v.y, T.ASH);
    for (const g of W.pois.gates) if (pr.gates.includes(g.region) && (this.map.get(g.x, g.y) === T.CRACKED || this.map.get(g.x, g.y) === T.BOULDER)) this.map.set(g.x, g.y, T.ROAD);
    for (const c of W.pois.caches) {
      if (!pr.caches.includes(c.id) && !pr.opened.includes(`blocker:${c.id}`)) continue;
      const t = this.map.get(c.x, c.y + 1);
      if ((t === T.CRACKED || t === T.BOULDER) && pr.opened.includes(`blocker:${c.id}`)) this.map.set(c.x, c.y + 1, W.ground[(c.y + 1) * W.w + c.x]);
    }
  }

  spawnQuestItems() {
    const st = this.game.state;
    const has = (id) => this.entities.some((e) => e.id === id && !e.dead);
    for (const q of this.game.sideQuests) {
      if (st.quest.side[q.id] !== 'active') continue;
      if (q.type === 'fetch' && !has(q.id)) this.spawn(new Pickup('quest', q.target.x * TILE + 8, q.target.y * TILE + 8, 1, { permanent: true, id: q.id }));
      if (q.type === 'pet' && !has(q.id)) this.spawn(new Critter(q, q.spot.x * TILE + 8, q.spot.y * TILE + 8));
      if (q.type === 'treasure' && !has(`dig:${q.id}`)) this.spawn(new DigSpot(q, q.spot.x * TILE + 8, q.spot.y * TILE + 8));
      if (q.type === 'gather') {
        q.spots.forEach((p, k) => {
          const id = `herb:${q.id}:${k}`;
          if (!st.progress.opened.includes(id) && !has(id)) this.spawn(new Pickup('herb', p.x * TILE + 8, p.y * TILE + 8, 1, { permanent: true, id, questId: q.id, color: HERBS[q.herb].color }));
        });
      }
    }
  }

  // The Sigil's leaves only lie out on their shrines while the quest is looking for them.
  spawnWardItems() {
    const st = this.game.state;
    if (st.quest.main !== 'leaves') return;
    for (const r of this.W.pois.relics.leaves) {
      if (st.progress.relics.includes(r.id) || this.entities.some((e) => e.id === `relic:${r.id}` && !e.dead)) continue;
      this.spawn(new SigilLeaf(r, r.x * TILE + 8, r.y * TILE + 8));
    }
  }

  drawGround(g, cam) { this.renderer.drawGround(g, cam, this.time); }
  collectTall(list, cam) {
    this.renderer.collectTall(cam, list, this.time, this.game.player);
    collectWardProps(list, cam, this.time, this.map, this.W, this.game.state.progress);
  }

  afterUpdate(dt) {
    this.groupT -= dt;
    if (this.groupT <= 0) { this.groupT = 0.4; this.updateGroups(); }
    this.checkTransitions();
    if (this.game.area !== this) return; // we just left; player coordinates now belong to the new area
    this.updateRegion();
    this.wardTriggers();
  }

  // Standing atop a lookout, or bringing the leaves to the thornwall, moves the quest along.
  wardTriggers() {
    const g = this.game, p = g.player, st = g.state.quest.main, W = this.W;
    if (p.mode === 'dead' || g.uiStack.length) return;
    const near = (t, r) => Math.hypot(p.x - (t.x * TILE + 8), p.y - (t.y * TILE + 8)) < r * TILE;
    if (st === 'lookout' || st === 'windcrest' || st === 'belfry') {
      const l = W.pois.lookouts.find((x) => x.id === st);
      if (l && near(l, 1.7)) g.reachLookout(l.id);
    }
    if (st === 'thornwall' && W.pois.seals.verdant && near(W.pois.seals.verdant.arena, 2.5)) g.breakSeal('verdant');
  }

  // ------------------------------------------------ encounter groups
  groupDefs() {
    const W = this.W;
    if (this.defs) return this.defs;
    const defs = [];
    for (const c of W.pois.camps) defs.push({ id: c.id, kind: 'camp', x: c.x, y: c.y, biome: c.biome, count: c.size, data: c });
    for (const k of WARDS) {
      const d = W.pois.dungeons[k];
      defs.push({ id: `guard:${k}`, kind: 'guard', x: d.front.x, y: d.front.y + 3, biome: d.biome, count: 3, ward: k });
    }
    for (const [kind, list] of Object.entries(W.pois.relics)) for (const r of list) defs.push({ id: `relic:${r.id}`, kind: 'relic', x: r.x, y: r.y + 1, biome: W.biome[r.y * W.w + r.x], count: 3, relic: r, relicKind: kind });
    for (const s of W.pois.spawns) defs.push({ id: s.id, kind: 'wild', x: s.x, y: s.y, biome: s.biome, count: s.count });
    for (const p of W.pois.patrols) defs.push({ id: p.id, kind: 'patrol', x: p.path[0].x, y: p.path[0].y, biome: p.biome, count: 2, path: p.path });
    this.defs = defs;
    return defs;
  }

  updateGroups() {
    const p = this.game.player, pr = this.game.state.progress;
    const ptx = p.x / TILE, pty = p.y / TILE;
    const stage = this.game.state.quest.main;
    this.updateElite(ptx, pty);
    for (const def of this.groupDefs()) {
      const d = Math.hypot(def.x - ptx, def.y - pty);
      let grp = this.groups.get(def.id);
      if ((def.kind === 'camp' || def.kind === 'guard' || def.kind === 'relic') && pr.cleared.includes(def.id)) continue;
      if (def.kind === 'guard' && !pr.seals.includes(def.ward)) continue; // nothing gets past the seal, not even them
      if (def.kind === 'relic' && !grp && (stageRelics(stage) !== def.relicKind || pr.relics.includes(def.relic.id))) continue;
      if (!grp && d < 22 && d > 12) {
        if (def.down && (performance.now() - def.downAt < 45000)) continue;
        grp = { def, enemies: [] };
        const rng = makeRng(`${def.id}:${Math.floor(performance.now() / 1000)}`);
        const mix = def.kind === 'camp' || def.kind === 'guard' ? ['brute', 'lunger', 'ranged', 'skirmisher', 'lunger'] : ['lunger', 'skirmisher', 'ranged', 'brute'];
        rng.shuffle(mix);
        for (let k = 0; k < def.count; k++) {
          const e = new Enemy(def.kind === 'camp' ? mix[k % mix.length] : rng.pick(mix), def.biome, def.x * TILE + 8 + rng.int(-24, 24), def.y * TILE + 8 + rng.int(-20, 20), { spawnId: def.id, hpMult: this.game.diff.enemyHp, leash: def.kind === 'camp' ? 160 : 220 });
          if (def.kind === 'patrol') e.patrol = def.path.map((q) => ({ x: q.x * TILE + 8, y: q.y * TILE + 8 }));
          if (!findFreeSpot(this.map, e, 4)) continue;
          // A relic's guards stand on its own level, never down a cliff from it.
          if (def.kind === 'relic' && this.map.elev[Math.floor(e.y / TILE) * this.map.w + Math.floor(e.x / TILE)] !== this.map.elev[def.relic.y * this.map.w + def.relic.x]) continue;
          grp.enemies.push(this.spawnEnemy(e));
        }
        if (def.kind === 'camp' && def.data.quest) {
          const chief = new Elite('warchief', def.x * TILE + 8, (def.y - 1) * TILE + 8, { spawnId: def.id, hpMult: this.game.diff.enemyHp });
          chief.aggro = false; chief.leash = 170;
          if (findFreeSpot(this.map, chief, 4)) grp.enemies.push(this.spawnEnemy(chief));
        }
        this.groups.set(def.id, grp);
      } else if (grp) {
        const alive = grp.enemies.filter((e) => !e.dead);
        if (!alive.length) {
          this.groups.delete(def.id);
          if (grp.killed) this.groupCleared(def);
        } else if (d > 32 && alive.every((e) => !e.aggro)) {
          for (const e of alive) { e.dead = true; this.tokens.delete(e); }
          this.groups.delete(def.id);
        }
      }
    }
  }

  enemyKilled(e) {
    const grp = e.spawnId && this.groups.get(e.spawnId);
    if (grp) grp.killed = true;
    if (e.elite) this.game.onEliteDefeated(e);
  }

  // A chain's guardian climbs out of its seal once the stage calls for it, and stays until beaten.
  updateElite(ptx, pty) {
    const g = this.game, pr = g.state.progress, id = stageElite(g.state.quest.main);
    const live = this.entities.find((e) => e.elite && e.eliteId !== 'warchief' && !e.dead);
    if (live && live.eliteId !== id) { live.dead = true; this.tokens.delete(live); }
    if (!id || live || pr.elites.includes(id)) return;
    const seal = this.W.pois.seals[ELITE_SEAL[id]];
    if (!seal || Math.hypot(seal.arena.x - ptx, seal.arena.y - pty) > 20) return;
    const e = new Elite(id, seal.arena.x * TILE + 8, seal.arena.y * TILE + 8, { hpMult: g.diff.enemyHp });
    e.state = 'spawn'; e.timer = 0.9;
    if (!findFreeSpot(this.map, e, 5)) return;
    this.spawnEnemy(e);
    const rise = ELITE_RISE[id];
    this.spawn(new Particles(e.x, e.y, { count: 24, color: rise.color, speed: 90, life: 0.8 }));
    g.cam.shake(3, 0.5);
    g.audio.sfx('boss', { pitch: 1.2 });
    g.showBanner(e.name.split(',')[0], rise.sub);
  }

  groupCleared(def) {
    const g = this.game, pr = g.state.progress;
    if (def.kind === 'wild' || def.kind === 'patrol') { def.down = true; def.downAt = performance.now(); return; }
    if (pr.cleared.includes(def.id)) return;
    pr.cleared.push(def.id);
    if (def.kind === 'relic') { g.toast({ leaves: 'The shrine\'s guardians scatter.', vents: 'The vent\'s guardians are beaten.', beacons: 'The beacon\'s guardians are beaten.', bells: 'The bell\'s guardians are beaten.' }[def.relicKind]); return; }
    if (def.kind === 'camp') {
      g.toast('Camp cleared! A supply chest is left behind.');
      g.audio.sfx('puzzle');
      this.spawnCampChest(def.data);
      g.questEvent({ type: 'cleared', quest: !!def.data.quest, id: def.id });
    } else g.toast('The entrance guard has fallen.');
  }

  spawnCampChest(camp) {
    const id = `campchest:${camp.id}`;
    if (this.entities.some((e) => e.id === id)) return;
    this.spawn(new Chest(id, camp.x * TILE + 8, (camp.y + 1) * TILE + 8, 'camp'));
  }

  // ------------------------------------------------ world interactions
  strikeWorld(player, o) {
    const r = o.reach;
    for (let k = 0; k <= 2; k++) {
      const a = o.angle + (k - 1) * o.arc * 0.35;
      const tx = Math.floor((player.x + Math.cos(a) * r * 0.8) / TILE), ty = Math.floor((player.y + Math.sin(a) * r * 0.8) / TILE);
      if (this.map.getDeco(tx, ty) === D.BUSH) this.cutBush(tx, ty);
    }
  }
  cutBush(tx, ty) {
    this.map.setDeco(tx, ty, D.NONE);
    this.spawn(new Particles(tx * TILE + 8, ty * TILE + 8, { count: 10, color: ['#3d8a3a', '#56a24a', '#2e6b2e'], speed: 50, life: 0.5 }));
    this.game.audio.sfx('swing', { pitch: 1.6, volume: 0.5 });
    if (Math.random() < 0.25 + this.game.derived.scavenge) this.dropLoot(tx * TILE + 8, ty * TILE + 8, 2);
  }

  explodeWorld(x, y, r) {
    const g = this.game, W = this.W;
    const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE), t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
      if (Math.hypot(tx * TILE + 8 - x, ty * TILE + 8 - y) > r + 8) continue;
      if (this.map.getDeco(tx, ty) === D.BUSH) this.cutBush(tx, ty);
      if (this.map.get(tx, ty) === T.VENT) { this.capVent(tx, ty); continue; }
      if (this.map.get(tx, ty) !== T.CRACKED) continue;
      const gate = W.pois.gates.find((q) => q.x === tx && q.y === ty);
      this.map.set(tx, ty, gate ? T.ROAD : W.ground[ty * W.w + tx]);
      this.spawn(new Particles(tx * TILE + 8, ty * TILE + 8, { count: 20, color: ['#8a7a6a', '#5a4a3a', '#f4dcb0'], speed: 80, life: 0.7 }));
      g.audio.sfx('gate');
      if (gate) {
        if (!g.state.progress.gates.includes(gate.region)) g.state.progress.gates.push(gate.region);
        g.toast('The cracked ridge crumbles! The way east lies open.');
        g.questEvent({ type: 'gate', region: gate.region });
      } else {
        const c = W.pois.caches.find((q) => q.x === tx && q.y === ty - 1);
        if (c) { g.state.progress.opened.push(`blocker:${c.id}`); g.toast('The rock crumbles, revealing a hidden nook.'); }
      }
    }
  }

  capVent(tx, ty) {
    const g = this.game, pr = g.state.progress;
    const v = this.W.pois.relics.vents.find((q) => q.x === tx && q.y === ty);
    this.map.set(tx, ty, T.ASH);
    this.spawn(new Particles(tx * TILE + 8, ty * TILE + 8, { count: 26, color: ['#ff7030', '#ffd060', '#5a4a4a', '#2a2222'], speed: 90, life: 0.9, up: 50 }));
    g.audio.sfx('gate', { pitch: 0.7 });
    g.cam.shake(3, 0.3);
    if (!v || pr.relics.includes(v.id)) return;
    pr.relics.push(v.id);
    const n = this.W.pois.relics.vents.filter((q) => pr.relics.includes(q.id)).length;
    g.toast(`The vent collapses in on itself. (${n}/${this.W.pois.relics.vents.length} capped)`);
    g.questEvent({ type: 'relic', kind: 'vents', id: v.id });
  }

  lightBeacon(b) {
    const g = this.game, pr = g.state.progress;
    if (pr.relics.includes(b.id)) { g.message('The old beacon roars with Kindler fire. You can feel its warmth from here.', 'Signal Beacon'); return; }
    if (!g.state.tools.gloves) { g.message('A great stone beacon, capped with a slab of ancient ice. It would take a giant to lift it.', 'Signal Beacon'); return; }
    pr.relics.push(b.id);
    const x = b.x * TILE + 8, y = b.y * TILE + 8;
    this.spawn(new Particles(x, y - 8, { count: 22, color: ['#e0f8ff', '#ffffff', '#a8c8e0'], speed: 80, life: 0.7 }));
    this.spawn(new Particles(x, y - 16, { count: 18, color: ['#ff9030', '#ffd060', '#fff0c0'], speed: 50, life: 1, up: 60 }));
    g.audio.sfx('lift'); g.audio.sfx('shrine');
    g.cam.shake(2, 0.25);
    const n = this.W.pois.relics.beacons.filter((q) => pr.relics.includes(q.id)).length;
    g.toast(`You heave the ice cap aside and the beacon blazes to life! (${n}/${this.W.pois.relics.beacons.length} lit)`);
    g.questEvent({ type: 'relic', kind: 'beacons', id: b.id });
  }

  // A Tide Bell rings from the ice in front of it, and the fens remember the Tidewarden's song.
  ringBell(b) {
    const g = this.game, pr = g.state.progress;
    if (pr.rung.includes(b.id)) { g.message('The bronze still hums under your hand, singing a note the water seems to remember.', 'Tide Bell'); return; }
    pr.rung.push(b.id);
    if (!pr.relics.includes(b.id)) pr.relics.push(b.id);
    const x = b.x * TILE + 8, y = b.y * TILE + 8;
    this.spawn(new Particles(x, y - 10, { count: 22, color: ['#e8b048', '#ffe090', '#a0e8f0'], speed: 70, life: 0.9, up: 20 }));
    g.audio.sfx('shrine', { pitch: 0.5 });
    g.cam.shake(1.5, 0.3);
    const n = this.W.pois.relics.bells.filter((q) => pr.relics.includes(q.id)).length;
    g.toast(`The Tide Bell tolls, deep and green, across the fens. (${n}/${this.W.pois.relics.bells.length} rung)`);
    g.questEvent({ type: 'relic', kind: 'bells', id: b.id });
  }

  // The Rime Charm, held over a pool from its edge, freezes the whole pool into a path.
  freezeAt(tx, ty) {
    const g = this.game, bell = this.W.pois.relics.bells.find((b) => b.pool.some((q) => q.x === tx && q.y === ty));
    if (!g.state.tools.charm || !bell) { g.message('Dark floodwater, cold and far too deep to wade. Something bronze glints out in the middle.', 'Flooded Pool'); return; }
    for (const q of g.freezePool(bell.id)) this.spawn(new Particles(q.x * TILE + 8, q.y * TILE + 8, { count: 5, color: ['#e0f8ff', '#ffffff', '#a8d8f0'], speed: 40, life: 0.6 }));
    g.audio.sfx('splash', { pitch: 1.3 }); g.audio.sfx('shrine', { pitch: 1.5 });
    g.toast('The Rime Charm flares, and the pool freezes into a path of ice.');
  }

  interact() {
    if (super.interact()) return true;
    const g = this.game, p = g.player, W = this.W;
    const ft0 = p.frontTile(), deco0 = this.map.getDeco(ft0.x, ft0.y), tile0 = this.map.get(ft0.x, ft0.y);
    if (deco0 === D.LOOKOUT) {
      const l = W.pois.lookouts.find((q) => q.x === ft0.x && q.y === ft0.y);
      if (l && g.state.quest.main === l.id) g.reachLookout(l.id);
      else g.message(...(LOOKOUT_TEXT[l?.id] || LOOKOUT_TEXT.lookout));
      return true;
    }
    if (deco0 === D.BEACON) { const b = W.pois.relics.beacons.find((q) => q.x === ft0.x && q.y === ft0.y); if (b) this.lightBeacon(b); return true; }
    if (deco0 === D.BELL) { const b = W.pois.relics.bells.find((q) => q.x === ft0.x && q.y === ft0.y); if (b) this.ringBell(b); return true; }
    if (tile0 === T.FLOOD) { this.freezeAt(ft0.x, ft0.y); return true; }
    if (deco0 === D.ALTAR) { g.message(g.state.progress.relics.includes(W.pois.relics.leaves.find((q) => q.x === ft0.x && q.y === ft0.y)?.id) ? 'An empty leaf-shrine, its moss pressed flat where the bronze leaf lay.' : 'A leaf-shrine of the Kindlers, overgrown and broken open. Thorn-beasts have been nesting here.', 'Leaf-shrine'); return true; }
    if (tile0 === T.VENT) { g.message('A magma vent, spitting heat straight up into the sky. A bomb thrown down its throat might bring it crashing in.', 'Magma Vent'); return true; }
    if (tile0 === T.SEAL) {
      const key = Object.keys(W.pois.seals).find((k) => W.pois.seals[k].tiles.some((t) => t.x === ft0.x && t.y === ft0.y));
      if (key === 'verdant' && g.state.quest.main === 'thornwall') { g.breakSeal('verdant'); return true; }
      g.message({
        verdant: 'A wall of black thorns, thick as your arm and still growing. Your blade can\'t even scratch them. They part for no one... no one without the Sigil.',
        ashen: 'A wall of roaring fire, taller than a house. It doesn\'t burn down; it burns up, fed from somewhere deep below.',
        frost: 'A wall of ancient blue ice. Your reflection stares back at you, warped and tiny. Nothing short of Kindler fire will melt this.',
        drowned: 'A wall of churning floodwater, standing upright where no water should stand. It roars like surf and pulls at your sleeves. The old song held it once.',
      }[key] || 'An unnatural barrier bars the way.', { verdant: 'Thornwall', ashen: 'Firewall', frost: 'Ice Wall', drowned: 'Tidewall' }[key]);
      return true;
    }
    const cache = this.entities.find((e) => e instanceof Cache && Math.hypot(e.x - p.x, e.y - p.y) < 16);
    if (cache) { g.digCache(cache); return true; }
    const dig = this.entities.find((e) => e instanceof DigSpot && Math.hypot(e.x - p.x, e.y - p.y) < 18);
    if (dig) { g.digTreasure(dig.q, dig); dig.dead = true; return true; }
    const ft = p.frontTile();
    const deco = this.map.getDeco(ft.x, ft.y), tile = this.map.get(ft.x, ft.y);
    if (deco === D.SIGN) { const s = W.pois.signs.find((q) => q.x === ft.x && q.y === ft.y); g.message(s ? s.text : 'The sign is too weathered to read.', 'Signpost'); return true; }
    if (deco === D.LORE) { const l = W.pois.lore.find((q) => q.x === ft.x && q.y === ft.y); if (l) g.readLore(l.id); else g.message('The runes are worn smooth.', 'Standing Stone'); return true; }
    if (deco === D.SHRINE) { g.openShrine(W.pois.shrines.find((q) => q.x === ft.x && q.y === ft.y)); return true; }
    if (deco === D.WELL) { g.message('Cool water. You feel refreshed.'); g.state.player.stamina = g.derived.maxStamina; return true; }
    if (tile === T.BOULDER) {
      if (!g.state.tools.gloves) { g.message('A massive boulder. It will not budge an inch.'); return true; }
      this.map.set(ft.x, ft.y, W.pois.gates.some((q) => q.x === ft.x && q.y === ft.y) ? T.ROAD : W.ground[ft.y * W.w + ft.x]);
      this.spawn(new Particles(ft.x * TILE + 8, ft.y * TILE + 8, { count: 14, color: ['#9a958e', '#7e7a74'], speed: 70, life: 0.6 }));
      g.audio.sfx('lift');
      g.cam.shake(2, 0.2);
      const gate = W.pois.gates.find((q) => q.x === ft.x && q.y === ft.y);
      if (gate) {
        if (!g.state.progress.gates.includes(gate.region)) g.state.progress.gates.push(gate.region);
        g.toast('You heave the boulder aside. The northern pass is open.');
        g.questEvent({ type: 'gate', region: gate.region });
      } else {
        const c = W.pois.caches.find((q) => q.x === ft.x && q.y === ft.y - 1);
        if (c) g.state.progress.opened.push(`blocker:${c.id}`);
        g.toast('You toss the boulder aside.');
      }
      return true;
    }
    if (tile === T.CRACKED) { g.message('The rock here is cracked and hollow-sounding. A strong blast might break it.'); return true; }
    if (tile === T.DUNGEON || this.map.get(ft.x, ft.y + 1) === T.DUNGEON) { this.tryDungeonDoor(ft.x, tile === T.DUNGEON ? ft.y : ft.y + 1); return true; }
    return false;
  }

  // The feet sit 2px below the body's centre; their tile is the one a doorway, cave mouth or gate catches.
  footTile(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor((y - 2) / TILE);
    return { tx, ty, t: this.map.get(tx, ty) };
  }
  exitsAt(x, y) {
    const { t } = this.footTile(x, y);
    return t === T.DOOR || t === T.CAVE || t === T.DUNGEON;
  }

  checkTransitions() {
    const g = this.game, p = g.player;
    if (p.mode === 'dead' || g.doorGrace > 0) return;
    const { tx, ty, t } = this.footTile(p.x, p.y);
    if (t === T.DOOR) {
      const b = this.W.props.find((q) => q.kind === 'building' && q.door.x === tx && q.door.y === ty);
      if (b) g.enterInterior(b);
    } else if (t === T.CAVE) {
      const c = this.W.pois.caves.find((q) => q.x === tx && q.y === ty);
      if (c) g.enterCave(c);
    } else if (t === T.DUNGEON) {
      if (!this.tryDungeonDoor(tx, ty)) p.y += 4;
    }
  }

  tryDungeonDoor(tx, ty) {
    const g = this.game, W = this.W;
    const lm = Object.values(W.pois.dungeons).concat([W.pois.spire]).find((d) => d.door.x === tx && d.door.y === ty);
    if (!lm) return false;
    if (lm.id === 'verdant' && !g.state.artifacts.includes('verdantSigil')) {
      g.message('A great stone door, sealed by a leaf-shaped lock of green bronze. It will not open without the matching sigil.', 'Verdant Vault');
      return false;
    }
    // The Spire opens once the Hearth has all four shards (the kindling), and stays open.
    if (lm.id === 'spire' && MAIN_STAGES.indexOf(g.state.quest.main) < MAIN_STAGES.indexOf('spire')) {
      g.message(`Four empty sockets ring the Spire door. ${g.state.progress.shards} of them glow faintly. It will open only when all four shards burn in the Hearth.`, 'Emberwake Spire');
      return false;
    }
    g.enterDungeon(lm.id);
    return true;
  }

  updateRegion() {
    const g = this.game, p = g.player, W = this.W;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const s = W.settlements.find((q) => tx >= q.x0 - 1 && tx < q.x0 + q.w + 1 && ty >= q.y0 - 1 && ty < q.y0 + q.h + 1);
    const b = W.biome[ty * W.w + tx];
    const key = s ? `s:${s.id}` : `b:${b}`;
    if (key === this.regionKey) return;
    this.regionKey = key;
    if (s) {
      g.showBanner(s.name, s.id === 'home' ? 'Your home village' : s.kind === 'town' ? `Town of the ${BIOME_NAMES[s.biome]}` : 'Outpost');
      g.audio.playMusic('town');
    } else {
      const region = W.regions[b];
      g.showBanner(region.name, BIOME_NAMES[b]);
      g.audio.playMusic(BIOME_MUSIC[b]);
    }
  }
}

// ------------------------------------------------------------------ interiors
const FURN = {
  bed: (g, x, y, w) => { R(g, x + 1, y + 1, w * 16 - 2, 14, '#6a4a2a'); R(g, x + 2, y + 2, 10, 12, '#f0ece0'); R(g, x + 12, y + 2, w * 16 - 14, 12, '#a04040'); },
  table: (g, x, y, w) => { R(g, x + 1, y + 2, w * 16 - 2, 10, '#8a5a32'); R(g, x + 1, y + 2, w * 16 - 2, 2, '#a87444'); R(g, x + 2, y + 12, 2, 4, '#5a3a20'); R(g, x + w * 16 - 4, y + 12, 2, 4, '#5a3a20'); R(g, x + 6, y + 3, 4, 3, '#e0e0d0'); },
  desk: (g, x, y, w) => { R(g, x, y + 2, w * 16, 12, '#6a3a22'); R(g, x, y + 2, w * 16, 2, '#8a5432'); R(g, x + 8, y + 4, 6, 4, '#f0e8c8'); R(g, x + w * 16 - 16, y + 3, 4, 6, '#3a6ab0'); },
  shelf: (g, x, y, w) => { R(g, x, y - 6, w * 16, 20, '#6a4a2a'); for (let k = 0; k < 3; k++) R(g, x + 1, y - 4 + k * 6, w * 16 - 2, 1, '#3a2a1a'); for (let k = 0; k < w * 4; k++) R(g, x + 2 + k * 4, y - 3 + (k % 3) * 6, 3, 3, ['#c04040', '#4080c0', '#e0c050', '#60a060'][k % 4]); },
  fireplace: (g, x, y, w, t) => { R(g, x, y - 6, w * 16, 22, '#8a8478'); R(g, x + 3, y + 2, w * 16 - 6, 12, '#2a1a10'); drawCampfire(g, x + (w * 16) / 2 - 8, y + 2, t); },
  plant: (g, x, y) => { R(g, x + 5, y + 9, 6, 6, '#a0603a'); R(g, x + 3, y + 2, 10, 8, '#3e8a3a'); R(g, x + 5, y, 5, 4, '#56a24a'); },
  barrel: (g, x, y) => { R(g, x + 3, y + 2, 10, 13, '#8a5a2a'); R(g, x + 3, y + 5, 10, 1, '#4a3a2a'); R(g, x + 3, y + 11, 10, 1, '#4a3a2a'); },
  banner: (g, x, y) => { R(g, x + 4, y + 4, 8, 14, '#a02a2a'); R(g, x + 6, y + 8, 4, 4, '#f0c850'); },
  counter: (g, x, y, w) => { R(g, x, y, w * 16, 14, '#7a4a2a'); R(g, x, y, w * 16, 3, '#a06a3a'); for (let k = 0; k < w; k++) R(g, x + k * 16 + 4, y - 3, 5, 4, ['#e0c050', '#c04040', '#4a8ae8', '#60a060'][k % 4]); },
  forge: (g, x, y, w, t) => { R(g, x, y - 4, 32, 36, '#5a5048'); R(g, x + 4, y + 8, 24, 14, '#2a1a10'); drawCampfire(g, x + 8, y + 8, t); },
  anvil: (g, x, y) => { R(g, x + 4, y + 4, 24, 5, '#4a4a52'); R(g, x + 10, y + 9, 12, 6, '#3a3a42'); R(g, x + 4, y + 4, 24, 1, '#8a8a96'); },
  rack: (g, x, y, w) => { R(g, x, y - 4, w * 16, 2, '#6a4a2a'); for (let k = 0; k < w * 2; k++) R(g, x + 4 + k * 8, y - 2, 2, 14, '#c8ccd4'); },
  orb: (g, x, y, w, t) => { R(g, x + 2, y + 6, 28, 9, '#4a2a5a'); drawEmberGlow(g, x + 16, y + 3, t, '180,140,255'); },
  candles: (g, x, y, w, t) => { R(g, x + 6, y + 6, 3, 8, '#f0e8d0'); drawEmberGlow(g, x + 7, y + 4, t); },
  maptable: (g, x, y, w) => { R(g, x, y + 2, w * 16, 12, '#7a5a32'); R(g, x + 4, y + 3, w * 16 - 8, 9, '#e8dcb0'); R(g, x + 10, y + 5, 12, 1, '#a04040'); R(g, x + 20, y + 7, 1, 4, '#a04040'); },
  stool: (g, x, y) => { R(g, x + 5, y + 6, 6, 3, '#8a5a32'); R(g, x + 6, y + 9, 1, 4, '#5a3a20'); R(g, x + 9, y + 9, 1, 4, '#5a3a20'); },
};

export class InteriorArea extends Area {
  constructor(game, building) {
    super(game, 'interior');
    this.building = building;
    this.id = building.id;
    const L = generateInterior(building, game.world.seed);
    this.layout = L;
    this.map = new TileMap(L.w, L.h);
    this.map.tiles.set(L.tiles);
    this.renderer = new RoomRenderer(this.map, { ...THEMES.interior, kind: 'interior' });
    const npc = game.world.npcs.find((n) => n.buildingId === building.id);
    if (npc) this.spawn(new NPC(npc, L.npcSpot.x * TILE + 8, L.npcSpot.y * TILE + 8));
    if (L.chest && building.type === 'home') {
      const id = 'chest:home';
      this.spawn(new Chest(id, L.chest.x * TILE + 8, L.chest.y * TILE + 8, 'home', { opened: game.state.progress.opened.includes(id) }));
      this.map.extraSolid[L.chest.y * L.w + L.chest.x] = 1;
    }
    this.name = building.type === 'home' ? 'Your Home' : `${building.type[0].toUpperCase()}${building.type.slice(1)}`;
    this.talkRange = 42; // shopkeepers and innkeepers stand behind counters
  }
  get spawnPoint() { return { x: this.layout.spawn.x * TILE + 8, y: this.layout.spawn.y * TILE + 4 }; }
  drawGround(g, cam) { this.renderer.draw(g, cam); }
  collectTall(list, cam) {
    for (const pr of this.layout.props) {
      const fn = FURN[pr.type];
      if (!fn) continue;
      const x = pr.x * TILE - cam.left, y = pr.y * TILE - cam.top;
      list.push({ y: (pr.y + pr.h) * TILE - 2, draw: (g) => fn(g, x, y, pr.w, this.time) });
    }
  }
  afterUpdate() {
    const p = this.game.player;
    if (this.game.doorGrace <= 0 && this.exitsAt(p.x, p.y)) this.game.exitToOverworld(this.building.door.x, this.building.door.y + 1);
  }
  interact() {
    if (super.interact()) return true;
    const p = this.game.player, ft = p.frontTile();
    const bed = this.layout.props.find((q) => q.type === 'bed' && ft.x >= q.x && ft.x < q.x + q.w && ft.y === q.y);
    if (bed && this.building.type === 'home') { this.game.restAtHome(); return true; }
    const shelf = this.layout.props.find((q) => q.type === 'shelf' && ft.x >= q.x && ft.x < q.x + q.w && ft.y === q.y);
    if (shelf) { this.game.readLore(`book${bookFor(this.game.world, this.building)}`); return true; }
    return false;
  }
}

// ------------------------------------------------------------------ caves
export class CaveArea extends Area {
  constructor(game, cave) {
    super(game, 'cave');
    this.cave = cave;
    this.id = cave.id;
    const L = generateCave(cave.id, game.world.seed, cave.biome);
    this.layout = L;
    this.map = new TileMap(L.w, L.h);
    this.map.tiles.set(L.tiles);
    const th = CAVE_THEMES[cave.biome];
    this.renderer = new RoomRenderer(this.map, { ...th, kind: 'cave', pit: '#000', water: cave.biome === 4 ? '#7aa8d0' : '#3a6a6a' });
    const pr = game.state.progress;
    for (const e of L.enemies) this.spawnEnemy(new Enemy(e.archetype, cave.biome, e.x * TILE + 8, e.y * TILE + 8, { hpMult: game.diff.enemyHp * 1.1, leash: 999 }));
    L.supplies.forEach((s, k) => {
      const id = `cavesupply:${cave.id}:${k}`;
      if (!pr.opened.includes(id)) this.spawn(new Pickup(s.kind === 'coins' ? 'coin' : s.kind, s.x * TILE + 8, s.y * TILE + 8, s.kind === 'coins' ? 5 : s.kind === 'arrows' ? 5 : 1, { permanent: true, id }));
    });
    const chestId = `cave:${cave.id}`;
    this.spawn(new Chest(chestId, L.chest.x * TILE + 8, L.chest.y * TILE + 8, L.chest.contents, { opened: pr.opened.includes(chestId), big: true }));
    this.map.extraSolid[L.chest.y * L.w + L.chest.x] = 1;
    const rescue = game.sideQuests.find((q) => q.type === 'rescue' && q.caveId === cave.id && game.state.quest.side[q.id] === 'active');
    if (rescue) {
      const giver = game.world.npcs.find((n) => n.id === rescue.giverId);
      this.spawn(new NPC({ id: `lost:${rescue.id}`, name: rescue.kin.replace(/^(my|our|the) /, '').replace(/^./, (c) => c.toUpperCase()), role: 'villager', look: giver.look + 3, lost: rescue.id, settlementId: giver.settlementId }, L.lostSpot.x * TILE + 8, L.lostSpot.y * TILE + 8));
    }
    this.name = 'Cave';
    this.lights = L.torches.map((t) => ({ x: t.x * TILE + 8, y: t.y * TILE + 8, r: 46 }));
  }
  get spawnPoint() { return { x: this.layout.entrance.x * TILE + 8, y: this.layout.entrance.y * TILE + 6 }; }
  drawGround(g, cam) { this.renderer.draw(g, cam); }
  collectTall(list, cam) {
    for (const t of this.layout.torches) {
      const x = t.x * TILE - cam.left, y = t.y * TILE - cam.top;
      list.push({ y: t.y * TILE + 12, draw: (g) => { R(g, x + 7, y + 4, 2, 10, '#5a3a20'); drawEmberGlow(g, x + 8, y + 3, this.time); } });
    }
  }
  drawOverlay(g, cam) {
    const p = this.game.player;
    drawDarkness(g, cam, [{ x: p.x, y: p.y - 4, r: 78 }, ...this.lights, { x: this.layout.exit.x * TILE + 8, y: this.layout.exit.y * TILE + 8, r: 40 }], 0.8);
  }
  afterUpdate() {
    const p = this.game.player;
    if (this.game.doorGrace <= 0 && this.exitsAt(p.x, p.y)) this.game.exitToOverworld(this.cave.front.x, this.cave.front.y);
  }
}
