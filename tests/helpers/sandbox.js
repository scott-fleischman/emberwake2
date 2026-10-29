// A one-room combat sandbox for tests: the real GameScene with its area swapped for the open arena,
// so enemies, bosses and the bot can be exercised without walking through a world first.
import { makeApp } from '../../tools/headless.mjs';
import { makeRng } from '../../src/core/rng.js';
import { Bot } from '../../src/bot/bot.js';

export async function sandbox({ cls = 'swordsman', seed = 'sandbox', difficulty = 'normal' } = {}) {
  const app = await makeApp({ difficulty });
  const rand = makeRng(`sandbox/${seed}`);
  Math.random = () => rand.next();
  const { GameScene } = await import('../../src/scenes/game.js');
  const { ArenaArea } = await import('../../src/scenes/arena.js');
  const { newGameState } = await import('../../src/game/state.js');
  const game = new GameScene(app, newGameState(seed, cls));
  game.saveGame = () => true;
  // ArenaArea reports kills to ArenaScene's log and stats; a plain GameScene has neither.
  game.log = () => {};
  game.stats = { kills: 0, ttk: {} };
  const area = new ArenaArea(game);
  game.setArea(area);
  const center = { x: area.map.pixelW / 2, y: area.map.pixelH / 2 };
  game.placePlayer(center.x, center.y);
  const step = (seconds, dt = 1 / 60) => {
    for (let t = 0; t < seconds; t += dt) { game.update(dt); app.input.endFrame(); }
  };
  const spawn = (e) => (e.team === 'enemy' ? area.spawnEnemy(e) : area.spawn(e));
  return { app, game, area, step, spawn, center };
}

// Runs a bot task until it finishes or maxSeconds of game time pass. The bot replaces a finished
// task with its route on the next frame, so the wrapper records completion itself.
export function botDo(s, makeTask, { maxSeconds = 120 } = {}) {
  const bot = new Bot(s.game, 'any'), dt = 1 / 60;
  let done = false;
  const task = makeTask(bot);
  bot.task = (function* () { yield* task; done = true; })();
  for (let t = 0; t < maxSeconds && !done; t += dt) {
    bot.step(dt);
    s.game.update(dt);
    s.app.input.endFrame();
  }
  return { done, status: bot.status };
}
