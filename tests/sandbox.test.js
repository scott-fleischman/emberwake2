import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, botDo } from './helpers/sandbox.js';
import { Enemy } from '../src/game/enemies.js';

test('sandbox runs a fight in an open arena', async () => {
  const s = await sandbox();
  const e = s.spawn(new Enemy('brute', 0, s.center.x + 40, s.center.y));
  s.step(2);
  assert.ok(e.aggro);
  assert.equal(s.game.area, s.area);
});

test('botDo reports a finished task', async () => {
  const s = await sandbox();
  const r = botDo(s, (bot) => bot.wait(0.5), { maxSeconds: 2 });
  assert.ok(r.done);
});
