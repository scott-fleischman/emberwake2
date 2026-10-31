// Vesper, the Unkindled: the Kindler who would not share, waiting at the bottom of the Spire. He
// fights in three phases on two bars.
//   Phase 1, his own form: slow homing gloam bolts, a shadow step behind the player over a marked
//   circle into a cold-flame scythe, gloam pillars from marked spots.
//   Phase 2, at half: his robes burn away into a smoke-winged shadow. A gloam ring with three gaps, a
//   sweeping drain beam, an eclipse that dims the room while bolts come in from its edges; one Gloam kin
//   climbs out of his shadow as it begins.
//   At 0 he rises instead of dying (the death flow's rise, bossdeath.js) on the sockets' light, with
//   a fresh bar, and phase 3 is one cycle through the four wardens: six seconds of his own moves, a
//   shift, then a warden borrowed in his colours, fighting with its phase 1 moves, until two hits
//   (three on Hard) break it and leave him stunned. Floors on his health hold him up until every
//   form is broken; a form not broken in 12 s wears off and he borrows it again.
// His punish windows: recovering from the scythe, spent after his pillars, the beam and the eclipse,
// stunned when a form breaks. His own form never hurts to touch.
// His own fight is a moveset like the wardens' (see Boss.runMoves); a borrowed one is theirs.
import { Boss, WARDEN_MOVES, Burst } from './boss.js';
import { Entity, Particles, Projectile } from './entities.js';
import { makeZone } from './zones.js';
import { moveActor, findFreeSpot } from './physics.js';
import { TILE } from '../world/tiles.js';
import { TAU } from '../core/math.js';
import { DUNGEON_FAMILY } from '../data/enemies.js';
import { drawDarkness } from '../gfx/render.js';
import { BOSS_RGB } from '../gfx/bossart.js';
import { paintThornmaw, thornUnder, thornOver } from '../gfx/art-thornmaw.js';
import { paintCinder, fxCinder, emberSwirl } from '../gfx/art-cinder.js';
import { paintRime, rimeUnder, rimeOver } from '../gfx/art-rime.js';
import { paintTide, tideOver, tidePose } from '../gfx/art-tide.js';
import {
  paintVesper, vesperCrown, vesperUnder, vesperOver, vesperPoseTick, drawGloamPillar, VESPER_PALS,
  BOLT_WIND, BOLT_GAP, STEP, SCYTHE, RECOVER, PILLARS, PILLAR_T, PILLAR_LIFE, RING, RING_T, BEAM_T, BEAM, SPENT, ECLIPSE, CALL, SHIFT, STUN,
} from '../gfx/art-vesper.js';

const SECOND_BAR = 100;
const FLOORS = [0.8, 0.6, 0.4, 0.2]; // phase 3: how low he can go with 0, 1, 2, 3 forms broken
const KINDS = ['thornmaw', 'cinder', 'rime', 'tide'];
const INTERLUDE = 6, FORM_T = 12;
const DRIFT = 1.1, RING_GROW = 85, SPIN = 1.25, EDGE_BOLTS = 8, EDGE_FROM = 0.6, EDGE_GAP = 0.18;
const RGB = BOSS_RGB.vesper;
const WARDS = Object.values(DUNGEON_FAMILY);

// The order he reaches for his own moves in, by phase. Phase 3's interludes draw on both.
const OWN = {
  1: ['bolts', 'pillars', 'step'],
  2: ['ring', 'bolts', 'step', 'beam', 'pillars', 'eclipse'],
  3: ['bolts', 'ring', 'step', 'pillars', 'beam', 'eclipse'],
};

// The room's dimming while the eclipse lasts: everything but the floor stays lit, a little light
// round the player and round him. Drawn over the floor, under everything that stands.
class Eclipse extends Entity {
  constructor(b) { super(b.x, b.y, 1, 1); this.b = b; this.t = 0; this.eclipse = true; }
  get sortY() { return -1e9; }
  update(dt) { this.t += dt; if (this.t >= ECLIPSE || this.b.dead || this.b.state !== 'eclipse') this.dead = true; }
  draw(g, cam, ctx) {
    const k = Math.min(1, this.t / 0.3, (ECLIPSE - this.t) / 0.4), p = ctx.player;
    if (k > 0) drawDarkness(g, cam, [{ x: p.x, y: p.y - 6, r: 46 }, { x: this.b.x, y: this.b.y - 30, r: 40 }], 0.72 * k);
  }
}

// A column of gloam where a pillar struck, standing a moment: a sight only.
class GloamPillar extends Entity {
  constructor(x, y) { super(x, y, 1, 1); this.t = 0; }
  get sortY() { return this.y + 5; }
  update(dt, ctx) {
    this.t += dt;
    if (this.t < PILLAR_LIFE) return;
    this.dead = true;
    ctx.area.spawn(new Particles(this.x, this.y - 14, { count: 10, color: ['#c8a0ff', '#2a1438', '#f0e8ff'], speed: 45, life: 0.5, up: 30 }));
  }
  draw(g, cam) { drawGloamPillar(g, this.x - cam.left, this.y - cam.top, this.t); }
}

// His attacks, each put down whole as it begins; the zones are the telegraph. + dt: this frame's
// tickZones counts them down too, and must not take a frame off.
const zone = (ctx, b, shape, fields) => { const z = makeZone(shape, { owner: b, rgb: RGB, ...fields }); ctx.area.zones.push(z); return z; };
const smoke = (ctx, x, y, n, speed = 50) => ctx.area.spawn(new Particles(x, y, { count: n, color: ['#2a1438', '#5a3480', '#c8a0ff'], speed, life: 0.6, up: 20 }));

// A spot on open floor a little way from p along (ux, uy), or null.
function spotAt(ctx, b, p, ux, uy, d) {
  const q = { x: p.x + ux * d, y: p.y + uy * d, w: b.w, h: b.h };
  return findFreeSpot(ctx.map, q, 2) && Math.hypot(q.x - p.x, q.y - p.y) > d * 0.5 ? q : null;
}
// Where the room's edge is, from p along angle a.
function edgeFrom(ctx, p, a) {
  const m = ctx.map, lo = TILE + 6, c = Math.cos(a), s = Math.sin(a);
  const tx = c > 0 ? (m.pixelW - lo - p.x) / c : c < 0 ? (lo - p.x) / c : Infinity;
  const ty = s > 0 ? (m.pixelH - lo - p.y) / s : s < 0 ? (lo - p.y) / s : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  return { x: p.x + c * t, y: p.y + s * t, d: t };
}

const BEGIN = {
  // Three homing motes of gloam from his raised hand (four from phase 2), one after another.
  bolts(b) { b.boltsLeft = b.phase > 1 ? 4 : 3; b.timer = BOLT_WIND; },
  // He sinks into his shadow; a circle marks the floor behind the player, and there he rises.
  step(b, ctx, { p, dx, dy, d }, dt) {
    const ax = Math.cos(p.aim ?? 0), ay = Math.sin(p.aim ?? 0);
    const to = spotAt(ctx, b, p, -ax, -ay * 0.8, 36) || spotAt(ctx, b, p, dx / d, dy / d * 0.8, 36) || { x: p.x, y: p.y };
    b.stepTo = { x: to.x, y: to.y };
    zone(ctx, b, 'circle', { x: to.x, y: to.y, r: 18, t: STEP + dt, dmg: 2, knock: 140, vesperStep: true });
    b.timer = STEP;
    smoke(ctx, b.x, b.y - 20, 14);
    ctx.game.audio.sfx('vesper_step');
  },
  // Pillars of gloam erupt from five marked spots: one where the player stands, four round it.
  pillars(b, ctx, { p }, dt) {
    const a = Math.random() * TAU;
    for (let k = 0; k < 5; k++) {
      const q = a + (k * TAU) / 4, r = k ? 36 : 0;
      zone(ctx, b, 'circle', { x: p.x + Math.cos(q) * r, y: p.y + Math.sin(q) * r * 0.75, r: 13, t: PILLAR_T + (k ? 0.15 : 0) + dt, dmg: 2, vesperPillar: true });
    }
    b.timer = PILLARS;
    ctx.game.audio.sfx('vesper_pillar');
  },
  // A ring of gloam rolls out from him, open at three gaps.
  ring(b, ctx, me, dt) {
    const m = ctx.map, a = Math.random() * TAU;
    const far = Math.max(...[[TILE, TILE], [m.pixelW - TILE, TILE], [TILE, m.pixelH - TILE], [m.pixelW - TILE, m.pixelH - TILE]].map(([x, y]) => Math.hypot(x - b.x, y - b.y)));
    zone(ctx, b, 'ring', { x: b.x, y: b.y, r: 14, width: 8, t: RING_T + dt, life: (far - 14) / RING_GROW, dmg: 2, grow: RING_GROW, gaps: [0, 1, 2].map((k) => [a + (k * TAU) / 3, 0.34]), vesperRing: true });
    b.timer = RING;
    ctx.game.audio.sfx('vesper_ring');
  },
  // A beam drawn out of his chest, laid down just off the player and swept across them.
  beam(b, ctx, { dx, dy }, dt) {
    const s = Math.random() < 0.5 ? 1 : -1, a = Math.atan2(dy, dx) - s * 0.8;
    zone(ctx, b, 'segment', { x1: b.x, y1: b.y - 2, x2: b.x + Math.cos(a) * 320, y2: b.y - 2 + Math.sin(a) * 320, w: 14, t: BEAM_T + dt, life: BEAM, dmg: 2, spin: s * SPIN, vesperBeam: true });
    b.timer = BEAM_T + BEAM;
    ctx.game.audio.sfx('vesper_beam');
  },
  // The light goes out of the room; eight bolts come in at the player from its dark edges, one after
  // another round it.
  eclipse(b, ctx) {
    ctx.area.spawn(new Eclipse(b));
    b.timer = ECLIPSE; b.waves = 0; b.edgeA = Math.random() * TAU;
    ctx.game.audio.sfx('vesper_eclipse');
  },
  // A Gloam kin of the wards climbs out of his shadow, once, as his second phase begins.
  call(b, ctx) {
    b.summon(ctx, 'lunger', WARDS[Math.floor(Math.random() * WARDS.length)], 1, { gloam: true });
    smoke(ctx, b.x, b.y - 10, 20, 70);
    b.timer = CALL;
  },
};
const kin = (ctx) => ctx.area.enemyList.some((e) => !e.boss && !e.dead);

// His next own move, by turns; in phase 3, once the interlude is up, the shift instead.
function next(b, ctx, me, dt) {
  if (b.phase === 3 && b.breaks < 4 && b.ownT <= 0) {
    b.state = 'shift'; b.timer = SHIFT;
    smoke(ctx, b.x, b.y - 30, 24, 60);
    ctx.game.audio.sfx('vesper_shift');
    return;
  }
  const order = b.ownOrder;
  const st = order[b.own++ % order.length];
  b.state = st; b.cdx = me.dx / me.d; b.cdy = me.dy / me.d;
  BEGIN[st](b, ctx, me, dt);
}
const drift = (b, t = DRIFT) => { b.state = 'drift'; b.timer = t; };
const done = (b) => { if (b.timer <= 0) drift(b); };
// After a big cast he is spent a moment: a punish window.
const spend = (b, t) => { if (b.timer <= 0) { b.state = 'spent'; b.timer = t; } };

// Out of the eclipse's dark, a bolt at the player from the room's edge, each from further round.
function edgeBolt(b, ctx, p, k) {
  const e = edgeFrom(ctx, p, b.edgeA + (k * TAU) / EDGE_BOLTS), a = Math.atan2(p.y - e.y, p.x - e.x);
  const pr = ctx.area.spawn(new Projectile('gloam', e.x, e.y, a, 80, 1, 'enemy', { life: e.d / 80 + 0.6 }));
  pr.edge = true;
  smoke(ctx, e.x, e.y, 6, 30);
  ctx.game.audio.sfx('vesper_bolt', { pitch: 0.7, volume: 0.6 });
}

export const moves = {
  first: 'drift',
  aim: ['bolts', 'scythe', 'beam'],
  init(b) { Object.assign(b, { timer: DRIFT, cdx: 0, cdy: 1, own: 0, boltsLeft: 0, stepTo: null, waves: 0, edgeA: 0, alpha: 1 }); },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'drift'; } },
    // He glides to a ring round the player, coming no nearer than he likes; crowded, he backs off quicker.
    drift(b, dt, ctx, me) {
      const want = me.d > 92 ? 34 : me.d < 50 ? -60 : me.d < 70 ? -34 : 0, ox = -me.dy / me.d, oy = me.dx / me.d;
      moveActor(ctx.map, b, ((me.dx / me.d) * want + ox * 14) * dt, ((me.dy / me.d) * want + oy * 14) * dt);
      if (b.timer <= 0) next(b, ctx, me, dt);
    },
    bolts(b, dt, ctx, { p, dx, dy, d }) {
      b.cdx = dx / d; b.cdy = dy / d;
      if (b.timer > 0) return;
      if (b.boltsLeft <= 0) return drift(b);
      const hx = b.x + b.cdx * 8, hy = b.y - 30, a = Math.atan2(p.y - hy, p.x - hx) + (b.boltsLeft % 2 ? 0.35 : -0.35);
      ctx.area.spawn(new Projectile('gloam', hx, hy, a, 72, 1, 'enemy', { life: 4.2, home: 1.3 }));
      ctx.game.audio.sfx('vesper_bolt');
      b.boltsLeft--; b.timer = BOLT_GAP;
    },
    // Gone into his shadow; up where the mark strikes, the scythe already drawn back.
    step(b, dt, ctx, { p }) {
      b.alpha = Math.max(0, (b.timer - (STEP - 0.25)) / 0.25);
      if (b.timer > 0) return;
      b.x = b.stepTo.x; b.y = b.stepTo.y; b.lx = b.x; b.ly = b.y; b.alpha = 1; // a jump, not a walk
      const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
      b.state = 'scythe'; b.timer = SCYTHE; b.cdx = dx / d; b.cdy = dy / d;
      zone(ctx, b, 'cone', { x: b.x, y: b.y, a: Math.atan2(dy, dx), spread: 1.15, r: 64, t: SCYTHE + dt, life: 0.12, dmg: 2, blockable: true, vesperScythe: true });
      smoke(ctx, b.x, b.y - 20, 18, 60);
      ctx.game.audio.sfx('vesper_scythe');
    },
    scythe(b) { if (b.timer <= 0) { b.state = 'recover'; b.timer = RECOVER; } },
    recover: done,
    pillars(b) { spend(b, SPENT * 0.75); },
    spent: done,
    stunned(b) { if (b.timer <= 0) b.interlude(); },
    shift(b) { if (b.timer <= 0) b.borrow(); },
  },
  phase2: {
    ring: done,
    call: done,
    beam(b) { spend(b, SPENT); },
    eclipse(b, dt, ctx, { p }) {
      while (b.waves < EDGE_BOLTS && ECLIPSE - b.timer >= EDGE_FROM + b.waves * EDGE_GAP) edgeBolt(b, ctx, p, b.waves++);
      spend(b, SPENT);
    },
  },
  vulnerable: (b) => b.state === 'recover' || b.state === 'spent' || b.state === 'stunned',
  untargetable: (b) => b.state === 'step' || b.state === 'shift',
  // The pose's bookkeeping and the interlude's clock; a pillar's eruption the frame its zone strikes.
  tick(b, dt, ctx) {
    vesperPoseTick(b, dt);
    if (b.phase === 3) b.ownT -= dt;
    for (const z of ctx.area.zones) {
      if (z.owner !== b || !z.vesperPillar || z.t <= 0 || z.t > dt) continue;
      ctx.area.spawn(new GloamPillar(z.x, z.y));
      ctx.area.spawn(new Particles(z.x, z.y - 6, { count: 10, color: ['#c8a0ff', '#f0e8ff', '#3a1a50'], speed: 70, life: 0.4, up: 30 }));
      ctx.game.cam.shake(1.5, 0.12);
    }
  },
  // His robes burn away; the shadow they hid unfolds its wings, and a Gloam kin comes.
  enter2(b, ctx) {
    ctx.area.spawn(new Particles(b.x, b.y - 40, { count: 30, color: ['#2a1438', '#5a3480', '#c8a0ff', '#ffc070'], speed: 120, life: 0.9, up: 50, gravity: 80 }));
    ctx.game.cam.shake(5, 0.4);
    if (!kin(ctx)) BEGIN.call(b, ctx);
  },
  clear(b, ctx) {
    for (const e of ctx.area.entities) if (e instanceof GloamPillar || e instanceof Eclipse) e.dead = true;
  },
};

// A borrowed form is drawn as its warden draws itself, in his colours and under his crown.
const FORMS = {
  thornmaw(b, g, cam, pal) {
    const st = b.state, face = b.face, tele = st === 'wind' && Math.floor(b.t * 14) % 2 === 0;
    const jx = st === 'wind' ? Math.round(Math.sin(b.anim * 70) * 1.5) : 0;
    b.drawBoss(g, { left: cam.left - jx, top: cam.top }, (gg, L) => { paintThornmaw(gg, b, L, pal); vesperCrown(gg, b, L); }, {
      face, tele, shadow: [8, 30, 7],
      under: (gg, x, y) => thornUnder(gg, b, x, y, face, pal),
      over: (gg, x, y) => thornOver(gg, b, x, y, face, pal),
    });
  },
  cinder(b, g, cam, pal) {
    const x = Math.round(b.x - cam.left), y = Math.round(b.y - cam.top);
    const fade = b.state === 'fadeout' || b.state === 'fadein' ? 1 - b.alpha : 0;
    b.drawBoss(g, cam, (gg, L) => { paintCinder(gg, b, L, pal); vesperCrown(gg, b, L); }, {
      alpha: b.alpha, shadow: [7, 22, 6],
      over: (gg, xx, yy, a) => fxCinder(gg, b, xx, yy, a, 1, pal),
    });
    if (fade > 0) emberSwirl(g, x, y, fade, b.anim, pal);
  },
  rime(b, g, cam, pal, ctx) {
    for (const z of ctx.area.zones) { // each mote of dark rain over where it lands
      if (z.owner !== b || !z.shard) continue;
      const h = z.t * 120;
      g.fillStyle = `rgb(${pal.rainHi})`; g.fillRect(z.x - cam.left - 1, z.y - cam.top - h - 7, 3, 7);
      g.fillStyle = `rgba(${pal.rainHi},0.35)`; g.fillRect(z.x - cam.left - 2, z.y - cam.top - h - 12, 5, 6);
    }
    const st = b.state, tele = st === 'wind' && Math.floor(b.t * 14) % 2 === 0;
    const ghosts = st === 'dash' ? [[-b.cdx * 12, -b.cdy * 12, 0.35], [-b.cdx * 24, -b.cdy * 24, 0.16]] : null;
    b.drawBoss(g, cam, (gg, L) => { paintRime(gg, b, L, pal); vesperCrown(gg, b, L); }, {
      tele, ghosts, shadow: [7, 20, 5],
      under: (gg, x, y) => rimeUnder(gg, b, x, y, 1, pal),
      over: (gg, x, y) => rimeOver(gg, b, x, y, 1, pal),
    });
  },
  tide(b, g, cam, pal) {
    const dry = 1 - tidePose(b).sink;
    b.drawBoss(g, cam, (gg, L) => { paintTide(gg, b, L, pal); vesperCrown(gg, b, L); }, {
      shadow: [2, 24 * dry, 5 * dry],
      over: (gg, x, y, a) => tideOver(gg, b, x, y, a, 1, pal),
    });
  },
};

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Vesper extends Boss {
  constructor(x, y, hpMult = 1) {
    super('vesper', x, y, hpMult);
    this.w = 16; this.h = 12;
    this.hpMult = hpMult;
    this.moves = moves; moves.init(this);
    this.view = 'front';
    this.cycle = [...KINDS]; this.borrowed = null; this.breaks = 0; this.formHits = 0; this.formT = 0; this.ownT = INTERLUDE;
    // The wardens' world effects read their palettes off whoever runs their moves.
    this.thornPal = VESPER_PALS.thornmaw; this.cinderPal = VESPER_PALS.cinder; this.rimePal = VESPER_PALS.rime; this.tidePal = VESPER_PALS.tide;
    this.tidePhase = 1; // its floor is drawn apart from him, so it can't see draw()'s phase 1
    this.tideRhythm = ['jets', 'dive', 'wave']; // R47: dive and resurface, and a tidal wave that leaves it spent
  }
  get ownOrder() { return OWN[this.phase]; }
  get roarSfx() { return 'vesper_laugh'; }

  // A borrowed form fights as its warden first did: phase 1's moves, at phase 1's pace.
  runMoves(m, dt, ctx) {
    if (!this.borrowed) return super.runMoves(m, dt, ctx);
    if ((this.formT += dt) >= FORM_T) { // worn off: not a break
      this.letGo(ctx);
      ctx.game.audio.sfx('vesper_shift', { pitch: 0.8 });
      return this.interlude();
    }
    const ph = this.phase;
    this.phase = 1;
    super.runMoves(m, dt, ctx);
    this.phase = ph;
  }

  // Phase 3 begins (the rise calls this): the four wardens in a new order, none of them broken yet.
  startCycle() {
    this.cycle = shuffle([...KINDS]);
    this.breaks = 0; this.borrowed = null;
    this.interlude();
  }
  // A few of his own moves before he borrows again.
  interlude() {
    Object.assign(this, { moves, borrowed: null, alpha: 1, ownT: INTERLUDE, untargetable: false });
    drift(this, 0.8);
  }
  // The shift is done: he is the next warden in the cycle, at its first state, its fields set afresh.
  // Its first state is one a hit can land in.
  borrow() {
    const kind = this.cycle[this.breaks], m = WARDEN_MOVES[kind];
    m.init(this);
    Object.assign(this, { moves: m, borrowed: kind, state: m.first, formHits: 0, formT: 0, alpha: 1 });
    this.vulnerable = m.vulnerable(this); this.untargetable = !!m.untargetable?.(this);
  }
  // Out of a borrowed form, broken or worn off: whatever the warden put in the room goes with it.
  letGo(ctx) {
    const m = WARDEN_MOVES[this.borrowed];
    m.clear(this, ctx);
    if (this.tideFloor) { this.tideFloor.dead = true; this.tideFloor = null; }
    this.borrowed = null; this.moves = moves; this.alpha = 1;
    smoke(ctx, this.x, this.y - 24, 20, 60);
  }
  breakForm(ctx) {
    this.letGo(ctx);
    this.breaks++;
    Object.assign(this, { state: 'stunned', timer: STUN, vulnerable: true, untargetable: false });
    ctx.area.spawn(new Particles(this.x, this.y - 30, { count: 30, color: ['#c8a0ff', '#f0e8ff', '#3a1a50'], speed: 130, life: 0.7, up: 30, gravity: 90 }));
    ctx.area.spawn(new Burst(this));
    ctx.game.cam.shake(5, 0.4);
    ctx.game.audio.sfx('vesper_break');
  }

  // Phase 1 holds at half for the transform; phase 3 at the floor its broken forms have reached.
  floor() {
    if (this.phase === 1) return this.maxHp * 0.5;
    return this.phase === 3 && this.breaks < 4 ? FLOORS[this.breaks] * this.maxHp : 0;
  }
  damage(amount, src, ctx, opts) {
    if (!super.damage(amount, src, ctx, opts)) return false;
    if (this.borrowed && ++this.formHits >= (ctx.game.app.options.difficulty === 'hard' ? 3 : 2)) this.breakForm(ctx);
    return true;
  }
  // At 0 in phase 2 he rises instead of dying, to a second bar.
  deathOpts() { return { rise: this.phase === 2 }; }
  get riseBar() { return Math.round(SECOND_BAR * this.hpMult); }
  // The rise is over: the second bar, full, and the cycle begins.
  rise() {
    this.maxHp = this.hp = this.riseBar;
    this.phase = 3; this.phaseT = 9;
    this.startCycle();
  }

  draw(g, cam, ctx) {
    if (this.borrowed) {
      const ph = this.phase;
      this.phase = 1; // the form's phase 1 look, matching its moves
      FORMS[this.borrowed](this, g, cam, VESPER_PALS[this.borrowed], ctx);
      this.phase = ph;
      return;
    }
    const st = this.state, tele = (st === 'bolts' && this.timer < 0.12) || (st === 'scythe' && this.timer < 0.12 && Math.floor(this.t * 20) % 2 === 0);
    this.drawBoss(g, cam, (gg, L) => paintVesper(gg, this, L), {
      alpha: this.alpha ?? 1, tele, shadow: [6, this.phase > 1 ? 22 : 14, 4],
      under: (gg, x, y, a) => vesperUnder(gg, this, x, y, a),
      over: (gg, x, y, a) => vesperOver(gg, this, x, y, a),
    });
  }
}
