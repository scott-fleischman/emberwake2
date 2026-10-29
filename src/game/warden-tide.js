// The Tidewarden's fight: a sea serpent lying in a pool it carries with it. It spits volleys of water,
// lashes its tail the length of the room along the player's line, and dives, bursting up under the
// ripple where the player stood, and is dazed a moment after: the punish window. In the Wail (phase 2),
// pale and drowned, a Wail attack follows each volley or sweep: a tidal wave across the room with one
// gap in it, a whirlpool that drags the player in, song rings to roll through. The wave leaves it
// spent. Mire Leeches come as it changes. A moveset any boss body can run; see Boss.runMoves. Its own
// scratch fields carry a `tide` prefix, since one body may come to run several movesets.
import { Entity, Particles, Projectile, flyingSolid } from './entities.js';
import { makeZone } from './zones.js';
import { moveActor } from './physics.js';
import { TILE } from '../world/tiles.js';
import { TAU } from '../core/math.js';
import { tidePal, tidePoseTick, tideMouth, drawTideWater, JETS, JET_WIND, JET_GAP, SWEEP, SWEEP_HOLD, DIVE, SINK, SURFACE, WAVE_T, SPENT, WHIRL_T, WHIRL, RING_T, RINGS } from '../gfx/art-tide.js';

const JET_SPEED = 135, PULL = 45, WAVE_SPEED = 120, GAP = 40, RING_GROW = 90;

// Its pool and every sight it puts on the floor, drawn under everything that stands, the player too.
class TideWater extends Entity {
  constructor(b, area) { super(b.x, b.y, 1, 1); this.b = b; this.area = area; }
  get sortY() { return -2e9; }
  update() { if (this.b.dead) this.dead = true; }
  draw(g, cam, ctx) { if (!this.b.dead) drawTideWater(g, this.b, ctx.area.zones, cam, ctx.map, tidePal(this.b)); }
}

// The attacks, each put down whole as it begins; the zones are the telegraph. + dt: this frame's
// tickZones counts them down too, and must not take a frame off.
const zone = (ctx, b, shape, fields) => { const z = makeZone(shape, { owner: b, rgb: tidePal(b).zone, ...fields }); ctx.area.zones.push(z); return z; };
const spray = (ctx, b, x, y, count, speed, up = 30) => ctx.area.spawn(new Particles(x, y, { count, color: [`rgb(${tidePal(b).foam})`, `rgb(${tidePal(b).waterHi})`], speed, life: 0.5, up, gravity: 120 }));
const BEGIN = {
  jets(b) { b.tideJets = JETS; b.tideShotT = JET_WIND; },
  // The tail coils, then lashes the length of the room along the player's line.
  sweep(b, ctx, { p }, dt) {
    zone(ctx, b, 'segment', { x1: TILE, y1: p.y, x2: ctx.map.pixelW - TILE, y2: p.y, w: 18, t: SWEEP + dt, life: 0.15, dmg: 2, from: Math.sign(p.x - b.x) || 1, tideSweep: true });
    b.timer = SWEEP + SWEEP_HOLD;
    ctx.game.audio.sfx('tide_sweep');
  },
  // It sinks into its pool; the water ripples where the player stands, and there it bursts up.
  dive(b, ctx, { p }, dt) {
    b.tideFrom = { x: b.x, y: b.y }; b.tideTo = { x: p.x, y: p.y };
    zone(ctx, b, 'circle', { x: p.x, y: p.y, r: 22, t: DIVE + dt, dmg: 2, knock: 220, tideDive: true });
    b.timer = DIVE + dt;
    spray(ctx, b, b.x, b.y, 10, 40);
    ctx.game.audio.sfx('tide_dive');
  },
  // A tidal wave rolls in from the wall behind it, across the room toward the player: wall to wall
  // but for one gap.
  wave(b, ctx, { dx, dy }, dt) {
    const m = ctx.map, w = 16, across = Math.abs(dx) > Math.abs(dy), s = Math.sign(across ? dx : dy) || 1;
    const len = across ? m.pixelW : m.pixelH, span = across ? m.pixelH : m.pixelW;
    const start = s > 0 ? TILE + w / 2 : len - TILE - w / 2, life = (len - 2 * TILE - w) / WAVE_SPEED;
    const mid = TILE + GAP / 2 + 24 + Math.random() * (span - 2 * TILE - GAP - 48);
    for (const [a0, a1] of [[TILE, mid - GAP / 2], [mid + GAP / 2, span - TILE]]) {
      zone(ctx, b, 'segment', { ...(across ? { x1: start, y1: a0, x2: start, y2: a1 } : { x1: a0, y1: start, x2: a1, y2: start }),
        w, t: WAVE_T + dt, life, dmg: 2, vx: across ? s * WAVE_SPEED : 0, vy: across ? 0 : s * WAVE_SPEED, tideWave: true });
    }
    b.timer = WAVE_T + life + dt; // until it breaks on the far wall
    ctx.game.audio.sfx('tide_wave');
  },
  // The water about it wheels into a whirlpool: its eye mires, and it drags the player in.
  whirl(b, ctx, me, dt) {
    b.tideWhirl = zone(ctx, b, 'circle', { x: b.x, y: b.y, r: 44, t: WHIRL_T + dt, life: WHIRL, dmg: 0, effect: 'mud', tideWhirl: true });
    b.timer = WHIRL_T + WHIRL + 0.3;
    ctx.game.audio.sfx('tide_whirl');
  },
  // Its throat sac swells and sings out three rings one after another, each open at two gaps.
  rings(b, ctx, me, dt) {
    const m = ctx.map, a = Math.random() * TAU;
    const far = Math.max(...[[TILE, TILE], [m.pixelW - TILE, TILE], [TILE, m.pixelH - TILE], [m.pixelW - TILE, m.pixelH - TILE]].map(([x, y]) => Math.hypot(x - b.x, y - b.y)));
    RING_T.forEach((t, k) => {
      const q = a + k * 1.1;
      zone(ctx, b, 'ring', { x: b.x, y: b.y, r: 12, width: 8, t: t + dt, life: (far - 12) / RING_GROW, dmg: 1, grow: RING_GROW, gaps: [[q, 0.36], [q + Math.PI, 0.36]], tideRing: true });
    });
    b.timer = RINGS;
    ctx.game.audio.sfx('tide_song');
  },
};

// Its rhythm, one step after another: phase 1 the jets, the sweep, the dive; in the Wail, a Wail
// attack after the jets and after the sweep, each followed by the dive. Surfacing leads on to the next.
// A body that borrows its moves may bring its own rhythm (b.tideRhythm).
const RHYTHM = [['jets', 'sweep', 'dive'], ['jets', 'wail', 'dive', 'sweep', 'wail', 'dive']];
const WAIL = ['wave', 'whirl', 'rings'];
function next(b, ctx, me, dt) {
  const r = b.tideRhythm ?? RHYTHM[b.phase > 1 ? 1 : 0];
  let st = r[b.tideStep++ % r.length];
  if (st === 'wail') st = WAIL[b.tideTurn++ % WAIL.length];
  b.state = st; b.cdx = me.dx / me.d; b.cdy = me.dy / me.d;
  BEGIN[st](b, ctx, me, dt);
}
const done = (b, dt, ctx, me) => { if (b.timer <= 0) next(b, ctx, me, dt); };

// Up where its ripple strikes, this very frame: dazed, facing the player.
function surface(b, ctx, { p }) {
  b.x = b.tideTo.x; b.y = b.tideTo.y; b.lx = b.x; b.ly = b.y; // a jump, not a swim: tickTimers mustn't turn it
  const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
  b.state = 'surface'; b.timer = SURFACE; b.cdx = dx / d; b.cdy = dy / d;
  spray(ctx, b, b.x, b.y - 6, 24, 90, 60);
  ctx.game.cam.shake(3, 0.25);
  ctx.game.audio.sfx('tide_surface');
}

// While the whirlpool turns it drags the player in, through the same collision a step takes (walls
// stop it, and it pulls no one out through a door), and its jaws are waiting in the eye.
function pull(b, dt, ctx) {
  const z = b.tideWhirl, p = ctx.player;
  if (!z || z.t > 0 || z.t <= -z.life || p.mode === 'dead') return;
  const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), x = p.x, y = p.y;
  if (d > 6) moveActor(ctx.map, p, (dx / d) * PULL * dt, (dy / d) * PULL * dt);
  if (ctx.area.exitsAt(p.x, p.y)) { p.x = x; p.y = y; }
  b.touchPlayer(ctx, 1);
}

export const moves = {
  first: 'jets',
  aim: ['jets', 'sweep', 'surface', 'wave', 'whirl', 'rings'],
  init(b) { Object.assign(b, { timer: 0, cdx: 0, cdy: 1, tideStep: 1, tideTurn: 0, tideJets: JETS, tideShotT: JET_WIND, tideFrom: null, tideTo: null, tideWhirl: null }); },
  phase1: {
    intro(b) { if (b.timer <= 0) { moves.init(b); b.state = 'jets'; } },
    // Three salvos at the player from its jaws, a fan of water each (wider in the Wail).
    jets(b, dt, ctx, me) {
      const { p, dx, dy, d } = me;
      b.cdx = dx / d; b.cdy = dy / d;
      if ((b.tideShotT -= dt) > 0) return;
      if (b.tideJets <= 0) return next(b, ctx, me, dt);
      const n = b.phase > 1 ? 5 : 3, [mx, my, drop] = tideMouth(b), walled = flyingSolid(ctx.map)(Math.floor((b.x + mx) / TILE), Math.floor((b.y + my) / TILE));
      const x = walled ? b.x : b.x + mx, y = b.y + my, a = Math.atan2(p.y - y, p.x - x); // jaws over a wall spit from above the pool
      for (let k = 0; k < n; k++) ctx.area.spawn(new Projectile('water', x, y, a + (k - (n - 1) / 2) * 0.2, JET_SPEED, 1, 'enemy', { life: 2.4, rgb: tidePal(b).jet, drop }));
      b.tideJets--; b.tideShotT = JET_GAP;
      ctx.game.audio.sfx('tide_jet');
    },
    sweep: done,
    // Under the water: once it has sunk it swims to the ripple, and bursts up as the ripple strikes.
    dive(b, dt, ctx, me) {
      if (b.timer > dt) {
        if (b.timer < DIVE - SINK && (b.x !== b.tideTo.x || b.y !== b.tideTo.y)) { b.x = b.tideTo.x; b.y = b.tideTo.y; b.lx = b.x; b.ly = b.y; }
        return;
      }
      surface(b, ctx, me);
    },
    surface: done,
    // The wave leaves it spent; phase 1 holds these so a borrower's rhythm can reach them too.
    wave(b) { if (b.timer <= 0) { b.state = 'spent'; b.timer = SPENT; } },
    spent: done,
  },
  phase2: {
    whirl(b, dt, ctx, me) { pull(b, dt, ctx); done(b, dt, ctx, me); },
    rings: done,
  },
  vulnerable: (b) => b.state === 'surface' || b.state === 'spent',
  untargetable: (b) => b.state === 'dive',
  // The pose's bookkeeping and its pool; spray thrown off the rolling wave, bubbles rising where it
  // will burst up, and the tail's lash throwing water down its line the frame it strikes.
  tick(b, dt, ctx) {
    tidePoseTick(b, dt);
    if (!b.tideFloor || b.tideFloor.dead || b.tideFloor.area !== ctx.area) { b.tideFloor = new TideWater(b, ctx.area); ctx.area.spawn(b.tideFloor); }
    for (const z of ctx.area.zones) {
      if (z.owner !== b) continue;
      if (z.tideWave && z.t <= 0 && Math.random() < 0.6) {
        const q = Math.random(), sp = Math.hypot(z.vx, z.vy) || 1;
        ctx.area.spawn(new Particles(z.x1 + (z.x2 - z.x1) * q + (z.vx / sp) * 8, z.y1 + (z.y2 - z.y1) * q + (z.vy / sp) * 8, { count: 1, color: `rgb(${tidePal(b).foam})`, speed: 30, life: 0.4, up: 25, gravity: 90 }));
      }
      if (z.tideDive && z.t > dt && Math.random() < 0.4) {
        const a = Math.random() * TAU, r = Math.random() * z.r;
        ctx.area.spawn(new Particles(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.4, { count: 1, color: `rgb(${tidePal(b).foam})`, speed: 4, life: 0.5, up: 18 }));
      }
      if (z.t <= 0 || z.t > dt || !z.tideSweep) continue;
      for (let k = 0; k <= 10; k++) spray(ctx, b, z.x1 + (z.x2 - z.x1) * (k / 10), z.y1, 3, 60, 40);
      ctx.game.cam.shake(2.5, 0.2);
    }
  },
  // Its coral bursts off, its colour drains away, and the leeches of the mire come at its wail.
  enter2(b, ctx) {
    const pal = tidePal(b);
    ctx.area.spawn(new Particles(b.x, b.y - 50, { count: 26, color: [pal.coral, pal.coralHi, pal.coralDark, `rgb(${pal.foam})`], speed: 120, life: 0.9, up: 50, gravity: 120 }));
    spray(ctx, b, b.x, b.y, 20, 80, 50);
    ctx.game.cam.shake(5, 0.4);
    b.summon(ctx, 'lunger', 1, 2);
  },
  clear() {},
};
