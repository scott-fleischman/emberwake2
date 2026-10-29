// Cutscene Theater (debug): every story scene back to back, like a movie. Warden scenes play in
// their real boss rooms. Step between scenes, pause, or change the speed with the bar (or keys).
// Uses a throwaway world and never saves.
import { GameScene } from './game.js';
import { Particles } from '../game/entities.js';
import { newGameState } from '../game/state.js';
import { CLASSES } from '../data/classes.js';
import { introShots, elderShots, hearthShots, kindleShots, bossIntroShots, bossOutroShots, WARDENS } from '../data/story.js';
import { dirWord } from '../game/quests.js';
import { DUNGEON_INFO } from '../world/dungeons.js';
import { lookoutShots, sealShots } from '../data/wards.js';
import { openSeal, closeSeal } from '../world/wards.js';
import { TILE } from '../world/tiles.js';
import { text } from '../gfx/ui.js';
import { UI } from '../gfx/palette.js';

const CHAPTERS = [['verdant', 'thornmaw', 'I'], ['ashen', 'cinder', 'II'], ['frost', 'rime', 'III']];
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
const fmtSpeed = (s) => `${s < 1 ? s.toString().replace('0.', '.') : s}×`;

export class TheaterScene extends GameScene {
  constructor(app, classId = 'swordsman') {
    super(app, newGameState(`theater${Math.floor(Math.random() * 1000)}`, classId));
    this.saveGame = () => true;
    this.speed = 1;
    this.paused = false;
    this.touchBack = 'Backspace';
    this.touchBarAt = 'top';
    this.scenes = this.program();
    this.i = -1;
    this.go(0);
  }

  // Each scene sets up its own stage, so any one can be played on its own.
  program() {
    const W = this.world, N = (sid, role) => W.npcs.find((n) => n.settlementId === sid && n.role === role);
    const home = W.settlements.find((s) => s.id === 'home'), out = W.settlements.find((s) => s.id === 'outpost');
    const cls = CLASSES[this.state.classId].name;
    const play = (shots, opts = {}) => this.playCutscene(shots, { autoplay: true, noSkip: true, hint: '←→ scene · −/+ speed · P pause · Backspace leave', ...opts, onDone: () => this.go(this.i + 1) });
    const list = [
      { label: 'Prologue', run: () => play(introShots(cls), { music: 'story' }) },
      { label: 'The elder', run: () => play(elderShots({ cls, elder: N('home', 'elder').name, scout: N('outpost', 'scout').name, outpost: out.name, dir: dirWord(home.center, out.center), tip: 'trust your instincts' }), { music: 'story' }) },
    ];
    for (const [id, kind, num] of CHAPTERS) {
      const name = DUNGEON_INFO[id].name;
      list.push({ label: `Chapter ${num}`, run: () => play([{ art: 'titlecard', title: name, sub: `Chapter ${num} · ${WARDENS[kind].sub}`, hold: 2.2 }], { music: 'story' }) });
      // The road to the ward: its lookout (if it has one), then the seal breaking.
      const look = { verdant: 'lookout', frost: 'windcrest' }[id];
      if (look && W.pois.lookouts.some((l) => l.id === look)) list.push({ label: look === 'lookout' ? 'The watchtower' : 'The Windcrest', run: () => { this.toWorld(W.pois.lookouts.find((l) => l.id === look), 1); play(lookoutShots(W, look), { letterbox: true, music: 'story' }); } });
      if (W.pois.seals[id]) list.push({ label: { verdant: 'The thornwall', ashen: 'The firewall', frost: 'The ice wall' }[id], run: () => { this.toWorld(W.pois.seals[id].arena, 0); closeSeal(W, this.overworldMap, id); play(sealShots(W, id, () => this.openSealFx(id)), { letterbox: true, liveFx: true, music: 'story' }); } });
      list.push({ label: `${WARDENS[kind].title} awakens`, run: () => { this.toBossRoom(id); play(bossIntroShots(kind), { letterbox: true, music: 'boss' }); } });
      list.push({ label: `${WARDENS[kind].title} falls`, run: () => { this.toBossRoom(id); const focus = this.quietBoss(); play(bossOutroShots(kind, focus), { letterbox: true, music: 'story' }); } });
    }
    const elder = N('home', 'elder').name, town = W.settlements.find((s) => s.id === 'swamp').name;
    list.push({ label: 'Rekindled', run: () => play(hearthShots({ elder, town }), { music: 'story' }) });
    list.push({ label: 'The Spire opens', run: () => play(kindleShots({ elder }), { music: 'story' }) });
    return list;
  }

  // Jump to scene i, dropping whatever is playing without letting it chain on.
  go(i) {
    for (const ui of this.uiStack) { ui.onDone = null; ui.done = true; ui.release?.(this); }
    this.uiStack = [];
    this.pending = null;
    if (i < 0) i = 0;
    if (i >= this.scenes.length) { this.app.toTitle(); return; }
    this.i = i;
    this.scenes[i].run();
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
    a.entities = a.entities.filter((e) => e !== b);
    return { x: b.x, y: b.y };
  }

  setSpeed(d) { this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed) + d))]; }

  update(dt) {
    const input = this.input;
    if (input.keyPressed('Backspace')) { this.app.toTitle(); return; }
    if (input.keyPressed('ArrowRight') || input.keyPressed('BracketRight')) { this.go(this.i + 1); return; }
    if (input.keyPressed('ArrowLeft') || input.keyPressed('BracketLeft')) { this.go(this.i - 1); return; }
    if (input.keyPressed('Equal') || input.keyPressed('NumpadAdd')) this.setSpeed(1);
    if (input.keyPressed('Minus') || input.keyPressed('NumpadSubtract')) this.setSpeed(-1);
    if (input.keyPressed('KeyP')) this.paused = !this.paused;
    super.update(this.paused ? 0 : dt * this.speed);
  }

  touchMode() { return 'ui'; }

  touchButtons() {
    return [
      { label: '◀◀ Prev', act: 'ArrowLeft', disabled: this.i <= 0 },
      { label: this.paused ? '▶ Play' : '❚❚ Pause', act: 'KeyP', on: this.paused },
      { label: 'Next ▶▶', act: 'ArrowRight' },
      { label: '−', act: 'Minus', disabled: this.speed === SPEEDS[0] },
      { label: fmtSpeed(this.speed), act: () => { this.speed = 1; } },
      { label: '+', act: 'Equal', disabled: this.speed === SPEEDS[SPEEDS.length - 1] },
      { label: '✕', act: 'Backspace' },
    ];
  }

  drawUI(u) {
    super.drawUI(u);
    const sc = this.scenes[this.i];
    if (sc) text(u, `${this.i + 1}/${this.scenes.length} · ${sc.label}${this.paused ? ' · paused' : ''}${this.speed !== 1 ? ` · ${fmtSpeed(this.speed)}` : ''}`, 8, 264, { size: 6, color: UI.dim });
  }
}
