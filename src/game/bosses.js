// Regional bosses. Each fights in two phases with distinct pressure and an explicit punish window,
// transforms at half health, and dies through the centered death flow (bossdeath.js). The body they
// share is Boss (boss.js); the last of them, Vesper, has his own file.
import { Boss, BOSS_INFO, DIE, WARDEN_MOVES, viewFrom, Burst } from './boss.js';
import { Vesper } from './vesper.js';
import { paintThornmaw, thornUnder, thornOver } from '../gfx/art-thornmaw.js';
import { paintCinder, fxCinder, emberSwirl, drawMeteors } from '../gfx/art-cinder.js';
import { paintRime, rimeUnder, rimeOver, drawGust, drawFrostMarks, RIME_PAL } from '../gfx/art-rime.js';
import { paintTide, tideOver, tidePose, tidePal } from '../gfx/art-tide.js';

export { Boss, BOSS_INFO, DIE, WARDEN_MOVES, viewFrom, Burst };

// ---------------------------------------------------------------- the wardens
// Each fight is a moveset in its warden-*.js file; a class adds the body and the draw.

// Thornmaw: charges, stuns on walls, thorn rings.
class Thornmaw extends Boss {
  constructor(x, y, hpMult) { super('thornmaw', x, y, hpMult); this.w = 26; this.h = 18; }
  draw(g, cam) {
    const st = this.state, face = this.face;
    const tele = st === 'wind' && Math.floor(this.t * 14) % 2 === 0;
    const jx = st === 'wind' ? Math.round(Math.sin(this.anim * 70) * 1.5) : 0;
    this.drawBoss(g, { left: cam.left - jx, top: cam.top }, (b, L) => paintThornmaw(b, this, L), {
      face, tele, shadow: [8, 30, 7],
      under: (gg, x, y) => thornUnder(gg, this, x, y, face),
      over: (gg, x, y) => thornOver(gg, this, x, y, face),
    });
  }
}

// Cinder Warden: teleports, fans of embers, vents (punish); Unbound, meteors, a greatsword, lava.
class CinderWarden extends Boss {
  constructor(x, y, hpMult) { super('cinder', x, y, hpMult); this.w = 18; this.h = 14; }
  draw(g, cam, ctx) {
    drawMeteors(g, this, ctx.area.zones, cam);
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    const fade = this.state === 'fadeout' || this.state === 'fadein' ? 1 - this.alpha : 0;
    this.drawBoss(g, cam, (b, L) => paintCinder(b, this, L), {
      alpha: this.alpha, shadow: [7, 22, 6],
      over: (gg, x, y, a) => fxCinder(gg, this, x, y, a),
    });
    if (fade > 0) emberSwirl(g, x, y, fade, this.anim);
  }
}

// Rime Sovereign: orbits, dashes (stun on walls), shard rain; Shattered, a gust, ice-pillar prisons, decoys.
class RimeSovereign extends Boss {
  constructor(x, y, hpMult) { super('rime', x, y, hpMult); this.w = 18; this.h = 14; }
  draw(g, cam, ctx) {
    drawFrostMarks(g, this, ctx.area.zones, cam);
    drawGust(g, this, ctx.area.zones, cam);
    // Each falling shard over its landing zone.
    for (const z of ctx.area.zones) {
      if (z.owner !== this || !z.shard) continue;
      const h = z.t * 120;
      g.fillStyle = `rgb(${RIME_PAL.rainHi})`; g.fillRect(z.x - cam.left - 2, z.y - cam.top - h - 8, 4, 8);
    }
    const st = this.state, tele = st === 'wind' && Math.floor(this.t * 14) % 2 === 0;
    const ghosts = st === 'dash' ? [[-this.cdx * 12, -this.cdy * 12, 0.35], [-this.cdx * 24, -this.cdy * 24, 0.16]] : null;
    this.drawBoss(g, cam, (b, L) => paintRime(b, this, L), {
      tele, ghosts, shadow: [7, 20, 5],
      under: (gg, x, y) => rimeUnder(gg, this, x, y),
      over: (gg, x, y) => rimeOver(gg, this, x, y),
    });
  }
}

// The Tidewarden: water jets, a tail sweep, dives that burst up under the player; the Wail, a tidal
// wave, a whirlpool, song rings. Its pool and what it puts on the floor are drawn under everything.
class Tidewarden extends Boss {
  constructor(x, y, hpMult) { super('tide', x, y, hpMult); this.w = 22; this.h = 14; }
  draw(g, cam) {
    const pal = tidePal(this), dry = 1 - tidePose(this).sink;
    this.drawBoss(g, cam, (b, L) => paintTide(b, this, L, pal), {
      shadow: [2, 24 * dry, 5 * dry],
      over: (gg, x, y, a) => tideOver(gg, this, x, y, a, 1, pal),
    });
  }
}

export function createBoss(kind, x, y, hpMult = 1) {
  if (kind === 'vesper') return new Vesper(x, y, hpMult);
  if (kind === 'thornmaw') return new Thornmaw(x, y, hpMult);
  if (kind === 'cinder') return new CinderWarden(x, y, hpMult);
  if (kind === 'tide') return new Tidewarden(x, y, hpMult);
  return new RimeSovereign(x, y, hpMult);
}
