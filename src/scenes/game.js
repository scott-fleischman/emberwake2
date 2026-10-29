// The main game scene: owns the world, state, current area, overlays, saving and death.
import { generateOverworld } from '../world/overworld.js';
import { TILE } from '../world/tiles.js';
import { derivedStats, decodeBits, encodeBits, applyDeathPenalty, DIFFICULTY } from '../game/state.js';
import { generateSideQuests, advanceMain, mainObjective, sideObjective, sideStatus, recordKill, reveal, trackedObjective, trackableQuests, cycleTracked, questTitle, ELITE_SEAL } from '../game/quests.js';
import { Player } from '../game/player.js';
import * as fx from '../game/effects.js';
import { OverworldArea, InteriorArea, CaveArea } from '../game/areas.js';
import { DungeonArea } from '../game/dungeon.js';
import { BossDeath } from '../game/bossdeath.js';
import { Poof, Particles, FloatText } from '../game/entities.js';
import { shieldBlocks, knockbackVector } from '../game/combat.js';
import { findFreeSpot } from '../game/physics.js';
import { conversation, shopMenu, shrineMenu, talentMenu, chestReward, cacheReward } from '../game/talk.js';
import { SHIELDS, WEAPONS, USE_ITEMS, ARTIFACTS } from '../data/items.js';
import { CLASSES } from '../data/classes.js';
import { Camera } from '../gfx/render.js';
import { drawBlind } from '../gfx/effects.js';
import { approach } from '../core/math.js';
import { Dialog, Menu, text, panel, setFont } from '../gfx/ui.js';
import { FAMILIES } from '../data/enemies.js';
import { drawHUD, drawMinimap, drawWorldMap, drawOverworldMinimap, FOG_CELL } from '../gfx/hud.js';
import { ItemMenu } from '../gfx/inventory.js';
import { Cutscene } from '../gfx/cutscene.js';
import { hot } from '../core/touch.js';
import { lookoutShots, sealShots } from '../data/wards.js';
import { openSeal, freezePool } from '../world/wards.js';
import { LoreJournal } from '../gfx/journal.js';
import { LOOKS } from '../gfx/sprites.js';
import { introShots, hearthShots, kindleShots, learnLore, LORE_ENTRIES, stonesRead } from '../data/story.js';
import { HERBS } from '../data/sidequests.js';
import { ROOM_W, ROOM_H } from '../world/dungeons.js';

class MapOverlay {
  constructor(kind) { this.kind = kind; this.done = false; this.skip = true; }
  update(dt, game) {
    if (this.skip) { this.skip = false; return; }
    if (game.input.pressed('map') || game.input.pressed('cancel') || game.input.pressed('pause')) { this.done = true; game.audio.sfx('menu'); }
    if (game.input.pressed('cycle')) game.cycleTrackedQuest();
  }
  draw(u, game) {
    hot(0, 0, 480, 270, 'KeyM');
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
    this.blindK = 0; // how far the blind vignette has closed, 0 to 1
    this.fogW = Math.ceil(this.world.w / FOG_CELL);
    this.fogH = Math.ceil(this.world.h / FOG_CELL);
    this.fog = decodeBits(state.progress.fog, this.fogW * this.fogH);
    this.fogNew = []; // cells revealed since the minimap last repainted
    this.player = new Player(this, 0, 0);
    this.lastOverworld = null;
    this.restoreLocation(state.location);
    this.updateObjective();
    // A save made mid-advance catches up: one from during Vesper's fall scene opens on the ending.
    this.questEvent({ type: 'load' });
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
      } else if (loc.area === 'dungeon' && (W.pois.dungeons[loc.id] || loc.id === 'spire')) { // the Spire stands apart from the wards
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
    this.settlePlayer();
    this.bossDeath = null;
    this.clearEffects();
  }

  // Whatever the player was in the middle of (a roll, a swing, a charge, a shove, a carried flame)
  // doesn't carry across a jump.
  settlePlayer() {
    const p = this.player;
    Object.assign(p, { lock: null, mode: p.mode === 'dead' ? 'dead' : 'normal', modeT: 0, charge: 0, kbT: 0, vx: 0, vy: 0, flame: 0 });
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
    const d = this.world.pois.dungeons[this.area.id] ?? this.world.pois.spire; // the Spire stands apart from the wards
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
    this.blindK = approach(this.blindK, this.player.effects.blind ? 1 : 0, dt * 3);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.banner) this.banner.t -= dt;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 3);
    const top = this.uiStack[this.uiStack.length - 1];
    if (top) {
      top.update(dt, this);
      if (top.liveFx) this.area.updateFx(dt);
      if (this.uiStack.some((ui) => ui.done)) this.uiStack = this.uiStack.filter((ui) => !ui.done);
      return;
    }
    if (this.deathT > 0) { this.updateDeath(dt); return; }
    if (this.bossDeath) { if (this.bossDeath.update(dt)) this.bossDeath = null; return; }
    if (this.pending && (this.pending.t -= dt) <= 0) { const fn = this.pending.fn; this.pending = null; fn(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.doorGrace > 0) this.doorGrace -= dt;
    const input = this.input;
    if (input.pressed('pause')) { this.openPause(); return; }
    if (input.pressed('map')) { this.pushUI(new MapOverlay(this.area.kind === 'dungeon' ? 'dungeon' : 'world')); this.audio.sfx('menu'); return; }
    if (input.pressed('inventory') && this.player.mode !== 'dead') { this.pushUI(new ItemMenu(this)); this.audio.sfx('menu'); return; }
    // A frozen player can't interact; the press falls through to Player.update and counts as a mash.
    if (input.pressed('interact') && this.player.mode !== 'dead' && !fx.blocked(this.player, 'all')) {
      if (this.area.interact()) return;
    }
    this.area.update(dt);
    this.tickEffects(dt);
    this.followCamera(dt);
    if (this.area.kind === 'overworld') this.revealFog();
    if (this.objT === undefined || (this.objT -= dt) <= 0) { this.objT = 1; this.updateObjective(); }
  }

  followCamera(dt, snap = false) {
    const p = this.player;
    if (this.area.kind === 'dungeon') this.cam.follow(ROOM_W * 8, ROOM_H * 8, ROOM_W * TILE, ROOM_H * TILE, dt, true);
    else this.cam.follow(p.x, p.y, this.area.map.pixelW, this.area.map.pixelH, dt, snap);
  }

  // What the touch layer should offer: the stick and buttons in play, a back button over menus,
  // nothing but watching while a warden dies.
  touchMode() { return this.uiStack.length || this.deathT > 0 || this.player.mode === 'dead' ? 'ui' : this.bossDeath ? 'watch' : 'play'; }

  drawWorld(g) {
    g.fillStyle = '#08060a';
    g.fillRect(0, 0, 480, 270);
    this.area.draw(g, this.cam);
    if (this.blindK > 0) drawBlind(g, this.player, this.cam, this.blindK);
    for (const ui of this.uiStack) if (ui.drawWorld) ui.drawWorld(g, this);
    if (this.bossDeath) this.bossDeath.draw(g);
    if (this.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade)})`; g.fillRect(0, 0, 480, 270); }
    if (this.deathT > 0) { g.fillStyle = `rgba(20,0,0,${Math.min(0.7, (2.2 - this.deathT) * 0.5)})`; g.fillRect(0, 0, 480, 270); }
  }

  drawUI(u) {
    if (!this.uiStack.some((ui) => ui.cinematic)) {
      drawBarks(u, this);
      drawHUD(u, this);
      if (this.area.kind === 'dungeon') drawMinimap(u, this.area, this);
      else if (this.area.kind !== 'arena') drawOverworldMinimap(u, this);
    }
    for (const ui of this.uiStack) ui.draw(u, this);
  }

  // ---------------------------------------------------------------- cutscenes
  playCutscene(shots, opts = {}) {
    this.clearEffects();
    return this.pushUI(new Cutscene(shots, { ...opts, ctx: { look: LOOKS[this.state.classId], world: this.world, shake: this.app.options.screenShake } }));
  }

  queueCutscene(fn, delay) { this.pending = { t: delay, fn }; }

  // A warden's hp hit 0: the centered death flow takes the scene over until it hands the victory to
  // the area. Nothing may hold the player through it.
  beginBossDeath(boss, opts = {}) {
    if (this.bossDeath || this.deathT > 0 || this.player.mode === 'dead') return; // the fallen watch no victory
    this.clearEffects();
    this.bossDeath = new BossDeath(this, boss, opts);
  }

  replayPrologue() {
    this.playCutscene(introShots(CLASSES[this.state.classId].name), { music: 'story', onDone: () => this.restoreMusic() });
  }

  restoreMusic() {
    const a = this.area;
    if (a.kind === 'dungeon') this.audio.playMusic(a.boss ? 'boss' : 'dungeon');
    else if (a.kind === 'cave') this.audio.playMusic('cave');
    else if (a.kind === 'interior') this.audio.playMusic('town');
    else if (a.kind === 'overworld') { a.regionKey = null; }
  }

  // ---------------------------------------------------------------- lore
  readLore(id, speaker) {
    const e = LORE_ENTRIES.find((x) => x.id === id);
    if (!e) return;
    const isNew = learnLore(this.state, id);
    this.message(e.text, speaker || e.title);
    if (!isNew) return;
    const n = this.state.progress.lore.length;
    this.toast(`Journal: “${e.title}” (${n}/${LORE_ENTRIES.length})`);
    this.audio.sfx('pickup', { pitch: 0.8 });
    const scholar = this.sideQuests.find((q) => q.type === 'scholar' && sideStatus(this.state, q) === 'active');
    if (scholar && id.startsWith('lore') && stonesRead(this.state) >= scholar.need) {
      this.state.quest.side[scholar.id] = 'ready';
      this.toast('You have read enough stones. Return to the scholar.');
    }
    this.updateObjective();
  }

  // ---------------------------------------------------------------- side quest moments
  catchPet(q) {
    if (this.state.quest.side[q.id] !== 'active') return;
    this.state.quest.side[q.id] = 'ready';
    this.audio.sfx('levelup');
    this.toast(`You scoop up ${q.pet.name}! Carry them home.`);
    this.updateObjective();
  }

  gatherHerb(q, id) {
    const s = this.state;
    if (s.quest.side[q.id] !== 'active') return;
    if (!s.progress.opened.includes(id)) s.progress.opened.push(id);
    const n = s.quest.kills[q.id] = (s.quest.kills[q.id] || 0) + 1;
    this.audio.sfx('pickup', { pitch: 1.2 });
    if (n >= q.count) { s.quest.side[q.id] = 'ready'; this.toast(`That's all the ${HERBS[q.herb].plural}! Bring them back.`); this.audio.sfx('levelup'); }
    else this.toast(`${HERBS[q.herb].plural[0].toUpperCase()}${HERBS[q.herb].plural.slice(1)}: ${n}/${q.count}`);
    this.updateObjective();
  }

  digTreasure(q, spot) {
    if (this.state.quest.side[q.id] !== 'active') return;
    this.state.quest.side[q.id] = 'ready';
    this.state.player.coins += 20;
    this.audio.sfx('chest');
    this.cam.shake(1.5, 0.15);
    this.area.spawn(new Particles(spot.x, spot.y, { count: 18, color: ['#a08050', '#ffe080', '#6a4a2a'], speed: 60, life: 0.6, up: 30 }));
    this.message(`Your shovel strikes wood! A small iron-bound strongbox, heavier than it looks. Inside: 20 loose coins, an old compass, and a folded note. Better bring the rest back to its owner.`, 'Buried Treasure');
    this.updateObjective();
  }

  pushUI(c) { this.uiStack.push(c); return c; }

  // ---------------------------------------------------------------- combat outcomes
  // opts.effect lands only with a hit that connects: a blocked or dodged blow carries nothing.
  // opts.unblockable skips the shield; zones set it unless they are blockable. opts.knock is the
  // knockback's force, for the heavy blows that throw you.
  damagePlayer(dmg, src, opts = {}) {
    const p = this.player, res = this.state.player;
    if (p.mode === 'dead' || this.deathT > 0 || this.bossDeath) return 'ignored';
    if (p.iframes > 0 && !opts.ignoreIframes) return 'ignored';
    if (!opts.unblockable && this.guard(dmg, src)) return 'blocked';
    const amount = dmg * this.diff.damageTaken;
    res.hp = Math.max(0, res.hp - amount);
    p.iframes = 0.9;
    p.flash = 0.15;
    this.player.regenPool = 0;
    if (src && !opts.noKnock) { const [kx, ky] = knockbackVector(src.x, src.y, p.x, p.y, opts.knock || 190); p.knock(kx, ky, 0.14); }
    this.audio.sfx('hurt');
    if (this.app.options.screenShake) this.cam.shake(2.5, 0.2);
    this.hitstop = 0.06;
    if (res.hp <= 0) this.die(); else if (opts.effect) this.applyEffect(opts.effect, src);
    return 'hit';
  }

  // The shield takes a blow from `src` if it faces it and stamina covers `dmg`: true when it does,
  // with the clang, the sparks and the shove. Effect-only zone strikes ask too (see zones.js); their
  // `src` is the point the blow comes from, with the foe that dealt it as `owner`.
  guard(dmg, src) {
    const p = this.player, res = this.state.player, shield = SHIELDS[this.state.gear.shield];
    if (!src || !shield || !p.shielding || !shieldBlocks(p, src.x, src.y, shield.arc)) return false;
    const cost = dmg * shield.cost * this.derived.blockMult;
    if (res.stamina < cost) { res.stamina = 0; this.toast('Guard broken!'); return false; }
    res.stamina -= cost;
    p.staminaDelay = 0.6;
    this.audio.sfx('block');
    this.area.spawn(new Particles(p.x + Math.cos(p.aim) * 8, p.y - 4 + Math.sin(p.aim) * 8, { count: 6, color: ['#ffffff', '#ffe080'], speed: 70, life: 0.25 }));
    const [kx, ky] = knockbackVector(src.x, src.y, p.x, p.y, 70);
    p.knock(kx, ky, 0.1);
    const foe = src.owner ?? src;
    if (foe.knock && foe.team === 'enemy' && !foe.boss) { const [ex, ey] = knockbackVector(p.x, p.y, foe.x, foe.y, 160); foe.knock(ex, ey, 0.2); }
    return true;
  }

  // ---------------------------------------------------------------- status effects
  // Zones with no damage call this directly. `src` is where it came from (a zone's strike point,
  // with its owner); nothing reads it yet.
  applyEffect(kind, src) {
    const p = this.player;
    if (p.mode === 'dead' || this.deathT > 0 || this.bossDeath) return false;
    const to = fx.resolve(p, kind), fresh = !p.effects[to];
    if (!fx.applyEffect(p, kind, { story: this.app.options.difficulty === 'story' })) return false;
    // A patch re-strikes every second; only the first strike of an effect gets the fanfare.
    if (fresh) {
      const def = fx.EFFECTS[to];
      this.audio.sfx(def.sfx);
      this.area.spawn(new Particles(p.x, p.y - 6, { count: 8, color: `rgb(${def.rgb})`, speed: 40, life: 0.4 }));
    }
    return true;
  }

  // Damage over time skips invulnerability and knockback: poison alone stops at half a heart, but a
  // burning player can die.
  tickEffects(dt) {
    const p = this.player, res = this.state.player;
    if (p.mode === 'dead') return;
    const floor = fx.dotFloor(p), dmg = fx.tickEffects(p, dt);
    if (dmg <= 0) return;
    res.hp = Math.min(res.hp, Math.max(floor, res.hp - dmg * this.diff.damageTaken));
    this.audio.sfx('hurt', { volume: 0.5, pitch: 1.4 });
    if (res.hp <= 0) this.die();
  }

  clearEffects() {
    fx.clearEffects(this.player);
    this.blindK = 0;
  }

  die() {
    const p = this.player;
    this.clearEffects();
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
      case 'relic': {
        const pr = s.progress, list = this.world.pois.relics.leaves;
        if (!pr.relics.includes(pk.relic.id)) pr.relics.push(pk.relic.id);
        this.audio.sfx('levelup');
        this.area.spawn(new Particles(pk.x, pk.y - 6, { count: 16, color: ['#8aff6a', '#c8a050', '#ffffff'], speed: 50, life: 0.7 }));
        this.toast(`A leaf of the Verdant Sigil! (${list.filter((r) => pr.relics.includes(r.id)).length}/${list.length})`);
        this.questEvent({ type: 'relic', kind: 'leaves', id: pk.relic.id });
        return true;
      }
      case 'herb': {
        const q = this.sideQuests.find((x) => x.id === pk.questId);
        if (q) this.gatherHerb(q, pk.id);
        return true;
      }
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
    if (pages && pages.cutscene) {
      this.playCutscene(pages.cutscene, {
        music: 'story',
        onDone: () => { npc.talking = false; this.restoreMusic(); this.updateObjective(); this.toast(`New objective: ${this.objective}`); },
      });
      return;
    }
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
    const from = this.state.quest.main;
    const r = advanceMain(this.state, this.world, ev);
    if (r.advanced) {
      if (r.stage === 'leaves' && this.overworld) this.overworld.spawnWardItems();
      for (const n of r.notes) this.toast(n);
      this.audio.sfx('levelup');
      this.updateObjective();
      this.toast(`New objective: ${this.objective}`);
      // Shards brought home: the Hearth takes three, then four, and the Spire answers.
      const scene = { hearth: hearthShots, kindle: kindleShots }[from];
      if (scene) {
        const W = this.world, elder = W.npcs.find((n) => n.role === 'elder' && n.settlementId === 'home');
        const town = W.settlements.find((q) => q.id === 'swamp').name;
        this.playCutscene(scene({ elder: elder.name, town }), { music: 'story', onDone: () => this.restoreMusic() });
      }
      if (r.stage === 'end') this.showEnding();
    }
  }

  // ---------------------------------------------------------------- ward quests
  reachLookout(id) {
    if (this.uiStack.length || this.state.quest.flags[`reach:${id}`]) return;
    this.state.quest.flags[`reach:${id}`] = true;
    this.playCutscene(lookoutShots(this.world, id), {
      letterbox: true,
      music: 'story',
      onDone: () => { this.restoreMusic(); this.questEvent({ type: 'reach', id }); },
    });
  }

  breakSeal(key) {
    const pr = this.state.progress;
    if (this.uiStack.length || pr.seals.includes(key)) return;
    const W = this.world;
    const open = () => {
      pr.seals.push(key);
      const tiles = openSeal(W, this.overworldMap, key);
      const color = { verdant: ['#3a2a1a', '#6a5a3a', '#2e4a1e'], ashen: ['#ff7030', '#ffd060', '#3a2a2a'], frost: ['#e0f8ff', '#ffffff', '#a8d8f0'], drowned: ['#5ac8d8', '#a0e8f0', '#2a5a6a'] }[key];
      if (this.area === this.overworld) for (const t of tiles) this.area.spawn(new Particles(t.x * TILE + 8, t.y * TILE + 4, { count: 10, color, speed: 70, life: 1.1, up: 30 }));
    };
    this.playCutscene(sealShots(W, key, open), {
      letterbox: true,
      liveFx: true,
      music: 'story',
      onDone: () => { if (!pr.seals.includes(key)) open(); this.restoreMusic(); this.questEvent({ type: 'seal', key }); this.saveGame(true); },
    });
  }

  onEliteDefeated(e) {
    const pr = this.state.progress;
    if (!pr.elites.includes(e.eliteId)) pr.elites.push(e.eliteId);
    this.audio.sfx('levelup');
    if (e.eliteId === 'warchief') { this.toast('Gorrak the Warchief falls! The warband breaks.'); return; }
    this.queueCutscene(() => this.breakSeal(ELITE_SEAL[e.eliteId]), 1.2);
  }

  // The Rime Charm turns a bell's pool to ice, for good.
  freezePool(bellId) {
    const pr = this.state.progress;
    if (!pr.frozen.includes(bellId)) pr.frozen.push(bellId);
    return this.overworldMap ? freezePool(this.world, this.overworldMap, bellId) : [];
  }

  onSideQuestAccepted(q) {
    if (['fetch', 'pet', 'gather', 'treasure'].includes(q.type) && this.overworld) this.overworld.spawnQuestItems();
    if (q.type === 'letters') this.toast('Received a sealed letter.');
    if (q.type === 'deliver') this.toast(`Received ${q.parcel}.`);
    if (q.type === 'rescue') reveal(this.state, `cave:${q.caveId}`);
    // A freshly accepted quest is usually the one you want to do next, so pin it.
    this.state.quest.tracked = q.id;
    this.updateObjective();
    this.toast(`Tracking “${questTitle(q, this.world)}” — switch in the Quest Log or map (Q).`);
  }

  trackQuest(id) {
    this.state.quest.tracked = id;
    this.updateObjective();
    this.audio.sfx('select');
  }

  cycleTrackedQuest() {
    cycleTracked(this.state, this.sideQuests);
    this.updateObjective();
    this.audio.sfx('menu');
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
        'Four wardens quieted. Four shards returned to the Hearth.',
        'The woods breathe, the ash and frost have lifted, and the fens drain.',
        'And beneath the Spire, the Unkindled has let go of the fire at last.',
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
    const o = trackedObjective(this.state, this.world, this.sideQuests, this.overworldPos());
    this.state.quest.tracked = o.id;
    this.objective = o.text;
    this.objectiveTitle = o.title;
    this.objectiveMarker = o.marker;
    this.objectiveDungeon = o.dungeon;
    // Faint markers for the quests you're not tracking.
    this.otherMarkers = trackableQuests(this.state, this.sideQuests).filter((id) => id !== o.id).map((id) => {
      const q = this.sideQuests.find((x) => x.id === id);
      const so = q ? sideObjective(this.state, q, this.world) : mainObjective(this.state, this.world, this.overworldPos());
      return so.marker;
    }).filter(Boolean);
    const others = this.otherMarkers.length;
    this.subObjective = others ? `${others} other quest${others > 1 ? 's' : ''} — Esc › Quest Log to switch` : '';
    if (this.area) {
      for (const n of this.area.npcs()) {
        const q = this.sideQuests.find((x) => x.giverId === n.data.id);
        const st = q && sideStatus(this.state, q);
        const carrying = this.sideQuests.some((x) => ['letters', 'deliver'].includes(x.type) && x.targetNpc === n.data.id && sideStatus(this.state, x) === 'active');
        n.marker = st === 'available' ? '!' : st === 'ready' ? '?' : this.isMainTarget(n) || carrying ? '!' : null;
      }
    }
  }

  // A short line an NPC calls out as you pass. Mostly hints at their quest or the state of the realm.
  barkFor(n) {
    const d = n.data, s = this.state;
    if (d.lost) return 'Hello? Is someone there?';
    const q = this.sideQuests.find((x) => x.giverId === d.id);
    const st = q && sideStatus(s, q);
    if (q && st === 'available') {
      switch (q.type) {
        case 'pet': return `${q.pet.name}! Where are you?`;
        case 'letters': return 'Should I send it? I should send it. Should I?';
        case 'riddle': return 'Riddles! Who wants riddles?';
        case 'scholar': return 'If only someone could read the old stones for me...';
        case 'treasure': return 'That old treasure map... my back is too stiff to dig.';
        case 'gather': return `I need ${HERBS[q.herb].plural}...`;
        case 'fetch': return `Where did my ${q.item} go?`;
        case 'hunt': return `Those ${FAMILIES[q.biome].names[q.archetype]}s again...`;
        case 'rescue': return `${q.kin[0].toUpperCase()}${q.kin.slice(1)} should be home by now...`;
        default: return 'This parcel won\'t deliver itself.';
      }
    }
    if (q && st === 'ready') return 'Is that... did you do it?';
    if (q && st === 'done' && Math.random() < 0.5) return ['Thanks again, friend!', 'There\'s my hero!', 'Good to see you!'][Math.floor(Math.random() * 3)];
    const role = { merchant: 'Rations! Arrows! Fair prices!', smith: '*clang* *clang* *clang*', innkeeper: 'Warm beds and hot stew!', seer: 'The smoke stirs...', scout: 'Quiet out there. Too quiet.', keeper: 'Keep the roads safe, traveler.', elder: 'The Hearth...', ranger: 'Mind the brambles.' }[d.role];
    if (role) return role;
    const b = s.progress.bosses;
    const lines = ['Lovely day for it.', 'Have you eaten? You look thin.', 'Mind the wolves past the fence.', 'My knees say rain is coming.'];
    if (!b.includes('verdant')) lines.push('Thorns grew across the north path again...', 'The Hearth looked so dim last night.');
    else lines.push('The woods feel lighter lately!', 'I heard birds this morning. Birds!');
    if (b.includes('ashen')) lines.push('No ash in the well today!');
    if (b.includes('frost')) lines.push('Is it me, or is it warmer?');
    return lines[Math.floor(Math.random() * lines.length)];
  }

  isMainTarget(n) {
    const st = this.state.quest.main, d = n.data;
    return (d.role === 'elder' && d.settlementId === 'home' && (st === 'wake' || st === 'hearth' || st === 'kindle'))
      || (d.role === 'scout' && (st === 'scout' || st === 'sigil'))
      || (d.role === 'smith' && d.settlementId === 'home' && st === 'smith')
      || (d.role === 'keeper' && ({ desert: 'ashpass', mountain: 'frostpass', volcanic: 'cinderwatch', snow: 'rimewatch', swamp: 'fenkeep' })[d.settlementId] === st);
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
      const i = y * this.fogW + x;
      if (!this.fog[i] && (x - cx) ** 2 * 0.7 + (y - cy) ** 2 <= r * r + 1) { this.fog[i] = 1; this.fogNew.push(i); }
    }
  }

  // ---------------------------------------------------------------- menus
  openPause() {
    this.audio.sfx('menu');
    const s = this.state;
    const menu = new Menu('Paused', [
      { label: 'Resume', onSelect: () => { menu.done = true; } },
      { label: 'Items', onSelect: () => this.pushUI(new ItemMenu(this)) },
      { label: 'Quest log', onSelect: () => this.pushUI(this.questLog()) },
      { label: 'Lore journal', value: () => `${(s.progress.lore || []).length}/${LORE_ENTRIES.length}`, onSelect: () => this.pushUI(new LoreJournal(this)) },
      { label: 'Equipment & stats', onSelect: () => this.pushUI(this.equipmentMenu()) },
      { label: 'Talents', value: () => `${s.talents.points} pts`, onSelect: () => this.pushUI(talentMenu(this, false)) },
      { label: 'Options', onSelect: () => this.pushUI(this.app.optionsMenu()) },
      { label: 'Controls', onSelect: () => this.pushUI(controlsMenu()) },
      { label: 'Replay prologue', onSelect: () => { menu.done = true; this.replayPrologue(); } },
      { label: 'Save game', onSelect: () => { this.saveGame(); menu.done = true; } },
      { label: 'Save & quit to title', onSelect: () => { this.saveGame(true); this.app.toTitle(); } },
    ], { width: 200, footer: `${CLASSES[s.classId].name} · seed "${s.seed}" · ${Math.floor(s.playTime / 60)} min` });
    this.pushUI(menu);
  }

  questLog() {
    const W = this.world, s = this.state;
    const done = this.sideQuests.filter((q) => sideStatus(s, q) === 'done').length;
    const entries = trackableQuests(s, this.sideQuests).map((id) => {
      const q = this.sideQuests.find((x) => x.id === id) || null;
      const objective = () => (q ? sideObjective(s, q, W) : mainObjective(s, W));
      return {
        get label() { return `${s.quest.tracked === id ? '◆' : '◇'} ${questTitle(q, W)}${q ? '' : '  (main)'}`; },
        value: () => (s.quest.tracked === id ? 'Tracking' : q && sideStatus(s, q) === 'ready' ? 'Complete' : ''),
        detail: () => objective().text,
        onSelect: () => { this.trackQuest(id); this.toast(`Tracking “${questTitle(q, W)}”.`); },
      };
    });
    return new Menu('Quest Log', entries, {
      width: 340,
      lines: [
        { text: 'Choose a quest to track. Its spot pulses yellow on your map and minimap.', color: '#b8a888' },
        `Side quests completed: ${done} / ${this.sideQuests.length}   ·   Ember shards: ${s.progress.shards} / 4`,
      ],
    });
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

function drawBarks(u, game) {
  if (!game.area || game.area.kind === 'dungeon') return;
  const cam = game.cam;
  for (const n of game.area.npcs()) {
    const b = n.bark;
    if (!b || b.t <= 0 || n.talking) continue;
    const x = n.x - cam.left, y = n.y - cam.top - 26 - (n.marker ? 8 : 0);
    if (x < -60 || x > 540 || y < -20 || y > 290) continue;
    setFont(u, 6);
    const w = Math.min(150, u.measureText(b.text).width + 10);
    u.globalAlpha = Math.min(1, b.t * 2, (3.2 - b.t) * 4 + 0.2);
    panel(u, x - w / 2, y - 9, w, 12, { r: 3, fill: 'rgba(250,244,230,0.92)', edge: '#6a5040' });
    u.fillStyle = 'rgba(250,244,230,0.92)';
    u.beginPath(); u.moveTo(x - 3, y + 3); u.lineTo(x + 3, y + 3); u.lineTo(x, y + 7); u.closePath(); u.fill();
    text(u, b.text, x, y, { size: 6, align: 'center', color: '#3a2a20', shadow: false });
    u.globalAlpha = 1;
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
      'Attack .......... J or Z        Spin attack .. hold J, release',
      'Use item ........ K or X        Item menu .... I or Y',
      'Quick-swap item . Q or Tab',
      'Shield (hold) ... L or C        Dodge ........ Space',
      'Sprint (hold) ... Shift         Lock-on ...... R',
      'Interact / talk . E or Enter    Pull block ... hold E + step back',
      'Eat ration ...... F             Map .......... M',
      'Pause / menu .... Esc or P',
    ],
  });
}
