import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashSeed, valueNoise2D, fbm } from '../src/core/rng.js';
import { astar, bfsDistances } from '../src/core/grid.js';

test('same seed yields same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
});

test('forks are independent and deterministic', () => {
  const r = makeRng('seed');
  const fa = r.fork('a').next(), fb = r.fork('b').next();
  assert.notEqual(fa, fb);
  assert.equal(makeRng('seed').fork('a').next(), fa);
});

test('int stays within inclusive bounds', () => {
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = r.int(3, 7);
    assert.ok(v >= 3 && v <= 7);
  }
});

test('hashSeed differs for different inputs', () => {
  assert.notEqual(hashSeed('a'), hashSeed('b'));
});

test('noise is in [0,1) and continuous', () => {
  const n = valueNoise2D(7);
  for (let i = 0; i < 100; i++) {
    const v = fbm(n, i * 0.13, i * 0.07, 4);
    assert.ok(v >= 0 && v < 1);
    assert.ok(Math.abs(n(i * 0.1, 0) - n(i * 0.1 + 0.001, 0)) < 0.01);
  }
});

test('astar routes around a wall and returns null when sealed', () => {
  const w = 10, h = 10;
  const wall = (x, y) => x === 5 && y < 9;
  const path = astar(w, h, (x0, y0, x1, y1) => (wall(x1, y1) ? Infinity : 1), { x: 0, y: 0 }, { x: 9, y: 0 });
  assert.ok(path);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path.at(-1), { x: 9, y: 0 });
  assert.ok(path.every((p) => !wall(p.x, p.y)));
  const sealed = astar(w, h, (x0, y0, x1, y1) => (x1 === 5 ? Infinity : 1), { x: 0, y: 0 }, { x: 9, y: 0 });
  assert.equal(sealed, null);
});

test('bfs marks unreachable as -1', () => {
  const d = bfsDistances(5, 1, (x) => x !== 2, [{ x: 0, y: 0 }]);
  assert.deepEqual([...d], [0, 1, -1, -1, -1]);
});
