// Building interiors: small hand-shaped rooms with seeded furniture. Pure.
import { makeRng } from '../core/rng.js';
import { T } from './tiles.js';

const SIZES = { home: [12, 9], house: [11, 8], hall: [16, 10], shop: [12, 9], smith: [12, 9], inn: [14, 10], seer: [10, 8], lodge: [13, 9] };

export function generateInterior(building, seed) {
  const rng = makeRng(`${seed}/interior/${building.id}`);
  const [w, h] = SIZES[building.type] || [11, 8];
  const tiles = new Uint8Array(w * h).fill(T.FLOOR);
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = t; };
  for (let x = 0; x < w; x++) { set(x, 0, T.WALL); set(x, 1, T.WALL); set(x, h - 1, T.WALL); }
  for (let y = 0; y < h; y++) { set(0, y, T.WALL); set(w - 1, y, T.WALL); }
  const exit = { x: w >> 1, y: h - 1 };
  set(exit.x, exit.y, T.EXIT);
  const props = [];
  const place = (type, x, y, pw = 1, ph = 1, solid = true) => {
    props.push({ type, x, y, w: pw, h: ph });
    if (solid) for (let yy = y; yy < y + ph; yy++) for (let xx = x; xx < x + pw; xx++) set(xx, yy, T.FURNITURE);
  };
  let npcSpot = { x: w >> 1, y: 3 };
  let chest = null;
  switch (building.type) {
    case 'home':
      place('bed', 1, 2, 2, 1); place('table', 5, 4, 2, 1); place('stool', 5, 5, 1, 1, false); place('shelf', 8, 2, 2, 1);
      place('fireplace', 4, 2, 2, 1); place('plant', w - 2, 2);
      chest = { x: w - 2, y: 4 };
      for (let x = 4; x < 8; x++) set(x, h - 3, T.RUG);
      break;
    case 'house':
      place('bed', 1, 2, 2, 1); place('table', w - 4, 4, 2, 1); place('shelf', 4, 2, 2, 1); place('plant', w - 2, 2);
      if (rng.chance(0.5)) place('barrel', 1, h - 3);
      npcSpot = { x: 3, y: 4 };
      break;
    case 'hall':
      for (let y = 3; y < h - 2; y++) for (let x = 6; x < 10; x++) set(x, y, T.RUG);
      place('banner', 2, 1, 1, 1, false); place('banner', w - 3, 1, 1, 1, false);
      place('desk', 6, 2, 4, 1); place('table', 2, 5, 2, 1); place('table', w - 4, 5, 2, 1);
      place('plant', 1, 2); place('plant', w - 2, 2);
      npcSpot = { x: 8, y: 3 };
      break;
    case 'shop':
      for (let x = 2; x < w - 2; x++) set(x, 4, T.COUNTER);
      props.push({ type: 'counter', x: 2, y: 4, w: w - 4, h: 1 });
      place('shelf', 1, 2, 3, 1); place('shelf', w - 4, 2, 3, 1); place('barrel', 1, 6); place('barrel', w - 2, 6);
      npcSpot = { x: w >> 1, y: 3 };
      break;
    case 'smith':
      place('forge', 1, 2, 2, 2); place('anvil', 5, 4, 2, 1); place('rack', w - 4, 2, 3, 1); place('barrel', w - 2, 5);
      npcSpot = { x: 7, y: 3 };
      break;
    case 'inn':
      for (let x = 2; x < 7; x++) set(x, 3, T.COUNTER);
      props.push({ type: 'counter', x: 2, y: 3, w: 5, h: 1 });
      place('table', 8, 4, 2, 1); place('table', 8, 7, 2, 1); place('bed', w - 3, 2, 2, 1); place('bed', w - 3, 5, 2, 1);
      place('fireplace', 1, 2, 1, 1);
      npcSpot = { x: 4, y: 2 };
      break;
    case 'seer':
      place('orb', 4, 3, 2, 1); place('candles', 1, 2); place('candles', w - 2, 2); place('shelf', 7, 2, 2, 1);
      for (let x = 3; x < 7; x++) set(x, 5, T.RUG);
      npcSpot = { x: 4, y: 2 };
      break;
    case 'lodge':
      place('maptable', 4, 4, 3, 1); place('bed', 1, 2, 2, 1); place('bed', w - 3, 2, 2, 1); place('rack', 5, 2, 3, 1);
      npcSpot = { x: 5, y: 3 };
      break;
  }
  return { w, h, tiles, exit, spawn: { x: exit.x, y: exit.y - 1 }, npcSpot, props, chest };
}
