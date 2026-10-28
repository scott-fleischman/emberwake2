// The main game scene: owns the world, state, current area, overlays, saving and death.
import { generateOverworld } from '../world/overworld.js';
import { TILE } from '../world/tiles.js';
import { derivedStats, decodeBits, encodeBits, applyDeathPenalty, DIFFICULTY } from '../game/state.js';
import { generateSideQuests, advanceMain, mainObjective, sideObjective, sideStatus, recordKill, reveal } from '../game/quests.js';
import { Player } from '../game/player.js';
import { OverworldArea, InteriorArea, CaveArea } from '../game/areas.js';
import { DungeonArea } from '../game/dungeon.js';
import { Poof, Particles, FloatText } from '../game/entities.js';
import { shieldBlocks, knockbackVector } from '../game/combat.js';
import { findFreeSpot } from '../game/physics.js';
import { conversation, shopMenu, shrineMenu, talentMenu, chestReward, cacheReward } from '../game/talk.js';
import { SHIELDS, WEAPONS, USE_ITEMS, ARTIFACTS } from '../data/items.js';
import { CLASSES } from '../data/classes.js';
import { Camera } from '../gfx/render.js';
import { Dialog, Menu } from '../gfx/ui.js';
import { drawHUD, drawMinimap, drawWorldMap, FOG_CELL } from '../gfx/hud.js';
import { ROOM_W, ROOM_H } from '../world/dungeons.js';

class MapOverlay {
  constructor(kind) { this.kind = kind; this.done = false; this.skip = true; }
  update(dt, game) {
    if (this.skip) { this.skip = false; return; }
    if (game.input.pressed('map') || game.input.pressed('cancel') || game.input.pressed('pause')) { this.done = true; game.audio.sfx('menu'); }
  }
  draw(u, game) {
    if (this.kind === 'dungeon') drawMinimap(u, game.area, game, true); else drawWorldMap(u, game);
  }
}

export class GameScene {
  constructor(app, state) {
    this.app = app;
    this.input = app.input;
    this.audio = app.audio;
    this.store = app.store;
    this.state = state;
    this.world = generateOverworld(state.seed);
    this.sideQuests = generateSideQuests(this.world);
    this.refreshDerived();
    this.cam = new Camera();
    this.uiStack = [];
    this.toasts = [];
    this.banner = null;
    this.time = 0;
    this.hitstop = 0;
    this.fade = 1;
    this.deathT = 0;
    this.fogW = Math.ceil(this.world.w / FOG_CELL);
    this.fogH = Math.ceil(this.world.h / FOG_CELL);
    this.fog = decodeBits(state.progress.fog, this.fogW * this.fogH);
    this.player = new Player(this, 0, 0);
    this.lastOverworld = null;
    this.restoreLocation(state.location);
    this.updateObjective();
  }

  get diff() { return DIFFICULTY[this.app.options.difficulty] || DIFFICULTY.normal; }

  refreshDerived() {
    this.derived = derivedStats(this.state);
    const p = this.state.player, d = this.derived;
    p.hp = Math.min(p.hp, d.maxHp);
    p.mana = Math.min(p.mana, d.maxMana);
    p.stamina = Math.min(p.stamina, d.maxStamina);
  }

  // ---------------------------------------------------------------- locations
  restoreLocation(loc) {
    const W = this.world;
    const atPos = (x, y) => (x !== null && x !== undefined ? { x, y } : null);
    try {
      if (loc.area === 'interior') {
        const b = loc.id === 'home' ? W.props.find((q) => q.kind === 'building' && q.type === 'home') : W.props.find((q) => q.id === loc.id);
        if (b) return this.enterInterior(b, atPos(loc.x, loc.y), true);
      } else if (loc.area === 'cave') {
        const c = W.pois.caves.find((q) => q.id === loc.id);
        if (c) return this.enterCave(c, atPos(loc.x, loc.y), true);
      } else if (loc.area === 'dungeon' && W.pois.dungeons[loc.id]) {
        return this.enterDungeon(loc.id, loc.room ?? null, atPos(loc.x, loc.y));
      } else if (loc.area === 'overworld' && loc.x !== null && loc.x !== undefined) {
        return this.exitToOverworld(loc.x, loc.y, true);
      }
    } catch (e) {
      console.warn('Could not restore location, returning home.', e);
    }
    const hd = W.pois.homeDoor;
    this.exitToOverworld(hd.x, hd.y, true);
  }

  setArea(area) {
    if (this.area && this.area.kind === 'overworld') this.lastOverworld = { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) };
    this.area = area;
    this.fade = 1;
    this.doorGrace = 0.35; // don't bounce straight back through the door we came out of
    this.player.lock = null;
    this.player.mode = this.player.mode === 'dead' ? 'dead' : 'normal';
    this.player.kbT = 0;
  }

  placePlayer(x, y, facing = 'down') {
    const p = this.player;
    p.x = x; p.y = y; p.facing = facing;
    p.aim = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[facing];
    findFreeSpot(this.area.map, p, 6);
    p.lastSafe = { x: p.x, y: p.y };
    this.cam.follow(p.x, p.y, this.area.map.pixelW, this.area.map.pixelH, 0, true);
  }

  enterInterior(b, pos = null, silent = false) {
    this.setArea(new InteriorArea(this, b));
    const sp = pos || this.area.spawnPoint;
    this.placePlayer(sp.x, sp.y, 'up');
    if (!silent) this.audio.sfx('door');
    this.audio.playMusic('town');
    this.state.location = { area: 'interior', id: b.type === 'home' && b.settlementId === 'home' ? 'home' : b.id };
  }

  enterCave(c, pos = null, silent = false) {
    this.setArea(new CaveArea(this, c));
    const sp = pos || this.area.spawnPoint;
    this.placePlayer(sp.x, sp.y, 'up');
    if (!silent) { this.audio.sfx('door', { pitch: 0.7 }); this.showBanner('A Dark Cave', 'Torches mark the way out.'); }
    this.audio.playMusic('cave');
  }

  enterDungeon(id, roomId = null, pos = null) {
    let room = roomId;
    const area = new DungeonArea(this, id, room, 's');
    this.setArea(area);
    // Never resume mid-boss: step back to the antechamber.
    if (area.room.role === 'boss' && !this.state.progress.bosses.includes(id)) {
      const ante = area.dungeon.rooms.find((r) => r.role === 'bossdoor');
      area.enterRoom(ante.id, 's');
      pos = null;
    }
    if (pos) this.placePlayer(pos.x, pos.y, 'up');
    this.audio.sfx('door', { pitch: 0.6 });
    this.updateObjective();
  }

  exitToOverworld(tx, ty, silent = false) {
    if (!this.overworld) this.overworld = new OverworldArea(this);
    this.setArea(this.overworld);
    this.overworld.regionKey = null;
    this.overworld.spawnQuestItems();
    this.placePlayer(tx * TILE + 8, ty * TILE + 8, 'down');
    if (!silent) this.audio.sfx('door', { pitch: 0.9 });
    this.updateObjective();
  }

  exitDungeon() {
    const d = this.world.pois.dungeons[this.area.id];
    this.exitToOverworld(d.front.x, d.front.y);
  }

  transition(fn) { fn(); this.fade = 0.6; }

  currentLocation() {
    const a = this.area, p = this.player;
    if (a.kind === 'overworld') return { area: 'overworld', x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    if (a.kind === 'interior') return { area: 'interior', id: a.building.type === 'home' && a.building.settlementId === 'home' ? 'home' : a.building.id, x: p.x, y: p.y };
    if (a.kind === 'cave') return { area: 'cave', id: a.cave.id, x: p.x, y: p.y };
    return { area: 'dungeon', id: a.id, room: a.roomId, x: p.x, y: p.y };
  }

  overworldPos() {
    if (this.area.kind === 'overworld') return { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) };
    return this.lastOverworld;
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    this.time += dt;
    this.state.playTime += dt;
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.banner) this.banner.t -= dt;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 3);
    const top = this.uiStack[this.uiStack.length - 1];
    if (top) {
      top.update(dt, this);
      if (top.done) { const i = this.uiStack.indexOf(top); if (i >= 0) this.uiStack.splice(i, 1); }
      return;
    }
    if (this.deathT > 0) { this.updateDeath(dt); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.doorGrace > 0) this.doorGrace -= dt;
    const input = this.input;
    if (input.pressed('pause')) { this.openPause(); return; }
    if (input.pressed('map')) { this.pushUI(new MapOverlay(this.area.kind === 'dungeon' ? 'dungeon' : 'world')); this.audio.sfx('menu'); return; }
    if (input.pressed('interact') && this.player.mode !== 'dead') {
      if (this.area.interact()) return;
    }
    this.area.update(dt);
    const p = this.player;
    if (this.area.kind === 'dungeon') this.cam.follow(ROOM_W * 8, ROOM_H * 8, ROOM_W * TILE, ROOM_H * TILE, dt, true);
    else this.cam.follow(p.x, p.y, this.area.map.pixelW, this.area.map.pixelH, dt);
    if (this.area.kind === 'overworld') this.revealFog();
    if (this.objT === undefined || (this.objT -= dt) <= 0) { this.objT = 1; this.updateObjective(); }
  }

  drawWorld(g) {
    g.fillStyle = '#08060a';
    g.fillRect(0, 0, 480, 270);
    this.area.draw(g, this.cam);
    if (this.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade)})`; g.fillRect(0, 0, 480, 270); }
    if (this.deathT > 0) { g.fillStyle = `rgba(20,0,0,${Math.min(0.7, (2.2 - this.deathT) * 0.5)})`; g.fillRect(0, 0, 480, 270); }
  }

  drawUI(u) {
    drawHUD(u, this);
    if (this.area.kind === 'dungeon') drawMinimap(u, this.area, this);
    for (const ui of this.uiStack) ui.draw(u, this);
  }

  pushUI(c) { this.uiStack.push(c); return c; }

  // ---------------------------------------------------------------- combat outcomes
  damagePlayer(dmg, src, opts = {}) {
    const p = this.player, res = this.state.player;
    if (p.mode === 'dead' || this.deathT > 0) return 'ignored';
    if (p.iframes > 0 && !opts.ignoreIframes) return 'ignored';
    const shield = SHIELDS[this.state.gear.shield];
    if (src && shield && p.shielding && shieldBlocks(p, src.x, src.y, shield.arc)) {
      const cost = dmg * shield.cost * this.derived.blockMult;
      if (res.stamina >= cost) {
        res.stamina -= cost;
        p.staminaDelay = 0.6;
        this.audio.sfx('block');
        this.area.spawn(new Particles(p.x + Math.cos(p.aim) * 8, p.y - 4 + Math.sin(p.aim) * 8, { count: 6, color: ['#ffffff', '#ffe080'], speed: 70, life: 0.25 }));
        const [kx, ky] = knockbackVector(src.x, src.y, p.x, p.y, 70);
        p.knock(kx, ky, 0.1);
        if (src.knock && src.team === 'enemy' && !src.boss) { const [ex, ey] = knockbackVector(p.x, p.y, src.x, src.y, 160); src.knock(ex, ey, 0.2); }
        return 'blocked';
      }
      res.stamina = 0;
      this.toast('Guard broken!');
    }
    const amount = dmg * this.diff.damageTaken;
    res.hp = Math.max(0, res.hp - amount);
    p.iframes = 0.9;
    p.flash = 0.15;
    this.player.regenPool = 0;
    if (src && !opts.noKnock) { const [kx, ky] = knockbackVector(src.x, src.y, p.x, p.y, 190); p.knock(kx, ky, 0.14); }
    this.audio.sfx('hurt');
    if (this.app.options.screenShake) this.cam.shake(2.5, 0.2);
    this.hitstop = 0.06;
    if (res.hp <= 0) this.die();
    return 'hit';
  }

  die() {
    const p = this.player;
    p.mode = 'dead';
    this.deathT = 2.2;
    this.area.spawn(new Poof(p.x, p.y - 4, '#ffffff', true));
    this.audio.sfx('death');
    this.audio.stopMusic();
  }

  updateDeath(dt) {
    this.deathT -= dt;
    for (const e of this.area.entities) if (e instanceof Poof || e instanceof Particles) e.update(dt, this.area.ctx);
    if (this.deathT > 0) return;
    this.deathT = 0;
    const lost = applyDeathPenalty(this.state);
    const where = this.state.respawn.label || 'the village';
    this.pushUI(new Dialog([{ speaker: 'The Ember', text: `You have fallen. ${lost ? `${lost} coins slip from your purse as` : 'As'} the Ember's warmth carries you back to ${where}.` }], {
      onClose: () => {
        this.player.mode = 'normal';
        this.player.iframes = 2;
        this.overworld = null;
        this.restoreLocation(this.state.location);
        if (this.state.location.area === 'overworld' && this.state.location.x === null) this.exitToOverworld(this.world.pois.homeDoor.x, this.world.pois.homeDoor.y, true);
      },
    }));
  }

  collect(pk) {
    const s = this.state, p = s.player, d = this.derived;
    switch (pk.kind) {
      case 'heart': p.hp = Math.min(d.maxHp, p.hp + 2); this.audio.sfx('heart'); break;
      case 'coin': p.coins += pk.value; this.audio.sfx('coin'); break;
      case 'arrows': p.arrows = Math.min(d.maxArrows, p.arrows + pk.value); this.audio.sfx('pickup'); break;
      case 'knives': p.knives = Math.min(d.maxKnives, p.knives + pk.value); this.audio.sfx('pickup'); break;
      case 'mana': p.mana = Math.min(d.maxMana, p.mana + 12); this.audio.sfx('pickup', { pitch: 1.3 }); break;
      case 'food': p.food++; this.audio.sfx('pickup'); this.area.spawn(new FloatText(pk.x, pk.y - 8, '+1 ration', '#ffc080')); break;
      case 'bombs': p.bombs = Math.min(d.maxBombs, p.bombs + pk.value); this.audio.sfx('pickup'); break;
      case 'quest': {
        const q = this.sideQuests.find((x) => x.id === pk.id);
        if (q && s.quest.side[q.id] === 'active') { s.quest.side[q.id] = 'ready'; this.toast(`Found the ${q.item}! Return it to its owner.`); this.audio.sfx('levelup'); this.updateObjective(); }
        break;
      }
      default: break;
    }
    if (pk.id && pk.id.startsWith('cavesupply:')) s.progress.opened.push(pk.id);
    return true;
  }

  onEnemyKilled(e) {
    this.state.stats.kills++;
    for (const q of recordKill(this.state, this.sideQuests, e)) { this.toast('Hunt complete! Return to the quest giver.'); this.audio.sfx('levelup'); }
  }

  // ---------------------------------------------------------------- dialog & services
  talk(npc) {
    npc.talking = true;
    const pages = conversation(this, npc);
    this.audio.sfx('talk');
    this.pushUI(new Dialog(pages, {
      onClose: () => {
        npc.talking = false;
        if (npc.leaving) { npc.dead = true; this.area.spawn(new Poof(npc.x, npc.y - 4, '#e8e0d0')); this.toast('They hurry toward the exit.'); }
        this.updateObjective();
      },
    }));
  }

  message(text, speaker = null) { this.pushUI(new Dialog([{ speaker, text }])); }

  openChest(chest) {
    chest.opened = true;
    if (!this.state.progress.opened.includes(chest.id)) this.state.progress.opened.push(chest.id);
    this.audio.sfx('chest');
    this.area.spawn(new Particles(chest.x, chest.y - 6, { count: 16, color: ['#ffe080', '#ffffff'], speed: 60, life: 0.6, up: 30 }));
    this.message(chestReward(this, chest.contents), 'Treasure');
    this.refreshDerived();
  }

  digCache(cache) {
    cache.dead = true;
    this.state.progress.caches.push(cache.data.id);
    this.audio.sfx('chest');
    this.area.spawn(new Particles(cache.x, cache.y, { count: 14, color: ['#a08050', '#ffe080'], speed: 50, life: 0.5 }));
    this.message(cacheReward(this, cache), 'Hidden Cache');
  }

  openShrine(shrine) { this.audio.sfx('shrine'); this.pushUI(shrineMenu(this, shrine)); }

  shrineRest(shrine) {
    const d = this.derived;
    Object.assign(this.state.player, { hp: d.maxHp, mana: d.maxMana, stamina: d.maxStamina });
    this.state.respawn = { area: 'overworld', x: shrine.x, y: shrine.y + 1, label: 'the shrine' };
    this.audio.sfx('shrine');
    this.saveGame();
  }

  restAtHome() {
    const d = this.derived;
    Object.assign(this.state.player, { hp: d.maxHp, mana: d.maxMana, stamina: d.maxStamina });
    this.state.respawn = { area: 'overworld', x: null, y: null, label: 'home' };
    this.audio.sfx('shrine');
    this.saveGame();
    this.message('You rest a while in your own bed. Health restored; progress saved.');
  }

  openShop(kind) { this.pushUI(shopMenu(this, kind)); }

  buy(cost, apply, msg) {
    const p = this.state.player;
    if (p.coins < cost) { this.audio.sfx('deny'); return { pages: [{ text: 'You don\'t have enough coins.' }] }; }
    p.coins -= cost;
    apply();
    this.audio.sfx('coin');
    return { pages: [{ text: msg }] };
  }

  seerReading() {
    const W = this.world, s = this.state;
    const here = this.overworldPos() || W.pois.home;
    const revealed = s.progress.revealed || [];
    const caves = W.pois.caves.filter((c) => !revealed.includes(`cave:${c.id}`) && !s.progress.opened.includes(`cave:${c.id}`)).sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
    if (caves.length) {
      reveal(s, `cave:${caves[0].id}`);
      return 'The smoke curls into the shape of a cave mouth... treasure waits in the dark. I have marked it on your map.';
    }
    const caches = W.pois.caches.filter((c) => !s.progress.caches.includes(c.id));
    if (caches.length) {
      const c = caches[0];
      return `I see a glint beneath ${c.kind === 'glint' ? 'a tree' : c.kind === 'cracked' ? 'cracked stone' : 'a heavy boulder'} in the ${['woods', 'fens', 'desert', 'highlands', 'snows', 'wastes'][c.biome]}. Look closely.`;
    }
    return 'The smoke is quiet. You have found all that hides from you.';
  }

  questEvent(ev) {
    const r = advanceMain(this.state, this.world, ev);
    if (r.advanced) {
      for (const n of r.notes) this.toast(n);
      this.audio.sfx('levelup');
      this.updateObjective();
      this.toast(`New objective: ${this.objective}`);
      if (r.stage === 'end') this.showEnding();
    }
  }

  onSideQuestAccepted(q) {
    if (q.type === 'fetch' && this.overworld) this.overworld.spawnQuestItems();
    if (q.type === 'deliver') this.toast(`Received ${q.parcel}.`);
    if (q.type === 'rescue') reveal(this.state, `cave:${q.caveId}`);
    this.updateObjective();
  }

  showEnding() {
    const s = this.state;
    const mins = Math.floor(s.playTime / 60);
    this.saveGame(true);
    this.pushUI(new Menu('The Ember Rekindled', [
      { label: 'Continue exploring', onSelect: () => { this.uiStack.pop(); } },
      { label: 'Return to title', onSelect: () => this.app.toTitle() },
    ], {
      width: 300,
      lines: [
        'Three wardens quieted. Three shards returned to the Hearth.',
        'The woods have stopped creeping; frost lifts from the high roads.',
        'But the western fane still drowns, and the Spire waits sealed.',
        '',
        `${CLASSES[s.classId].name} · ${mins} min · ${s.stats.kills} foes defeated · ${s.stats.deaths} falls`,
        'Thank you for playing this prototype of Emberwake.',
      ],
    }));
  }

  saveGame(silent = false) {
    this.state.location = this.currentLocation();
    this.state.progress.fog = encodeBits(this.fog);
    const ok = this.store.save(this.state);
    if (!silent || !ok) this.toast(ok ? 'Game saved.' : 'Could not save — browser storage is unavailable.');
    return ok;
  }

  updateObjective() {
    const o = mainObjective(this.state, this.world);
    this.objective = o.text;
    this.objectiveMarker = o.marker;
    const active = this.sideQuests.filter((q) => ['active', 'ready'].includes(sideStatus(this.state, q)));
    this.subObjective = active.length ? `${active.length} side quest${active.length > 1 ? 's' : ''} active — Esc › Quest Log` : '';
    if (this.area?.kind === 'overworld') {
      for (const n of this.area.npcs()) {
        const q = this.sideQuests.find((x) => x.giverId === n.data.id);
        const st = q && sideStatus(this.state, q);
        n.marker = st === 'available' ? '!' : st === 'ready' ? '?' : this.isMainTarget(n) ? '!' : null;
      }
    } else if (this.area) {
      for (const n of this.area.npcs()) {
        const q = this.sideQuests.find((x) => x.giverId === n.data.id);
        const st = q && sideStatus(this.state, q);
        n.marker = st === 'available' ? '!' : st === 'ready' ? '?' : this.isMainTarget(n) ? '!' : null;
      }
    }
  }

  isMainTarget(n) {
    const st = this.state.quest.main, d = n.data;
    return (d.role === 'elder' && d.settlementId === 'home' && (st === 'wake' || st === 'drowned'))
      || (d.role === 'scout' && (st === 'scout' || st === 'sigil'))
      || (d.role === 'smith' && d.settlementId === 'home' && st === 'smith')
      || (d.role === 'keeper' && ((d.settlementId === 'desert' && st === 'ashpass') || (d.settlementId === 'mountain' && st === 'frostpass')));
  }

  showBanner(title, sub) { this.banner = { title, sub, t: 3, max: 3 }; }

  toast(text) {
    this.toasts.push({ text, t: 3.5 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  revealFog() {
    const p = this.player;
    const cx = Math.floor(p.x / TILE / FOG_CELL), cy = Math.floor(p.y / TILE / FOG_CELL);
    const r = 4;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      if (x < 0 || y < 0 || x >= this.fogW || y >= this.fogH) continue;
      if ((x - cx) ** 2 * 0.7 + (y - cy) ** 2 <= r * r + 1) this.fog[y * this.fogW + x] = 1;
    }
  }

  // ---------------------------------------------------------------- menus
  openPause() {
    this.audio.sfx('menu');
    const s = this.state;
    const menu = new Menu('Paused', [
      { label: 'Resume', onSelect: () => { menu.done = true; } },
      { label: 'Quest log', onSelect: () => this.pushUI(this.questLog()) },
      { label: 'Equipment & stats', onSelect: () => this.pushUI(this.equipmentMenu()) },
      { label: 'Talents', value: () => `${s.talents.points} pts`, onSelect: () => this.pushUI(talentMenu(this, false)) },
      { label: 'Options', onSelect: () => this.pushUI(this.app.optionsMenu()) },
      { label: 'Controls', onSelect: () => this.pushUI(controlsMenu()) },
      { label: 'Save game', onSelect: () => { this.saveGame(); menu.done = true; } },
      { label: 'Save & quit to title', onSelect: () => { this.saveGame(true); this.app.toTitle(); } },
    ], { width: 200, footer: `${CLASSES[s.classId].name} · seed "${s.seed}" · ${Math.floor(s.playTime / 60)} min` });
    this.pushUI(menu);
  }

  questLog() {
    const lines = [{ text: 'Main quest', color: '#f0c850' }, ...wrapPlain(this.objective, 60)];
    const active = this.sideQuests.filter((q) => ['active', 'ready'].includes(sideStatus(this.state, q)));
    lines.push('', { text: 'Side quests', color: '#f0c850' });
    if (!active.length) lines.push('None active. Look for villagers marked with “!”.');
    for (const q of active) lines.push(...wrapPlain('• ' + sideObjective(this.state, q, this.world).text, 60));
    const done = this.sideQuests.filter((q) => sideStatus(this.state, q) === 'done').length;
    lines.push('', `Completed side quests: ${done} / ${this.sideQuests.length}   ·   Ember shards: ${this.state.progress.shards} / 4`);
    return new Menu('Quest Log', [], { width: 320, lines });
  }

  equipmentMenu() {
    const s = this.state, d = this.derived;
    const owned = s.gear.owned;
    return new Menu('Equipment & Stats', [
      {
        label: 'Weapon', value: () => WEAPONS[s.gear.weapon].name + (owned.length > 1 ? '  ◂▸' : ''),
        detail: 'Left/right to swap between weapons you own.',
        onLeft: () => { const i = owned.indexOf(s.gear.weapon); s.gear.weapon = owned[(i + owned.length - 1) % owned.length]; },
        onRight: () => { const i = owned.indexOf(s.gear.weapon); s.gear.weapon = owned[(i + 1) % owned.length]; },
      },
      { label: 'Shield', value: () => (s.gear.shield ? SHIELDS[s.gear.shield].name : '—') },
      { label: 'Items', value: () => s.gear.items.map((i) => USE_ITEMS[i].name).join(', ') || '—' },
      { label: 'Artifacts', value: () => s.artifacts.map((a) => ARTIFACTS[a]?.name || a).join(', ') || '—' },
    ], {
      width: 330,
      lines: [
        `${CLASSES[s.classId].name} — ${CLASSES[s.classId].blurb}`,
        `Health ${Math.ceil(s.player.hp)}/${d.maxHp}   Mana ${Math.floor(s.player.mana)}/${d.maxMana}   Stamina ${d.maxStamina}`,
        `Arrows ${s.player.arrows}/${d.maxArrows}   Knives ${s.player.knives}/${d.maxKnives}   Bombs ${s.player.bombs}/${s.tools.bombs ? d.maxBombs : 0}`,
        `Coins ${s.player.coins}   Rations ${s.player.food}   Heart pieces ${s.upgrades.heartPieces}/2   Shards ${s.progress.shards}/4`,
        `Foes defeated ${s.stats.kills}   Falls ${s.stats.deaths}`,
      ],
    });
  }
}

function wrapPlain(text, n) {
  const out = []; let line = '';
  for (const w of String(text).split(' ')) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

export function controlsMenu() {
  return new Menu('Controls', [], {
    width: 300,
    lines: [
      'Move ............ WASD / Arrow keys',
      'Attack .......... J or Z',
      'Use item ........ K or X        Cycle item ... Q or Tab',
      'Shield (hold) ... L or C        Dodge ........ Space',
      'Sprint (hold) ... Shift         Lock-on ...... R',
      'Interact / talk . E or Enter    Pull block ... hold E + step back',
      'Eat ration ...... F             Map .......... M',
      'Pause / menu .... Esc or P',
    ],
  });
}
