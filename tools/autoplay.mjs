// Headless autoplay: runs the bot through a whole seed in Node and prints speedrun splits.
//   node tools/autoplay.mjs [seed] [class] [any|full] [difficulty]
import { makeApp } from './headless.mjs';

export async function autoplay({ seed = 'ember123', cls = 'swordsman', mode = 'any', difficulty = 'normal', maxMinutes = 90, verbose = false, dt = 1 / 60 } = {}) {
  const app = await makeApp({ difficulty });
  // Seed Math.random too, so a run (enemy AI, loot) is reproducible.
  const { makeRng } = await import('../src/core/rng.js');
  const rand = makeRng(`autoplay/${seed}/${cls}/${mode}`);
  Math.random = () => rand.next();
  let simMs = 0;
  const realPerf = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => simMs }, configurable: true, writable: true });
  const { GameScene } = await import('../src/scenes/game.js');
  const { newGameState } = await import('../src/game/state.js');
  const { Bot } = await import('../src/bot/bot.js');
  const game = new GameScene(app, newGameState(seed, cls));
  game.saveGame = () => true;
  const bot = new Bot(game, mode);
  let stage = game.state.quest.main, since = 0, lastLog = 0;
  // Progress, for the stall check: the stage, 100%'s count, and the steps through a dungeon (a long one,
  // like the Spire, is all one stage and counts nothing toward 100% until its end).
  const pr = game.state.progress, steps = () => pr.solved.length + pr.cleared.length + Object.values(pr.visited).reduce((a, v) => a + v.length, 0);
  const frames = Math.round((maxMinutes * 60) / dt);
  for (let f = 0; f < frames && !bot.done; f++) {
    simMs += dt * 1000;
    bot.step(dt);
    game.update(dt);
    app.input.endFrame();
    const mark = f % 60 === 0 ? `${game.state.quest.main}/${mode === 'full' ? `${bot.progress().done}/` : ''}${steps()}` : stage;
    if (mark !== stage) { stage = mark; since = 0; } else since += dt;
    if (verbose && bot.time - lastLog > 30) { lastLog = bot.time; console.log(`  ${bot.clock()} ${stage} | ${game.area.kind}${game.area.id ? ':' + game.area.id : ''} | ${bot.status} | hp ${game.state.player.hp.toFixed(1)}`); }
    if (since > 8 * 60) break;
  }
  Object.defineProperty(globalThis, 'performance', { value: realPerf, configurable: true, writable: true });
  return { done: bot.done, time: bot.time, splits: bot.splits, stage: game.state.quest.main + (mode === 'full' ? ` ${bot.progress().done}/${bot.progress().total}` : ''), status: bot.status, deaths: game.state.stats.deaths, log: bot.log, game, bot };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [seed, cls, mode, difficulty] = process.argv.slice(2);
  const t0 = Date.now();
  const r = await autoplay({ seed, cls, mode, difficulty, verbose: true });
  for (const s of r.splits) console.log(`${String(Math.floor(s.t / 60)).padStart(2)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}  ${s.label}`);
  const a = r.game.area;
  const pct = mode === 'full' ? (() => { const p = r.bot.progress(); return ` (${p.done}/${p.total})`; })() : '';
  console.log(r.done ? `FINISHED in ${Math.floor(r.time / 60)}m${Math.floor(r.time % 60)}s, ${r.deaths} falls${pct}` : `STALLED at ${r.stage} (${a.kind}${a.id ? ':' + a.id : ''}${a.room ? ' room ' + a.roomId + ' ' + a.room.role : ''}), ${r.deaths} falls: ${r.status}`);
  if (mode === 'full') { const pr = r.bot.progress(); console.log(`100% progress: ${pr.done}/${pr.total}`, r.bot.missing().join(' | ')); }
  if (!r.done) console.log(r.log.slice(-25).join('\n'));
  console.log(`(simulated in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
