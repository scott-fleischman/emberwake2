// Puzzle runtime (see world/puzzles.js). Tide levers: the room's tide floods one set of tide tiles and
// drains the other, and a lever turns it; the tide a room was left at is kept in progress.tides. The
// ember beam's mirrors, source and receiver, and the ember carry's braziers: their state lives on the
// area for the visit (mirrorState, brazierState), and a solved room shows its answer.
import { Entity, Particles } from './entities.js';
import { findFreeSpot, rectSolid } from './physics.js';
import { T, TILE } from '../world/tiles.js';
import { ROOM_W } from '../world/dungeons.js';
import { R } from '../gfx/sprites.js';
import { drawShadow, drawFlame } from '../gfx/render.js';
import { tileHash } from '../core/rng.js';
import { TAU } from '../core/math.js';

// Lays the area's tide onto its map: 'a' leaves the A tiles dry and B under water, 'b' the reverse.
export function setTide(area) {
  const { a, b } = area.room.puzzle, m = area.map;
  for (const c of a) m.set(c.x, c.y, area.tide === 'a' ? T.DFLOOR : T.DWATER);
  for (const c of b) m.set(c.x, c.y, area.tide === 'b' ? T.DFLOOR : T.DWATER);
}

export class Lever extends Entity {
  constructor(obj, area) {
    super(obj.x * TILE + 8, obj.y * TILE + 8, 14, 14);
    this.obj = obj; this.area = area; this.t = 0; this.throwT = 0;
  }
  update(dt) { this.t += dt; this.throwT = Math.max(0, this.throwT - dt); }

  // Thrown: the tide turns, the water pours off one set of stones and over the other.
  use(game) {
    const a = this.area, pz = a.room.puzzle;
    a.tide = a.tide === 'a' ? 'b' : 'a';
    a.pr.tides[a.key()] = a.tide;
    setTide(a);
    // A lever never stands by a tide tile, but a player at the edge of its reach can lap onto one that
    // floods. Set them down on the tile they stand on (dry, as the lever keeps clear of the tide) rather
    // than let findFreeSpot snap them to a neighbour.
    const p = game.player, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (rectSolid(a.map, p.x, p.y, p.w, p.h, (x, y) => a.map.isSolid(x, y))) {
      if (a.map.isSolid(tx, ty)) findFreeSpot(a.map, p, 3);
      else { p.x = (tx + 0.5) * TILE; p.y = (ty + 0.5) * TILE; }
    }
    for (const c of a.tide === 'a' ? pz.b : pz.a) a.spawn(new Particles(c.x * TILE + 8, c.y * TILE + 8, { count: 3, color: ['#c8f0e8', '#6ab8b0'], speed: 30, life: 0.5, up: 30, gravity: 90 }));
    this.throwT = 0.25;
    game.audio.sfx('lever');
    game.audio.sfx('splash');
  }

  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top);
    // The handle leans left at tide 'a', right at 'b', swinging over as it's thrown.
    const lean = this.area.tide === 'a' ? -1 : 1, k = this.throwT / 0.25, a = (lean * (1 - 2 * k)) * 0.6 - Math.PI / 2;
    drawShadow(g, x, y + 6, 7, 2);
    R(g, x - 6, y + 1, 12, 5, '#4a4452'); R(g, x - 6, y + 1, 12, 1, '#6e6878');
    R(g, x - 3, y - 1, 6, 3, '#5a5462');
    const hx = x + Math.cos(a) * 11, hy = y + Math.sin(a) * 11;
    g.strokeStyle = '#8a8496'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = this.area.theme.accent; g.beginPath(); g.arc(hx, hy, 2.5, 0, TAU); g.fill();
  }
}

// Over the tiles: dry tide stones stay dark and damp, and flooded ones show as stepping stones under
// the water, so the eye can read which way each tide runs.
export function drawTide(g, cam, area) {
  const { a, b } = area.room.puzzle;
  for (const [list, dry] of [[a, area.tide === 'a'], [b, area.tide === 'b']]) {
    for (const c of list) {
      const x = c.x * TILE - cam.left, y = c.y * TILE - cam.top, h = tileHash(c.x, c.y, 21);
      if (dry) {
        g.fillStyle = 'rgba(40,96,88,0.3)'; g.fillRect(x, y, 16, 16);
        g.strokeStyle = 'rgba(110,210,190,0.4)'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, 13, 13);
        R(g, x + 3 + Math.floor(h * 7), y + 4 + Math.floor(h * 7), 3, 1, 'rgba(190,240,230,0.55)');
      } else {
        g.strokeStyle = 'rgba(170,230,220,0.28)'; g.lineWidth = 1;
        g.strokeRect(x + 2.5, y + 2.5, 11, 11);
        const ph = (area.time * 0.7 + h * 4) % 2;
        if (ph < 1) { g.strokeStyle = `rgba(220,250,245,${0.3 * (1 - ph)})`; g.beginPath(); g.ellipse(x + 8, y + 8, 2 + ph * 5, 1 + ph * 2.5, 0, 0, TAU); g.stroke(); }
      }
    }
  }
}

// ---------------------------------------------------------------- the ember beam
const LIFT = 6; // the beam runs this high off the floor, at the mirrors' faces
const TURN_T = 0.2;
const STONE = ['#4a4258', '#6e6680', '#2e2838'];

class Piece extends Entity {
  constructor(obj, area) {
    super(obj.x * TILE + 8, obj.y * TILE + 8, 14, 14);
    this.obj = obj; this.area = area; this.t = 0;
  }
  update(dt) { this.t += dt; }
}

// A mirror on a stone drum. Struck, it turns a quarter, always the same way round; it glows while the
// beam is on it.
export class Mirror extends Piece {
  constructor(obj, area) { super(obj, area); this.hp = 1; this.turnT = 0; }
  get state() { return this.area.mirrorState()[this.obj.index]; }
  get lit() { return this.area.beamLit?.has(this.obj.y * ROOM_W + this.obj.x); }
  update(dt) { this.t += dt; this.turnT = Math.max(0, this.turnT - dt); }
  turned() { this.turnT = TURN_T; }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top), cy = y - LIFT;
    drawShadow(g, x, y + 6, 7, 2);
    R(g, x - 6, y + 1, 12, 5, STONE[0]); R(g, x - 6, y + 1, 12, 1, STONE[1]); R(g, x - 5, y + 6, 10, 1, STONE[2]);
    // The collar's studs walk round with the turn.
    const k = this.turnT / TURN_T, a = (this.state === '/' ? -Math.PI / 4 : Math.PI / 4) - (Math.PI / 2) * k * k;
    for (let n = 0; n < 4; n++) { const b = a * 2 + n * (TAU / 4); if (Math.sin(b) > -0.2) R(g, Math.round(x + Math.cos(b) * 4) - 1, y + 2, 2, 1, '#a08a5a'); }
    R(g, x - 1, cy, 2, y + 1 - cy, STONE[2]);
    const c = Math.cos(a) * 6, s = Math.sin(a) * 6;
    g.lineCap = 'round';
    g.strokeStyle = '#6a5030'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x - c, cy - s); g.lineTo(x + c, cy + s); g.stroke();
    g.strokeStyle = this.lit ? '#fff4d8' : '#b8c6d4'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - c, cy - s); g.lineTo(x + c, cy + s); g.stroke();
    g.lineCap = 'butt';
    R(g, Math.round(x - c * 0.45), Math.round(cy - s * 0.45), 1, 1, '#ffffff');
    if (this.lit) { g.fillStyle = `rgba(255,190,100,${0.3 + 0.1 * Math.sin(this.t * 9)})`; g.beginPath(); g.arc(x, cy, 6, 0, TAU); g.fill(); }
  }
}

// The ember brazier that throws the beam: a fire bowl on a plinth, a brass hood open on the beam's side.
export class BeamSource extends Piece {
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top), d = this.obj.dir, hood = '#b08a48';
    drawShadow(g, x, y + 6, 8, 2);
    R(g, x - 6, y - 1, 12, 7, STONE[0]); R(g, x - 6, y + 5, 12, 1, STONE[2]);
    R(g, x - 7, y - 4, 14, 3, STONE[1]); R(g, x - 5, y - 3, 10, 1, '#1a1420');
    // The hood: a back plate behind the fire, sides and a front lip before it, all but the open side.
    if (d !== 'n') R(g, x - 6, y - 13, 12, 3, hood);
    drawFlame(g, x, y - 4, this.t + this.obj.x, 0.9);
    if (d !== 'w') R(g, x - 7, y - 12, 2, 8, hood);
    if (d !== 'e') R(g, x + 5, y - 12, 2, 8, hood);
    if (d !== 's') R(g, x - 6, y - 5, 12, 2, '#8a6a38');
    const [dx, dy] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[d];
    g.fillStyle = 'rgba(255,220,150,0.8)'; g.beginPath(); g.arc(x + dx * 6, y - LIFT + dy * 6, 1.5, 0, TAU); g.fill();
  }
}

// The receiver: a crystal eye on a stand, dull until the beam finds it.
export class Receiver extends Piece {
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top), cy = y - LIFT, lit = this.area.beam?.hit;
    drawShadow(g, x, y + 6, 7, 2);
    R(g, x - 4, y - 1, 8, 7, STONE[0]); R(g, x - 4, y + 5, 8, 1, STONE[2]); R(g, x - 6, y + 4, 12, 2, STONE[1]);
    if (lit) {
      g.fillStyle = `rgba(255,220,140,${0.25 + 0.08 * Math.sin(this.t * 5)})`; g.beginPath(); g.arc(x, cy, 11, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,240,190,0.7)'; g.lineWidth = 1;
      for (let n = 0; n < 4; n++) {
        const b = this.t * 0.8 + n * (TAU / 4);
        g.beginPath(); g.moveTo(x + Math.cos(b) * 6, cy + Math.sin(b) * 6); g.lineTo(x + Math.cos(b) * 10, cy + Math.sin(b) * 10); g.stroke();
      }
    }
    g.fillStyle = '#2a2030'; g.beginPath(); g.arc(x, cy, 4.5, 0, TAU); g.fill();
    g.fillStyle = lit ? '#fff2c0' : '#6a5236'; g.beginPath(); g.arc(x, cy, 3, 0, TAU); g.fill();
    R(g, x - 1, cy - 2, 1, 1, lit ? '#ffffff' : '#9a8060');
  }
}

// Over the floor: the beam as a warm line of light from the source, mirror to mirror, to the receiver
// or the wall that stops it, with sparks running along it.
export function drawBeam(g, cam, area) {
  const { source } = area.room.puzzle, b = area.beam;
  if (!b) return;
  const at = (c) => [c.x * TILE + 8 - cam.left, c.y * TILE + 8 - cam.top - LIFT];
  const turns = new Set(area.room.puzzle.mirrors.map((m) => m.y * ROOM_W + m.x)), pts = [at(source)];
  b.cells.forEach((c, i) => { if (i === b.cells.length - 1 || turns.has(c.y * ROOM_W + c.x)) pts.push(at(c)); });
  if (!b.hit) {
    const [lx, ly] = at(b.cells[b.cells.length - 1] ?? source), [ex, ey] = at(b.end);
    pts.push([(lx + ex) / 2, (ly + ey) / 2]);
  }
  const line = (lift, w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + lift) : g.moveTo(x, y + lift)));
    g.stroke();
  };
  const t = area.time, pulse = b.hit ? 1 : 0.75 + 0.1 * Math.sin(t * 9);
  g.lineJoin = 'round';
  line(LIFT, 7, `rgba(255,150,60,${0.1 * pulse})`);
  line(0, 5, `rgba(255,170,80,${0.25 * pulse})`);
  line(0, 2, '#ffc870');
  line(0, 1, '#fff4d8');
  g.lineJoin = 'miter';
  // Sparks every 20px, drifting away from the source.
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = (20 - ((t * 50 + run) % 20)) % 20; d < len; d += 20) {
      R(g, Math.round(x0 + ((x1 - x0) * d) / len) - 1, Math.round(y0 + ((y1 - y0) * d) / len) - 1, 2, 2, '#fffbe8');
    }
    run += len;
  }
}

// ---------------------------------------------------------------- the ember carry
// A stone bowl on legs, dark and cold or burning. The source stands taller, its band in the room's accent.
export class Brazier extends Piece {
  constructor(obj, area) { super(obj, area); this.lightT = 0; }
  get lit() { return !!this.obj.source || this.area.brazierState()[this.obj.index]; }
  update(dt) { this.t += dt; this.lightT = Math.max(0, this.lightT - dt); }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left), y = Math.round(this.y - cam.top), src = this.obj.source, top = src ? y - 6 : y - 3;
    drawShadow(g, x, y + 6, 7, 2);
    if (src) { R(g, x - 3, y - 3, 6, 9, STONE[0]); R(g, x - 5, y + 4, 10, 2, STONE[1]); R(g, x - 3, y, 6, 1, this.area.theme.accent); }
    else { R(g, x - 5, y, 2, 6, STONE[2]); R(g, x + 3, y, 2, 6, STONE[2]); R(g, x - 1, y + 1, 2, 5, STONE[0]); }
    R(g, x - 7, top - 3, 14, 4, STONE[1]); R(g, x - 6, top + 1, 12, 1, STONE[0]); R(g, x - 7, top - 3, 14, 1, '#8a8298');
    if (this.lit) drawFlame(g, x, top - 2, this.t + this.obj.x * 0.7, 1);
    else {
      R(g, x - 5, top - 3, 10, 1, '#2a2430'); R(g, x - 2, top - 3, 1, 1, '#5a5060'); R(g, x + 2, top - 3, 1, 1, '#4a4250');
      // A thin curl of old smoke.
      const ph = (this.t * 0.6 + this.obj.x * 0.13) % 1;
      g.fillStyle = `rgba(150,140,160,${0.35 * (1 - ph)})`; g.fillRect(Math.round(x + Math.sin(ph * 6 + this.obj.y) * 2), Math.round(top - 5 - ph * 10), 1, 2);
    }
    if (this.lightT > 0) {
      const k = 1 - this.lightT / 0.5;
      g.strokeStyle = `rgba(255,200,110,${0.8 * (1 - k)})`; g.lineWidth = 2;
      g.beginPath(); g.arc(x, top - 4, 4 + k * 14, 0, TAU); g.stroke();
    }
  }
}
