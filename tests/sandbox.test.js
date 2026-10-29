import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, botDo } from './helpers/sandbox.js';
import { Enemy } from '../src/game/enemies.js';
import { Bot } from '../src/bot/bot.js';
import { tileOf } from '../src/bot/nav.js';
import { T, TILE } from '../src/world/tiles.js';

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

// Dodges landing on lava and hazard tiles cost fen77's ranger two falls at the Cinder Warden.
test('the bot never dodge-rolls into lava', async () => {
  const s = await sandbox({ cls: 'ranger' });
  const bot = new Bot(s.game, 'any'), map = s.area.map, t = tileOf(s.game.player.x, s.game.player.y);
  map.set(t.x + 2, t.y, T.LAVA);
  assert.equal(bot.safeRoll([1, 0]), false);
  assert.equal(bot.safeRoll([-1, 0]), true);
  map.set(t.x, t.y + 1, T.DWALL);
  map.set(t.x, t.y + 2, T.LAVA);
  assert.equal(bot.safeRoll([0, 1]), true); // the wall stops the roll short of the lava
});

// A lull isn't an empty camp: hearth's 100% run kept walking out on members it wasn't fighting, and
// each walk-out let the warband muster again at full strength.
test('clearing a camp goes after its stragglers', async () => {
  const s = await sandbox();
  const camp = { id: 'camp9', x: 3, y: 8 };
  s.game.placePlayer(camp.x * TILE + 8, camp.y * TILE + 8);
  const e = s.spawn(new Enemy('lunger', 0, 24 * TILE + 8, 8 * TILE + 8, { spawnId: camp.id }));
  botDo(s, (bot) => bot.clearCamp(camp), { maxSeconds: 60 });
  assert.ok(e.hp <= 0);
});
