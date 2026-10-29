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

// It also saves Vesper for last: when the Spire opens, the main quest is the only job left.
test('the autoplay bot completes everything (100%), and saves Vesper for last', async () => {
  const r = await autoplay({ seed: 'quests', cls: 'swordsman', mode: 'full', maxMinutes: 160 });
  const pr = r.bot.progress();
  assert.ok(r.done, `stalled at ${r.stage}: ${r.status}`);
  assert.equal(pr.done, pr.total, r.bot.missing().join(', '));
  assert.equal(r.splits.find((s) => s.label === SPLITS.spire).done, pr.total - 1, 'the 100% bot saves Vesper for last');
});
