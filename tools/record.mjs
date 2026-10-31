// Records a run of the game to an MP4, frame by frame: the autoplay bot plays in a headless browser at
// a fixed rate (it never has to keep up with real time), every frame is drawn and sent back here as
// a JPEG, and the sound is rendered offline beside it, so picture and sound line up exactly.
//   node tools/record.mjs [--mode full|any] [--seed quests] [--class swordsman] [--minutes N]
//                         [--phone] [--fps 30] [--out movie.mp4]
// --phone films an iPhone held sideways (844x390 at 2x), zoomed in as a phone plays, with the touch
// controls on screen. --minutes stops early (counted from the start of the prologue).
// Needs ffmpeg on the PATH and Playwright (npm i -D playwright, or PLAYWRIGHT=<path to its index.mjs>).
import { createServer } from 'node:http';
import { readFile, open, rm, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return a;
}, []));
const opt = {
  mode: args.mode || 'full', seed: args.seed || 'quests', cls: args.class || 'swordsman', fps: +(args.fps || 30),
  minutes: +(args.minutes || 0), phone: !!args.phone, out: resolve(args.out || `emberwake-${args.phone ? 'phone' : args.mode || 'full'}.mp4`),
};
const view = opt.phone ? { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 810, deviceScaleFactor: 1 };
const RATE = 48000, CHUNK = 30, TAIL = 24; // the page's offline audio chunks (see AudioEngine.startOffline)
const work = join(tmpdir(), `emberwake-rec-${process.pid}`);
await mkdir(work, { recursive: true });
const videoFile = join(work, 'video.mp4'), audioFile = join(work, 'audio.f32');

// ---------------------------------------------------------------- ffmpeg: frames in, H.264 out
const ff = (argv) => spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
const exited = (p) => new Promise((ok, fail) => p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited ${c}`)))));
const enc = ff(['-f', 'image2pipe', '-framerate', String(opt.fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoFile]);
const encDone = exited(enc);

// Frames arrive a few at a time and not always in order: hold them until it's their turn.
const frames = new Map();
let nextFrame = 0;
async function pushFrame(i, buf) {
  frames.set(i, buf);
  while (frames.has(nextFrame)) {
    const b = frames.get(nextFrame);
    frames.delete(nextFrame++);
    if (!enc.stdin.write(b)) await new Promise((r) => enc.stdin.once('drain', r));
  }
}

// ---------------------------------------------------------------- sound: chunks overlap-added in order
// Chunk k starts at k * CHUNK seconds and runs TAIL seconds over; what rings past its end is added
// into the start of the next. Once chunk k is in, everything before chunk k + 1 is final.
const C = CHUNK * RATE * 2, T = TAIL * RATE * 2; // interleaved stereo samples
const audioOut = await open(audioFile, 'w');
const chunks = new Map();
let nextChunk = 0, acc = new Float32Array(C + T), writes = Promise.resolve();
const writeAudio = (f32) => { writes = writes.then(() => audioOut.write(Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength))); return writes; };
function pushChunk(i, data) {
  chunks.set(i, data);
  while (chunks.has(nextChunk)) {
    const d = chunks.get(nextChunk);
    chunks.delete(nextChunk++);
    for (let k = 0; k < Math.min(d.length, acc.length); k++) acc[k] += d[k];
    writeAudio(acc.slice(0, C));
    const rest = new Float32Array(C + T);
    rest.set(acc.subarray(C));
    acc = rest;
  }
  return writes;
}

// ---------------------------------------------------------------- the server the page talks to
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const body = (req) => new Promise((ok) => { const parts = []; req.on('data', (p) => parts.push(p)); req.on('end', () => ok(Buffer.concat(parts))); });
let finish, summary = null, lastLog = Date.now();
const finished = new Promise((r) => { finish = r; });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), q = url.searchParams;
  try {
    if (req.method === 'POST') {
      const b = await body(req);
      if (url.pathname === '/frame') await pushFrame(+q.get('i'), b);
      else if (url.pathname === '/audio') await pushChunk(+q.get('i'), new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
      else if (url.pathname === '/log') { console.log(b.toString()); lastLog = Date.now(); }
      else if (url.pathname === '/done') { summary = JSON.parse(b.toString()); finish(); }
      res.writeHead(204).end();
      return;
    }
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path);
    if (!file.startsWith(root) || path.split(/[/\\]/).some((seg) => seg.startsWith('.'))) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    console.error(req.url, e.message);
    if (!res.headersSent) res.writeHead(500).end(String(e.message));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---------------------------------------------------------------- the browser
const pw = await import(process.env.PLAYWRIGHT || 'playwright').catch(() => {
  console.error('Playwright is needed: npm i -D playwright (or set PLAYWRIGHT to its index.mjs).');
  process.exit(1);
});
// Stopped early (Ctrl+C): close everything down rather than wait on a page that's gone.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.error('\nStopped.'); enc.kill('SIGKILL'); rm(work, { recursive: true, force: true }).finally(() => process.exit(130)); });
const browser = await pw.chromium.launch({ headless: true, handleSIGINT: false, handleSIGTERM: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.deviceScaleFactor, isMobile: view.isMobile, hasTouch: view.hasTouch });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => { console.error('[page error]', e.message); });
const qs = new URLSearchParams({ mode: opt.mode, seed: opt.seed, cls: opt.cls, fps: opt.fps, minutes: opt.minutes, rate: RATE, chunk: CHUNK, tail: TAIL });
if (opt.phone) qs.set('phone', '1');
const t0 = Date.now();
console.log(`Recording ${opt.phone ? 'a phone' : 'a'} ${opt.mode === 'full' ? '100%' : 'Any%'} run (seed ${opt.seed}, ${opt.cls}) at ${view.width}x${view.height}@${view.deviceScaleFactor}x, ${opt.fps} fps...`);
await page.goto(`http://127.0.0.1:${port}/tools/record.html?${qs}`);
const watchdog = setInterval(() => { if (Date.now() - lastLog > 10 * 60 * 1000) { console.error('No word from the page in 10 minutes; giving up.'); finish(); } }, 30000);
await finished;
clearInterval(watchdog);
await browser.close();
server.close();
enc.stdin.end();
await encDone;
await writeAudio(acc); // the last chunk's ringing out
await audioOut.close();

// ---------------------------------------------------------------- picture and sound together
// The page's mix is uncompressed so its chunks add up exactly; the game's compressor is applied here,
// then the whole is brought to a steady loudness.
const film = (summary?.frames ?? nextFrame) / opt.fps;
const mux = ff(['-i', videoFile, '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', audioFile, '-map', '0:v', '-map', '1:a', '-t', film.toFixed(3),
  '-c:v', 'copy', '-af', 'acompressor=threshold=0.1:ratio=4:attack=4:release=300:knee=4:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', String(RATE), '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', opt.out]);
mux.stdin.end();
await exited(mux);
await rm(work, { recursive: true, force: true });
const m = Math.floor(film / 60), s = Math.round(film % 60);
console.log(`Wrote ${opt.out}: ${m}m${String(s).padStart(2, '0')}s of film in ${((Date.now() - t0) / 60000).toFixed(1)} minutes. ${summary ? summary.result : '(stopped early)'}`);
