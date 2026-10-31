// Cutscene Theater (debug): every story scene back to back, like a movie. Warden scenes play in
// their real boss rooms. Step between scenes, pause, or change the speed with the bar (or keys).
// Uses a throwaway world and never saves.
import { GameScene } from './game.js';
import { Particles } from '../game/entities.js';
import { newGameState } from '../game/state.js';
import { CLASSES } from '../data/classes.js';
import { introShots, elderShots, hearthShots, kindleShots, endingShots, bossIntroShots, bossOutroShots, vesperRiseShots, WARDENS } from '../data/story.js';
import { dirWord } from '../game/quests.js';
import { DUNGEON_INFO } from '../world/dungeons.js';
import { lookoutShots, sealShots } from '../data/wards.js';
import { openSeal, closeSeal } from '../world/wards.js';
import { TILE } from '../world/tiles.js';
import { text } from '../gfx/ui.js';
import { UI } from '../gfx/palette.js';

const WARD_CHAPTERS = [['verdant', 'I'], ['ashen', 'II'], ['frost', 'III'], ['drowned', 'IV']];
const LOOKOUT = { verdant: ['lookout', 'The watchtower'], frost: ['windcrest', 'The Windcrest'], drowned: ['belfry', 'The Drowned Belfry'] };
const SEAL = { verdant: 'The thornwall', ashen: 'The firewall', frost: 'The ice wall', drowned: 'The Tidewall' };
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
const fmtSpeed = (s) => `${s < 1 ? s.toString().replace('0.', '.') : s}×`;
const card = (title, sub) => [{ art: 'titlecard', title, sub, hold: 2.2 }];

// The whole story in the order it plays, as {label, run}. Labels need only the world; each run sets
// up its own stage on the Theater `t`, so any one scene can be played on its own.
export function theaterScenes(W, t) {
  const N = (sid, role) => W.npcs.find((n) => n.settlementId === sid && n.role === role);
  const S = (id) => W.settlements.find((s) => s.id === id);
  const home = S('home'), out = S('outpost'), elder = N('home', 'elder').name;
  const cls = () => CLASSES[t.state.classId].name;
  const story = (shots) => t.play(shots, { music: 'story' });
  const list = [
    { label: 'Prologue', run: () => story(introShots(cls())) },
    { label: 'The elder', run: () => story(elderShots({ cls: cls(), elder, scout: N('outpost', 'scout').name, outpost: out.name, dir: dirWord(home.center, out.center), tip: 'trust your instincts' })) },
  ];
  for (const [id, num] of WARD_CHAPTERS) {
    const kind = DUNGEON_INFO[id].boss, w = WARDENS[kind];
    // Three shards home come before the fourth ward's chain.
    if (id === 'drowned') list.push({ label: 'The Hearth rekindled', run: () => story(hearthShots({ elder, town: S('swamp').name })) });
    list.push({ label: `Chapter ${num}`, run: () => story(card(DUNGEON_INFO[id].name, `Chapter ${num} · ${w.sub}`)) });
    // The road to the ward: its lookout (if this world has one), then the seal breaking.
    const [look, lookLabel] = LOOKOUT[id] || [];
    const tower = look && W.pois.lookouts.find((l) => l.id === look);
    if (tower) list.push({ label: lookLabel, run: () => { t.toWorld(tower, 1); t.play(lookoutShots(W, look), { letterbox: true, music: 'story' }); } });
    if (W.pois.seals[id]) list.push({ label: SEAL[id], run: () => { t.toWorld(W.pois.seals[id].arena, 0); closeSeal(W, t.overworldMap, id); t.play(sealShots(W, id, () => t.openSealFx(id)), { letterbox: true, liveFx: true, music: 'story' }); } });
    list.push({ label: `${w.title} awakens`, run: () => { t.toBossRoom(id); t.play(bossIntroShots(kind), { letterbox: true, music: 'boss' }); } });
    list.push({ label: `${w.title} falls`, run: () => { t.toBossRoom(id); t.play(bossOutroShots(kind, t.quietBoss()), { letterbox: true, music: 'story' }); } });
  }
  list.push(
    { label: 'The Kindling', run: () => story(kindleShots({ elder })) },
    { label: 'Chapter V', run: () => story(card(DUNGEON_INFO.spire.name, `Chapter V · ${WARDENS.vesper.sub}`)) },
    { label: 'Into the Spire', run: () => { t.toSpire(); t.play(t.spireShots(), { letterbox: true, music: 'dungeon' }); } },
    { label: 'Vesper awakens', run: () => { t.toBossRoom('spire'); t.play(bossIntroShots('vesper'), { letterbox: true, music: 'boss' }); } },
    { label: 'Vesper rises', run: () => { t.toBossRoom('spire'); t.play(vesperRiseShots(), { letterbox: true, music: 'boss2' }); } },
    { label: 'Vesper lets go', run: () => { t.toBossRoom('spire'); t.play(bossOutroShots('vesper', t.quietBoss()), { letterbox: true, music: 'story' }); } },
    { label: 'Ending', run: () => t.play(endingShots({ elder }), { music: 'hearth' }) },
  );
  return list;
}

export class TheaterScene extends GameScene {
  constructor(app, classId = 'swordsman') {
    super(app, newGameState(`theater${Math.floor(Math.random() * 1000)}`, classId));
    this.saveGame = () => true;
    this.speed = 1;
    this.paused = false;
    this.touchBack = 'Backspace';
    this.touchBarAt = 'top';
    this.scenes = theaterScenes(this.world, this);
    this.i = -1;
    this.go(0);
  }

  // Scenes play themselves and chain on to the next.
  play(shots, opts = {}) {
    return this.playCutscene(shots, { autoplay: true, noSkip: true, hint: '←→ scene · −/+ speed · P pause · Backspace leave', ...opts, onDone: () => this.go(this.i + 1) });
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

  // Just inside the Spire's door.
  toSpire() {
    this.enterDungeon('spire');
    this.fade = 0;
  }

  // Play has no scene for the first steps into the Spire, so the Theater makes one from what its
  // walls say, then looks in on the inner hub's four dark sockets.
  spireShots() {
    const a = this.area;
    const plaque = a.room.objects.find((o) => o.type === 'plaque');
    const hub = a.dungeon.rooms.find((r) => r.role === 'hub' && r.objects.some((o) => o.type === 'socket'));
    return [
      { text: 'Through the open door, a stair winds down into the Spire. The air is cold, and smells of old smoke.', hold: 2.4, sfx: [['door', { pitch: 0.6 }]] },
      plaque && { text: `Carved over the arch: "${plaque.text}"`, hold: 2.6 },
      hub && { run: () => { a.enterRoom(hub.id, 's'); this.fade = 0; }, text: 'Deeper in, four sockets sit dark in the floor of a round hall, one for each ward. The way down stays shut until every one burns.', hold: 3 },
    ];
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
