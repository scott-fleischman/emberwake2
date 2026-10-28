import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shieldBlocks, knockbackVector, meleeTargets, canUseItem, lockOnTarget, isBehind } from '../src/game/combat.js';
import { moveActor, clampDt, findFreeSpot } from '../src/game/physics.js';
import { TileMap } from '../src/world/tilemap.js';
import { T } from '../src/world/tiles.js';
import { newGameState, derivedStats } from '../src/game/state.js';

test('frontal shield blocks, rear hit lands', () => {
  const d = { x: 0, y: 0, aim: 0, shielding: true };
  assert.equal(shieldBlocks(d, 20, 2, 2.1), true);
  assert.equal(shieldBlocks(d, -20, 0, 2.1), false);
  assert.equal(shieldBlocks({ ...d, shielding: false }, 20, 0, 2.1), false);
});

test('knockback points away from the source', () => {
  const [vx, vy] = knockbackVector(0, 0, 10, 0, 100);
  assert.ok(vx > 99 && Math.abs(vy) < 1e-9);
  const [zx, zy] = knockbackVector(5, 5, 5, 5, 50);
  assert.equal(Math.hypot(zx, zy), 50);
});

test('melee arc hits in front only', () => {
  const targets = [{ x: 15, y: 0, w: 10, h: 10, hp: 1 }, { x: -15, y: 0, w: 10, h: 10, hp: 1 }, { x: 60, y: 0, w: 10, h: 10, hp: 1 }];
  const hits = meleeTargets(0, 0, 0, 20, 1.9, targets);
  assert.deepEqual(hits, [targets[0]]);
});

test('items refuse without ammo or mana', () => {
  const s = newGameState(1, 'ranger');
  const d = derivedStats(s);
  assert.equal(canUseItem(s.player, 'bow', d).ok, true);
  s.player.arrows = 0;
  assert.deepEqual(canUseItem(s.player, 'bow', d), { ok: false, reason: 'ammo' });
  s.player.mana = 0;
  assert.deepEqual(canUseItem(s.player, 'firebolt', d), { ok: false, reason: 'mana' });
});

test('lock-on picks nearest enemy in range', () => {
  const a = { x: 50, y: 0, hp: 1 }, b = { x: 30, y: 0, hp: 1 }, c = { x: 300, y: 0, hp: 1 }, dead = { x: 5, y: 0, hp: 0 };
  assert.equal(lockOnTarget(0, 0, [a, b, c, dead]), b);
  assert.equal(lockOnTarget(0, 0, [c]), null);
});

test('backstab detection', () => {
  assert.equal(isBehind({ x: 0, y: 0, aim: 0 }, -10, 0), true);
  assert.equal(isBehind({ x: 0, y: 0, aim: 0 }, 10, 0), false);
});

test('a huge knockback stops flush against a wall (no tunneling)', () => {
  const m = new TileMap(20, 5, T.FLOOR);
  for (let y = 0; y < 5; y++) m.set(10, y, T.WALL);
  const a = { x: 40, y: 40, w: 10, h: 8 };
  moveActor(m, a, 200, 0);
  assert.equal(a.x + a.w / 2, 160);
});

test('dt is clamped after tab switches', () => {
  assert.equal(clampDt(2.5), 1 / 30);
  assert.equal(clampDt(-1), 0);
  assert.equal(clampDt(NaN), 0);
});

test('findFreeSpot rescues an actor embedded in a wall', () => {
  const m = new TileMap(10, 10, T.FLOOR);
  m.set(5, 5, T.WALL);
  const a = { x: 88, y: 88, w: 10, h: 8 };
  assert.ok(findFreeSpot(m, a));
  assert.ok(!m.solidAtPixel(a.x, a.y));
});
