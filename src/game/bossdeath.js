// The centered boss death. At 0 hp: a hit-stop and a white flash while minions and shots vanish in
// poofs; a fade to black; the boss set back at the centre of its arena, where it spawned, with the
// player a few steps south facing it; a fade back in; then the boss dematerializes on the spot and
// the area takes the victory (its spirit appears where the boss stood). The scene runs this in
// place of the area, so nothing else moves and the player can't act. Elites keep their own defeat.
// Vesper's first bar ends in a rise instead: he laughs, pulls the light out of the four sockets on the
// arena's rim and gets back up with a full bar.
import { Bomb, Particles, Poof, Projectile } from './entities.js';
import { Burst, DIE } from './boss.js';
import { TILE } from '../world/tiles.js';
import { vesperRiseShots } from '../data/story.js';
import { drawRiseStreams } from '../gfx/art-vesper.js';

// The rise: the laugh, the sockets' light streaming into him (PULL to IN), then his bar refilling to
// the end.
const RISE = 2.6, PULL = 0.3, IN = 1.1;
const STEPS = { stop: 0.25, fadeout: 0.6, fadein: 0.6, dissolve: DIE, rise: RISE };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class BossDeath {
  // rise: a boss that gets back up at 0 instead of dying (Vesper's first bar), to boss.riseBar, then
  // boss.rise() picks the fight up again.
  constructor(game, boss, { rise = false } = {}) {
    this.game = game; this.boss = boss; this.area = game.area; this.rise = rise;
    this.step = 'stop'; this.t = 0;
    boss.moves?.clear?.(boss, this.area.ctx); // once: whatever the fight left in the room
    this.sweep(true);
    game.audio.stopMusic();
    game.audio.sfx('explode', { pitch: 0.6, volume: 0.6 });
    game.cam.shake(4, 0.4);
  }

  // Every minion, shot, lit bomb and zone goes: in poofs at the killing blow, unseen once the screen is black.
  sweep(poof) {
    const a = this.area;
    for (const e of [...a.enemyList, ...a.entities.filter((q) => q instanceof Projectile || q instanceof Bomb)]) {
      if (e === this.boss || e.dead) continue;
      e.dead = true;
      if (poof) a.spawn(new Poof(e.x, e.y - 4));
    }
    a.entities = a.entities.filter((e) => !e.dead);
    a.enemyList = a.enemyList.filter((e) => !e.dead);
    a.zones = [];
  }

  place() {
    const g = this.game, b = this.boss;
    this.sweep(false);
    b.x = b.spawn.x; b.y = b.spawn.y; b.lx = b.x; b.ly = b.y; // a jump, not a walk: tickTimers mustn't turn it
    Object.assign(b, { view: 'front', state: 'defeated', roarT: 0, flash: 0 });
    g.placePlayer(b.spawn.x, b.spawn.y + 48, 'up'); // freed onto open floor
    g.settlePlayer();
    g.followCamera(0, true);
  }

  // True once it's over.
  update(dt) {
    const g = this.game, a = this.area, b = this.boss, ctx = a.ctx;
    if (g.area !== a) return true;
    this.t += dt;
    for (const e of a.entities) if (!e.dead && e instanceof Burst) e.update(dt, ctx);
    a.updateFx(dt);
    if (this.step === 'fadein' || this.step === 'rise') b.tickTimers(dt);
    if (this.step === 'rise' && this.riseUpdate()) return true;
    if (this.step === 'dissolve') {
      b.update(dt, ctx);
      if (b.dead) {
        a.entities = a.entities.filter((e) => !e.dead); a.enemyList = a.enemyList.filter((e) => !e.dead);
        a.onBossDefeated(b, ctx);
        return true;
      }
    }
    g.followCamera(dt);
    if (this.t >= STEPS[this.step]) this.next();
    return false;
  }

  next() {
    const g = this.game, b = this.boss;
    this.t = 0;
    if (this.step === 'stop') this.step = 'fadeout';
    else if (this.step === 'fadeout') { this.place(); this.step = 'fadein'; }
    else if (this.step === 'fadein' && this.rise) {
      this.step = 'rise';
      Object.assign(b, { state: 'rise', roarT: 0.9 });
      this.sources = this.sockets();
      g.audio.sfx('vesper_laugh');
      g.cam.shake(3, 1);
    } else if (this.step === 'fadein') {
      this.step = 'dissolve';
      b.state = 'dying'; b.timer = DIE;
      g.audio.sfx(`${b.kind}_death`);
      g.cam.shake(4, 1.2);
    }
  }

  // Where the light comes from: the sockets on the arena's rim, else the room's four corners.
  sockets() {
    const a = this.area, rim = a.entities.filter((e) => e.obj?.type === 'socket' && !e.obj.wing && e.lit);
    if (rim.length) return rim.map((e) => ({ x: e.x, y: e.y - 7, socket: e }));
    const m = a.map, i = 2.5 * TILE;
    return [[i, i], [m.pixelW - i, i], [i, m.pixelH - i], [m.pixelW - i, m.pixelH - i]].map(([x, y]) => ({ x, y }));
  }

  // His rise, frame by frame: the sockets go dark as their light leaves, it pours into him, and his bar
  // fills. True once he is back up.
  riseUpdate() {
    const g = this.game, b = this.boss, t = this.t;
    if (t >= PULL && !this.pulled) {
      this.pulled = true;
      for (const s of this.sources) if (s.socket) s.socket.lit = false;
      g.audio.sfx('vesper_rise');
    }
    if (t >= IN && !this.filled) {
      this.filled = true;
      b.roarT = 0.9;
      this.area.spawn(new Particles(b.x, b.y - 34, { count: 30, color: ['#ffd890', '#ffffff', '#c8a0ff'], speed: 110, life: 0.6 }));
      this.area.spawn(new Burst(b));
      g.cam.shake(5, 0.5);
    }
    if (this.filled) { b.maxHp = b.riseBar; b.hp = b.riseBar * clamp01((t - IN) / (RISE - IN)); }
    if (t < RISE) return false;
    b.rise();
    g.audio.playMusic('boss2');
    const flags = g.state.quest.flags;
    if (!flags['rise:vesper']) { flags['rise:vesper'] = true; g.playCutscene(vesperRiseShots(), { letterbox: true }); }
    return true;
  }

  // The flash at the killing blow, and the fades either side of the move to the centre; in a rise,
  // the sockets' light streaming into him.
  draw(g) {
    const t = this.t, s = this.step;
    if (s === 'rise') drawRiseStreams(g, this.sources, this.boss, this.game.cam, clamp01((t - PULL) / (IN - PULL)));
    if (s === 'stop') { g.fillStyle = `rgba(255,255,255,${0.7 * (1 - t / STEPS.stop)})`; g.fillRect(0, 0, 480, 270); }
    const k = s === 'fadeout' ? t / STEPS.fadeout : s === 'fadein' ? 1 - t / STEPS.fadein : 0;
    if (k > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, k)})`; g.fillRect(0, 0, 480, 270); }
  }
}
