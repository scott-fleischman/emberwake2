# The fourth ward, the Spire and Vesper: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow Emberwake to five dungeons (the Drowned Fane, then the Spire with Vesper at the bottom).
Along the way: two-phase wardens with four-way views and centered deaths, a regional signature move
for every monster, and unique synthesized sounds.

**Architecture:** Three shared pieces come first, because everything else uses them:
- **Danger zones:** telegraphed hazards as data, drawn, hit-checked and read by the bot from one list.
- **Status effects:** one table with the rules for each effect.
- **Boss movesets:** each warden's fight becomes a table of state handlers that any boss body can run,
  so Vesper can borrow the wardens' fights.

The Fane, its quest chain, the Spire and Vesper are built on top in story order. The bot learns each
piece in the task that adds it, so the autoplay test stays green after every task.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D at 480×270, WebAudio synthesis, `node --test`. No
dependencies.

**Spec:** `docs/superpowers/specs/2026-10-28-tidewarden-spire-vesper-design.md`. Read it alongside
this plan; it holds the look of every boss form and each region's moves.

## Global Constraints

- **Code style.** Zero dependencies and plain ES modules. Match the surrounding code: terse, with
  sparse comments that say why.
- **No `Math.random` in painters.** Art painters never call it (headless runs must reproduce). Use
  `hash()` in the art files.
- **Placement and gates.** New world features go through `tryPlace` in `stageContent`, so
  reachability holds. Reachability treats tool gates as open when the tool is held.
- **Saves.** No save compatibility is needed (pre-release).
- **Effects:**
  - Each lasts about **5 s**.
  - Control effects (snare, freeze) give **3 s immunity** to further control effects once they end.
  - Freeze breaks after **6 presses** (about 1.5 s), or by itself at 5 s.
  - **Story** difficulty halves durations, and freeze breaks in **1 press**.
  - Poison can't take the player below **1 hp** (½ heart).
  - Health is counted in hp, 2 per heart.
- **Signature moves.**
  - Each is a separate special with an **8–12 s** cooldown.
  - The first special comes after a random **3–9 s** delay.
  - Normal attacks carry no effect.
- **Boss HP.**

  | Boss | HP |
  |---|---|
  | Thornmaw | 120 |
  | Cinder Warden | 144 |
  | Rime Sovereign | 168 |
  | Tidewarden | 180 |
  | Vesper, first bar | 220 |
  | Vesper, second bar | 180 |

- **Warden phase 2.** It starts at **50%** HP with a **1.5 s** transform during which the warden can't
  be hurt. Phase 1 damage can't take the HP below 50%.
- **Death flow.**
  - **0.6 s** fade out, then **0.6 s** fade in, then a **1.6 s** dematerialize.
  - It all happens at the boss's spawn point (tile 12, 7 in a dungeon boss room).
- **Vesper's phase 3:**
  - HP floors at **80 / 60 / 40 / 20%**, each lifted by one more broken form.
  - **2 hits** break a borrowed form (**3** on Hard).
  - A form wears off at **12 s**.
- **Toughness.** Monsters in the Fane use a tier of at least **1.9**. Gloam-touched monsters use tier
  **2.2**.
- **Sounds.** All synthesized in `src/audio/audio.js`. Each boss gets its own `${kind}_*` sounds.
- **Done means** the Any% and 100% sweeps finish **all 32 runs** each (4 classes × 8 seeds) on the
  true ending.

## Review Focus

1. **Effects have to clear** on death and respawn, on any area change, and when a cutscene or the
   boss death flow starts. A freeze must never carry into a cutscene or survive a respawn. *(Task 3
   test: `effects clear on death, area change and cutscenes`.)*
2. **A hit the player blocks with a shield applies no effect.** Rolling through a zone while
   invulnerable also applies no effect. *(Task 3 test: `blocked and dodged hits apply no effect`.)*
3. **One huge hit can't skip phase 2.** A bomb at 51% HP must leave the warden at exactly 50% and
   transforming, never dead or past the transform. *(Task 7 test: `a huge hit cannot skip phase 2`.)*
4. **The death flow has to cope with a messy fight.** It must work with minions, projectiles and zones
   still live, and with the player standing where the boss will be moved to. All of those get
   cleared, and the player lands on open floor. *(Task 7 test: `the death flow clears the arena and
   frees the player`.)*
5. **Save and reload restore every new piece of world state:** frozen pools, rung bells, the broken
   Tidewall, the Spire's lit inner seals and tide-lever states. *(Task 14 test: `fourth ward state
   survives save and load`; Task 15 test: `spire inner seals survive save and load`.)*

---

## File map

New:
| File | Responsibility |
|---|---|
| `tests/helpers/sandbox.js` | A headless GameScene in an open arena, plus a bot driver for tests |
| `tools/sweep.mjs` | Runs autoplay over 4 classes × 8 seeds in parallel and prints a table |
| `src/game/zones.js` | Telegraphed danger zones: shapes, ticking, hits, drawing, bot danger |
| `src/game/effects.js` | Status effect rules |
| `src/gfx/effects.js` | Effect icons, HUD chips, blind vignette, ground-patch art |
| `src/game/specials.js` | The 24 regional signature moves |
| `src/game/warden-thornmaw.js` / `warden-cinder.js` / `warden-rime.js` / `warden-tide.js` | Movesets (phase 1 and 2 state handlers) |
| `src/gfx/art-thornmaw.js` / `art-cinder.js` / `art-rime.js` / `art-tide.js` / `art-vesper.js` | Painters with side, front and back views and a palette parameter |
| `src/game/bossdeath.js` | The centered death sequence (and Vesper's rise) |
| `src/game/vesper.js` | Vesper's three-phase fight |
| `src/world/puzzles.js` | Generators for the tide lever, ember beam and ember carry |
| `src/game/puzzles.js` | Runtime entities for those puzzles (Lever, Mirror, Brazier) and beam tracing |
| `tests/zones.test.js`, `tests/effects.test.js`, `tests/specials.test.js`, `tests/bosses.test.js`, `tests/vesper.test.js` | Unit and sandbox tests |

Modified (main ones): `src/game/bosses.js` (base `Boss`, registry), `src/gfx/bossart.js` (shared
helpers only), `src/game/enemies.js`, `src/game/player.js`, `src/scenes/game.js`, `src/game/areas.js`,
`src/game/dungeon.js`, `src/world/dungeons.js`, `src/world/wards.js`, `src/world/overworld.js`,
`src/world/tiles.js`, `src/game/quests.js`, `src/game/talk.js`, `src/data/story.js`,
`src/data/wards.js`, `src/data/enemies.js`, `src/gfx/cinema.js`, `src/gfx/hud.js`, `src/gfx/wards.js`,
`src/game/entities.js`, `src/audio/audio.js`, `src/bot/bot.js`, `src/bot/full.js`,
`src/scenes/theater.js`, `src/scenes/autoplay.js`, `src/scenes/arena.js`, `README.md`.

---

### Task 1: Test sandbox and sweep tool

**Files:**
- Create: `tests/helpers/sandbox.js`, `tools/sweep.mjs`, `tests/sandbox.test.js`
- Modify: `src/scenes/arena.js` (export `ArenaArea`)

**Interfaces:**
- Produces:
  - `sandbox({ cls = 'swordsman', seed = 'sandbox', difficulty = 'normal' } = {}) → Promise<{ app, game, area, step(seconds, dt = 1/60), spawn(entity), center: {x, y} }>`.
    It builds a `GameScene`, swaps `game.area` for a fresh `ArenaArea` (28×16 open room) and puts the
    player at its centre. `Math.random` is seeded from `sandbox/${seed}`. `step` runs
    `game.update(dt)` then `app.input.endFrame()`.
  - `botDo(s, makeTask, { maxSeconds = 120 }) → { done: boolean, status: string }`. It creates
    `new Bot(s.game, 'any')`, wraps `makeTask(bot)` in a generator that sets `done` when it finishes,
    and steps `bot.step(dt); game.update(dt); input.endFrame()` until done or out of time.
  - `tools/sweep.mjs [any|full] [--seeds a,b,…] [--classes …]`. It forks one child process per run
    (concurrency = CPU count), prints `seed class time result` rows and a summary line `N/32 done`,
    and exits 1 if any run fails. Defaults:
    - seeds: `quests, ember123, dune88, fen77, d1, zz9, hearth, wake`;
    - classes: all four in `CLASS_ORDER`.

- [ ] **Step 1: Write the failing test** in `tests/sandbox.test.js`

```js
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
```

- [ ] **Step 2: Run** `node --test tests/sandbox.test.js`. Expected: FAIL (cannot find `./helpers/sandbox.js`).
- [ ] **Step 3: Implement** `sandbox`, `botDo`, export `ArenaArea`, and write `tools/sweep.mjs` (it wraps `autoplay()` from `tools/autoplay.mjs`).
- [ ] **Step 4: Run** `node --test tests/sandbox.test.js`. Expected: PASS.
- [ ] **Step 5: Baseline sweep.** Run `node tools/sweep.mjs any`. Expected: `32/32 done`. Record the times in the commit message as the baseline.
- [ ] **Step 6: Commit** `git add tests/helpers tests/sandbox.test.js tools/sweep.mjs src/scenes/arena.js && git commit -m "Test sandbox and autoplay sweep tool"`

---

### Task 2: Telegraphed danger zones

**Files:**
- Create: `src/game/zones.js`, `tests/zones.test.js`
- Modify: `src/game/areas.js` (`Area`: `zones = []`, tick in `update`, draw under entities), `src/bot/bot.js` (`danger()` reads `g.area.zones`)

**Interfaces:**
- Produces, in `src/game/zones.js`:
  - `makeZone(shape, fields) → Zone`.
    - Shapes:
      - `'circle' {x, y, r}`
      - `'segment' {x1, y1, x2, y2, w}`
      - `'ring' {x, y, r, width, gaps: [[angle, halfWidth]]}`
      - `'cone' {x, y, a, spread, r}`
    - Common fields and their defaults:
      - `t: 0.8`: seconds until it strikes.
      - `life: 0`: seconds it stays live after striking.
      - `dmg: 1`
      - `effect: null`: an `EFFECTS` key, `'knockback'` or `null`.
      - `knock: 0`
      - `rgb: '255,80,60'`
      - `art: null`: a patch art key.
      - `owner: null`
      - `blockable: false`
      - `vx: 0, vy: 0`: movement while live.
      - `grow: 0`: radius growth per second while live.
      - `hit: false`
  - `inZone(z, x, y, pad = 0) → boolean`.
  - `tickZones(zones, dt, ctx) → Zone[]`.
    - It counts `t` down, then moves and grows live zones.
    - It strikes the player at most once per zone:
      - with `dmg > 0`: `ctx.game.damagePlayer(z.dmg, z.owner ?? z, { effect: z.effect, knock: z.knock })`;
      - with `dmg === 0` and an effect: `ctx.game.applyEffect(z.effect, z.owner ?? z)`.
    - It drops expired zones, and zones whose `owner` is dead unless `z.art` is set (a ground patch
      outlives its maker).
  - `zoneDanger(z, x, y) → 0|1|2|3`:
    - 0: outside the zone;
    - 1: inside and `t ≥ 0.9`;
    - 2: inside and `0 < t < 0.9`;
    - 3: inside and live.
  - `drawZones(g, cam, zones, time)`: a pulsing outline, filling as `t → 0`; patch art via
    `drawPatch` from `src/gfx/effects.js` (added in Task 3; a no-op stub until then).

- [ ] **Step 1: Write the failing tests** in `tests/zones.test.js`

```js
test('shapes: inside and outside', () => {
  assert.ok(inZone(makeZone('circle', { x: 0, y: 0, r: 10 }), 6, 6));
  assert.ok(!inZone(makeZone('circle', { x: 0, y: 0, r: 10 }), 9, 9));
  assert.ok(inZone(makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 8 }), 50, 3));
  assert.ok(!inZone(makeZone('segment', { x1: 0, y1: 0, x2: 100, y2: 0, w: 8 }), 50, 9));
  const ring = makeZone('ring', { x: 0, y: 0, r: 40, width: 8, gaps: [[0, 0.4]] });
  assert.ok(inZone(ring, 0, 40));       // on the ring
  assert.ok(!inZone(ring, 40, 0));      // in the gap
  assert.ok(!inZone(ring, 0, 20));      // inside the ring's hole
  assert.ok(inZone(makeZone('cone', { x: 0, y: 0, a: 0, spread: 0.5, r: 50 }), 30, 5));
  assert.ok(!inZone(makeZone('cone', { x: 0, y: 0, a: 0, spread: 0.5, r: 50 }), -30, 0));
});
test('danger levels follow the countdown', () => {
  const z = makeZone('circle', { x: 0, y: 0, r: 10, t: 1.2, life: 1 });
  assert.equal(zoneDanger(z, 0, 0), 1);
  z.t = 0.5; assert.equal(zoneDanger(z, 0, 0), 2);
  z.t = -0.1; assert.equal(zoneDanger(z, 0, 0), 3);
  assert.equal(zoneDanger(z, 50, 0), 0);
});
test('a zone strikes the player once, when its timer runs out', async () => {
  const s = await sandbox();
  const hp0 = s.game.state.player.hp;
  s.area.zones.push(makeZone('circle', { ...s.center, r: 12, t: 0.5, life: 1, dmg: 2 }));
  s.step(0.4); assert.equal(s.game.state.player.hp, hp0);
  s.step(0.2); const hp1 = s.game.state.player.hp; assert.ok(hp1 < hp0);
  s.step(1.5); assert.equal(s.game.state.player.hp, hp1);
  assert.equal(s.area.zones.length, 0);
});
test("a dead owner's zones vanish, but ground patches stay", async () => {
  const s = await sandbox();
  const e = s.spawn(new Enemy('brute', 0, s.center.x + 60, s.center.y));
  s.area.zones.push(makeZone('circle', { x: 0, y: 0, r: 5, t: 3, owner: e }), makeZone('circle', { x: 0, y: 0, r: 5, t: 3, owner: e, art: 'mud' }));
  e.dead = true; s.step(0.1);
  assert.deepEqual(s.area.zones.map((z) => z.art), ['mud']);
});
test('the bot reads zones as danger', async () => {
  const s = await sandbox();
  s.area.zones.push(makeZone('circle', { ...s.center, r: 12, t: 0.3 }));
  assert.equal(new Bot(s.game).danger(s.center.x, s.center.y, []).lv, 2);
});
```

- [ ] **Step 2: Run** `node --test tests/zones.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/game/zones.js`, wire `Area` and the bot's `danger()`. `damagePlayer` accepts `opts.effect` and `opts.knock` but ignores them until Task 3.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "Danger zones: telegraphed hazards as data for drawing, hits and the bot"` (add the new files first).

---

### Task 3: Status effects

**Files:**
- Create: `src/game/effects.js`, `src/gfx/effects.js`, `tests/effects.test.js`
- Modify:
  - `src/game/player.js`: movement multiplier, blocks, shake-off on attack, roll and button press;
  - `src/scenes/game.js`:
    - `damagePlayer` applies `opts.effect` only on `'hit'` (Review Focus 2);
    - new `applyEffect(kind, src)`;
    - per-frame `tickEffects` damage with the poison floor, scaled by `diff.damageTaken`;
    - `clearEffects` on death, area change, `playCutscene` and boss death start (Review Focus 1);
    - the blind vignette is drawn over the pixel layer;
  - `src/gfx/hud.js`: effect chips;
  - `src/audio/audio.js`: `fx_snare, fx_poison, fx_mud, fx_blind, fx_chill, fx_freeze, fx_burn, fx_break`;
  - `src/bot/bot.js`: shake-offs.

**Interfaces:**
- Produces, in `src/game/effects.js`:
  - `EFFECTS`. Each entry is `{ dur, control?, speed?, tick?, dmg?, floor?, blocks?, shake, need?, upgrade?, rgb, sfx }`, with the values below:

    | Effect | Values |
    |---|---|
    | snare | `dur 5, control, blocks {move, roll}, shake 'attack', need 3` |
    | poison | `dur 5, tick 1.5, dmg 1, floor 1, shake 'eat'` |
    | mud | `dur 5, speed 0.5, shake 'roll'` |
    | blind | `dur 5, shake null` |
    | chill | `dur 5, speed 0.7, upgrade 'freeze'` |
    | freeze | `dur 5, control, blocks {all}, shake 'press', need 6` |
    | burn | `dur 5, tick 1, dmg 1, shake 'roll'` |

  - `CONTROL_IMMUNITY = 3`.
  - `applyEffect(p, kind, { story = false } = {}) → boolean`.
    - It is `false` when a control effect is refused because `p.controlImmune > 0`.
    - A chill while already chilled becomes freeze.
    - Story halves `dur`, and freeze needs 1 press.
    - It stores `p.effects[kind] = { t, n: 0 }`.
  - `tickEffects(p, dt) → number`: the hp of damage due this frame. When a control effect ends, it
    sets `p.controlImmune = CONTROL_IMMUNITY`.
  - `shakeEffects(p, action) → string[]`: `action` is `'attack' | 'roll' | 'press' | 'eat'`; it
    returns the kinds removed.
  - `clearEffects(p)`.
  - `moveMult(p) → number`.
  - `blocked(p, what) → boolean`, where `what` is `'move' | 'roll' | 'attack'`, or `'all'` for
    freeze.
- Produces, in `src/gfx/effects.js`:
  - `drawEffectIcons(g, p, cam, time)`: icons over the player's head.
  - `drawEffectChips(u, p, x, y)`: HUD chips.
  - `drawBlind(g, p, cam, k)`: vignette radius 120 → 28 px.
  - `drawPatch(g, z, cam, time)`, for the patch arts `thorns, roots, mud, poison, dust, fire, fissure, frost`.
- Consumes: `makeZone` and `tickZones` (Task 2), `sandbox` (Task 1).

- [ ] **Step 1: Write the failing tests** in `tests/effects.test.js`

```js
const P = () => ({ effects: {}, controlImmune: 0 });
test('effects last about five seconds and Story halves them', () => {
  const p = P(); applyEffect(p, 'burn'); assert.equal(p.effects.burn.t, 5);
  const q = P(); applyEffect(q, 'burn', { story: true }); assert.equal(q.effects.burn.t, 2.5);
});
test('control effects grant three seconds of immunity when they end', () => {
  const p = P(); applyEffect(p, 'snare');
  for (let i = 0; i < 301; i++) tickEffects(p, 1 / 60);
  assert.ok(!p.effects.snare); assert.equal(p.controlImmune, 3);
  assert.equal(applyEffect(p, 'freeze'), false);
  assert.equal(applyEffect(p, 'burn'), true);
});
test('a second chill becomes a freeze', () => {
  const p = P(); applyEffect(p, 'chill'); applyEffect(p, 'chill');
  assert.ok(p.effects.freeze); assert.ok(!p.effects.chill);
});
test('shaking off: six presses break freeze, a roll puts out burn, three attacks tear free of snare', () => {
  const p = P(); applyEffect(p, 'freeze');
  for (let i = 0; i < 5; i++) shakeEffects(p, 'press'); assert.ok(p.effects.freeze);
  shakeEffects(p, 'press'); assert.ok(!p.effects.freeze);
  const q = P(); applyEffect(q, 'burn'); assert.deepEqual(shakeEffects(q, 'roll'), ['burn']);
  const r = P(); applyEffect(r, 'snare'); shakeEffects(r, 'attack'); shakeEffects(r, 'attack'); assert.ok(r.effects.snare);
  shakeEffects(r, 'attack'); assert.ok(!r.effects.snare);
});
test('poison stops at half a heart', async () => {
  const s = await sandbox(); s.game.state.player.hp = 2;
  s.game.applyEffect('poison'); s.step(5.5);
  assert.equal(s.game.state.player.hp, 1);
});
test('frozen players cannot move, snared players cannot roll, mud halves speed', async () => {
  const s = await sandbox(), p = s.game.player, x0 = p.x;
  s.game.applyEffect('freeze'); s.app.input.press('KeyD'); s.step(0.5); assert.equal(p.x, x0);
  s.app.input.release('KeyD'); clearEffects(p);
  s.game.applyEffect('snare'); s.app.input.press('Space'); s.step(0.1); assert.notEqual(p.mode, 'dodge');
  s.app.input.release('Space'); clearEffects(p);
  s.game.applyEffect('mud'); assert.equal(moveMult(p), 0.5);
});
test('effects clear on death, area change and cutscenes', async () => {
  const s = await sandbox();
  s.game.applyEffect('freeze'); s.game.playCutscene([{ text: 'x', hold: 0.1 }], {}); assert.deepEqual(s.game.player.effects, {});
  s.game.applyEffect('snare'); s.game.enterDungeon('verdant'); assert.deepEqual(s.game.player.effects, {});
  s.game.applyEffect('burn'); s.game.die(); assert.deepEqual(s.game.player.effects, {});
});
test('blocked and dodged hits apply no effect', async () => {
  const s = await sandbox(), p = s.game.player;
  p.shielding = true; p.aim = 0;
  s.game.damagePlayer(1, { x: p.x + 20, y: p.y }, { effect: 'snare' });
  assert.ok(!p.effects.snare);
  p.shielding = false; p.mode = 'dodge'; p.iframes = 0.3;
  s.game.damagePlayer(1, { x: p.x + 20, y: p.y }, { effect: 'burn' });
  assert.ok(!p.effects.burn);
});
```

`Input.press(code)` holds a key until `release(code)`. Its `justDown` makes the press count once.

- [ ] **Step 2: Run** `node --test tests/effects.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the module and wire it in.
  - **Player:**
    - Movement speed is multiplied by `moveMult(p)`.
    - `blocked(p, 'all')` skips all input except presses, which call `shakeEffects(p, 'press')`.
    - `blocked(p, 'roll')` refuses `tryDodge`.
    - Each melee swing calls `shakeEffects(p, 'attack')`, a dodge start calls `shakeEffects(p, 'roll')`, and `eat()` calls `shakeEffects(p, 'eat')`.
  - **Sounds:** each `fx_*` sound is distinct, a short WebAudio recipe in the `SFX` table style:
    - freeze: a glassy crackle;
    - burn: a sizzle;
    - snare: a wooden creak;
    - poison: bubbles;
    - mud: a squelch;
    - blind: a whoosh;
    - break: a shatter or snap.
  - **Bot** (in `tidyUp` or the combat step):
    - frozen → tap attack every frame;
    - burning or carrying a leech → roll;
    - snared → attack;
    - poisoned and below 50% hp → eat.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Look at it.** Open the game in the browser pane (`npm start`, http://localhost:5173), go to the Combat Arena, and call `game.applyEffect(k)` from the console for each effect. Screenshot the icons, the chips and the blind vignette.
- [ ] **Step 6: Commit** `git commit -m "Status effects: snare, poison, mud, blind, chill, freeze, burn"`

---

### Task 4: Signature moves I: framework, forest, swamp, desert

**Files:**
- Create: `src/game/specials.js`, `tests/specials.test.js`
- Modify:
  - `src/game/enemies.js`: the `special` state and cooldown, and the `untargetable` flag (burrow, dive);
  - `src/game/entities.js`: `PROJ_STYLE` kinds `vine, mud, poison, sand`; `Projectile` opts `effect`, `lob` (an arc), and `land(proj, ctx)`;
  - `src/gfx/sprites.js`: a special glow pose for each archetype;
  - `src/audio/audio.js`: one `mv_<biome>_<archetype>` sound for each move added;
  - `src/bot/bot.js`: the `TELEGRAPH` set and danger include `special`.

**Interfaces:**
- Produces, in `src/game/specials.js`:
  - `SPECIALS[biomeKey][archetype]`, where `biomeKey` comes from `BIOME_KEYS`. Each entry is `{ name, windup, range, effect, sfx, start(e, ctx, p), update(e, dt, ctx, p) → boolean }`; `update` returns true when the move is finished. Moves publish their danger as `ctx.area.zones` entries with `owner: e`, and lingering ground uses `art`.
  - `specialCooldown() → number`: 8–12 s.
  - `firstDelay() → number`: 3–9 s.
- Enemy changes:
  - The constructor sets `this.specialCool = firstDelay()`.
  - In `update`, when aggro, not mid-attack, `specialCool ≤ 0`, the player is within `range` and the enemy gets a token, the enemy enters `state = 'special'`, `sub = 'windup'`, `timer = windup`, glowing in the effect color.
  - It then runs `start`, then `update` until it is done, then `recover` for 0.6 s.
  - Finally it resets `specialCool = specialCooldown()`.
  - Elites run the same move at 1.6× zone size.
- Mechanics this task needs:
  - **Latch** (Mire Leech): `e.latched = true`. It follows the player's position and applies poison every 1.5 s. A player roll, or any player hit on it, detaches it.
  - **Burrow** (Dune Scorpion): `e.untargetable = true`. It is drawn as a moving sand ripple zone, then erupts at the player's position after a 0.8 s mark.
  - **Dust devil:** an area zone with `vx, vy` that steers toward the player at 30 px/s for 4 s. Inside it, the player is blind.
- The moves themselves come from the spec's table, rows Forest, Swamp and Desert.

- [ ] **Step 1: Write the failing tests** in `tests/specials.test.js`

```js
const DONE = ['forest', 'swamp', 'desert'];
test('each of these regions has a move for all four archetypes', () => {
  for (const b of DONE) for (const a of ['brute', 'lunger', 'skirmisher', 'ranged']) {
    const m = SPECIALS[b][a];
    assert.ok(m && m.windup >= 0.5, `${b}/${a}`);
    assert.ok(EFFECTS[m.effect] || ['knockback', 'rockfall'].includes(m.effect), `${b}/${a} effect`);
  }
});
// Fires one special at a player standing still; reports what it did. Normal attacks are off.
async function specialHits(a, b) {
  const s = await sandbox({ seed: `${b}${a}` });
  const e = s.spawn(new Enemy(a, BIOME_KEYS.indexOf(b), s.center.x + 30, s.center.y));
  e.specialCool = 0.2; e.cool = 99;
  let windup = false; const effects = new Set();
  for (let t = 0; t < 8; t += 1 / 60) {
    s.step(1 / 60);
    windup ||= e.state === 'special' && e.sub === 'windup';
    for (const k of Object.keys(s.game.player.effects)) effects.add(k);
  }
  return { windup, effects: [...effects], hpLost: s.game.derived.maxHp - s.game.state.player.hp };
}
test('a special waits for its first delay, telegraphs, then lands', async () => {
  for (const b of DONE) for (const a of ['brute', 'lunger', 'skirmisher', 'ranged']) {
    const r = await specialHits(a, b), m = SPECIALS[b][a];
    assert.ok(r.windup, `${b}/${a} telegraph`);
    assert.ok(EFFECTS[m.effect] ? r.effects.includes(m.effect) : r.hpLost > 0, `${b}/${a} landed`);
  }
});
test('normal attacks carry no effect', async () => {
  const s = await sandbox();
  const e = s.spawn(new Enemy('lunger', 0, s.center.x + 60, s.center.y)); e.specialCool = 999;
  s.step(6);
  assert.deepEqual(s.game.player.effects, {});
});
test('specials come back on an 8-12 s cooldown', () => {
  for (let i = 0; i < 200; i++) { const c = specialCooldown(); assert.ok(c >= 8 && c <= 12); const f = firstDelay(); assert.ok(f >= 3 && f <= 9); }
});
```

The second test drives the player standing still. Moves that need the player inside a zone (patches, burrow) must aim at the player's position, so a standing player gets caught.

- [ ] **Step 2: Run** `node --test tests/specials.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the framework and the 12 moves, with art and sound for each.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Regression sweep.** Run `node tools/sweep.mjs any`. Expected: `32/32 done`. If a run stalls, fix the bot's reading of the new zones or states before going on.
- [ ] **Step 6: Commit** `git commit -m "Signature moves for forest, swamp and desert monsters"`

---

### Task 5: Signature moves II: mountain, snow, volcanic, and the Gloam tier

**Files:**
- Modify:
  - `src/game/specials.js`;
  - `src/game/entities.js`: `PROJ_STYLE` kinds `boulder, snowball, fireball`, plus a `roll` option so a projectile carries on along the ground after landing, publishing a moving segment zone;
  - `src/data/enemies.js`: `enemyStats(archetype, biome, opts = {})` takes `opts.tier` (overriding `BIOME_TIER[biome]`), and there is a new `gloamPalette(pal) → pal`;
  - `src/game/enemies.js`: the `opts.gloam` constructor option sets tier 2.2 and the gloam palette, and appends " (Gloam)"-free names, i.e. "Gloam Thornback";
  - `src/audio/audio.js`;
  - `tests/specials.test.js`.

**Interfaces:**
- Consumes: Task 4's framework.
- Produces:
  - `new Enemy(arch, biome, x, y, { gloam: true })`.
  - `enemyStats(arch, biome, { tier })`.
- Moves: the spec's table, rows Mountain, Snow and Volcanic. Notes on two of them:
  - **Harpy dive:** `untargetable` while airborne. A shadow circle zone appears 0.9 s before impact, and the impact uses `effect: 'knockback'` with `knock: 260`.
  - **Stone Ogre rockfall:** 4 circle zones around the ogre with `t` staggered from 0.9 to 1.4 s.

- [ ] **Step 1: Write the failing tests.** Widen `DONE` in `tests/specials.test.js` to all six regions, and add:

```js
test('Gloam-touched monsters are tier 2.2 and violet', () => {
  const e = new Enemy('brute', 0, 0, 0, { gloam: true });
  assert.equal(e.maxHp, Math.round(ARCHETYPES.brute.hp * 2.2));
  assert.match(e.name, /^Gloam /);
  assert.notDeepEqual(e.st.pal, enemyStats('brute', 0).pal);
});
test('Ice Wisps freeze on touch; Frost Archers chill', async () => {
  assert.ok((await specialHits('skirmisher', 'snow')).effects.includes('freeze'));
  assert.ok((await specialHits('ranged', 'snow')).effects.includes('chill'));
});
```

- [ ] **Step 2: Run** `node --test tests/specials.test.js`. Expected: FAIL for the three new regions.
- [ ] **Step 3: Implement** the 12 moves (with art and sound), the `roll` projectile option and the Gloam tier.
- [ ] **Step 4: Run** `npm test`, then `node tools/sweep.mjs any`. Expected: all pass, and `32/32 done`.
- [ ] **Step 5: Look at it.** In the Combat Arena (in the browser pane), cycle through the six enemy families and screenshot one special per region.
- [ ] **Step 6: Commit** `git commit -m "Signature moves for mountain, snow and volcanic monsters; Gloam-touched tier"`

---

### Task 6: Boss movesets and art split (no behavior change)

**Files:**
- Create: `src/game/warden-thornmaw.js`, `src/game/warden-cinder.js`, `src/game/warden-rime.js`, `src/gfx/art-thornmaw.js`, `src/gfx/art-cinder.js`, `src/gfx/art-rime.js`, `tests/bosses.test.js`
- Modify:
  - `src/game/bosses.js`: the base `Boss` runs movesets; the warden classes become thin;
  - `src/gfx/bossart.js`: keeps only the shared helpers (`stamp`, `glow`, `roarRings`, `deathRays`, `dizzyStars`, `quakeDebris`, entrance and omen dispatch, `BOSS_RGB`, `portraitPose`) and re-exports the painters for existing importers;
  - `src/gfx/cutscene.js`, `src/gfx/cinema.js` (imports);
  - `src/bot/bot.js`: drop the `marks` and `drops` branches; zones cover them.

**Interfaces:**
- Produces:
  - **Moveset shape**, exported as `moves` from each `warden-*.js` file:
    ```js
    export const moves = {
      first: 'stalk',                       // state after the intro (and when a borrowed form begins)
      phase1: { stalk(b, dt, ctx, me) {}, wind() {}, … },   // me = { p, dx, dy, d }
      phase2: {},                           // filled in Tasks 8–10; merged over phase1 when b.phase > 1
      vulnerable: (b) => b.state === 'stunned',
      enter2(b, ctx) {},                    // runs once when phase 2 begins
      clear(b, ctx) {},                     // undo world changes (Rime walls) on death or form change
    };
    ```
  - `WARDEN_MOVES = { thornmaw, cinder, rime }`, exported from `src/game/bosses.js`. The Tidewarden is added in Task 11.
  - `Boss.prototype.runMoves(m, dt, ctx)`: it builds `me`, calls `set[this.state]?.(this, dt, ctx, me)`, and sets `this.vulnerable = m.vulnerable(this)`.
  - **Painter signature:** `paintThornmaw(g, b, L, pal = THORN_PAL)`, and the same for `paintCinder` and `paintRime`. The `PAL` objects hold every color literal the painter used, so Vesper can recolor.
  - **Zones:** Cinder eruption marks and Rime shard drops become `ctx.area.zones` circles. The Thornmaw and Rime charge windups publish a 300 px segment zone (w 24) during `wind`.
- Behavior must not change in this task. Phase 2 still means today's `phase > 1` tweaks, which are kept in `phase1` handlers that read `b.phase` until Tasks 8–10 move them.

- [ ] **Step 1: Write the failing tests** in `tests/bosses.test.js`

```js
test('every warden has a complete moveset', () => {
  for (const [k, m] of Object.entries(WARDEN_MOVES)) {
    assert.ok(m.phase1[m.first], `${k} first state`);
    assert.equal(typeof m.vulnerable, 'function');
  }
});
test('painters take a palette', () => {
  const rec = recorder();                      // a Proxy context logging fillStyle assignments
  paintCinder(rec.g, portraitPose('cinder', 1), [], { ...CINDER_PAL, core: '#123456' });
  assert.ok(rec.fills.includes('#123456'));
});
test('boss telegraphs are zones', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.state = 'volley'; b.volleys = 1; b.phase = 2; b.timer = 0;
  s.step(0.1);
  assert.ok(s.area.zones.some((z) => z.owner === b));
});
```

Put a `recorder()` helper in `tests/helpers/sandbox.js`. It returns a Proxy 2D context whose
assignments to `fillStyle` and `strokeStyle` are pushed to `fills`, and whose calls are logged to
`calls`.

- [ ] **Step 2: Run** `node --test tests/bosses.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the split and the moveset refactor. Move code; don't rewrite it.
- [ ] **Step 4: Run** `npm test` and `node tools/sweep.mjs any`. Expected: all pass, `32/32 done`, and boss times within about 10% of the Task 1 baseline.
- [ ] **Step 5: Commit** `git commit -m "Wardens as movesets; boss art split per warden with palettes"`

---

### Task 7: Boss views, two-phase transform, doubled HP, centered death

**Files:**
- Create: `src/game/bossdeath.js`
- Modify: `src/game/bosses.js`, `src/gfx/bossart.js` (`stamp` mirrors only for the side view), the three `art-*.js` files (dispatch on `b.view`), `src/scenes/game.js`, `src/game/dungeon.js` (the outro focuses on `boss.spawn`), `src/scenes/arena.js`, `tests/bosses.test.js`

**Interfaces:**
- Produces:
  - `viewFrom(vx, vy, prev) → 'side' | 'front' | 'back'`, exported from `bosses.js`.
    - Under 4 px/s it returns `prev`.
    - It returns `'side'` when `|vx| ≥ 1.25|vy|`.
    - It returns `'front'` or `'back'` when `|vy| ≥ 1.25|vx|`, by the sign of `vy`.
    - Otherwise it returns `prev`.
    - `Boss.tickTimers` sets `b.view`. While the state is a telegraph (`wind`, or any state named in `m.aim`), the boss uses `cdx`/`cdy` instead of its velocity.
  - **Painters** branch on `b.view`. In this task the front and back views can be rough. Tasks 8–10 finish them for real.
  - `Boss.spawn = { x, y }`, set in the constructor.
  - `BOSS_INFO` HP: thornmaw 120, cinder 144, rime 168.
  - **Phase change:** `Boss.checkPhase(ctx)` replaces `updatePhase`. In phase 1, `damage` clamps HP to at least `0.5 * maxHp` (Review Focus 3). When it reaches 50%:
    1. `state = 'transform'`, `timer = 1.5`, `untargetable = true`; the boss roars, bursts, and plays sfx `${kind}_phase`. The music swells: add a `boss2` track to `TRACKS` in `audio.js` (the boss track, faster, with a darker voicing) and switch to it.
    2. When the timer runs out: `phase = 2`, then `m.enter2(b, ctx)`, then `state = m.first2 ?? m.first`.
  - **Death:** `Boss.damage` reaching 0 calls `ctx.game.beginBossDeath(this)` instead of setting `state = 'dying'` directly.
  - `class BossDeath { constructor(game, boss, { rise = false } = {}); update(dt) → boolean /* finished */; draw(g) }`, in `src/game/bossdeath.js`.
    - **Steps:** `stop` 0.25 s (hit-stop and flash) → `fadeout` 0.6 → `place` → `fadein` 0.6 → `dissolve` 1.6, or `rise` (Task 17).
    - **During `place`:**
      - every non-boss enemy, enemy projectile and zone is removed (with poofs during `stop`);
      - `boss.x/y = boss.spawn`, `boss.view = 'front'`;
      - the player moves to `spawn + (0, 48)` and is freed with `findFreeSpot`, facing up;
      - the camera snaps.
    - **During `dissolve`:** `boss.state = 'dying'` with `DIE = 1.6`, using today's rays and cracks.
    - **At the end:** `area.onBossDefeated(boss, ctx)`.
  - `GameScene.beginBossDeath(boss, opts = {})`. It passes `opts` through to `BossDeath` and sets `this.bossDeath`. While it is set, the scene updates it instead of the area and draws its fade over the pixel layer. It also calls `clearEffects`. `touchMode` reports `'watch'`.
  - **Sounds:** `thornmaw_phase`, `cinder_phase`, `rime_phase`, `thornmaw_death`, `cinder_death`, `rime_death`. These are placeholders, distinct per boss; Tasks 8–10 enrich them.

- [ ] **Step 1: Write the failing tests** in `tests/bosses.test.js`

```js
test('viewFrom has hysteresis', () => {
  assert.equal(viewFrom(50, 0, 'front'), 'side');
  assert.equal(viewFrom(0, 50, 'side'), 'front');
  assert.equal(viewFrom(0, -50, 'side'), 'back');
  assert.equal(viewFrom(40, 38, 'back'), 'back');
  assert.equal(viewFrom(1, 2, 'side'), 'side');
});
test('wardens have double HP and transform at half', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 40)); b.state = 'stalk';
  assert.equal(b.maxHp, 120);
  b.damage(61, s.game.player, s.game.area.ctx);
  s.step(0.05); assert.equal(b.state, 'transform'); assert.ok(b.untargetable);
  s.step(1.6); assert.equal(b.phase, 2); assert.notEqual(b.state, 'transform');
});
test('a huge hit cannot skip phase 2', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('rime', s.center.x, s.center.y - 40)); b.state = 'orbit';
  b.hp = b.maxHp * 0.51; b.damage(500, s.game.player, s.game.area.ctx);
  assert.equal(b.hp, b.maxHp * 0.5); s.step(0.05); assert.equal(b.state, 'transform');
});
test('the death flow clears the arena and frees the player', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('cinder', s.center.x, s.center.y - 40)); b.phase = 2; b.state = 'volley';
  s.spawn(new Enemy('skirmisher', 5, s.center.x - 30, s.center.y));
  s.area.zones.push(makeZone('circle', { ...s.center, r: 10, t: 2 }));
  b.x += 70; s.game.player.x = b.spawn.x; s.game.player.y = b.spawn.y;
  let defeated = false; s.area.onBossDefeated = () => { defeated = true; };
  b.damage(9999, s.game.player, s.game.area.ctx);
  s.step(1.2);
  assert.deepEqual({ x: b.x, y: b.y }, b.spawn);
  assert.equal(s.area.enemyList.filter((e) => !e.boss && !e.dead).length, 0);
  assert.equal(s.area.zones.length, 0);
  assert.ok(!s.area.map.isSolid(Math.floor(s.game.player.x / 16), Math.floor(s.game.player.y / 16)));
  assert.ok(s.game.player.y > b.spawn.y);
  s.step(2); assert.ok(defeated);
});
test('the outro is focused on the arena centre', async () => {
  const s = await sandbox(); s.game.enterDungeon('verdant');
  const a = s.game.area; a.enterRoom(a.dungeon.bossId, 's');
  const b = a.boss; b.state = 'stalk'; b.phase = 2; b.x -= 60;
  let shots = null; s.game.queueCutscene = (fn) => fn(); s.game.playCutscene = (sh) => { shots = sh; };
  b.damage(9999, s.game.player, s.game.area.ctx); s.step(4);
  assert.deepEqual(shots[0].focus, b.spawn);
});
```

`area.ctx` is the existing getter that `Area.update` passes to entities.

- [ ] **Step 2: Run** `node --test tests/bosses.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `node tools/sweep.mjs any`. Expected: all pass and `32/32 done`. The doubled HP will lengthen the boss splits, which is expected.
- [ ] **Step 5: Look at it.** In the browser pane, run a Combat Arena boss fight. Screenshot the transform, the fade, and the dematerialize at the centre.
- [ ] **Step 6: Commit** `git commit -m "Wardens face four ways, transform at half health, and die at the arena centre"`

---

### Task 8: Thornmaw, "Bloom"

**Files:**
- Modify: `src/game/warden-thornmaw.js` (`phase2`, `enter2`), `src/gfx/art-thornmaw.js` (finished side, front and back views for both forms; the Bloom look per the spec), `src/audio/audio.js`, `src/bot/bot.js` (only if a new attack needs it), `tests/bosses.test.js`

**Interfaces:**
- Consumes: the moveset shape (Task 6), zones (Task 2), effects (Task 3).
- Produces: `moves.phase2` with these states:
  - `roots`: 3 segment zones racing from the boss toward the player, each with `t` staggered 0.7, 0.9 and 1.1 s and `w` 14.
  - `spores`: a circle zone, r 40, around the player's position, `t` 1.0, `life` 2.5, `dmg 0`, `effect 'snare'`, `art 'roots'`.
  - `lash`: a cone, `spread` 1.1, r 70, `t` 0.6, dmg 2.
  - The phase 1 charge stays, interleaved.
- Today's phase-2 lunger and skirmisher summons are kept in `enter2`.
- Sounds: `thornmaw_roar, thornmaw_charge, thornmaw_slam, thornmaw_roots, thornmaw_spores, thornmaw_lash, thornmaw_phase, thornmaw_death`. Use them in place of the generic `boss`, `explode` and `arrow` calls.

- [ ] **Step 1: Write the failing tests**

```js
test('Thornmaw blooms: phase 2 uses new attacks', async () => {
  const s = await sandbox();
  const b = s.spawn(createBoss('thornmaw', s.center.x, s.center.y - 50)); b.phase = 2; b.state = WARDEN_MOVES.thornmaw.first;
  const seen = new Set(); for (let t = 0; t < 30; t += 1 / 60) { s.step(1 / 60); seen.add(b.state); s.game.state.player.hp = 99; }
  for (const st of ['roots', 'spores', 'lash']) assert.ok(seen.has(st), st);
});
test('Thornmaw has its own voice', async () => {
  const names = await sfxDuringFight('thornmaw', 40);   // sandbox helper: spies game.audio.sfx over a fight
  assert.ok(names.filter((n) => n.startsWith('thornmaw_')).length >= 4);
  assert.ok(!names.includes('boss'));
});
test('Thornmaw front and back views differ from the side', () => {
  const draw = (view) => { const r = recorder(); paintThornmaw(r.g, { ...portraitPose('thornmaw', 1), view }, []); return JSON.stringify(r.calls); };
  assert.notEqual(draw('front'), draw('side')); assert.notEqual(draw('back'), draw('side')); assert.notEqual(draw('front'), draw('back'));
});
```

Add `sfxDuringFight(kind, seconds)` to the sandbox helper. It spawns the boss, keeps the player
alive, spies on `game.audio.sfx`, and returns the names it was called with.

- [ ] **Step 2: Run** `node --test tests/bosses.test.js`. Expected: the Thornmaw tests FAIL.
- [ ] **Step 3: Implement** the moves, the art for all 6 form/view combinations, and the sounds.
- [ ] **Step 4: Run** `npm test` and `node tools/sweep.mjs any`. Expected: all pass and `32/32 done`.
- [ ] **Step 5: Look at it.** In the browser pane, open the Combat Arena and fight Thornmaw. Circle it so it moves up and down. Screenshot every view in both forms, and the Theater's Thornmaw entrance.
- [ ] **Step 6: Commit** `git commit -m "Thornmaw blooms in its second phase; front and back views; its own voice"`

---

### Task 9: Cinder Warden, "Unbound", and the casting pose

**Files:**
- Modify: `src/game/warden-cinder.js`, `src/gfx/art-cinder.js`, `src/audio/audio.js`, `tests/bosses.test.js`

**Interfaces:**
- Produces: `moves.phase2` with these states:
  - `meteors`: 5 circle zones near the player with `t` from 1.0 to 1.6 s, r 16, dmg 2.
  - `sweep`: a cone for the greatsword arc (r 60), then a moving segment fire wave (`vx`/`vy` 140 px/s, `life` 1.2, `art 'fire'`, `effect 'burn'`).
  - `pools`: 3 circle zones, `life` 6, `dmg 0`, `effect 'burn'`, `art 'fire'`, with r growing 4 px/s.
- Today's 25% step and the phase-3 skirmisher summon are removed. The summon moves to `enter2`.
- **Casting pose.** `cinderHands` for `volley` gets a new pose:
  - Over the first 60% of the windup, the hands draw back and up: x ±26, y −44.
  - Then they thrust outward along the aim, in the view's frame: side view x ±30 forward, front view toward the camera with the y offset.
  - Both palms open, and the embers spawn at the palm positions moving along the aim.
  - No inward x motion at any point.
- Sounds: `cinder_roar, cinder_cast, cinder_blink, cinder_vent, cinder_meteor, cinder_sweep, cinder_phase, cinder_death`.

- [ ] **Step 1: Write the failing tests**

```js
test('the casting hands never move inward', () => {
  for (let k = 0; k <= 10; k++) {
    const b = { ...portraitPose('cinder', 1), state: 'volley', timer: 0.55 * (1 - k / 10), view: 'side' };
    for (const h of cinderHands(b)) assert.ok(Math.abs(h.x) >= 22, `k=${k} x=${h.x}`);
  }
});
```

Also add the same three kinds of test as Task 8, for `cinder`, with the states
`['meteors', 'sweep', 'pools']`.

- [ ] **Step 2: Run** `node --test tests/bosses.test.js`. Expected: the Cinder tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `node tools/sweep.mjs any`. Expected: all pass and `32/32 done`.
- [ ] **Step 5: Look at it.** In the browser pane, screenshot the volley cast from side, front and back, and the Unbound form.
- [ ] **Step 6: Commit** `git commit -m "Cinder Warden: Unbound second phase, an outward casting pose, its own voice"`

---

### Task 10: Rime Sovereign, "Shatter"

**Files:**
- Modify: `src/game/warden-rime.js`, `src/gfx/art-rime.js`, `src/audio/audio.js`, `src/bot/bot.js` (decoys count as enemies the bot may target), `tests/bosses.test.js`

**Interfaces:**
- Produces: `moves.phase2` with these states:
  - `gust`: for 2 s it pushes the player 60 px/s away from the boss; it shows as a cone zone with `dmg 0`.
  - `pillars`: 4 circle zones at the player's position and around it, `t` 1.1, r 12, `effect 'freeze'`, dmg 1.
  - `decoys`: spawns 2 `new RimeDecoy(x, y, owner)` actors (the class is exported from `warden-rime.js`). Each has hp 1, fires an ice bolt every 1.4 s, and shatters after one hit or 8 s.
- Today's walls (phase 2) and summons (phase 3) move into `enter2`.
- Sounds: `rime_roar, rime_dash, rime_shard, rime_gust, rime_pillar, rime_decoy, rime_phase, rime_death`.

- [ ] **Step 1: Write the failing tests.** Add the Task 8-style trio for `rime`, with the states `['gust', 'pillars', 'decoys']`, plus:

```js
test('Rime decoys break in one hit', async () => {
  const s = await sandbox(); const d = s.spawn(new RimeDecoy(s.center.x + 30, s.center.y, null));
  d.damage(1, s.game.player, s.game.area.ctx); s.step(0.3); assert.ok(d.dead);
});
```

- [ ] **Step 2: Run** `node --test tests/bosses.test.js`. Expected: the Rime tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `node tools/sweep.mjs any`. Expected: all pass and `32/32 done`.
- [ ] **Step 5: Look at it.** In the browser pane, screenshot every view of both forms.
- [ ] **Step 6: Commit** `git commit -m "Rime Sovereign shatters into a winged second phase; its own voice"`

---

### Task 11: The Tidewarden

**Files:**
- Create: `src/game/warden-tide.js`, `src/gfx/art-tide.js`
- Modify:
  - `src/game/bosses.js`: `BOSS_INFO.tide = { name: 'The Tidewarden', hp: 180, music: 'boss' }`, `WARDEN_MOVES.tide`, `createBoss('tide')`;
  - `src/gfx/bossart.js`: `BOSS_RGB.tide = '90,200,220'`, plus entrance and omen dispatch to the new `surgeFx`;
  - `src/data/story.js`: `WARDENS.tide` with `title, sub, color, narration, omen, rise, rgb, voice, hint, spirit: { kind: 'whale', name: 'The Tide Spirit', color: '#a0e8ff' }, lines, taunt`; `IMPACT.tide`;
  - `src/gfx/cinema.js`: a `whale` case in `drawSpirit`, and the `portrait_tide` art;
  - `src/audio/audio.js`: `tide_roar, tide_dive, tide_surface, tide_jet, tide_sweep, tide_wave, tide_whirl, tide_song, tide_phase, tide_death`;
  - `src/scenes/arena.js`: `BOSSES` gains `'tide'`;
  - `tests/bosses.test.js`, `tests/story.test.js`.

**Interfaces:**
- Produces:
  - `moves` for the Tidewarden, following the spec's Tidewarden section:
    - **phase 1:** `dive` (untargetable; a ripple circle zone at the player's position with `t` 0.9, then `surface` at that spot), `jets`, and `sweep` (a segment zone the width of the arena).
    - **phase 2:**
      - `wave`: a moving segment across the arena with one gap 40 px wide (two segment zones with a gap between them).
      - `whirl`: for 3 s it pulls the player toward the boss at 45 px/s. Its circle zone has `dmg 0` and `effect 'mud'`.
      - `rings`: 3 ring zones growing at 90 px/s, each with 2 gaps.
      - `enter2` summons Mire Leeches.
    - **`vulnerable`:** during `surface` recovery (1.4 s) and after `wave`.
  - **Pools:** in the arena the boss can dive anywhere; the "pool" is drawn at the dive spot as dark water. The Fane boss room adds real `DWATER` décor in Task 12, but the moves can't depend on it.
  - **Tests:** the Task 8-style trio for `tide`, with the states `['wave', 'whirl', 'rings']`. Also: `the Tidewarden has warden story data and a whale spirit`, which asserts that `bossIntroShots('tide')` and `bossOutroShots('tide', {x: 0, y: 0})` are non-empty and that the outro shots name `whale`.

- [ ] **Step 1: Write the failing tests** (above).
- [ ] **Step 2: Run** `node --test tests/bosses.test.js tests/story.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the boss, its art (6 form/view combinations plus the portrait), the entrance FX, the story data, the whale spirit and the sounds.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Look at it.** In the browser pane, open the Combat Arena and fight the Tidewarden. Screenshot both forms in every view, and the whale spirit (call `bossOutroShots` from the console in the Theater).
- [ ] **Step 6: Commit** `git commit -m "The Tidewarden: a coral-crowned sea serpent with a ghostly second phase"`

---

### Task 12: The Drowned Fane and the tide lever

**Files:**
- Create: `src/world/puzzles.js`, `src/game/puzzles.js`
- Modify:
  - `src/world/tiles.js`: dungeon tiles `BOG: 52` (walkable, applies mud) and `MIRE: 53` (walkable, applies poison), with `TILE_INFO` entries;
  - `src/world/dungeons.js`:
    - `DUNGEON_INFO.drowned = { name: 'Drowned Fane', biome: 1, boss: 'tide' }`;
    - `TEMPLATES.drowned`: about 17 rooms with 2 `tide` rooms;
    - `THEMES.drowned = { hazard: T.BOG, ringHazard: T.MIRE, enemies: … }`;
    - `ENTRANCE_LINES.drowned`;
    - `SETUP.tide` delegates to `src/world/puzzles.js`;
    - the boss room gets `DWATER` pools when the theme is `drowned`;
  - `src/data/enemies.js`: `DUNGEON_FAMILY.drowned = 1`, `DUNGEON_TIER = { drowned: 1.9 }`;
  - `src/game/dungeon.js`: the tide runtime, per-room `BOG`/`MIRE` effects, the dungeon tier;
  - `src/gfx/render.js` and `src/gfx/palette.js`: the Fane theme and the bog and mire tiles;
  - `src/game/areas.js`: the lever interaction;
  - `src/bot/bot.js`: `solveTide()`, and `BOG`/`MIRE` added to the nav cost;
  - `tests/dungeons.test.js`.

**Interfaces:**
- Produces:
  - `setupTide(L, spec)`, in `src/world/puzzles.js`. It writes `L.puzzle = { kind: 'tide', a: [{x, y}], b: [{x, y}], levers: [{x, y}], start: 'a' }`. Tide `'a'` means the A tiles are **dry** and the B tiles are flooded (`DWATER`).
    - The room is laid out as entry shore, A band, an island with a lever, B band, exit shore. There is a lever on each shore and on the island.
    - The layout is built from a solved path and then checked by the BFS below. On failure it retries
      (like `push`), up to 500 times, then throws.
  - `tideSolvable(room) → boolean`, in `src/world/puzzles.js`. It does a BFS over (tile, tide) states. From the entry gap with `start`, it can walk in the current state, toggle at any reachable lever, and must reach the room's onward door gap.
  - `class Lever`, in `src/game/puzzles.js`. Interacting with it (USE) toggles `area.tide` and swaps the tiles; it plays `splash` and `lever` sounds. `progress.tides[\`${id}:${roomId}\`]` stores the state, and `enterRoom` restores it.
  - Tide rooms don't seal doors. The crossing is the gate, so `PUZZLE_ROLES` is unchanged, and `tide` is listed with the puzzles for the "puzzles are well formed" test.
  - `*solveTide()`, in `src/bot/bot.js`. It plans the (tile, tide) BFS above with the bot's own reach map, walks, and taps USE at the levers. `roomTasks` calls it when `room.puzzle.kind === 'tide'` and the onward door is unreached.

- [ ] **Step 1: Write the failing tests** in `tests/dungeons.test.js`

```js
// Add 'drowned' to IDS and 'tide' to PUZZLES.
test('Fane tide rooms can always be crossed', () => {
  for (const seed of SEEDS) for (const r of get('drowned', seed).rooms.filter((r) => r.puzzle?.kind === 'tide')) assert.ok(tideSolvable(r), `${seed}/${r.id}`);
});
test('the Fane is about the size of the Sanctuary and uses swamp hazards', () => {
  for (const seed of SEEDS) { const d = get('drowned', seed); assert.ok(d.rooms.length >= 15 && d.rooms.length <= 19); assert.ok(d.rooms.some((r) => r.tiles.includes(T.BOG))); }
});
test('the bot crosses a tide room', async () => {
  const s = await sandbox(); s.game.enterDungeon('drowned');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'tide');
  a.enterRoom(room.id, 's');                      // or the room's real entry dir
  const r = botDo(s, (bot) => bot.solveTide(), { maxSeconds: 90 });
  assert.ok(r.done, r.status);
});
```

Also add `'drowned'` to the list in the runtime-door-rules test.

- [ ] **Step 2: Run** `node --test tests/dungeons.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Look at it.** In the browser pane, enter the Fane from the console (`game.enterDungeon('drowned')`), walk a tide room, and screenshot both tide states.
- [ ] **Step 6: Commit** `git commit -m "The Drowned Fane dungeon and the tide-lever puzzle"`

---

### Task 13: Fourth ward world features

**Files:**
- Modify:
  - `src/world/tiles.js`: `T.FLOOD: 25` (solid), and `D.BELL: 18` (in `DECO_SOLID`);
  - `src/world/wards.js`: `WARDS` gains `'drowned'`, `RELICS.bells = 'drowned'`, and the Belfry, bells and pools are placed in `stageWardFeatures`;
  - `src/world/overworld.js`: `isPassable` passes `T.FLOOD` only with `tools.charm`; `stageContent` hands the reachability passes `charm: true`; `stageSeals` includes `drowned`;
  - `src/gfx/wards.js`: Tidewall seal art (a churning whirlpool wall), the half-sunk Belfry, the bronze bell on its island, flooded-pool water, frozen-pool ice;
  - `src/gfx/render.js`: the `FLOOD` tile;
  - `tests/overworld.test.js`.

**Interfaces:**
- Produces:
  - `W.pois.lookouts` gains `{ id: 'belfry', ward: 'drowned', x, y }`.
    - It sits in the swamp, 12+ tiles from the swamp town and 14+ from the Fane front, preferring about 22 tiles from both.
    - It is placed with the same `lookout()` candidate loop as the Windcrest.
  - `W.pois.relics.bells = [{ id, x, y, pool: [{x, y}] }]`, three of them.
    - Each bell is a `D.BELL` on a 1-tile island. A ring of `T.FLOOD` tiles 1–2 wide surrounds it, and that ring touches walkable ground on at least one side.
    - Bells sit in the swamp, are spread out with `spread()`, and stay `awayFromWards`.
  - `W.pois.seals.drowned` comes from `stageSeals`, with `arena` (Bogmaw's spot).
  - `freezePool(W, map, bellId)` and `thawPool(W, map, bellId)`, in `wards.js`. They swap the bell's pool tiles between `FLOOD` and `ICE`.

- [ ] **Step 1: Write the failing tests** in `tests/overworld.test.js`

```js
// Inside the per-seed reachability test:
const charm = { ...all, charm: true };
assert.ok(!reach(open(all), W.pois.dungeons.drowned.front) || W.pois.seals.drowned.r === 0, 'drowned reachable through its seal');
assert.ok(reach(open(charm), W.pois.dungeons.drowned.front), 'drowned unreachable');
assert.ok(reach(all, W.pois.seals.drowned.arena), 'Tidewall unreachable');
assert.ok(reach(all, W.pois.lookouts.find((l) => l.id === 'belfry')), 'belfry unreachable');
for (const b of W.pois.relics.bells) {
  const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: b.x + dx, y: b.y + dy }));
  assert.ok(!beside.some((p) => reach(all, p)), `bell ${b.id} reachable without the charm`);
  assert.ok(beside.some((p) => reach(charm, p)), `bell ${b.id} unreachable with the charm`);
}
```

Remove the old assertion that the drowned front is reachable with no tools.

- [ ] **Step 2: Run** `node --test tests/overworld.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** If a seed can't fit the Tidewall ring, use the same smaller-radius and door-seal fallback as `dune88`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass (the quest still ends at `drowned`, and the bot never goes there yet).
- [ ] **Step 5: Look at it.** In the browser pane, open the Terrain Viewer on 3 seeds and screenshot the Belfry, the bells and the Tidewall.
- [ ] **Step 6: Commit** `git commit -m "Fourth ward world: the Tidewall, the Drowned Belfry and three sunken Tide Bells"`

---

### Task 14: Fourth ward quest chain

**Files:**
- Modify:
  - `src/game/quests.js`:
    - `MAIN_STAGES`: `…, 'sanctuary', 'hearth', 'fenkeep', 'belfry', 'bells', 'bogking', 'fane', 'kindle', 'end'`. `spire` is inserted before `end` in Task 17.
    - `ELITES.bogking = { name: 'Bogmaw, the Drowned King', archetype: 'ranged', biome: 1, hp: 6 }`.
    - `advanceMain`, `stageElite`, `stageRelics`, `mainObjective`, catch-ups.
    - Giving the Rime Charm.
  - `src/game/state.js`: `tools.charm`, `progress.frozen`, `progress.rung`, `progress.tides`;
  - `src/game/talk.js`: elder lines for `hearth` and `kindle`, swamp keeper lines for `fenkeep`, and hints;
  - `src/game/areas.js`: using the charm at a pool edge (USE) calls `freezePool` and records `progress.frozen`; the bell interaction rings and records `relic` events; Bogmaw spawns at the seal arena when `bogking` is reached; frozen pools and the opened seal are re-applied when the area is entered;
  - `src/game/elites.js`: an `AURA` entry for `bogking`;
  - `src/data/wards.js`: `lookoutShots(W, 'belfry')` and `sealShots(W, 'drowned', open)`;
  - `src/data/story.js`: `hearthShots(c)` (today's `endingShots` without the chapter card) and `kindleShots(c)` (four sockets blaze, the door grinds open, "Come down, little ember.");
  - `src/gfx/cinema.js`: the arts `sockets3`, `sockets4` and `spireopen`;
  - `src/scenes/game.js`: plays `hearthShots` and `kindleShots` on those stage changes, and the `isMainTarget` keepers;
  - `src/bot/bot.js` (`SPLITS`) and `src/bot/full.js` (`mainStep` cases);
  - `tests/quests.test.js`, `tests/autoplay.test.js`.

**Interfaces:**
- Consumes: Task 13's world features and `freezePool`; Task 12's `drowned` dungeon; Task 11's Tidewarden.
- Produces:
  - **Stage events:**
    - `hearth`: `talk('elder', 'home')`.
    - `fenkeep`: `talk('keeper', 'swamp')`.
    - `belfry`: `ev.type === 'reach' && ev.id === 'belfry'`.
    - `bells`: `ev.type === 'relic' && allRelics(state, W, 'bells')`.
    - `bogking`: `sealed('drowned')`.
    - `fane`: `ev.type === 'boss' && ev.kind === 'tide'`.
    - `kindle`: `talk('elder', 'home')`.
  - **Rime Charm:** `sanctuary` (the Rime boss event) sets `tools.charm` and the `charm` artifact, and shows the toast "Received the Rime Charm!".
  - **Bot:**
    - `full.js` `mainStep`: `hearth`/`kindle` → talk to the elder; `fenkeep` → talk to the swamp keeper; `belfry` → `climbLookout`; `bells` → `gatherRelics` (which must call a new `*freezePoolAt(bell)` before walking in); `bogking` → `atSeal('drowned', 'Facing Bogmaw')`; `fane` → `runDungeon('drowned', full)`.
    - The `AVOID` and nav costs treat `FLOOD` as solid until it is frozen.

- [ ] **Step 1: Write the failing tests** in `tests/quests.test.js`

```js
test('the fourth ward chain runs from the Hearth to the kindling', () => {
  const W = generateOverworld('quests'), s = newGameState('quests', 'swordsman');
  s.quest.main = 'sanctuary';
  advanceMain(s, W, { type: 'boss', kind: 'rime' }); assert.equal(s.quest.main, 'hearth'); assert.ok(s.tools.charm);
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' }); assert.equal(s.quest.main, 'fenkeep');
  advanceMain(s, W, { type: 'talk', role: 'keeper', settlementId: 'swamp' }); assert.equal(s.quest.main, 'belfry');
  advanceMain(s, W, { type: 'reach', id: 'belfry' }); assert.equal(s.quest.main, 'bells');
  for (const b of W.pois.relics.bells) { s.progress.relics.push(`relic:${b.id}`); advanceMain(s, W, { type: 'relic', id: b.id }); }
  assert.equal(s.quest.main, 'bogking');
  s.progress.seals.push('drowned'); advanceMain(s, W, { type: 'elite', id: 'bogking' }); assert.equal(s.quest.main, 'fane');
  advanceMain(s, W, { type: 'boss', kind: 'tide' }); assert.equal(s.quest.main, 'kindle');
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' }); assert.equal(s.quest.main, 'end');
});
test('bells rung before anyone asks still count', () => {
  const W = generateOverworld('quests'), s = newGameState('quests', 'swordsman');
  s.quest.main = 'hearth';
  for (const b of W.pois.relics.bells) s.progress.relics.push(`relic:${b.id}`);
  advanceMain(s, W, { type: 'talk', role: 'elder', settlementId: 'home' });
  advanceMain(s, W, { type: 'talk', role: 'keeper', settlementId: 'swamp' });
  advanceMain(s, W, { type: 'reach', id: 'belfry' });
  assert.equal(s.quest.main, 'bogking');
});
test('fourth ward state survives save and load', async () => {
  const s = await sandbox(), g = s.game, W = g.world, bell = W.pois.relics.bells[0];
  g.exitToOverworld(W.pois.homeDoor.x, W.pois.homeDoor.y + 1, true);
  g.freezePool(bell.id); g.state.progress.rung.push(bell.id);
  g.state.progress.seals.push('drowned'); g.state.progress.tides['drowned:3'] = 'b';
  const g2 = new GameScene(s.app, deserialize(serialize(g.state))); g2.exitToOverworld(W.pois.homeDoor.x, W.pois.homeDoor.y + 1, true);
  assert.equal(g2.area.map.get(bell.pool[0].x, bell.pool[0].y), T.ICE);
  const t = W.pois.seals.drowned.tiles[0]; assert.notEqual(g2.area.map.get(t.x, t.y), T.SEAL);
  assert.deepEqual(g2.state.progress.rung, [bell.id]); assert.equal(g2.state.progress.tides['drowned:3'], 'b');
});
```

Match the event field names to the ones `advanceMain` already uses for talks and relics.
`quests.test.js:9` shows them. `exitToOverworld(tx, ty, silent)` is the existing way into the
overworld. `g.freezePool(id)` is the scene-level wrapper around `freezePool(W, map, id)` that also
records `progress.frozen`.

- [ ] **Step 2: Run** `node --test tests/quests.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, including the cutscenes, dialogue and bot steps.
- [ ] **Step 4: Run** `npm test`, which includes the autoplay test. In `tests/autoplay.test.js`, raise `maxMinutes` to 60 for any% and 120 for 100%. Expected: all pass.
- [ ] **Step 5: Sweep.** Run `node tools/sweep.mjs any` and `node tools/sweep.mjs full`. Expected: `32/32 done` for both.
- [ ] **Step 6: Commit** `git commit -m "The fourth ward chain: Rime Charm, the Belfry, the Tide Bells, Bogmaw and the Fane"`

---

### Task 15: The Spire: hub, wings and echoes

**Files:**
- Modify:
  - `src/world/dungeons.js`:
    - `DUNGEON_INFO.spire = { name: 'Emberwake Spire', biome: 3, boss: 'vesper' }`.
    - `TEMPLATES.spire` with hubs, wings and a descent; `buildGraph` supports `wing` on branches and the `inner` entry type.
    - Per-room `theme`; the `echo` and `hub` roles; `solveDungeon` handles `inner`.
    - An embed fallback for 30+ rooms.
  - `src/game/dungeon.js`:
    - The per-room renderer theme, enemy family and Gloam enemies.
    - The `echo` room spawns `Elite(id, …, { gloam: true })`, and its defeat records `progress.solved` `spire:echo:<wing>`.
    - The `inner` door is open when all 4 are recorded.
    - The hub draws four sockets that light up, counted by `DungeonArea.litSeals() → 0..4`.
    - The Spire boss room (theme `spire`) carries four `socket` objects on its rim for Vesper's arena. They are lit when the boss room is entered, and Task 17's rise drains them.
  - `src/game/elites.js`: an `opts.gloam` palette and aura.
  - `src/gfx/hud.js`: the dungeon minimap and map scale to fit.
  - `src/game/areas.js`: until Task 17, the Spire door message stays as it is (the door only opens at `spire`).
  - `src/bot/bot.js`: `roomTasks` clears the echoes and treats `inner` as locked until all wings are done.
  - `tests/dungeons.test.js`.

**Interfaces:**
- Produces:
  - **Template shape:**
    ```js
    spire: {
      main: ['entrance', 'combat', 'hub', 'hub', { role: 'combat', entry: 'inner' }, 'tide', 'beam', 'combat', 'carry', 'switches', 'combat', 'bossdoor', 'boss'],
      branches: [
        { at: 2, wing: 'verdant', roles: ['combat', 'timed', { role: 'combat', entry: 'locked' }, 'ordered', 'echo'], keyAt: 1 },
        { at: 2, wing: 'ashen', roles: [...], keyAt: … },
        { at: 3, wing: 'frost', roles: [...] },
        { at: 3, wing: 'drowned', roles: [..., 'tide', ..., 'echo'] },
      ],
    }
    ```
    - Each wing has 6–7 rooms: its ward's puzzle types, one key and lock (the key on a small side branch inside the wing), and an `echo` room at the end.
    - The total is **30–34 rooms**. Nodes on a wing carry `theme: wing`; the others carry `theme: 'spire'`.
    - `THEMES.spire` has its own hazard (`T.HAZARD` recolored violet by the renderer) and Gloam enemies.
    - In this task `beam` and `carry` use `switches` and `ordered` as stand-ins; Task 16 swaps them in.
  - `ECHO = { verdant: 'warchief', ashen: 'slagheart', frost: 'frostfang', drowned: 'bogking' }`.
  - **Door type `inner`:** `solveDungeon` treats it as passable once every `echo` room is reachable. `DungeonArea.isDoorOpen` checks `progress.solved` for `spire:echo:*` (4 entries).
  - **Embedding:**
    - If the random walk fails 2000 times, `embed` falls back to a deterministic layout: the hub column runs north, two wings branch off west and east from each hub, and the descent continues north.
    - Every room must still have ≤ 4 doors and lie at y ≤ 0.

- [ ] **Step 1: Write the failing tests** in `tests/dungeons.test.js`

```js
test('the Spire is about twice the Sanctuary, with four wings and an inner seal', () => {
  for (const seed of SEEDS) {
    const d = get('spire', seed);
    assert.ok(d.rooms.length >= 30 && d.rooms.length <= 34, `${seed}: ${d.rooms.length}`);
    assert.deepEqual(new Set(d.rooms.filter((r) => r.role === 'echo').map((r) => r.theme)), new Set(['verdant', 'ashen', 'frost', 'drowned']));
    assert.ok(d.rooms.some((r) => Object.values(r.doors).some((x) => x.type === 'inner')));
    assert.ok(solveDungeon(d).bossReachable, seed);
    for (const r of d.rooms) assert.ok(Object.keys(r.doors).length <= 4);
  }
});
test('the inner seal needs every echo', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire'); const a = s.game.area, pr = s.game.state.progress;
  const inner = a.dungeon.rooms.flatMap((r) => Object.values(r.doors)).find((d) => d.type === 'inner');
  const room = a.dungeon.rooms.find((r) => Object.values(r.doors).includes(inner));
  for (const w of ['verdant', 'ashen', 'frost']) pr.solved.push(`spire:echo:${w}`);
  assert.ok(!a.isDoorOpen(room, inner));
  pr.solved.push('spire:echo:drowned'); assert.ok(a.isDoorOpen(room, inner));
});
test('spire inner seals survive save and load', async () => {
  const s = await sandbox(); s.game.state.progress.solved.push('spire:echo:verdant', 'spire:echo:frost');
  const g2 = new GameScene(s.app, deserialize(serialize(s.game.state))); g2.enterDungeon('spire');
  assert.equal(g2.area.litSeals(), 2);                            // the hub's socket count, also used for drawing
});
```

Add `'spire'` to `IDS` (the generic per-seed tests must hold) and to the runtime-door-rules walk. That
walk counts an `echo` room as cleared when it is reached.

- [ ] **Step 2: Run** `node --test tests/dungeons.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Bot check.** In a scratch script, run `game.enterDungeon('spire')` with the boss room's boss stubbed out (Vesper doesn't exist until Task 17), then `bot.runDungeon('spire')` via `botDo`. Expected: it reaches the boss door with all four echoes beaten.
- [ ] **Step 6: Commit** `git commit -m "The Emberwake Spire: hub, four ward wings, Gloam echoes, inner seals"`

---

### Task 16: Spire puzzles: ember beam and ember carry

**Files:**
- Modify:
  - `src/world/puzzles.js`: `setupBeam`, `beamSolved`, `setupCarry`;
  - `src/world/dungeons.js`: `SETUP.beam` and `SETUP.carry`; `PUZZLE_ROLES` adds both (they seal the onward door); the Spire template uses them;
  - `src/game/puzzles.js`: the `Mirror`, `BeamSource`, `Receiver` and `Brazier` entities, `traceBeam(room, mirrors)`, and the carried flame;
  - `src/game/player.js`: `p.flame` (seconds left), drawn as a flame on the weapon hand; a roll puts it out;
  - `src/game/dungeon.js`: objects, strikes, solve;
  - `src/audio/audio.js`: `beam_turn, beam_hum, beam_lit, flame_take, flame_light, flame_out`;
  - `src/bot/bot.js`: `solveBeam()` and `solveCarry()`;
  - `tests/dungeons.test.js`.

**Interfaces:**
- Produces:
  - **Beam data:** `{ kind: 'beam', source: {x, y, dir}, receiver: {x, y}, mirrors: [{x, y, state, solution}] }`.
    - `state` and `solution` take the values `'/'` and `'\\'`, and striking a mirror toggles its state.
    - Generation lays a path of 2–4 straight runs with turns at mirrors. It adds 1–2 decoy mirrors off the path and scrambles states so at least one on-path mirror is wrong. Mirrors are solid objects.
  - `traceBeam(room, mirrorStates) → { cells: [{x, y}], hit: boolean }`. The beam stops at walls and solid tiles and reflects at mirrors.
  - **Carry data:** `{ kind: 'carry', source: {x, y}, braziers: [{x, y}], burn }`.
    - There are 3–5 braziers.
    - `burn = round((tourLength * 16 / 100 + 1.0) * 100) / 100`, where `tourLength` is the nearest-neighbour BFS walking distance from the source through every brazier.
    - Taking flame (USE at the source) sets `p.flame = burn`, and touching a dark brazier lights it.
    - The burn stops counting when `p.flame` hits 0, and a roll resets `p.flame` to 0 (`flame_out`).
    - When all are lit the room is solved. Lit braziers stay lit, but a failed run relights nothing: walk back to the source.
  - **Bot:**
    - `solvePuzzle()` dispatches `beam` to `solveBeam` and `carry` to `solveCarry`.
    - `*solveBeam()` strikes each mirror whose `state !== solution`.
    - `*solveCarry()` takes the flame, walks the nearest-neighbour tour without rolling, and retakes it if the flame goes out.

- [ ] **Step 1: Write the failing tests** in `tests/dungeons.test.js`

```js
test('beam rooms solve with their solution and are scrambled at start', () => {
  for (const seed of SEEDS) for (const r of get('spire', seed).rooms.filter((r) => r.puzzle?.kind === 'beam')) {
    const pz = r.puzzle;
    assert.ok(!traceBeam(r, pz.mirrors.map((m) => m.state)).hit, `${seed}/${r.id} starts solved`);
    assert.ok(traceBeam(r, pz.mirrors.map((m) => m.solution)).hit, `${seed}/${r.id} unsolvable`);
  }
});
test('carry rooms give enough flame for the tour', () => {
  for (const seed of SEEDS) for (const r of get('spire', seed).rooms.filter((r) => r.puzzle?.kind === 'carry')) {
    const { source, braziers, burn } = r.puzzle;
    assert.ok(braziers.length >= 3 && braziers.length <= 5);
    assert.ok(burn >= tourLength(r, source, braziers) * 16 / 100 + 0.99);   // export tourLength from src/world/puzzles.js
  }
});
test('the bot solves beam and carry rooms', async () => {
  for (const kind of ['beam', 'carry']) {
    const s = await sandbox({ seed: kind }); s.game.enterDungeon('spire');
    const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === kind); a.enterRoom(room.id, 's');
    const r = botDo(s, (bot) => bot.solvePuzzle(), { maxSeconds: 90 });
    assert.ok(r.done && s.game.state.progress.solved.includes(`spire:${room.id}`), `${kind}: ${r.status}`);
  }
});
test('a roll puts out the carried flame', async () => {
  const s = await sandbox(); s.game.enterDungeon('spire');
  const a = s.game.area, room = a.dungeon.rooms.find((r) => r.puzzle?.kind === 'carry'); a.enterRoom(room.id, 's');
  const p = s.game.player; p.flame = room.puzzle.burn;
  s.app.input.press('KeyD'); s.app.input.press('Space'); s.step(0.1);
  assert.equal(p.flame, 0);
});
```

- [ ] **Step 2: Run** `node --test tests/dungeons.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, with art: mirror pedestals that rotate, the beam as a warm light line with a glow, braziers dark and lit, and the flame on the player.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Look at it.** In the browser pane, open a beam room and a carry room. Screenshot each before and after it is solved.
- [ ] **Step 6: Commit** `git commit -m "Spire puzzles: steer the ember beam, carry the flame"`

---

### Task 17: Vesper

**Files:**
- Create: `src/game/vesper.js`, `src/gfx/art-vesper.js`, `tests/vesper.test.js`
- Modify:
  - `src/game/bosses.js`: `BOSS_INFO.vesper = { name: 'Vesper, the Unkindled', hp: 220, music: 'boss' }`; `createBoss('vesper')`;
  - `src/game/bossdeath.js`: the `rise` step: Vesper laughs, the four socket lights stream into him, and the bar refills over 1.5 s;
  - `src/gfx/bossart.js`: `BOSS_RGB.vesper = '200,160,255'`, plus entrance and omen dispatch;
  - `src/data/story.js`: `WARDENS.vesper` (intro data; no animal spirit), `vesperRiseShots()`, `vesperFallShots()`;
  - `src/gfx/cinema.js`: `portrait_vesper` and `vesperghost`;
  - `src/game/quests.js`: `MAIN_STAGES` gains `'spire'` between `kindle` and `end`; `kindle` → `spire` on talking to the elder; `spire` → `end` on `{ type: 'boss', kind: 'vesper' }`;
  - `src/game/areas.js`: the Spire door opens at `spire` and later stages;
  - `src/audio/audio.js`: `vesper_laugh, vesper_bolt, vesper_step, vesper_pillar, vesper_scythe, vesper_ring, vesper_beam, vesper_eclipse, vesper_shift, vesper_break, vesper_rise, vesper_phase, vesper_death`;
  - `src/bot/full.js`: the `spire` stage runs the dungeon;
  - `src/bot/bot.js`: target Vesper while he's borrowing (to break the form), and use the stun window;
  - `tests/quests.test.js` (the chain now ends `kindle → spire → end`) and `tests/autoplay.test.js`.

**Interfaces:**
- Consumes: `WARDEN_MOVES` (Task 6), the painter palettes (Task 6), `BossDeath` (Task 7), zones and effects.
- Produces:
  - `class Vesper extends Boss`. Its state, beyond `Boss`:
    - `phase` runs 1–3.
    - `cycle`: the 4 warden kinds, shuffled at the start of phase 3.
    - `borrowed`: a kind, or `null`.
    - `breaks`: 0–4.
    - `formHits` and `formT`.
  - **Own moves**, following the spec:
    - **Phase 1:** `drift`, `bolts` (homing projectiles), `step` (a teleport behind the player with a 0.6 s marked circle), `pillars` (circle zones), `scythe` (a cone).
    - **Phase 2:** `ring` (a growing ring with 3 gaps), `beam` (a rotating segment, `life` 2), `eclipse` (screen dim; 8 edge bolts), and Gloam summons.
  - **First bar:** at 50% HP Vesper enters phase 2 with the transform. At 0 in phase 2 he calls `ctx.game.beginBossDeath(this, { rise: true })`. The sequence ends with `maxHp = 180`, `hp = 180`, `phase = 3`, and the cycle starts.
  - **Phase 3 loop:**
    - own interlude: 6 s of own moves;
    - then `shift` (1 s, untargetable);
    - then he borrows `cycle[breaks]` and runs `WARDEN_MOVES[kind].phase1` from `first`.
    - Each `damage` while borrowing adds 1 to `formHits`. At 2 (3 on Hard; read `ctx.game.app.options.difficulty`) the form breaks:
      1. `borrowed = null`, `breaks++`;
      2. `state = 'stunned'`, `timer = 2.2`, vulnerable;
      3. `WARDEN_MOVES[kind].clear(this, ctx)`;
      4. sfx `vesper_break`.
    - When `formT ≥ 12`, the form wears off. It doesn't count as a break.
    - **HP floor:** `hp` can't drop below `[0.8, 0.6, 0.4, 0.2][breaks] * maxHp` while `breaks < 4`. With all four broken, nothing holds him up: the last fifth is his final stand.
    - `startCycle(ctx)`: shuffles `cycle` and sets `breaks = 0`, `borrowed = null`, then begins the own interlude. The rise calls it, and tests call it directly.
    - `borrowed` is set when `shift` **ends**, so every hit while `borrowed` is non-null lands.
  - **Art.** `paintVesper(g, b, L)` draws both forms in 3 views. When he's borrowing, the warden's painter is drawn with `VESPER_PALS[kind]`, and `vesperCrown(g, b)` is drawn over it.
  - **Death:** the normal `BossDeath` flow, then `vesperFallShots` (the ghost lets go), then `questEvent({ type: 'boss', kind: 'vesper' })`.

- [ ] **Step 1: Write the failing tests** in `tests/vesper.test.js`

```js
const fight = async (difficulty = 'normal') => {
  const s = await sandbox({ difficulty });
  const v = s.spawn(createBoss('vesper', s.center.x, s.center.y - 50)); v.state = 'drift';
  const hit = (n) => v.damage(n, s.game.player, s.game.area.ctx);
  return { s, v, hit };
};
test('the first bar has two phases and then he rises with a full second bar', async () => {
  const { s, v, hit } = await fight();
  hit(111); s.step(1.6); assert.equal(v.phase, 2);
  hit(9999); s.step(4.5);
  assert.equal(v.phase, 3); assert.equal(v.maxHp, 180); assert.equal(v.hp, 180); assert.ok(!v.dead);
});
test('phase 3 shows all four wardens before he can fall', async () => {
  const { s, v, hit } = await fight(); v.phase = 3; v.maxHp = v.hp = 180; v.startCycle(s.game.area.ctx);
  const borrowed = [];
  for (let i = 0; i < 4; i++) {
    hit(9999); assert.ok(v.hp >= [0.8, 0.6, 0.4, 0.2][i] * 180 - 1e-9 && !v.dead, `floor ${i}`);
    while (!v.borrowed) s.step(1 / 60);
    borrowed.push(v.borrowed); hit(1); hit(1); s.step(0.1);
    assert.equal(v.borrowed, null); assert.equal(v.breaks, i + 1);
    s.step(2.5);
  }
  assert.deepEqual(new Set(borrowed), new Set(['thornmaw', 'cinder', 'rime', 'tide']));
  hit(9999); s.step(4); assert.ok(v.dead || v.state === 'dying');
});
test('a borrowed form wears off after 12 seconds without counting as a break', async () => {
  const { s, v } = await fight(); v.phase = 3; v.maxHp = v.hp = 180; v.startCycle(s.game.area.ctx);
  while (!v.borrowed) s.step(1 / 60);
  const kind = v.borrowed; s.step(12.2);
  assert.equal(v.breaks, 0);
  while (!v.borrowed) s.step(1 / 60); assert.equal(v.borrowed, kind);
});
test('Hard needs three hits to break a form', async () => {
  const { s, v, hit } = await fight('hard'); v.phase = 3; v.maxHp = v.hp = 180; v.startCycle(s.game.area.ctx);
  while (!v.borrowed) s.step(1 / 60);
  hit(1); hit(1); assert.ok(v.borrowed);
  hit(1); assert.equal(v.borrowed, null); assert.equal(v.breaks, 1);
});
test('Vesper has his own voice', async () => { const n = await sfxDuringFight('vesper', 40); assert.ok(n.filter((x) => x.startsWith('vesper_')).length >= 5); });
```

Keep the player alive inside the sandbox loops (`s.game.state.player.hp = 99`) so the test is about
Vesper's rules.

- [ ] **Step 2: Run** `node --test tests/vesper.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the fight, the art, the rise and fall scenes, the stage, the door and the bot. In `tests/autoplay.test.js`, raise `maxMinutes` to 80 for any% and 160 for 100%.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including autoplay through Vesper.
- [ ] **Step 5: Sweep.** Run `node tools/sweep.mjs any` and `node tools/sweep.mjs full`. Expected: `32/32 done` for both. If the bot stalls against borrowed forms, fix the bot's targeting, not Vesper's rules.
- [ ] **Step 6: Look at it.** In the browser pane, open the Combat Arena (add `'vesper'` to `BOSSES`). Screenshot phases 1 and 2, the rise, each of the four borrowed forms, a break, and the fall.
- [ ] **Step 7: Commit** `git commit -m "Vesper, the Unkindled: three phases, borrowing every warden in the last"`

---

### Task 18: True ending and post-game

**Files:**
- Modify:
  - `src/data/story.js`: `endingShots(c)` is rewritten for the five beats in the spec's "true ending" section, ending with the credits card;
  - `src/gfx/cinema.js`: the arts `spiritsring`, `spark`, `healing4` and `credits` (and reuses `vesperghost`, `hearth` and `rekindle`);
  - `src/scenes/game.js`: the win screen's choices stay *Continue exploring* and *Title*;
  - `src/game/quests.js`: the `end` objective text is "The Hearth burns bright. Explore freely.";
  - `src/game/talk.js`: villager epilogue lines for `end`;
  - `src/game/dungeon.js`: after Vesper the Spire boss room is empty, with the portal active;
  - `src/bot/full.js`: the 100% route takes `spire` only when every other job is done;
  - `tests/story.test.js`, `tests/quests.test.js`.

**Interfaces:**
- Produces:
  - `endingShots({ elder }) → shots`, covering: Vesper's ghost, the spirit ring, the elder's reveal, the four regions healing in turn, and the credits.

- [ ] **Step 1: Write the failing tests**

```js
test('the true ending names all four spirits and reveals the spark', () => {
  const shots = endingShots({ elder: 'Old Maren' }), text = JSON.stringify(shots);
  for (const k of ['stag', 'phoenix', 'owl', 'whale']) assert.ok(text.includes(k), k);
  assert.match(text, /last spark/i);
  assert.ok(!/Chapter I/.test(text));
});
test('after the end the objective is peaceful', () => {
  const W = generateOverworld('quests'), s = newGameState('quests', 'swordsman'); s.quest.main = 'end';
  assert.equal(mainObjective(s, W).text, 'The Hearth burns bright. Explore freely.');
});
```

Also add `the 100% bot saves Vesper for last`. It runs `autoplay({ mode: 'full' })` and asserts that
when the `spire` split is recorded, `bot.progress().done === bot.progress().total - 1`, the main
quest being the only job left. Fold this into the existing 100% autoplay test so the game isn't run
twice.

- [ ] **Step 2: Run** `node --test tests/story.test.js tests/quests.test.js tests/autoplay.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "The true ending, and a world at peace afterwards"`

---

### Task 19: Theater, autoplay skip, README, final sweep

**Files:**
- Modify:
  - `src/scenes/theater.js`: the scene list in story order, per the spec's "How" section (hearth, Belfry vista, Tidewall, Tidewarden intro and outro, kindle, Spire entrance, Vesper intro, rise, fall, true ending);
  - `src/scenes/autoplay.js`: `skipTarget()` covers the `drowned` and `spire` dungeons and Vesper;
  - `README.md`: the intro sentence (five dungeons), the main quest list (the fourth ward chain, kindle, the Spire), bosses (two phases, four-way facing, centered deaths, the Tidewarden, Vesper), regional monster moves and effects, the new puzzles, and the Theater and Autoplay lists;
  - `tests/autoplay.test.js` (only if the skip has a unit test).

**Interfaces:**
- Consumes: every shot function from Tasks 11, 14, 17 and 18.

- [ ] **Step 1: Write the failing test**

```js
test('the Theater covers the whole story in order', async () => {
  const labels = theaterScenes(/* a world */).map((s) => s.label);   // export the list builder from theater.js
  for (const l of ['Hearth', 'Drowned Belfry', 'Tidewall', 'Tidewarden', 'Kindling', 'Spire', 'Vesper', 'Ending']) assert.ok(labels.some((x) => x.includes(l)), l);
  assert.ok(labels.findIndex((x) => x.includes('Tidewarden')) < labels.findIndex((x) => x.includes('Vesper')));
});
```

- [ ] **Step 2: Run** `node --test tests/story.test.js` (or wherever the test lives). Expected: FAIL.
- [ ] **Step 3: Implement** the Theater list, the autoplay skip and the README.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Final sweeps.** Run `node tools/sweep.mjs any` and `node tools/sweep.mjs full`. Expected: `32/32 done` for both, with every 100% run at full completion. Paste both summary tables into the commit message.
- [ ] **Step 6: Look at it.** In the browser pane at 844×390 (iPhone landscape):
  - Theater: step through the new scenes with Prev and Next.
  - Autoplay: Skip until it reaches the Fane, the Spire and Vesper, then use To the end.
  - In play: tap USE on a lever, a mirror and a brazier, and mash out of a freeze using the touch buttons.

  Check the console for errors.
- [ ] **Step 7: Commit** `git commit -m "Theater and autoplay cover the Fane, the Spire and Vesper; README"`
