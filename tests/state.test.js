import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGameState, serialize, deserialize, applyDeathPenalty, derivedStats, SaveStore, encodeBits, decodeBits } from '../src/game/state.js';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('round trip preserves state', () => {
  const s = newGameState('seed', 'ranger');
  s.player.coins = 77;
  s.progress.opened.push('chest:1');
  s.location = { area: 'dungeon', id: 'verdant', room: 3, x: 10, y: 5 };
  assert.deepEqual(deserialize(serialize(s)), s);
});

test('each class starts with distinct loadouts', () => {
  const ids = ['swordsman', 'mage', 'ranger', 'rogue'];
  const weapons = new Set(ids.map((c) => newGameState(1, c).gear.weapon));
  assert.equal(weapons.size, 4);
  assert.equal(newGameState(1, 'swordsman').gear.shield, 'buckler');
  assert.ok(newGameState(1, 'mage').gear.items.includes('firebolt'));
  assert.ok(newGameState(1, 'ranger').player.arrows > 0);
  assert.ok(newGameState(1, 'rogue').player.knives > 0);
});

test('garbage, old-version and partial saves never throw', () => {
  assert.equal(deserialize('not json'), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize(null), null);
  assert.equal(deserialize('{"version":0}'), null);
  assert.equal(deserialize('{"version":1,"seed":"x","classId":"bard","player":{"hp":3}}'), null);
  const partial = deserialize('{"version":1,"seed":"x","classId":"mage","player":{"hp":3}}');
  assert.ok(partial);
  assert.equal(partial.player.hp, 3);
  assert.deepEqual(partial.progress.opened, []);
  assert.equal(partial.player.coins, 30);
});

test('death costs 20% coins, never goes negative, restores to respawn', () => {
  const s = newGameState('d', 'swordsman');
  s.player.coins = 55;
  s.respawn = { area: 'overworld', x: 4, y: 5, label: 'shrine' };
  s.location = { area: 'cave', id: 'cave1', x: 1, y: 1 };
  s.player.hp = 0;
  assert.equal(applyDeathPenalty(s), 11);
  assert.equal(s.player.coins, 44);
  assert.equal(s.player.hp, derivedStats(s).maxHp);
  assert.deepEqual(s.location, s.respawn);
  s.player.coins = 0;
  applyDeathPenalty(s);
  assert.equal(s.player.coins, 0);
  assert.equal(s.stats.deaths, 2);
});

test('talents raise derived stats', () => {
  const s = newGameState('t', 'swordsman');
  const before = derivedStats(s);
  s.talents.ranks.vigor = 2;
  s.talents.ranks.endurance = 1;
  const after = derivedStats(s);
  assert.equal(after.maxHp, before.maxHp + 4);
  assert.equal(after.maxStamina, before.maxStamina + 20);
  assert.equal(before.blockMult, 0.6); // swordsman opening: bulwark
});

test('save store tolerates missing or throwing storage', () => {
  const none = new SaveStore(undefined);
  assert.equal(none.has(), false);
  assert.equal(none.load(), null);
  assert.equal(none.save(newGameState(1, 'mage')), false);
  const throwing = new SaveStore({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() {} });
  assert.equal(throwing.load(), null);
  assert.equal(throwing.save(newGameState(1, 'mage')), false);
  const ok = new SaveStore(memStore());
  const s = newGameState(9, 'rogue');
  assert.ok(ok.save(s));
  assert.ok(ok.has());
  assert.deepEqual(ok.load(), s);
});

test('fog bitset round trips', () => {
  const bits = new Uint8Array(1000);
  for (let i = 0; i < 1000; i += 7) bits[i] = 1;
  assert.deepEqual(decodeBits(encodeBits(bits), 1000), bits);
  assert.equal(decodeBits('%%%corrupt', 10).length, 10);
});
