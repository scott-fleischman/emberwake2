// Areas: the overworld, building interiors and caves (dungeons live in dungeon.js).
import { TileMap } from '../world/tilemap.js';
import { T, D, TILE, BIOME, BIOME_MUSIC, BIOME_NAMES } from '../world/tiles.js';
import { generateInterior } from '../world/interiors.js';
import { generateCave } from '../world/caves.js';
import { OverworldRenderer, RoomRenderer, drawDarkness, drawCampfire, drawEmberGlow } from '../gfx/render.js';
import { THEMES, CAVE_THEMES } from '../gfx/palette.js';
import { R } from '../gfx/sprites.js';
import { NPC, Chest, Cache, Pickup, Particles, Explosion, FloatText, Critter, DigSpot } from './entities.js';
import { HERBS } from '../data/sidequests.js';
import { bookFor } from '../data/story.js';
import { Enemy } from './enemies.js';
import { meleeTargets, knockbackVector, isBehind } from './combat.js';
import { findFreeSpot } from './physics.js';
import { makeRng } from '../core/rng.js';

const overlap = (a, b, pad = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;

export class Area {
  constructor(game, kind) {
    this.game = game;
    this.kind = kind;
    this.entities = [];
    this.enemyList = [];
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

  update(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const p = this.game.player;
    p.update(dt, ctx);
    for (const e of this.entities) if (!e.dead) e.update(dt, ctx);
    // NPCs are solid to the player.
    for (const n of this.entities) {
      if (!(n instanceof NPC) || !overlap(n, p)) continue;
      const ox = (n.w + p.w) / 2 - Math.abs(p.x - n.x), oy = (n.h + p.h) / 2 - Math.abs(p.y - n.y);
      if (ox < oy) p.x += Math.sign(p.x - n.x || 1) * ox; else p.y += Math.sign(p.y - n.y || 1) * oy;
    }
    this.entities = this.entities.filter((e) => !e.dead);
    this.enemyList = this.enemyList.filter((e) => !e.dead);
    for (const t of this.tokens) if (t.dead) this.tokens.delete(t);
    this.afterUpdate(dt, ctx);
  }
  afterUpdate() {}

  draw(g, cam) {
    this.drawGround(g, cam);
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
        const r = this.game.damagePlayer(p.dmg, p, { projectile: true });
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
    for (const camp of W.pois.camps) {
      if (game.state.progress.cleared.includes(camp.id) && !game.state.progress.opened.includes(`campchest:${camp.id}`)) this.spawnCampChest(camp);
    }
  }

  applyProgress() {
    const W = this.W, pr = this.game.state.progress;
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

  drawGround(g, cam) { this.renderer.drawGround(g, cam, this.time); }
  collectTall(list, cam) { this.renderer.collectTall(cam, list, this.time, this.game.player); }

  afterUpdate(dt) {
    this.groupT -= dt;
    if (this.groupT <= 0) { this.groupT = 0.4; this.updateGroups(); }
    this.checkTransitions();
    if (this.game.area !== this) return; // we just left; player coordinates now belong to the new area
    this.updateRegion();
  }

  // ------------------------------------------------ encounter groups
  groupDefs() {
    const W = this.W;
    if (this.defs) return this.defs;
    const defs = [];
    for (const c of W.pois.camps) defs.push({ id: c.id, kind: 'camp', x: c.x, y: c.y, biome: c.biome, count: c.size, data: c });
    for (const k of ['verdant', 'ashen', 'frost']) {
      const d = W.pois.dungeons[k];
      defs.push({ id: `guard:${k}`, kind: 'guard', x: d.front.x, y: d.front.y + 3, biome: d.biome, count: 3 });
    }
    for (const s of W.pois.spawns) defs.push({ id: s.id, kind: 'wild', x: s.x, y: s.y, biome: s.biome, count: s.count });
    for (const p of W.pois.patrols) defs.push({ id: p.id, kind: 'patrol', x: p.path[0].x, y: p.path[0].y, biome: p.biome, count: 2, path: p.path });
    this.defs = defs;
    return defs;
  }

  updateGroups() {
    const p = this.game.player, pr = this.game.state.progress;
    const ptx = p.x / TILE, pty = p.y / TILE;
    for (const def of this.groupDefs()) {
      const d = Math.hypot(def.x - ptx, def.y - pty);
      let grp = this.groups.get(def.id);
      if ((def.kind === 'camp' || def.kind === 'guard') && pr.cleared.includes(def.id)) continue;
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
          grp.enemies.push(this.spawnEnemy(e));
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
  }

  groupCleared(def) {
    const g = this.game, pr = g.state.progress;
    if (def.kind === 'wild' || def.kind === 'patrol') { def.down = true; def.downAt = performance.now(); return; }
    if (pr.cleared.includes(def.id)) return;
    pr.cleared.push(def.id);
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

  interact() {
    if (super.interact()) return true;
    const g = this.game, p = g.player, W = this.W;
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

  checkTransitions() {
    const g = this.game, p = g.player;
    if (p.mode === 'dead' || g.doorGrace > 0) return;
    const tx = Math.floor(p.x / TILE), ty = Math.floor((p.y - 2) / TILE);
    const t = this.map.get(tx, ty);
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
    if (lm.id === 'drowned') { g.message('Water seeps from beneath a door bound in rusted chains. Something deep within is still sleeping. (The fourth region arrives in a future chapter.)', 'Drowned Fane'); return false; }
    if (lm.id === 'spire') { g.message(`Four empty sockets ring the Spire door. ${g.state.progress.shards} of them glow faintly. It will open only when all four wards are quieted.`, 'Emberwake Spire'); return false; }
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
    if (this.game.doorGrace <= 0 && this.map.tileAtPixel(p.x, p.y + 3) === T.EXIT) this.game.exitToOverworld(this.building.door.x, this.building.door.y + 1);
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
    if (this.game.doorGrace <= 0 && this.map.tileAtPixel(p.x, p.y + 3) === T.EXIT) this.game.exitToOverworld(this.cave.front.x, this.cave.front.y);
  }
}
