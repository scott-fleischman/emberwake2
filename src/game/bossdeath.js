// The centered boss death. At 0 hp: a hit-stop and a white flash while minions and shots vanish in
// poofs; a fade to black; the boss set back at the centre of its arena, where it spawned, with the
// player a few steps south facing it; a fade back in; then the boss dematerializes on the spot and
// the area takes the victory (its spirit appears where the boss stood). The scene runs this in
// place of the area, so nothing else moves and the player can't act. Elites keep their own defeat.
import { Bomb, Poof, Projectile } from './entities.js';
import { Burst, DIE } from './bosses.js';

const STEPS = { stop: 0.25, fadeout: 0.6, fadein: 0.6, dissolve: DIE };

export class BossDeath {
  // rise: a boss that gets back up at 0 instead of dying (Vesper's first bar). Its step arrives with
  // him; until then every boss dissolves.
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
    if (this.step === 'fadein') b.tickTimers(dt);
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
    else if (this.step === 'fadein') {
      this.step = 'dissolve';
      b.state = 'dying'; b.timer = DIE;
      g.audio.sfx(`${b.kind}_death`);
      g.cam.shake(4, 1.2);
    }
  }

  // The flash at the killing blow, and the fades either side of the move to the centre.
  draw(g) {
    const t = this.t, s = this.step;
    if (s === 'stop') { g.fillStyle = `rgba(255,255,255,${0.7 * (1 - t / STEPS.stop)})`; g.fillRect(0, 0, 480, 270); }
    const k = s === 'fadeout' ? t / STEPS.fadeout : s === 'fadein' ? 1 - t / STEPS.fadein : 0;
    if (k > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, k)})`; g.fillRect(0, 0, 480, 270); }
  }
}
