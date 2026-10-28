# Emberwake Browser Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable browser prototype of Emberwake that covers the spec's "Current prototype status": home start, village hub, staged procedural overworld, NPC quest chain, bomb unlock, caves, three dungeons with bosses, food/sprint/caches/shrine talents, combat arena and terrain viewer debug modes, and local save/load.

**Architecture:** Zero-dependency ES modules on a 480×270 canvas scaled with pixelated rendering. Pure logic (RNG, world generation, dungeon graphs, quests, save serialization, combat math) has no DOM access and is unit tested with `node --test`. Runtime is scene-based (`title`, `game`, `arena`, `viewer`). The game scene owns one active `Area` (overworld, interior, cave, dungeon), which holds a `TileMap` plus entities.

**Tech Stack:** Vanilla JS (ES2022 modules), Canvas 2D, WebAudio, localStorage, Node 22 built-in test runner. A tiny Node static server (`tools/serve.mjs`) for local play.

**Spec:** `game-space.md`

## Global Constraints

- Top-down 2.5D: flat navigation plane; depth only via cliff faces, wall/roof mass, shadows, y-sorted actors.
- Hard cliff border at overworld edge; staged generation order: terrain/geology → water → regional growth → settlements → roads → encounters/quest content.
- Biomes present in the world: forest, desert, swamp, caves (as interiors), mountain, snowy mountain, volcanic.
- Classes: Swordsman, Mage, Ranger, Rogue; differ by stats, gear, combat rhythm, resource profile; none hard-locks content.
- Resources: health, mana, stamina, ammo, food (no hunger meter).
- Dungeon requirements: guarded entrance, ≥1 small key, locked door, timed gate, enemy encounters, boss, minimap showing room progress and exit route, boss-room return seal.
- Enemy archetypes: brute, lunger, skirmisher, ranged, boss (phased).
- Death costs money and resets to village/shrine; save shrines exist; save & exit works anywhere.
- No external assets are downloaded: art is procedural pixel art; audio is synthesized behind an `AudioEngine` interface so bundled licensed files can replace it later (a known deviation from the spec's "bundled audio assets" line).

## Review Focus

1. Seeds that produce unreachable towns, dungeons, or gates: every seed must be solvable with exactly the intended tools → `tests/overworld.test.js` checks reachability over 12 seeds, with and without each tool.
2. Getting stuck in walls through knockback, dodges, or dt spikes after a tab switch → movement is swept per axis against the TileMap, dt is clamped to 1/30 s, and `tests/physics.test.js` pins both.
3. Softlocks in puzzles (push block in a corner, timed gate missed, keys spent) → rooms reset on re-entry, key count equals locked doors, and `tests/dungeons.test.js` simulates key BFS solvability.
4. Corrupt, missing, or old saves, plus saving mid-dungeon or mid-boss → loading never throws; boss rooms restore at the room entrance with the boss reset. Covered by `tests/state.test.js`.
5. Death at zero coins, and firing with zero ammo or mana → coins never go negative and the shot is refused with a `deny` cue. Covered by `tests/combat.test.js` and `tests/state.test.js`.

---

### Task 1: Scaffold, core utilities

**Files:** Create `package.json`, `index.html`, `tools/serve.mjs`, `src/main.js`, `src/core/{rng,math,grid,input}.js`; Test `tests/{rng,grid}.test.js`

**Interfaces (Produces):**
- `rng.js`: `makeRng(seed:number) -> {next():float, int(lo,hi):int, pick(arr), chance(p):bool, shuffle(arr), fork(tag:string)}`; `hashSeed(str|number) -> uint32`; `valueNoise2D(seed) -> (x,y)=>[0,1)`; `fbm(noise, x, y, octaves) -> [0,1)`.
- `grid.js`: `astar(w,h,costFn(x0,y0,x1,y1)->number|Infinity, start, goal) -> [{x,y}]|null`; `bfsDistances(w,h,passable(x,y), sources) -> Int32Array (-1 unreachable)`; `floodComponent(w,h,passable,start) -> Uint8Array`.
- `input.js`: `Input` with `held(action)`, `pressed(action)`, `released(action)`, `endFrame()`, blur clears all. Actions: `up down left right attack item shield dodge sprint interact cycle lock eat map pause confirm cancel`.

- [ ] Tests: same seed → same sequence; `fork('a')` differs from `fork('b')`; astar finds a path around a wall and returns null when sealed; bfs marks unreachable as -1.
- [ ] Implement; `npm test` passes; commit.

### Task 2: Tiles and staged overworld generation

**Files:** Create `src/world/{tiles,overworld,settlements,tilemap}.js`, `src/data/names.js`; Test `tests/overworld.test.js`

**Interfaces (Produces):**
- `tiles.js`: `T` tile id enum, `BIOME` enum `{FOREST,SWAMP,DESERT,MOUNTAIN,SNOW,VOLCANIC}`, `TILE_INFO[id] = {solid, slow, damage, water}`.
- `generateOverworld(seed) -> World` where World = `{seed,w:192,h:160,tiles,elev,biome,deco (Uint8Arrays), regions, settlements, pois:{home, dungeons:{verdant,ashen,frost,drowned}, caves[], camps[], shrines[], caches[], spire, gates[]}, roads[]}`. Pipeline functions are exported individually (`stageTerrain`, `stageWater`, `stageRegions`, `stageSettlements`, `stageRoads`, `stageContent`).
- Gating rule: elevation changes are solid except at road-carved `STAIRS`. Volcanic is ringed by a ridge whose single road crossing is `CRACKED_WALL` (bombs). Snow is ringed by a ridge whose single crossing is `BOULDER` (gloves).
- `TileMap(w,h)` with `get/set`, `isSolid(x,y)`, `solidAtPixel(px,py)`.

- [ ] Tests (12 seeds): deterministic; border tiles solid; all 6 surface biomes present; from home, every non-gated settlement and the Verdant entrance are reachable; Ashen is reachable only when cracked walls are passable; Frost only when boulders are also passable; each settlement has ≥3 buildings and ≥3 named NPCs; ≥6 cave entrances; ≥4 camps adjacent to roads.
- [ ] Implement; tests pass; commit.

### Task 3: Rendering, sprites, player movement

**Files:** Create `src/gfx/{palette,sprites,render}.js`, `src/game/{player,physics}.js`; Test `tests/physics.test.js`

**Interfaces:** `moveActor(map, actor, dx, dy)` sweeps per axis, sub-stepping at ≤4 px. `Camera{x,y,follow(actor,map)}`. `drawTileMap(ctx, map, cam, style)` draws south-facing cliff faces and rims; tall props are y-sorted with actors.

- [ ] Tests: an actor knocked 200 px toward a wall in one tick stops flush with it; dt is clamped to 1/30.
- [ ] Implement; walk the overworld in the browser; commit.

### Task 4: Combat and enemies

**Files:** Create `src/data/{classes,items,enemies}.js`, `src/game/{combat,enemies,entities}.js`; Test `tests/combat.test.js`

**Values:** Classes as `CLASSES[id] = {name, maxHp, maxMana, maxStamina, speed, weapon, shield, ranged, ammo, coins, food, perk}`. Swordsman 12/10/100/78 sword+buckler; Mage 8/40/70/76 staff+firebolt; Ranger 10/10/110/82 dagger+bow(30 arrows); Rogue 8/15/100/88 twin daggers+knives(15), dodge cost 15, sees caches. Attack tokens: at most 2 non-boss enemies attack at once; the rest hold a ring at 50–70 px.

- [ ] Tests: frontal shield block negates damage and costs stamina; a hit from behind lands; knockback points away from the source; attacking with 0 ammo returns `{ok:false, reason:'ammo'}`; lock-on picks the nearest enemy within 140 px.
- [ ] Implement brute/lunger/skirmisher/ranged FSMs with telegraphs; poof/spirit defeat effects; commit.

### Task 5: Settlements, NPCs, interiors, dialog, quests

**Files:** Create `src/world/interiors.js`, `src/game/{quests,npc,dialog}.js`; Test `tests/quests.test.js`

**Interfaces:** `MAIN_QUEST` stages `wake → scout → camp → sigil → vault → smith → ashpass → reliquary → frostpass → sanctuary → drowned`. `questObjective(state, world) -> {text, marker:{area,x,y}|null}`. `generateSideQuests(world, seed) -> [{id, giverNpcId, type:'fetch'|'hunt'|'deliver'|'rescue', target, reward}]`.

- [ ] Tests: stages advance only on the right flags; side quests differ across seeds in type/target/reward; each settlement hands out ≥1 side quest.
- [ ] Implement; commit.

### Task 6: Dungeons, puzzles, bosses, minimap

**Files:** Create `src/world/dungeons.js`, `src/game/{dungeon,bosses,puzzles}.js`, `src/gfx/hud.js` (minimap part); Test `tests/dungeons.test.js`

**Interfaces:** `generateDungeon(id:'verdant'|'ashen'|'frost', seed) -> {id, rooms:[{id,gx,gy,role,doors:{n,s,e,w:{to,type:'open'|'locked'|'shutter'|'sealed'|'boss'}}, layout}] , entrance, boss}`. Roles: `entrance combat key locked timed switches ordered push treasure bossdoor boss`. Room = 24×15 tiles.

- [ ] Tests: per template, every room is reachable via key-BFS; locked doors = keys available before them; contains `timed`, a logic puzzle (`switches|ordered`), `key`, `boss`; Frost has ≥12 rooms; door positions are open in the layout.
- [ ] Implement Thornmaw, Cinder Warden, Rime Sovereign with phases and punish windows; return seal; commit.

### Task 7: Caves, economy, shrines, talents, food, caches, map

**Files:** Create `src/world/caves.js`, `src/data/talents.js`, `src/game/shop.js`; extend `hud.js`

- [ ] Tests: cave has one connected floor, an exit, and a chest farther than 15 tiles from the exit.
- [ ] Implement; commit.

### Task 8: Save/load, death, options

**Files:** Create `src/game/state.js`; Test `tests/state.test.js`

**Interfaces:** `newGameState(seed, classId)`, `serialize(state)->string`, `deserialize(str)->state|null` (never throws), `applyDeathPenalty(state)` (lose 20% coins, floored, ≥0), `SaveStore(storageLike)` with `save/load/clear/has`.

- [ ] Tests: round-trip equality; garbage/old-version strings yield null; zero coins stay zero after death.
- [ ] Implement; commit.

### Task 9: Scenes — title, class select, arena, terrain viewer; audio

**Files:** Create `src/scenes/{title,game,arena,viewer}.js`, `src/audio/audio.js`

**Audio interface:** `AudioEngine{init(), playMusic(key), stopMusic(), sfx(name), setMusicVolume(v), setSfxVolume(v)}`, with music keys `title forest wetland frontier mountain snow volcanic dungeon cave town boss victory`.

- [ ] Verify in browser: new game per class, quest chain through Verdant Vault, bomb unlock, arena log, viewer layers; commit.
