import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox } from './helpers/sandbox.js';
import { EFFECTS, CONTROL_IMMUNITY, applyEffect, tickEffects, shakeEffects, clearEffects, moveMult, blocked } from '../src/game/effects.js';
import { makeZone } from '../src/game/zones.js';
import { Chest } from '../src/game/entities.js';
import { drawEffectIcons, drawEffectChips, drawBlind, drawPatch } from '../src/gfx/effects.js';
import { AudioEngine, SFX_NAMES } from '../src/audio/audio.js';
import { Bot } from '../src/bot/bot.js';

const P = () => ({ effects: {}, controlImmune: 0 });
const KINDS = Object.keys(EFFECTS);

test('effects last about five seconds and Story halves them', () => {
  const p = P(); applyEffect(p, 'burn'); assert.equal(p.effects.burn.t, 5);
  const q = P(); applyEffect(q, 'burn', { story: true }); assert.equal(q.effects.burn.t, 2.5);
});
test('the seven effects carry the designed numbers', () => {
  assert.deepEqual(KINDS, ['snare', 'poison', 'mud', 'blind', 'chill', 'freeze', 'burn']);
  assert.equal(EFFECTS.freeze.need, 6); assert.equal(EFFECTS.snare.need, 3);
  assert.equal(EFFECTS.poison.tick, 1.5); assert.equal(EFFECTS.burn.tick, 1);
  assert.equal(EFFECTS.chill.speed, 0.7); assert.equal(EFFECTS.mud.speed, 0.5);
  assert.equal(CONTROL_IMMUNITY, 3);
  assert.equal(applyEffect(P(), 'nonsense'), false);
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
test('a chill that cannot harden into a freeze stays a chill', () => {
  const p = P(); applyEffect(p, 'chill'); p.controlImmune = 2;
  assert.equal(applyEffect(p, 'chill'), false);
  assert.ok(p.effects.chill); assert.ok(!p.effects.freeze);
});
test('shaking off: six presses break freeze, a roll puts out burn, three attacks tear free of snare', () => {
  const p = P(); applyEffect(p, 'freeze');
  for (let i = 0; i < 5; i++) shakeEffects(p, 'press'); assert.ok(p.effects.freeze);
  shakeEffects(p, 'press'); assert.ok(!p.effects.freeze);
  const q = P(); applyEffect(q, 'burn'); assert.deepEqual(shakeEffects(q, 'roll'), ['burn']);
  const r = P(); applyEffect(r, 'snare'); shakeEffects(r, 'attack'); shakeEffects(r, 'attack'); assert.ok(r.effects.snare);
  shakeEffects(r, 'attack'); assert.ok(!r.effects.snare);
});
test('only the matching action shakes an effect off, and blind and chill never shake off', () => {
  const p = P();
  for (const k of KINDS) applyEffect(p, k);
  assert.deepEqual(shakeEffects(p, 'eat'), ['poison']);
  assert.deepEqual(shakeEffects(p, 'roll').sort(), ['burn', 'mud']);
  assert.deepEqual(Object.keys(p.effects).sort(), ['blind', 'chill', 'freeze', 'snare']);
});
test('Story freeze breaks on one press', () => {
  const p = P(); applyEffect(p, 'freeze', { story: true });
  assert.deepEqual(shakeEffects(p, 'press'), ['freeze']);
});
test('breaking free grants the same immunity as waiting it out', () => {
  const p = P(); applyEffect(p, 'freeze', { story: true }); shakeEffects(p, 'press');
  assert.equal(p.controlImmune, CONTROL_IMMUNITY);
  assert.equal(applyEffect(p, 'snare'), false);
});
test('applying an effect again refreshes the clock but keeps the progress', () => {
  const p = P(); applyEffect(p, 'freeze');
  for (let i = 0; i < 3; i++) shakeEffects(p, 'press');
  p.effects.freeze.t = 1;
  applyEffect(p, 'freeze');
  assert.equal(p.effects.freeze.t, 5); assert.equal(p.effects.freeze.n, 3);
  for (let i = 0; i < 2; i++) shakeEffects(p, 'press'); assert.ok(p.effects.freeze);
  shakeEffects(p, 'press'); assert.ok(!p.effects.freeze);
});
test('damage over time ticks on schedule and effects blocking and slowing read from the table', () => {
  const p = P(); applyEffect(p, 'burn');
  let hp = 0; for (let i = 0; i < 150; i++) hp += tickEffects(p, 1 / 60);
  assert.equal(hp, 2); // burn ticks every second: two by 2.5 s
  const q = P(); applyEffect(q, 'poison');
  hp = 0; for (let i = 0; i < 200; i++) hp += tickEffects(q, 1 / 60);
  assert.equal(hp, 2); // poison ticks every 1.5 s: two by 3.33 s
  const r = P(); applyEffect(r, 'snare');
  assert.ok(blocked(r, 'move') && blocked(r, 'roll') && !blocked(r, 'attack') && !blocked(r, 'all'));
  applyEffect(r, 'freeze');
  assert.ok(blocked(r, 'all') && blocked(r, 'attack'));
  const s = P(); applyEffect(s, 'mud'); applyEffect(s, 'chill');
  assert.ok(Math.abs(moveMult(s) - 0.35) < 1e-9);
  clearEffects(s); assert.equal(moveMult(s), 1);
});
test('poison stops at half a heart', async () => {
  const s = await sandbox(); s.game.state.player.hp = 2;
  s.game.applyEffect('poison'); s.step(5.5);
  assert.equal(s.game.state.player.hp, 1);
});
test('a burning player can still die', async () => {
  const s = await sandbox(); s.game.state.player.hp = 1;
  s.game.applyEffect('burn'); s.step(1.5);
  assert.equal(s.game.player.mode, 'dead');
  assert.deepEqual(s.game.player.effects, {});
});
test('damage over time is scaled by the difficulty', async () => {
  const s = await sandbox({ difficulty: 'story' }), hp0 = s.game.state.player.hp;
  s.game.applyEffect('burn'); s.step(4);
  assert.ok(Math.abs(hp0 - s.game.state.player.hp - 0.5) < 1e-9); // Story: 2.5 s burn, two ticks of a quarter
});
test('frozen players cannot move, snared players cannot roll, mud halves speed', async () => {
  const s = await sandbox(), p = s.game.player, x0 = p.x;
  s.game.applyEffect('freeze'); s.app.input.press('KeyD'); s.step(0.5); assert.equal(p.x, x0);
  s.app.input.release('KeyD'); clearEffects(p);
  s.game.applyEffect('snare'); s.app.input.press('Space'); s.step(0.1); assert.notEqual(p.mode, 'dodge');
  s.app.input.release('Space'); clearEffects(p);
  s.game.applyEffect('mud'); assert.equal(moveMult(p), 0.5);
});
test('snared players cannot walk but can still turn', async () => {
  const s = await sandbox(), p = s.game.player, x0 = p.x;
  s.game.applyEffect('snare'); s.app.input.press('KeyD'); s.step(0.5);
  assert.equal(p.x, x0); assert.equal(p.facing, 'right'); assert.equal(p.aim, 0);
});
test('mud slows the walk by half', async () => {
  const s = await sandbox(), p = s.game.player;
  s.app.input.press('KeyD'); const x0 = p.x; s.step(0.3); const free = p.x - x0;
  s.app.input.release('KeyD'); s.step(0.2); p.x = x0;
  s.game.applyEffect('mud'); s.app.input.press('KeyD'); s.step(0.3);
  assert.ok(Math.abs((p.x - x0) / free - 0.5) < 0.08, `${(p.x - x0) / free}`);
});
test('mashing any button thaws a frozen player, and a thaw is not instant', async () => {
  const s = await sandbox(), p = s.game.player;
  s.game.applyEffect('freeze');
  for (let i = 0; i < 5; i++) { s.app.input.press('KeyJ'); s.step(1 / 60); s.app.input.release('KeyJ'); s.step(1 / 60); }
  assert.ok(p.effects.freeze);
  s.app.input.press('KeyK'); s.step(1 / 60);
  assert.ok(!p.effects.freeze);
});
test('a frozen player cannot interact, and the press counts toward the mash', async () => {
  const s = await sandbox(), p = s.game.player;
  const chest = s.spawn(new Chest('frozen-chest', p.x + 8, p.y, 'coins'));
  s.game.applyEffect('freeze');
  s.app.input.press('KeyE'); s.step(1 / 60); s.app.input.release('KeyE');
  assert.equal(s.game.uiStack.length, 0); assert.ok(!chest.opened);
  assert.equal(p.effects.freeze.n, 1);
  clearEffects(p);
  s.app.input.press('KeyE'); s.step(1 / 60);
  assert.ok(chest.opened); assert.equal(s.game.uiStack.length, 1);
});
test('a roll puts out burn and swings tear a snare', async () => {
  const s = await sandbox(), p = s.game.player;
  s.game.applyEffect('burn'); s.app.input.press('Space'); s.step(0.1); s.app.input.release('Space');
  assert.ok(!p.effects.burn);
  s.step(0.5); // let the roll end
  s.game.applyEffect('snare');
  for (let i = 0; i < 3; i++) { assert.ok(p.effects.snare); s.app.input.press('KeyJ'); s.step(1 / 60); s.app.input.release('KeyJ'); s.step(0.6); }
  assert.ok(!p.effects.snare);
});
test('eating cures poison, but only when a ration is actually eaten', async () => {
  const s = await sandbox(), p = s.game.player, res = s.game.state.player;
  s.game.applyEffect('poison');
  res.hp = s.game.derived.maxHp; res.food = 2; // not hungry yet
  s.app.input.press('KeyF'); s.step(1 / 60); s.app.input.release('KeyF');
  assert.ok(p.effects.poison); assert.equal(res.food, 2);
  res.hp = 4;
  s.app.input.press('KeyF'); s.step(1 / 60); s.app.input.release('KeyF');
  assert.ok(!p.effects.poison); assert.equal(res.food, 1);
});
test('effects clear on death, area change and cutscenes', async () => {
  const s = await sandbox();
  s.game.applyEffect('freeze'); s.game.playCutscene([{ text: 'x', hold: 0.1 }], {}); assert.deepEqual(s.game.player.effects, {});
  s.game.applyEffect('snare'); s.game.enterDungeon('verdant'); assert.deepEqual(s.game.player.effects, {});
  s.game.applyEffect('burn'); s.game.die(); assert.deepEqual(s.game.player.effects, {});
});
test('effects clear when a boss starts to die', async () => {
  const { createBoss } = await import('../src/game/bosses.js');
  const s = await sandbox(), boss = createBoss('thornmaw', s.center.x, s.center.y - 60, 1);
  s.area.boss = boss; s.spawn(boss); boss.state = 'stalk';
  s.game.applyEffect('freeze');
  boss.damage(9999, s.game.player, s.area.ctx);
  assert.equal(boss.state, 'dying'); assert.deepEqual(s.game.player.effects, {});
});
test('the arena revive clears effects too', async () => {
  const { makeApp } = await import('../tools/headless.mjs');
  const { ArenaScene } = await import('../src/scenes/arena.js');
  const arena = new ArenaScene(await makeApp());
  arena.applyEffect('burn'); arena.die();
  assert.deepEqual(arena.player.effects, {});
});
test('blocked and dodged hits apply no effect', async () => {
  const s = await sandbox(), p = s.game.player;
  s.game.state.gear.shield = 'buckler';
  p.shielding = true; p.aim = 0;
  s.game.damagePlayer(1, { x: p.x + 20, y: p.y }, { effect: 'snare' });
  assert.ok(!p.effects.snare);
  p.shielding = false; p.mode = 'dodge'; p.iframes = 0.3;
  s.game.damagePlayer(1, { x: p.x + 20, y: p.y }, { effect: 'burn' });
  assert.ok(!p.effects.burn);
});
test('a landed hit applies its effect, and it ends the effect with the player', async () => {
  const s = await sandbox(), p = s.game.player;
  assert.equal(s.game.damagePlayer(1, { x: p.x + 20, y: p.y }, { effect: 'poison' }), 'hit');
  assert.ok(p.effects.poison);
  p.iframes = 0; s.game.state.player.hp = 1;
  s.game.damagePlayer(1, { x: p.x + 20, y: p.y }, { effect: 'snare' });
  assert.equal(p.mode, 'dead'); assert.ok(!p.effects.snare);
});
test('a freeze that hits while the player is control-immune is refused', async () => {
  const s = await sandbox(), p = s.game.player;
  p.controlImmune = 2;
  assert.equal(s.game.applyEffect('freeze'), false);
  assert.ok(!p.effects.freeze);
});
test('standing in a ground patch keeps its effect fresh until the patch ends', async () => {
  const s = await sandbox(), p = s.game.player;
  s.area.zones.push(makeZone('circle', { ...s.center, r: 30, t: 0, life: 9, dmg: 0, effect: 'mud', art: 'mud' }));
  s.step(7.5); // the mud lasts five seconds on its own
  assert.ok(p.effects.mud); assert.ok(p.effects.mud.t > 3.9, `${p.effects.mud.t}`);
  s.step(2); assert.equal(s.area.zones.length, 0);
  s.step(5.5); assert.ok(!p.effects.mud);
});
test('the blind vignette closes in while blind and opens with the effect', async () => {
  const s = await sandbox();
  s.game.applyEffect('blind'); s.step(0.6);
  assert.ok(s.game.blindK > 0.99);
  clearEffects(s.game.player); s.step(0.6);
  assert.equal(s.game.blindK, 0);
  s.game.applyEffect('blind'); s.step(0.6); s.game.clearEffects();
  assert.equal(s.game.blindK, 0);
});
test('every effect has its own sound', () => {
  const engine = new AudioEngine(), calls = [];
  engine.ctx = { currentTime: 0 };
  for (const k of ['tone', 'noise']) engine[k] = (t, o) => calls.push([k, t, o]);
  const recipe = (name) => { calls.length = 0; engine._last = {}; engine.sfx(name); return JSON.stringify(calls); };
  const names = [...KINDS.map((k) => EFFECTS[k].sfx), 'fx_break'];
  for (const n of names) { assert.ok(SFX_NAMES.includes(n), n); assert.ok(recipe(n).length > 2, `${n} makes no sound`); }
  const recipes = names.map(recipe);
  assert.equal(new Set(recipes).size, names.length);
});

// ---------------------------------------------------------------- the bot
const idleBot = (s) => { const bot = new Bot(s.game, 'any'); bot.task = (function* () { for (;;) yield; })(); return bot; };
const run = (s, bot, frames, until) => { for (let i = 0; i < frames && !until(); i++) { bot.step(1 / 60); s.game.update(1 / 60); s.app.input.endFrame(); } };

test('the bot mashes out of a freeze long before it would thaw', async () => {
  const s = await sandbox(), p = s.game.player;
  s.game.applyEffect('freeze');
  run(s, idleBot(s), 90, () => !p.effects.freeze);
  assert.ok(!p.effects.freeze);
});
test('the bot rolls out of a fire and swings free of a snare', async () => {
  const s = await sandbox(), p = s.game.player, bot = idleBot(s);
  s.game.applyEffect('burn');
  run(s, bot, 60, () => !p.effects.burn);
  assert.ok(!p.effects.burn);
  run(s, bot, 60, () => false); // let the roll end
  s.game.applyEffect('snare');
  run(s, bot, 240, () => !p.effects.snare);
  assert.ok(!p.effects.snare);
});
test('the bot eats a ration when poison has it below half health', async () => {
  const s = await sandbox(), p = s.game.player, res = s.game.state.player;
  res.food = 2; res.hp = s.game.derived.maxHp;
  s.game.applyEffect('poison');
  run(s, idleBot(s), 120, () => false);
  assert.ok(p.effects.poison); assert.equal(res.food, 2); // healthy: leaves it be
  res.hp = s.game.derived.maxHp * 0.4;
  run(s, idleBot(s), 30, () => !p.effects.poison);
  assert.ok(!p.effects.poison); assert.equal(res.food, 1);
});

// ---------------------------------------------------------------- drawing
const recorder = () => {
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; return true; } });
  return { g, calls };
};
const noRandom = (fn) => {
  const rnd = Math.random;
  Math.random = () => { throw new Error('drawing used Math.random'); };
  try { fn(); } finally { Math.random = rnd; }
};
test('icons and chips draw for every effect without randomness', () => {
  const p = P(); for (const k of KINDS) applyEffect(p, k);
  const { g, calls } = recorder();
  noRandom(() => { drawEffectIcons(g, { ...p, x: 100, y: 100 }, { left: 0, top: 0 }, 1.7); drawEffectChips(g, p, 6, 25); });
  assert.ok(calls.filter((c) => c[0] === 'fillRect').length > 100);
  const none = recorder();
  drawEffectIcons(none.g, { ...P(), x: 1, y: 1 }, { left: 0, top: 0 }, 0); drawEffectChips(none.g, P(), 6, 25);
  assert.equal(none.calls.length, 0);
});
test('the blind vignette runs from 120 px wide open to 28 px', () => {
  const clear = (k) => {
    const { g, calls } = recorder();
    noRandom(() => drawBlind(g, { x: 100, y: 80 }, { left: 20, top: 10 }, k));
    const arcs = calls.filter((c) => c[0] === 'arc');
    assert.ok(arcs.every((c) => c[1] === 80 && c[2] === 70)); // centred on the player on screen
    return Math.min(...arcs.map((c) => c[3]));
  };
  assert.equal(clear(0), 120); assert.equal(clear(1), 28);
  const { g, calls } = recorder(); drawBlind(g, { x: 0, y: 0 }, { left: 0, top: 0 }, 0.5);
  assert.ok(calls.some((c) => c[0] === 'fill'));
});
test('every patch art draws on every shape, deterministically', () => {
  const arts = ['thorns', 'roots', 'mud', 'poison', 'dust', 'fire', 'fissure', 'frost'];
  const shapes = [
    { shape: 'circle', x: 60, y: 60, r: 24 }, { shape: 'segment', x1: 20, y1: 20, x2: 120, y2: 50, w: 12 },
    { shape: 'ring', x: 60, y: 60, r: 30, width: 8, gaps: [] }, { shape: 'cone', x: 60, y: 60, a: 0.4, spread: 0.6, r: 40 },
  ];
  for (const art of arts) for (const sh of shapes) {
    const z = makeZone(sh.shape, { ...sh, art, t: -1, life: 5 });
    const a = recorder(), b = recorder();
    noRandom(() => { drawPatch(a.g, z, { left: 0, top: 0 }, 2.2); drawPatch(b.g, z, { left: 0, top: 0 }, 2.2); });
    assert.ok(a.calls.length > 8, `${art} on a ${sh.shape} drew nothing`);
    assert.deepEqual(a.calls, b.calls);
  }
  const z = makeZone('circle', { x: 0, y: 0, r: 10, art: 'nonsense', t: -1, life: 5 }), r = recorder();
  drawPatch(r.g, z, { left: 0, top: 0 }, 0);
  assert.equal(r.calls.length, 0);
});
test('a patch fades in as it lands and out as it expires', () => {
  const alphaOf = (t) => {
    const z = makeZone('circle', { x: 0, y: 0, r: 10, art: 'mud', t, life: 4 }), r = recorder();
    drawPatch(r.g, z, { left: 0, top: 0 }, 0);
    return r.g.globalAlpha;
  };
  assert.ok(alphaOf(-0.02) < 0.2);
  assert.equal(alphaOf(-2), 1);
  assert.ok(alphaOf(-3.9) < 0.3);
});
