import { TILE, TILE_INFO, DECO_SOLID } from './tiles.js';

// A rectangular tile grid with an optional decoration layer and dynamic solids (props, blocks).
export class TileMap {
  constructor(w, h, fill = 0) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h).fill(fill);
    this.deco = new Uint8Array(w * h);
    this.elev = null;
    this.biome = null;
    this.extraSolid = new Uint8Array(w * h); // building footprints, props, push blocks
    this.version = 0; // bumped on mutation so render caches can invalidate
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  idx(x, y) { return y * this.w + x; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : -1; }
  set(x, y, id) {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.w + x] = id;
    this.version++;
  }
  getDeco(x, y) { return this.inBounds(x, y) ? this.deco[y * this.w + x] : 0; }
  setDeco(x, y, d) {
    if (!this.inBounds(x, y)) return;
    this.deco[y * this.w + x] = d;
    this.version++;
  }

  isSolid(x, y) {
    if (!this.inBounds(x, y)) return true;
    const i = y * this.w + x;
    return TILE_INFO[this.tiles[i]].solid || DECO_SOLID.has(this.deco[i]) || this.extraSolid[i] > 0;
  }

  solidAtPixel(px, py) {
    return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  tileAtPixel(px, py) {
    return this.get(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  get pixelW() { return this.w * TILE; }
  get pixelH() { return this.h * TILE; }
}
