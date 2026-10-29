// Runs the autoplay bot over a grid of seeds and classes, one child process per run, and exits 1
// if any run stalls. Run it before and after anything that touches the main route or combat.
//   node tools/sweep.mjs [any|full] [--seeds a,b,…] [--classes mage,rogue,…]
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CLASS_ORDER } from '../src/data/classes.js';

const SEEDS = ['quests', 'ember123', 'dune88', 'fen77', 'd1', 'zz9', 'hearth', 'wake'];
const clock = (t) => `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s`;

if (process.argv[2] === '--run') {
  // Child: one autoplay run, reported to the parent over IPC.
  const [, , , mode, seed, cls] = process.argv;
  const { autoplay } = await import('./autoplay.mjs');
  const r = await autoplay({ seed, cls, mode });
  process.send({ done: r.done, time: r.time, stage: r.stage, status: r.status, deaths: r.deaths }, () => process.exit(0));
} else {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1].split(','); };
  const seeds = flag('--seeds', SEEDS), classes = flag('--classes', CLASS_ORDER);
  const mode = args[0] || 'any';
  if (!['any', 'full'].includes(mode) || classes.some((c) => !CLASS_ORDER.includes(c))) {
    console.error('usage: node tools/sweep.mjs [any|full] [--seeds a,b,…] [--classes swordsman,mage,ranger,rogue]');
    process.exit(2);
  }

  const run = (seed, cls) => new Promise((resolve) => {
    let out = null;
    const child = fork(fileURLToPath(import.meta.url), ['--run', mode, seed, cls]);
    child.on('message', (m) => { out = m; });
    child.on('exit', (code) => resolve(out || { done: false, time: 0, status: `child exited with code ${code}` }));
  });

  const jobs = seeds.flatMap((seed) => classes.map((cls) => ({ seed, cls })));
  const queue = [...jobs];
  let passed = 0;
  const worker = async () => {
    for (let job; (job = queue.shift());) {
      const r = await run(job.seed, job.cls);
      if (r.done) passed++;
      const result = r.done ? 'done' : `STALLED ${r.stage ? `at ${r.stage}: ` : ''}${r.status}`;
      console.log(`${job.seed.padEnd(10)} ${job.cls.padEnd(10)} ${clock(r.time).padStart(7)}  ${result}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cpus().length, jobs.length) }, worker));
  console.log(`${passed}/${jobs.length} done`);
  process.exit(passed === jobs.length ? 0 : 1);
}
