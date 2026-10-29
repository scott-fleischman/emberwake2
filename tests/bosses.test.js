import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, recorder } from './helpers/sandbox.js';
import { WARDEN_MOVES, createBoss } from '../src/game/bosses.js';
import { paintCinder, CINDER_PAL } from '../src/gfx/art-cinder.js';
import { paintThornmaw, THORN_PAL } from '../src/gfx/art-thornmaw.js';
import { paintRime, RIME_PAL } from '../src/gfx/art-rime.js';
import { portraitPose } from '../src/gfx/bossart.js';
import { T } from '../src/world/tiles.js';

test('every warden has a complete moveset', () => {
  for (const [k, m] of Object.entries(WARDEN_MOVES)) {
    assert.ok(m.phase1[m.first], `${k} first state`);
    assert.equal(typeof m.vulnerable, 'function');
    // A borrowed form begins at `first`, so a hit has to land there at once.
    assert.ok(!m.untargetable?.({ state: m.first }), `${k} first state is targetable`);
    assert.equal(typeof m.phase2, 'object');
    assert.equal(typeof m.enter2, 'function');
    assert.equal(typeof m.clear, 'function');
  }
});

test('painters take a palette', () => {
  const rec = recorder();                      // a Proxy context logging fillStyle assignments
  paintCinder(rec.g, portraitPose('cinder', 1), [], { ...CINDER_PAL, core: '#123456' });
  assert.ok(rec.fills.includes('#123456'));
});

// Repainted with every palette colour swapped, no colour the painter uses may stay the same.
test('a palette reaches every colour its painter uses', () => {
  const swap = (pal) => JSON.parse(JSON.stringify(pal).replace(/#[0-9a-f]{6}/gi, '#010203').replace(/\d+,\d+,\d+/g, '1,2,3'));
  const states = ['intro', 'stalk', 'wind', 'charge', 'stunned', 'thorns', 'volley', 'vent', 'fadeout', 'orbit', 'dash', 'skid', 'rain', 'dying'];
  const colours = (kind, paint, pal) => {
    const rec = recorder(), L = [];
    rec.g.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    for (const state of states) for (const phase of [1, 2, 3]) for (const roarT of [0, 0.2]) {
      paint(rec.g, { ...portraitPose(kind, 1.3), state, phase, roarT, phaseT: 0.5, timer: 0.5, cdx: 1, cdy: 0 }, L, pal);
    }
    return [...rec.fills, ...rec.calls.filter((c) => c[0] === 'addColorStop').map((c) => c[2]), ...L.map((l) => l.rgb)].filter((c) => typeof c === 'string');
  };
  for (const [kind, paint, pal] of [['thornmaw', paintThornmaw, THORN_PAL], ['cinder', paintCinder, CINDER_PAL], ['rime', paintRime, RIME_PAL]]) {
    const a = colours(kind, paint, pal), b = colours(kind, paint, swap(pal));
    assert.equal(a.length, b.length);
    a.forEach((c, i) => assert.notEqual(c, b[i], `${kind} paints ${c} from outside its palette`));
  }
});

test('boss telegraphs are zones', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.state = 'volley'; b.volleys = 1; b.phase = 2; b.timer = 0;
  s.step(0.1);
  assert.ok(s.area.zones.some((z) => z.owner === b));
});

test('eruptions and shard drops strike where the player stood', async () => {
  for (const [kind, state, dmg] of [['cinder', 'volley', 2], ['rime', 'rain', 1]]) {
    const s = await sandbox(), res = s.game.state.player, p = s.game.player;
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); b.state = state; b.volleys = 1; b.phase = 2; b.timer = 0;
    s.step(1 / 60);
    const mine = s.area.zones.filter((z) => z.owner === b && z.shape === 'circle');
    assert.ok(mine.length >= 3, `${kind} puts down its circles`);
    assert.ok(mine.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < 1), `${kind} aims one at the player`);
    // Only the zones may hurt: park the boss and clear its shots.
    b.state = 'parked';
    for (const e of s.area.entities) if (e !== b && e.team === 'enemy') e.dead = true;
    const hp = res.hp;
    s.step(1);
    assert.equal(hp - res.hp, dmg * s.game.diff.damageTaken, `${kind} strike`);
  }
});

test('charge windups show the lane the charge will take', async () => {
  for (const [kind, state] of [['thornmaw', 'stalk'], ['rime', 'orbit']]) {
    const s = await sandbox();
    const b = s.spawn(createBoss(kind, s.center.x, s.center.y - 60)); b.state = state; b.timer = 0; b.shotT = 9;
    s.step(1 / 60);
    assert.equal(b.state, 'wind');
    const z = s.area.zones.find((q) => q.owner === b && q.shape === 'segment');
    assert.ok(z, `${kind} lane`);
    assert.equal(z.w, 24); assert.equal(z.dmg, 0);
    assert.deepEqual([z.x1, z.y1], [b.x, b.y]);
    assert.ok(Math.abs((z.x2 - z.x1) / 300 - b.cdx) < 1e-9 && Math.abs((z.y2 - z.y1) / 300 - b.cdy) < 1e-9, `${kind} lane runs 300 px along the charge`);
    while (b.state === 'wind') s.step(1 / 60);
    assert.ok(!s.area.zones.includes(z), `${kind} lane is gone once the charge starts`);
  }
});

test('the Rime Sovereign takes her walls down when she dies', async () => {
  const s = await sandbox(), map = s.area.map;
  const b = s.spawn(createBoss('rime', s.center.x, s.center.y - 60)); b.state = 'orbit'; b.timer = 9; b.shotT = 9;
  b.hp = b.maxHp * 0.55; s.step(1 / 60);
  const walls = b.walls.map((w) => [w.tx, w.ty]);
  assert.ok(walls.length > 0 && walls.every(([x, y]) => map.get(x, y) === T.DWALL));
  b.damage(9999, s.game.player, s.area.ctx); s.step(1 / 60);
  assert.ok(walls.every(([x, y]) => map.get(x, y) === T.DFLOOR));
});
