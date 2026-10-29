// Tide-lever runtime: the room's tide floods one set of tide tiles and drains the other (see
// world/puzzles.js), and a lever turns it. The tide a room was left at is kept in progress.tides.
import { Entity, Particles } from './entities.js';
import { findFreeSpot, rectSolid } from './physics.js';
import { T, TILE } from '../world/tiles.js';
import { R } from '../gfx/sprites.js';
import { drawShadow } from '../gfx/render.js';
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
