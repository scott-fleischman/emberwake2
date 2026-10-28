// Dungeon runtime: screen-locked rooms, doors (locked/sealed/shutters/boss), puzzles, boss, return seal.
import { Area } from './areas.js';
import { Entity, Chest, Particles, FloatText } from './entities.js';
import { Enemy } from './enemies.js';
import { createBoss } from './bosses.js';
import { meleeTargets } from './combat.js';
import { generateDungeon, ROOM_W, ROOM_H, DOOR_TILES, DUNGEON_INFO } from '../world/dungeons.js';
import { TileMap } from '../world/tilemap.js';
import { T, TILE, TILE_INFO } from '../world/tiles.js';
import { THEMES } from '../gfx/palette.js';
import { RoomRenderer, drawEmberGlow, drawShadow } from '../gfx/render.js';
import { R } from '../gfx/sprites.js';
import { DUNGEON_FAMILY } from '../data/enemies.js';
import { TAU } from '../core/math.js';

const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const PUZZLE_ROLES = new Set(['timed', 'switches', 'ordered', 'push']);
const IN_ROOM_PUZZLES = new Set(['switches', 'ordered', 'push']); // timed rooms already gate with their bars

// ---------------------------------------------------------------- room objects
class RoomObject extends Entity {
  constructor(obj, area) {
    super(obj.x * TILE + 8, obj.y * TILE + 8, 14, 14);
    this.obj = obj; this.area = area; this.t = 0;
  }
  get tx() { return this.obj.x; }
  get ty() { return this.obj.y; }
  update(dt) { this.t += dt; }
  playerOn(p) { return Math.floor(p.x / TILE) === this.obj.x && Math.floor(p.y / TILE) === this.obj.y; }
}

class Plate extends RoomObject {
  constructor(obj, area, lit) { super(obj, area); this.lit = lit; this.was = false; }
  get sortY() { return -1000; }
  update(dt, ctx) {
    this.t += dt;
    const on = this.playerOn(ctx.player);
    if (on && !this.was) this.area.stepPlate(this);
    this.was = on;
  }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    R(g, x - 7, y - 7, 14, 14, '#2a2430'); R(g, x - 6, y - 6, 12, 12, this.lit ? this.area.theme.accent : '#5a5260');
    if (this.lit) { g.fillStyle = this.area.theme.glow; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill(); }
    R(g, x - 2, y - 2, 4, 4, this.lit ? '#ffffff' : '#3a3440');
  }
}

class TimedSwitch extends RoomObject {
  constructor(obj, area) { super(obj, area); this.was = false; }
  get sortY() { return -1000; }
  update(dt, ctx) {
    this.t += dt;
    const on = this.playerOn(ctx.player);
    if (on && !this.was) this.area.startTimer();
    this.was = on;
  }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    const active = this.area.gateTimer > 0 || this.area.solved;
    R(g, x - 7, y - 7, 14, 14, '#2a2430'); R(g, x - 6, y - 6, 12, 12, active ? '#f0c850' : '#6a6070');
    g.strokeStyle = active ? '#fff' : '#2a2430'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, 4, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 3); g.moveTo(x, y); g.lineTo(x + 2, y); g.stroke();
    if (this.area.gateTimer > 0) {
      const f = this.area.gateTimer / this.area.room.puzzle.duration;
      g.strokeStyle = '#ffe080'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
    }
  }
}

class Crystal extends RoomObject {
  constructor(obj, area, lit) { super(obj, area); this.lit = lit; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    drawShadow(g, x, y + 6, 6, 2);
    R(g, x - 6, y + 2, 12, 5, '#4a4452');
    for (let k = 0; k < this.obj.order; k++) R(g, x - 5 + k * 3, y + 4, 2, 2, '#f0e0a0');
    const c = this.lit ? '#ffffff' : this.area.theme.accent;
    const bob = Math.sin(this.t * 3) * 1;
    g.fillStyle = c; g.beginPath(); g.moveTo(x, y - 14 + bob); g.lineTo(x + 5, y - 6 + bob); g.lineTo(x, y + 1 + bob); g.lineTo(x - 5, y - 6 + bob); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - 2, y - 10 + bob, 2, 4);
    if (this.lit) { g.fillStyle = this.area.theme.glow; g.beginPath(); g.arc(x, y - 6, 12, 0, TAU); g.fill(); }
  }
}

class Block extends RoomObject {
  constructor(obj, area) { super(obj, area); this.bx = obj.x; this.by = obj.y; this.slide = 0; this.fromX = this.x; this.fromY = this.y; this.pushT = 0; }
  get tx() { return this.bx; }
  get ty() { return this.by; }
  update(dt) {
    this.t += dt;
    if (this.slide > 0) {
      this.slide = Math.max(0, this.slide - dt / 0.18);
      const k = 1 - this.slide;
      this.x = this.fromX + (this.bx * TILE + 8 - this.fromX) * k;
      this.y = this.fromY + (this.by * TILE + 8 - this.fromY) * k;
    }
  }
  move(dx, dy) {
    const nx = this.bx + dx, ny = this.by + dy, m = this.area.map;
    const t = m.get(nx, ny);
    if (TILE_INFO[t]?.solid || t === T.PIT || m.extraSolid[ny * m.w + nx]) return false;
    m.extraSolid[this.by * m.w + this.bx] = 0;
    this.fromX = this.x; this.fromY = this.y;
    this.bx = nx; this.by = ny; this.slide = 1;
    m.extraSolid[ny * m.w + nx] = 1;
    return true;
  }
  draw(g, cam) {
    const x = Math.round(this.x - cam.left) - 8, y = Math.round(this.y - cam.top) - 8;
    R(g, x, y - 4, 16, 16, '#7a7482'); R(g, x, y - 4, 16, 4, '#a49eb0'); R(g, x, y + 10, 16, 2, '#4a4452');
    R(g, x + 4, y + 1, 8, 6, '#625c6a'); R(g, x + 6, y + 3, 4, 2, this.area.theme.accent);
  }
}

class BlockTarget extends RoomObject {
  get sortY() { return -1000; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    g.strokeStyle = this.area.solved ? '#ffffff' : this.area.theme.accent; g.lineWidth = 1.5;
    g.strokeRect(x - 7, y - 7, 14, 14);
    g.strokeRect(x - 3, y - 3, 6, 6);
  }
}

class Fountain extends RoomObject {
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    drawShadow(g, x, y + 7, 11, 3);
    R(g, x - 11, y - 2, 22, 9, '#8a8496'); R(g, x - 9, y - 1, 18, 5, '#4a8ad8');
    R(g, x - 6 + Math.sin(this.t * 3) * 3, y, 4, 1, '#c0e0ff');
    R(g, x - 2, y - 12, 4, 10, '#a49eb0');
    g.fillStyle = 'rgba(120,180,255,0.7)'; g.fillRect(x - 1, y - 14 + (this.t * 20) % 6, 2, 3);
  }
}

class Portal extends RoomObject {
  get sortY() { return -999; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    const active = this.area.portalActive;
    g.strokeStyle = active ? '#ffe8a0' : 'rgba(160,150,180,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(x, y, 11, 7, 0, 0, TAU); g.stroke();
    if (active) {
      for (let k = 0; k < 6; k++) {
        const a = this.t * 3 + (k * TAU) / 6;
        g.fillStyle = k % 2 ? '#fff4c0' : '#ffb050';
        g.fillRect(x + Math.cos(a) * 8 - 1, y + Math.sin(a) * 5 - 1, 2, 2);
      }
      g.fillStyle = 'rgba(255,220,140,0.3)'; g.beginPath(); g.ellipse(x, y, 9, 5, 0, 0, TAU); g.fill();
    }
  }
}

class Plaque extends RoomObject {
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    R(g, x - 6, y - 8, 12, 14, '#6e6a78'); R(g, x - 5, y - 7, 10, 12, '#8a8694');
    for (let k = 0; k < 3; k++) R(g, x - 3, y - 4 + k * 3, 6, 1, '#4a4652');
  }
}

class Torch extends RoomObject {
  get sortY() { return this.y + 4; }
  draw(g, cam) {
    const x = this.x - cam.left, y = this.y - cam.top;
    R(g, x - 1, y - 2, 3, 8, '#4a3a2a');
    drawEmberGlow(g, x + 0.5, y - 5, this.t + this.obj.x);
  }
}

// ---------------------------------------------------------------- area
export class DungeonArea extends Area {
  constructor(game, id, roomId = null, fromDir = 's') {
    super(game, 'dungeon');
    this.id = id;
    this.dungeon = generateDungeon(id, game.world.seed);
    this.byId = new Map(this.dungeon.rooms.map((r) => [r.id, r]));
    this.theme = { ...THEMES[id], kind: 'dungeon', water: id === 'frost' ? '#6a9ac8' : '#3a5a7a' };
    this.family = DUNGEON_FAMILY[id];
    this.name = DUNGEON_INFO[id].name;
    this.tokenMax = 2;
    this.lockMsgT = 0;
    this.enterRoom(roomId ?? this.dungeon.entranceId, fromDir, true);
  }

  get room() { return this.byId.get(this.roomId); }
  get pr() { return this.game.state.progress; }
  key(room = this.room) { return `${this.id}:${room.id}`; }
  get solved() { return this.pr.solved.includes(this.key()); }

  // The puzzle room a door belongs to, if either side of it holds a puzzle.
  puzzleRoomFor(door, roles = PUZZLE_ROLES) {
    if (!door.id || door.id === 'exit') return null;
    const [a, b] = door.id.split('-').map(Number);
    return [this.byId.get(a), this.byId.get(b)].find((r) => r && roles.has(r.role)) || null;
  }

  isDoorSealed(door) {
    // Locked doors out of a plate/crystal/block room need the puzzle solved first, then a key.
    const pz = door.type === 'sealed' ? this.puzzleRoomFor(door) : door.type === 'locked' ? this.puzzleRoomFor(door, IN_ROOM_PUZZLES) : null;
    return !!pz && !this.pr.solved.includes(this.key(pz));
  }

  isDoorOpen(room, door) {
    if (this.isDoorSealed(door)) return false;
    if (door.type === 'locked') return this.pr.unlocked.includes(`${this.id}:${door.id}`);
    return true;
  }

  enterRoom(roomId, fromDir, initial = false) {
    const g = this.game;
    this.roomId = roomId;
    const room = this.room;
    this.entities = [];
    this.enemyList = [];
    this.tokens.clear();
    this.boss = null;
    this.objs = [];
    this.gateTimer = 0;
    this.tickT = 0;
    this.shut = false;
    this.shutPending = false;
    this.map = new TileMap(ROOM_W, ROOM_H);
    this.map.tiles.set(room.tiles);
    this.renderer = new RoomRenderer(this.map, this.theme);
    const visited = this.pr.visited[this.id] || (this.pr.visited[this.id] = []);
    if (!visited.includes(room.id)) visited.push(room.id);
    const cleared = this.pr.cleared.includes(`d:${this.key()}`);
    const bossDone = this.pr.bosses.includes(this.id);
    this.portalActive = bossDone;
    let hasEnemies = false;
    for (const o of room.objects) {
      switch (o.type) {
        case 'enemy':
          if (!cleared) { this.spawnEnemy(new Enemy(o.archetype, this.family, o.x * TILE + 8, o.y * TILE + 8, { aggro: true, leash: 999, hpMult: g.diff.enemyHp })); hasEnemies = true; }
          break;
        case 'chest': {
          const id = `d:${this.key()}:chest`;
          const opened = this.pr.opened.includes(id);
          const hidden = (o.contents === 'shard' && !bossDone) || (o.contents === 'key' && !cleared && room.objects.some((q) => q.type === 'enemy'));
          const c = new Chest(id, o.x * TILE + 8, o.y * TILE + 8, o.contents, { opened, hidden, big: o.contents === 'shard' || o.contents === 'map' });
          this.spawn(c);
          if (!hidden) this.map.extraSolid[o.y * ROOM_W + o.x] = 1;
          break;
        }
        case 'plate': {
          const lit = this.solved || this.plateState()[o.index];
          this.objs.push(this.spawn(new Plate(o, this, lit)));
          break;
        }
        case 'timedSwitch': this.objs.push(this.spawn(new TimedSwitch(o, this))); break;
        case 'crystal': this.objs.push(this.spawn(new Crystal(o, this, this.solved))); break;
        case 'block': {
          const b = this.spawn(new Block(o, this));
          this.map.extraSolid[o.y * ROOM_W + o.x] = 1;
          this.objs.push(b);
          if (this.solved) { const tg = room.objects.find((q) => q.type === 'blockTarget'); if (tg) { this.map.extraSolid[o.y * ROOM_W + o.x] = 0; b.bx = tg.x; b.by = tg.y; b.x = tg.x * TILE + 8; b.y = tg.y * TILE + 8; this.map.extraSolid[tg.y * ROOM_W + tg.x] = 1; } }
          break;
        }
        case 'blockTarget': this.objs.push(this.spawn(new BlockTarget(o, this))); break;
        case 'fountain': this.objs.push(this.spawn(new Fountain(o, this))); this.map.extraSolid[o.y * ROOM_W + o.x] = 1; break;
        case 'portal': this.objs.push(this.spawn(new Portal(o, this))); break;
        case 'plaque': this.objs.push(this.spawn(new Plaque(o, this))); this.map.extraSolid[o.y * ROOM_W + o.x] = 1; break;
        case 'torch': this.spawn(new Torch(o, this)); break;
        case 'boss':
          if (!bossDone) {
            this.boss = createBoss(o.kind, o.x * TILE + 8, o.y * TILE + 8, g.diff.enemyHp);
            this.spawnEnemy(this.boss);
            hasEnemies = true;
          }
          break;
      }
    }
    if (room.puzzle?.kind === 'ordered') this.nextOrder = 1;
    if (room.puzzle?.kind === 'timed' && this.solved) this.setGate(true);
    this.applyDoors();
    if (hasEnemies && room.clearToOpen) this.shutPending = true;
    // Place the player just inside the door they came through.
    const p = g.player;
    const dir = OPP[fromDir] || 's';
    const tiles = DOOR_TILES[dir];
    const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length, cy = tiles[0].y;
    const inset = { n: [0, 1.2], s: [0, -1.2], w: [1.2, 0], e: [-1.2, 0] }[dir];
    p.x = (cx + 0.5 + inset[0]) * TILE; p.y = (cy + 0.5 + inset[1]) * TILE;
    p.facing = { n: 'down', s: 'up', w: 'right', e: 'left' }[dir];
    p.aim = { n: Math.PI / 2, s: -Math.PI / 2, w: 0, e: Math.PI }[dir];
    p.lock = null; p.vx = p.vy = 0; p.kbT = 0;
    p.lastSafe = { x: p.x, y: p.y };
    if (this.boss) {
      g.audio.playMusic('boss');
      g.audio.sfx('boss');
      g.showBanner(this.boss.name.split(',')[0], this.boss.name.includes(',') ? this.boss.name.split(', ')[1] : 'Warden of the deep');
    } else g.audio.playMusic('dungeon');
    if (initial) g.showBanner(this.name, 'Find the warden. Mind the seals.');
    g.cam.follow(ROOM_W * 8, ROOM_H * 8, ROOM_W * TILE, ROOM_H * TILE, 0, true);
  }

  plateState() {
    const pz = this.room.puzzle;
    if (!this.plates) this.plates = {};
    if (!this.plates[this.roomId]) this.plates[this.roomId] = [...pz.initial];
    return this.plates[this.roomId];
  }

  applyDoors() {
    const room = this.room;
    this.doorState = {};
    for (const [dir, door] of Object.entries(room.doors)) {
      let state = door.type === 'exit' ? 'exit' : this.isDoorOpen(room, door) ? (door.type === 'boss' ? 'boss' : 'open') : this.isDoorSealed(door) ? 'sealed' : door.type;
      if (this.shut && state !== 'exit') state = 'shutter';
      if (this.shut && state === 'exit') state = 'shutter';
      this.doorState[dir] = state;
      const solid = state === 'locked' || state === 'sealed' || state === 'shutter';
      for (const t of DOOR_TILES[dir]) this.map.set(t.x, t.y, solid ? T.DDOOR : T.DFLOOR);
    }
  }

  setGate(open) {
    for (const t of this.room.puzzle.gate) {
      const p = this.game.player;
      if (!open && Math.floor(p.x / TILE) === t.x && Math.floor(p.y / TILE) === t.y) continue;
      this.map.set(t.x, t.y, open ? T.DFLOOR : T.GATE);
    }
  }

  startTimer() {
    if (this.solved) return;
    this.gateTimer = this.room.puzzle.duration;
    this.setGate(true);
    this.game.audio.sfx('switch');
    this.game.audio.sfx('gate');
  }

  solve(msg = 'A seal releases somewhere nearby.') {
    if (this.solved) return;
    this.pr.solved.push(this.key());
    this.game.audio.sfx('puzzle');
    this.game.toast(msg);
    this.applyDoors();
  }

  stepPlate(plate) {
    if (this.solved) return;
    const pz = this.room.puzzle;
    const st = this.plateState();
    for (const i of pz.links[plate.obj.index]) st[i] = !st[i];
    for (const o of this.objs) if (o instanceof Plate) o.lit = st[o.obj.index];
    this.game.audio.sfx('switch');
    if (st.every(Boolean)) this.solve('All four plates glow. The sealed door grinds open.');
  }

  hitCrystal(c) {
    if (this.solved || c.lit) return;
    if (c.obj.order === this.nextOrder) {
      c.lit = true;
      this.nextOrder++;
      this.game.audio.sfx('switch', { pitch: 1 + this.nextOrder * 0.15 });
      if (this.nextOrder > this.room.puzzle.count) this.solve('The crystals sing in order. A seal releases.');
    } else {
      for (const o of this.objs) if (o instanceof Crystal) o.lit = false;
      this.nextOrder = 1;
      this.game.audio.sfx('deny');
      this.spawn(new FloatText(c.x, c.y - 18, 'Wrong order', '#ff8080'));
    }
  }

  strikeWorld(player, o) {
    for (const c of meleeTargets(player.x, player.y - 2, o.angle, o.reach + 4, o.arc, this.objs.filter((q) => q instanceof Crystal).map((q) => Object.assign(q, { hp: 1 })))) this.hitCrystal(c);
  }

  projectileObjects(p) {
    for (const c of this.objs) {
      if (!(c instanceof Crystal) || p.dead) continue;
      if (Math.abs(p.x - c.x) < 8 && Math.abs(p.y - (c.y - 6)) < 10) { this.hitCrystal(c); p.dead = true; }
    }
  }

  afterUpdate(dt, ctx) {
    const g = this.game, p = g.player, room = this.room;
    this.lockMsgT -= dt;
    // Combat lock-in once the player is clear of the doorway.
    if (this.shutPending) {
      const inside = p.x > 2.2 * TILE && p.x < (ROOM_W - 2.2) * TILE && p.y > 2.2 * TILE && p.y < (ROOM_H - 2.2) * TILE;
      if (inside) { this.shutPending = false; this.shut = true; this.applyDoors(); g.audio.sfx('gate', { pitch: 0.7 }); }
    }
    if (this.shut && this.enemyList.every((e) => e.dead || e.state === 'dying')) {
      this.shut = false;
      if (!this.boss) {
        this.pr.cleared.push(`d:${this.key()}`);
        for (const c of this.entities) if (c instanceof Chest && c.hidden && c.contents !== 'shard') { c.hidden = false; this.map.extraSolid[Math.floor(c.y / TILE) * ROOM_W + Math.floor(c.x / TILE)] = 1; this.spawn(new Particles(c.x, c.y, { count: 14, color: '#ffe080', speed: 50, life: 0.6 })); g.audio.sfx('chest'); }
        g.audio.sfx('puzzle');
      }
      this.applyDoors();
    }
    // Timed gate
    if (this.gateTimer > 0) {
      this.gateTimer -= dt;
      this.tickT -= dt;
      if (this.tickT <= 0) { this.tickT = this.gateTimer < 1.5 ? 0.25 : 0.5; g.audio.sfx('tick'); }
      const sw = room.objects.find((o) => o.type === 'timedSwitch');
      const gate = room.puzzle.gate;
      const horiz = gate[0].y === gate[gate.length - 1].y;
      const side = (px, py) => (horiz ? Math.sign(py - (gate[0].y * TILE + 8)) : Math.sign(px - (gate[0].x * TILE + 8)));
      const pSide = side(p.x, p.y), sSide = side(sw.x * TILE + 8, sw.y * TILE + 8);
      const onGate = gate.some((t) => Math.floor(p.x / TILE) === t.x && Math.floor(p.y / TILE) === t.y);
      if (pSide !== sSide && !onGate && Math.abs(horiz ? p.y - (gate[0].y * TILE + 8) : p.x - (gate[0].x * TILE + 8)) > 10) {
        this.gateTimer = 0;
        this.solve('You made it through! The gate stays open.');
      } else if (this.gateTimer <= 0) {
        this.gateTimer = 0;
        this.setGate(false);
        if (onGate) this.gateTimer = 0.05; // wait until the player steps off
        else g.audio.sfx('gate', { pitch: 0.8 });
      }
    }
    // Push blocks
    const block = this.objs.find((o) => o instanceof Block);
    if (block && !this.solved) this.updateBlock(block, dt, ctx);
    // Locked doors: bump to unlock.
    for (const [dir, state] of Object.entries(this.doorState)) {
      if (state !== 'locked') continue;
      const tiles = DOOR_TILES[dir];
      const cx = (tiles.reduce((a, t) => a + t.x, 0) / tiles.length + 0.5) * TILE, cy = (tiles[0].y + 0.5) * TILE;
      if (Math.hypot(p.x - cx, p.y - cy) > 17) continue;
      const keys = this.pr.keys[this.id] || 0;
      if (keys > 0) {
        this.pr.keys[this.id] = keys - 1;
        this.pr.unlocked.push(`${this.id}:${room.doors[dir].id}`);
        g.audio.sfx('unlock');
        g.toast('Unlocked the door with a small key.');
        this.applyDoors();
      } else if (this.lockMsgT <= 0) { this.lockMsgT = 3; g.toast('Locked. A small key would open it.'); g.audio.sfx('deny'); }
    }
    // Return seal
    const portal = this.objs.find((o) => o instanceof Portal);
    if (portal && this.portalActive && Math.hypot(p.x - portal.x, p.y - portal.y) < 8) { g.audio.sfx('shrine'); g.exitDungeon(); return; }
    // Room transitions through door gaps.
    let dir = null;
    // The hitbox stops at the map edge, so "leaving" means the center is deep inside an edge door gap.
    if (p.y < 9) dir = 'n'; else if (p.y > ROOM_H * TILE - 9) dir = 's'; else if (p.x < 9) dir = 'w'; else if (p.x > ROOM_W * TILE - 9) dir = 'e';
    if (dir) {
      const door = room.doors[dir];
      if (!door) { p.x = Math.max(8, Math.min(ROOM_W * TILE - 8, p.x)); p.y = Math.max(8, Math.min(ROOM_H * TILE - 8, p.y)); return; }
      if (door.type === 'exit') { g.exitDungeon(); return; }
      g.transition(() => this.enterRoom(door.to, dir));
    }
  }

  updateBlock(block, dt, ctx) {
    const g = this.game, p = g.player, input = g.input;
    const [ax, ay] = input.axis();
    const bx = block.bx * TILE + 8, by = block.by * TILE + 8;
    const dx = bx - p.x, dy = by - p.y;
    const touching = Math.abs(dx) < 15 && Math.abs(dy) < 13;
    const pushDir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    if (touching && block.slide === 0 && ax === pushDir[0] && ay === pushDir[1] && (ax || ay)) {
      block.pushT += dt;
      if (block.pushT > 0.3) {
        block.pushT = 0;
        if (block.move(pushDir[0], pushDir[1])) g.audio.sfx('lift', { pitch: 0.7, volume: 0.6 });
      }
    } else block.pushT = 0;
    // Pull: hold interact facing the block and step away.
    if (touching && input.held('interact') && block.slide === 0 && (ax === -pushDir[0] && ay === -pushDir[1]) && (ax || ay)) {
      block.pullT = (block.pullT || 0) + dt;
      if (block.pullT > 0.3) {
        block.pullT = 0;
        const behindX = Math.floor(p.x / TILE) - pushDir[0], behindY = Math.floor(p.y / TILE) - pushDir[1];
        if (!this.map.isSolid(behindX, behindY) && block.move(-pushDir[0], -pushDir[1])) {
          p.x -= pushDir[0] * TILE; p.y -= pushDir[1] * TILE;
          g.audio.sfx('lift', { pitch: 0.6, volume: 0.6 });
        }
      }
    } else block.pullT = 0;
    const target = this.room.objects.find((o) => o.type === 'blockTarget');
    if (target && block.bx === target.x && block.by === target.y && block.slide === 0) this.solve('The block settles into its socket. A seal releases.');
  }

  interact() {
    if (super.interact()) return true;
    const g = this.game, p = g.player;
    for (const o of this.objs) {
      if (Math.hypot(o.x - p.x, o.y - p.y) > 22) continue;
      if (o instanceof Plaque) { g.message(o.obj.text, 'Inscription'); return true; }
      if (o instanceof Fountain) {
        const d = g.derived;
        Object.assign(g.state.player, { hp: d.maxHp, mana: d.maxMana, stamina: d.maxStamina });
        g.audio.sfx('shrine');
        g.message('Cool spring water washes your wounds away. Health and mana restored.');
        return true;
      }
    }
    return false;
  }

  onBossDefeated(boss) {
    const g = this.game, pr = this.pr;
    if (!pr.bosses.includes(this.id)) {
      pr.bosses.push(this.id);
      g.state.upgrades.hearts++;
      g.state.talents.points++;
      g.refreshDerived();
      const d = g.derived;
      Object.assign(g.state.player, { hp: d.maxHp, mana: d.maxMana });
    }
    pr.shards = pr.bosses.length;
    this.boss = null;
    this.portalActive = true;
    this.shut = false;
    this.applyDoors();
    for (const c of this.entities) if (c instanceof Chest && c.hidden) { c.hidden = false; this.map.extraSolid[Math.floor(c.y / TILE) * ROOM_W + Math.floor(c.x / TILE)] = 1; }
    g.audio.playMusic('victory');
    g.showBanner('Warden Quieted', 'A return seal awakens. Claim the Ember Shard.');
    g.toast('Heart vessel gained! Talent point gained!');
    g.questEvent({ type: 'boss', kind: boss.kind });
    g.saveGame(true);
    setTimeout(() => { if (g.area === this) g.audio.playMusic('dungeon'); }, 7000);
  }

  drawGround(g, cam) {
    this.renderer.draw(g, cam);
    // Door frames and their states.
    for (const [dir, state] of Object.entries(this.doorState)) {
      const tiles = DOOR_TILES[dir];
      for (const t of tiles) {
        const x = t.x * TILE - cam.left, y = t.y * TILE - cam.top;
        if (state === 'open' || state === 'exit') continue;
        const col = state === 'locked' ? '#8a6a3a' : state === 'sealed' ? '#4a3a6a' : state === 'boss' ? null : '#4a4a52';
        if (state === 'boss') { R(g, x, y, 16, 2, '#a02a2a'); continue; }
        R(g, x, y, 16, 16, col);
        if (state === 'shutter') for (let k = 0; k < 4; k++) R(g, x + 1 + k * 4, y, 2, 16, '#8a8a96');
        if (state === 'locked') { R(g, x + 2, y + 2, 12, 12, '#a07a48'); R(g, x + 6, y + 5, 4, 4, '#2a1a10'); R(g, x + 7, y + 8, 2, 4, '#2a1a10'); }
        if (state === 'sealed') { g.fillStyle = this.theme.accent; g.beginPath(); g.arc(x + 8, y + 8, 4, 0, TAU); g.fill(); R(g, x + 7, y + 2, 2, 12, this.theme.accent); }
      }
    }
    // Gate countdown shimmer.
    if (this.gateTimer > 0 && this.room.puzzle) {
      const f = this.gateTimer / this.room.puzzle.duration;
      g.fillStyle = `rgba(255,220,120,${0.15 + 0.15 * Math.sin(this.time * 20)})`;
      for (const t of this.room.puzzle.gate) g.fillRect(t.x * TILE - cam.left, t.y * TILE - cam.top + 14 - 12 * f, 16, 2);
    }
  }
}
