import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, recorder } from './helpers/sandbox.js';
import { createBoss } from '../src/game/bosses.js';
import { TouchControls } from '../src/core/touch.js';
import { installHeadless } from '../tools/headless.mjs';

installHeadless(); // the touch layer measures its button labels on a canvas

// The labels the touch layer draws for a scene on a landscape phone, once a finger has touched it.
function labels(scene) {
  globalThis.innerWidth = 800; globalThis.innerHeight = 400;
  const touch = new TouchControls({ scene, dpr: 1, input: { release() {}, down: new Set() } });
  touch.active = true; touch.endFrame(1 / 60);
  const { g, calls } = recorder(); touch.draw(g);
  return calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
}
const BACK = '‹ Back';

test('a Back pill sits over menus with no bar of their own, and nowhere else', () => {
  assert.ok(labels({ touchMode: () => 'ui' }).includes(BACK));
  assert.ok(!labels({ touchMode: () => 'watch' }).includes(BACK));
  assert.ok(!labels({ touchMode: () => 'menu' }).includes(BACK));
  assert.ok(!labels({ touchMode: () => 'play' }).includes(BACK));
  // Theater and Autoplay bring their own bars
  for (const mode of ['ui', 'watch']) {
    const l = labels({ touchMode: () => mode, touchButtons: () => [{ label: 'Skip', act: 'KeyN' }] });
    assert.ok(l.includes('Skip') && !l.includes(BACK), mode);
  }
});
test('no Back pill hangs over a warden dying: Escape would only be swallowed', async () => {
  const s = await sandbox();
  s.game.uiStack.push({});
  assert.ok(labels(s.game).includes(BACK), 'a menu is open');
  s.game.uiStack.length = 0;
  assert.ok(labels(s.game).includes('HIT'), 'playing');
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'vent';
  b.damage(9999, s.game.player, s.area.ctx); s.step(1 / 60);
  assert.ok(s.game.bossDeath);
  assert.deepEqual(labels(s.game), []);
  s.step(3.2);
  assert.ok(!s.game.bossDeath);
  assert.ok(labels(s.game).includes('HIT'));
});
