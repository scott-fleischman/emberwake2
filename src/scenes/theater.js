// Cutscene Theater (debug): every story scene back to back, like a movie. Warden scenes play in
// their real boss rooms. Uses a throwaway world and never saves.
import { GameScene } from './game.js';
import { Particles } from '../game/entities.js';
import { newGameState } from '../game/state.js';
import { CLASSES } from '../data/classes.js';
import { introShots, elderShots, endingShots, bossIntroShots, bossOutroShots, WARDENS } from '../data/story.js';
import { dirWord } from '../game/quests.js';
import { DUNGEON_INFO } from '../world/dungeons.js';
import { lookoutShots, sealShots } from '../data/wards.js';
import { openSeal } from '../world/wards.js';
import { TILE } from '../world/tiles.js';

const CHAPTERS = [['verdant', 'thornmaw', 'I'], ['ashen', 'cinder', 'II'], ['frost', 'rime', 'III']];

export class TheaterScene extends GameScene {
  constructor(app, classId = 'swordsman') {
    super(app, newGameState(`theater${Math.floor(Math.random() * 1000)}`, classId));
    this.saveGame = () => true;
    this.queue = this.program();
    this.next();
  }

  program() {
    const W = this.world, N = (sid, role) => W.npcs.find((n) => n.settlementId === sid && n.role === role);
    const home = W.settlements.find((s) => s.id === 'home'), out = W.settlements.find((s) => s.id === 'outpost');
    const cls = CLASSES[this.state.classId].name;
    const play = (shots, opts = {}) => () => this.playCutscene(shots, { autoplay: true, hint: 'Enter: next · Esc twice: skip scene · Backspace: leave', ...opts, onDone: () => this.next() });
    const list = [
      play(introShots(cls), { music: 'story' }),
      play(elderShots({ cls, elder: N('home', 'elder').name, scout: N('outpost', 'scout').name, outpost: out.name, dir: dirWord(home.center, out.center), tip: 'trust your instincts' }), { music: 'story' }),
    ];
    for (const [id, kind, num] of CHAPTERS) {
      list.push(play([{ art: 'titlecard', title: DUNGEON_INFO[id].name, sub: `Chapter ${num} · ${WARDENS[kind].sub}`, hold: 2.2 }], { music: 'story' }));
      // The road to the ward: its lookout (if it has one), then the seal breaking.
      const look = { verdant: 'lookout', frost: 'windcrest' }[id];
      if (look && W.pois.lookouts.some((l) => l.id === look)) list.push(() => { this.toWorld(W.pois.lookouts.find((l) => l.id === look), 1); play(lookoutShots(W, look), { letterbox: true, music: 'story' })(); });
      if (W.pois.seals[id]) list.push(() => { this.toWorld(W.pois.seals[id].arena, 0); play(sealShots(W, id, () => this.openSealFx(id)), { letterbox: true, liveFx: true, music: 'story' })(); });
      list.push(() => { this.toBossRoom(id); play(bossIntroShots(kind), { letterbox: true, music: 'boss' })(); });
      list.push(() => { const focus = this.quietBoss(); play(bossOutroShots(kind, focus), { letterbox: true, music: 'story' })(); });
    }
    list.push(play(endingShots({ elder: N('home', 'elder').name }), { music: 'story' }));
    return list;
  }

  // Stand on the overworld beside a tile, camera already there.
  toWorld(t, dy) {
    this.exitToOverworld(t.x, t.y + dy, true);
    this.cam.follow(this.player.x, this.player.y, this.area.map.pixelW, this.area.map.pixelH, 0, true);
    this.fade = 0;
  }

  openSealFx(id) {
    for (const t of openSeal(this.world, this.overworldMap, id)) this.area.spawn(new Particles(t.x * TILE + 8, t.y * TILE + 4, { count: 10, color: ['#ffffff', '#ffe0a0', '#a0a0a0'], speed: 70, life: 1.1, up: 30 }));
  }

  toBossRoom(id) {
    const boss = DUNGEON_INFO[id].boss;
    this.state.quest.flags[`intro:${boss}`] = true; // we play the intro ourselves
    this.enterDungeon(id);
    const a = this.area;
    a.enterRoom(a.dungeon.rooms.find((r) => r.role === 'boss').id, 's');
    this.fade = 0;
  }

  quietBoss() {
    const a = this.area, b = a.boss;
    if (!b) return { x: 192, y: 112 };
    b.dead = true;
    a.boss = null;
    a.enemyList = a.enemyList.filter((e) => e !== b);
    return { x: b.x, y: b.y };
  }

  next() {
    const step = this.queue.shift();
    if (step) step(); else this.app.toTitle();
  }

  update(dt) {
    if (this.input.keyPressed('Backspace')) { this.app.toTitle(); return; }
    super.update(dt);
  }
}
