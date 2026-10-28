import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGameState } from '../src/game/state.js';
import { ownedItems, equipItem, ITEM_SLOTS } from '../src/gfx/inventory.js';

test('item menu lists only owned items, in slot order', () => {
  const s = newGameState('inv', 'mage');
  s.gear.items.push('bombs', 'bow');
  assert.deepEqual(ownedItems(s), ITEM_SLOTS.filter((id) => ['bow', 'firebolt', 'bombs'].includes(id)));
});

test('equipping assigns the use-item button and refuses unowned items', () => {
  const s = newGameState('inv', 'ranger');
  s.gear.items.push('bombs');
  assert.equal(equipItem(s, 'bombs'), true);
  assert.equal(s.gear.items[s.gear.selected], 'bombs');
  assert.equal(equipItem(s, 'firebolt'), false);
  assert.equal(s.gear.items[s.gear.selected], 'bombs');
});
