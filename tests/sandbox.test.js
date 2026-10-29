import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, botDo } from './helpers/sandbox.js';
import { Enemy } from '../src/game/enemies.js';
import { NPC, Projectile } from '../src/game/entities.js';
import { Bot } from '../src/bot/bot.js';
import { tileOf } from '../src/bot/nav.js';
import { rectSolid } from '../src/game/physics.js';
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

// d1's swordsman fell to the Tidewarden again and again, poisoned by the mire along the Fane's walls:
// its rolls ended in it, and it fought on it.
test('the bot treats mire as danger and never ends a roll in it', async () => {
  const s = await sandbox(), bot = new Bot(s.game, 'any'), map = s.area.map, p = s.game.player, t = tileOf(p.x, p.y);
  for (let dx = 2; dx <= 4; dx++) map.set(t.x + dx, t.y, T.MIRE);
  assert.equal(bot.safeRoll([1, 0]), false);
  assert.equal(bot.safeRoll([-1, 0]), true);
  assert.equal(bot.danger((t.x + 3) * TILE + 8, t.y * TILE + 8, []).lv, 1);
  assert.equal(bot.danger(p.x, p.y, []).lv, 0);
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

// dune88's ranger spent 45 of its 48 coins on arrows, met the Cinder Warden with no food, and fell
// twice there.
test('the bot buys food before ammo', async () => {
  const s = await sandbox({ cls: 'ranger' }), p = s.game.state.player;
  Object.assign(p, { food: 1, arrows: 0, coins: 48 });
  const bot = new Bot(s.game, 'any');
  assert.equal(bot.shoppingList()[0][0], 'Ration');
});

// hearth's rogue cut a diagonal across a lava corner (still invulnerable from a burn) into a pocket
// walled by cliffs and lava, and never got out.
test('the bot will not step across a lava corner into ground it cannot walk back from', async () => {
  const s = await sandbox(), map = s.area.map, p = s.game.player;
  map.set(9, 8, T.LAVA); map.set(8, 9, T.LAVA); map.set(9, 10, T.LAVA); map.set(10, 9, T.DWALL);
  p.x = 10 * TILE + 0.5; p.y = 8 * TILE + 15.5; // the bottom-left corner of tile (10, 8)
  const e = s.spawn(new Enemy('brute', 0, 7 * TILE, 12 * TILE));
  Object.assign(e, { aggro: true, cool: 999, specialCool: 999 });
  const bot = new Bot(s.game, 'any');
  bot.threats();
  assert.notDeepEqual(bot.bestMove([e], e, 40, { lv: 0 }), [-1, 1]); // onto (9, 9), ringed by lava
});

// fen77's ranger wore Slagheart from 35 hp down to 14, but Ash Golems kept joining, so the fight's
// total health never fell and the bot walked off a fight it was winning.
test('the bot stays in a fight while it is wearing one foe down, even as others join', async () => {
  const s = await sandbox(), p = s.game.player, bot = new Bot(s.game, 'any');
  bot.task = (function* () { for (;;) yield; })();
  const foe = (dx, dy) => Object.assign(s.spawn(new Enemy('brute', 5, p.x + dx, p.y + dy)), { aggro: true, cool: 999, specialCool: 999, state: 'idle' });
  const target = foe(20, 0);
  for (let i = 0; i < 20; i++) {
    if (i % 3 === 0) foe(-20, i * 2 - 20);
    target.hp -= 0.5;
    for (let k = 0; k < 60; k++) { bot.step(1 / 60); s.app.input.endFrame(); }
  }
  assert.ok(!bot.log.some((l) => l.includes('goes nowhere')), bot.log.join('\n'));
});

// A roll's invulnerability is brief: rolling as soon as a shot enters our lane ran out before it
// landed, and the roll's cooldown left us open. Rangers ate a dozen embers a Cinder Warden fight.
test('a shot far down our lane is a warning; one about to land is the moment to roll', async () => {
  const s = await sandbox(), p = s.game.player, bot = new Bot(s.game, 'any');
  const pr = s.spawn(new Projectile('arrow', p.x - 48, p.y, 0, 120, 1, 'enemy')); // 0.4 s out
  assert.equal(bot.danger(p.x, p.y, []).lv, 1);
  pr.x = p.x - 20; // under 0.2 s
  assert.equal(bot.danger(p.x, p.y, []).lv, 2);
});

// Rolling away from a volley lets its wave catch up once the roll's invulnerability ends; rolling
// into it crosses the whole wave while still invulnerable.
test('the bot rolls into a shot that is about to land, not away from it', async () => {
  const s = await sandbox({ cls: 'ranger' }), p = s.game.player, bot = new Bot(s.game, 'any');
  bot.task = (function* () { for (;;) yield; })();
  const e = s.spawn(new Enemy('brute', 0, p.x + 40, p.y)); // what we're fighting is the other way
  Object.assign(e, { aggro: true, cool: 999, specialCool: 999, state: 'idle' });
  p.aim = 0;
  s.spawn(new Projectile('arrow', p.x - 22, p.y, 0, 120, 1, 'enemy'));
  bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame();
  assert.equal(p.mode, 'dodge'); assert.ok(p.dodgeX < 0, `rolled ${p.dodgeX},${p.dodgeY}`);
});

// The other side of the same check: foes arriving while nobody gets hurt is still a fight going nowhere.
test('the bot breaks off a fight nobody is hurt in, even as foes keep joining', async () => {
  const s = await sandbox(), p = s.game.player, bot = new Bot(s.game, 'any');
  bot.task = (function* () { for (;;) yield; })();
  const foe = (dx, dy) => Object.assign(s.spawn(new Enemy('brute', 5, p.x + dx, p.y + dy)), { aggro: true, cool: 999, specialCool: 999, state: 'idle' });
  let broke = null;
  for (let i = 0; i < 20 && broke === null; i++) {
    if (i % 3 === 0 && i < 15) foe(i % 2 ? 20 : -20, i * 2 - 15);
    for (let k = 0; k < 60 && broke === null; k++) { bot.step(1 / 60); s.app.input.endFrame(); if (bot.log.some((l) => l.includes('goes nowhere'))) broke = bot.time; }
  }
  assert.ok(broke !== null && broke < 16.5, `broke off at ${broke}`);
});

// R21: a villager on a door's exit spot shoved the player back up into the doorway, and in again.
test('an NPC never shoves the player onto a door, cave mouth or dungeon gate', async () => {
  const s = await sandbox(), g = s.game, W = g.world;
  const b = W.props.find((q) => q.kind === 'building'), villager = W.npcs.find((n) => n.role === 'villager');
  const spots = { door: { x: b.door.x, y: b.door.y + 1 }, cave: W.pois.caves[0].front, gate: W.pois.dungeons.ashen.front };
  for (const [what, at] of Object.entries(spots)) {
    g.exitToOverworld(at.x, at.y, true);
    const area = g.area, p = g.player;
    area.entities = area.entities.filter((e) => !(e instanceof NPC));
    area.spawn(new NPC(villager, p.x, p.y + 0.5)); // as near level as it gets: the biggest shove, straight up
    s.step(1);
    assert.ok(g.area === area, `${what}: no area change`); // not equal(): a failure would diff two whole worlds
    assert.equal(g.uiStack.length, 0, `${what}: no door message`);
    assert.ok(!area.exitsAt(p.x, p.y), `${what}: the player is not in the doorway`);
  }
});

test('an NPC shoves the player sideways, not into a wall', async () => {
  const s = await sandbox(), p = s.game.player, map = s.area.map;
  const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  for (let k = -1; k <= 1; k++) map.set(tx + 1, ty + k, T.DWALL);
  p.x = tx * TILE + 8; p.y = ty * TILE + 8;
  s.area.spawn(new NPC(s.game.world.npcs[0], p.x - 3, p.y)); // overlapping more across than down: the shove would go right, into the wall
  s.step(0.2);
  assert.equal(p.x, tx * TILE + 8);
  assert.ok(!rectSolid(map, p.x, p.y, p.w, p.h, (a, b) => map.isSolid(a, b)));
  assert.ok(p.y > ty * TILE + 8, 'out of the NPC another way');
});
