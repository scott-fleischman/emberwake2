// The page half of tools/record.mjs. Plays the prologue, then the autoplay bot's run, one fixed frame
// at a time: each frame is drawn and posted back as a JPEG, and the sound, rendered offline on the
// same clock, goes back a chunk at a time.
import { makeRng } from '../src/core/rng.js';
import { AutoplayScene } from '../src/scenes/autoplay.js';
import { IntroScene } from '../src/scenes/intro.js';
import { TOUCH } from '../src/core/touch.js';

const q = new URLSearchParams(location.search);
const MODE = q.get('mode'), SEED = q.get('seed'), CLS = q.get('cls'), FPS = +q.get('fps'), MINUTES = +q.get('minutes'), PHONE = q.has('phone');
const STEP = 1 / 60, PER_FRAME = Math.round(1 / (STEP * FPS)), HOLD_END = 8, STALL = 8 * 60; // seconds

const app = await new Promise((ok) => { const wait = () => (window.emberwake ? ok(window.emberwake) : setTimeout(wait, 20)); wait(); });
Object.assign(app.options, { music: 0.5, sfx: 0.7, difficulty: 'normal', screenShake: false, zoom: 'auto' }); // as tools/autoplay.mjs plays
app.applyOptions();
app.resize();

// The game's randomness is seeded as tools/autoplay.mjs seeds it, so this is the run the tests play;
// drawing and sound roll their own dice, so they can't change it.
const fxRand = makeRng(`record/fx/${SEED}`);
Math.random = () => fxRand.next();
const asFx = (fn) => (...a) => { const r = Math.random; Math.random = () => fxRand.next(); try { return fn(...a); } finally { Math.random = r; } };
for (const k of ['sfx', 'playMusic', 'stopMusic', 'ambience', 'update']) app.audio[k] = asFx(app.audio[k].bind(app.audio));
app.render = asFx(app.render.bind(app));

// Two clocks: the game's (ms, kept as tools/autoplay.mjs keeps it) and the film's (s), which the
// sound follows.
let simMs = 0, film = 0;
Object.defineProperty(performance, 'now', { value: () => simMs, configurable: true });

let failed = null;
const inflight = new Set();
function post(path, body) {
  const p = fetch(path, { method: 'POST', body }).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); });
  inflight.add(p);
  p.then(() => inflight.delete(p), (e) => { failed = e; inflight.delete(p); });
  return p;
}
const log = (msg) => fetch('/log', { method: 'POST', body: msg });
const interleave = (b) => {
  const L = b.getChannelData(0), R = b.getChannelData(1), out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
  return out;
};
app.audio.stopMusic(); // nothing from the title screen
app.audio.startOffline({ clock: () => film, rate: +q.get('rate'), chunk: +q.get('chunk'), tail: +q.get('tail'), onChunk: (i, buf) => post(`/audio?i=${i}`, interleave(buf)) });

// The prologue first (Watch Autoplay starts its game without one), then the run.
let run = null;
app.startGame = () => {
  const rand = makeRng(`autoplay/${SEED}/${CLS}/${MODE}`);
  Math.random = () => rand.next();
  run = new AutoplayScene(app, { mode: MODE, classId: CLS, seed: SEED, movie: true });
  run.speed = 1;
  if (PHONE) phone(run);
  app.scene = run;
};
app.scene = new IntroScene(app, { classId: CLS });
app.scene.cut.hint = ''; // nobody is going to press Enter

// On a phone: the game alone, no speedrun overlay, and the touch controls on screen following the
// bot's hands: buttons light as it presses them, the stick leans the way it walks.
function phone(s) {
  TOUCH.active = app.touch.active = true;
  s.drawUI = (u) => s.game.drawUI(u);
  s.touchMode = () => s.game.touchMode();
  s.touchButtons = undefined;
  const input = s.game.input, at = {}, press = input.press.bind(input);
  input.press = (code) => { at[code] = simMs; press(code); };
  app.touch.held = (key) => input.down.has(key) || simMs - (at[key] ?? -1e9) < 150;
  const render = app.render;
  app.render = () => {
    const t = app.touch, U = t.unit(), d = (k) => (input.down.has(k) ? 1 : 0);
    const dx = d('KeyD') - d('KeyA'), dy = d('KeyS') - d('KeyW'), l = Math.hypot(dx, dy) || 1;
    const cx = t.safe.l + U * 3.2, cy = innerHeight - t.safe.b - U * 3.4;
    t.stick = dx || dy ? { cx, cy, x: cx + (dx / l) * U * 1.1, y: cy + (dy / l) * U * 1.1 } : null;
    render();
  };
}

function frame() {
  if (run) for (let k = 0; k < PER_FRAME && !run.bot.done; k++) { simMs += STEP * 1000; run.tick(); }
  else app.scene.update(1 / FPS);
  app.audio.update();
  app.render();
  app.touch.endFrame(1 / FPS);
  app.input.endFrame();
}

// What counts as getting somewhere, for the stall check: the stage, 100%'s count, the steps through a dungeon.
const mark = () => {
  if (!run) return 'prologue';
  const g = run.game, pr = g.state.progress;
  return `${g.state.quest.main}/${run.bot.progress().done}/${pr.solved.length + pr.cleared.length + Object.values(pr.visited).reduce((a, v) => a + v.length, 0)}`;
};

let f = 0, result = 'stopped', last = mark(), since = 0, doneAt = null;
const clock = () => `${Math.floor(film / 60)}:${String(Math.floor(film % 60)).padStart(2, '0')}`;
await log(`page ready: ${innerWidth}x${innerHeight}@${devicePixelRatio}x, zoom ${app.zoom.toFixed(2)}`);
try {
  for (;; f++) {
    film = f / FPS;
    frame();
    if (app.error) throw app.error;
    const i = f, blob = new Promise((ok) => app.display.toBlob(ok, 'image/jpeg', 0.92));
    const p = blob.then((b) => post(`/frame?i=${i}`, b));
    inflight.add(p);
    p.then(() => inflight.delete(p), (e) => { failed = e; inflight.delete(p); });
    while (inflight.size >= 8) await Promise.race(inflight);
    if (failed) throw failed;
    if (f % (FPS * 60) === 0) log(`  ${clock()} film | ${run ? `${run.bot.clock()} run | ${run.bot.status}${MODE === 'full' ? ` | ${run.bot.progress().done}/${run.bot.progress().total}` : ''}` : 'prologue'}`);
    const m = mark();
    if (m !== last) { last = m; since = 0; } else since += 1 / FPS;
    if (run?.bot.done && doneAt === null) { doneAt = film; result = `Run complete in ${run.bot.clock()}, ${run.game.state.stats.deaths} falls.`; log(result); }
    if (doneAt !== null && film - doneAt >= HOLD_END) break;
    if (MINUTES && film >= MINUTES * 60) { result = `Stopped at ${MINUTES} minutes as asked (${run ? run.bot.status : 'prologue'}).`; break; }
    if (run && !run.bot.done && since > STALL) { result = `STALLED at ${last}: ${run.bot.status}`; log(run.bot.log.slice(-15).join('\n')); break; }
  }
} catch (e) {
  result = `FAILED: ${e && e.stack || e}`;
  log(result);
}
await app.audio.finishOffline();
while (inflight.size) await Promise.allSettled([...inflight]);
await fetch('/done', { method: 'POST', body: JSON.stringify({ frames: f + 1, result }) });
