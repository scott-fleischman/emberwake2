import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoplay } from '../tools/autoplay.mjs';
import { MAIN_STAGES } from '../src/game/quests.js';
import { SPLITS } from '../src/bot/bot.js';

// The bot plays through the real input system, so a finished run proves the seed can be beaten.
test('the autoplay bot beats the game (any%)', async () => {
  const r = await autoplay({ seed: 'quests', cls: 'swordsman', mode: 'any', maxMinutes: 80 });
  assert.ok(r.done, `stalled at ${r.stage}: ${r.status}`);
  assert.equal(r.splits.length, MAIN_STAGES.length - 1); // a split for every stage after the first
});

// Watch Autoplay's skip: the next unbeaten dungeon, the Fane and the Spire included, then from inside it
// its warden (in the Spire, Vesper), and once all five fall, the end.
test('autoplay skips on to the Fane, the Spire and Vesper', async () => {
  const { makeApp } = await import('../tools/headless.mjs');
  const { AutoplayScene } = await import('../src/scenes/autoplay.js');
  const scene = new AutoplayScene(await makeApp(), { seed: 'quests' });
  const g = scene.game, pr = g.state.progress;
  assert.equal(scene.skipTarget().label, 'the Verdant Vault');
  pr.bosses.push('verdant', 'ashen', 'frost');
  assert.equal(scene.skipTarget().label, 'the Drowned Fane');
  pr.bosses.push('drowned');
  const spire = scene.skipTarget();
  assert.equal(spire.label, 'the Emberwake Spire');
  assert.equal(spire.until(), false);
  g.enterDungeon('spire');
  assert.equal(spire.until(), true);
  const vesper = scene.skipTarget();
  assert.equal(vesper.label, 'Vesper');
  assert.equal(vesper.until(), false);
  g.area.enterRoom(g.area.dungeon.rooms.find((r) => r.role === 'boss').id, 's');
  assert.equal(vesper.until(), true);
  pr.bosses.push('spire');
  assert.equal(scene.skipTarget().label, 'the end');
});

// It also saves Vesper for last: when the Spire opens, the main quest is the only job left.
test('the autoplay bot completes everything (100%), and saves Vesper for last', async () => {
  const r = await autoplay({ seed: 'quests', cls: 'swordsman', mode: 'full', maxMinutes: 160 });
  const pr = r.bot.progress();
  assert.ok(r.done, `stalled at ${r.stage}: ${r.status}`);
  assert.equal(pr.done, pr.total, r.bot.missing().join(', '));
  assert.equal(r.splits.find((s) => s.label === SPLITS.spire).done, pr.total - 1, 'the 100% bot saves Vesper for last');
});
