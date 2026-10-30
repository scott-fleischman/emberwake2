// Builds dist/: a folder you can copy anywhere (a Windows PC, a USB stick) and play by double-clicking
// index.html, with no server, install or internet connection.
// Browsers refuse to load module files into a page opened from disk, so every module is embedded in the
// page as a data: URL and an import map points each import at its embedded copy. The code itself runs
// unchanged, with the same live bindings and module order as on the web.
//   node tools/build.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';
const TAG = `<script type="module" src="${ENTRY}"></script>`;
const SPEC = /(\b(?:from|import)\s*)(['"])(\.{1,2}\/[^'"]+)\2/g; // every relative import/export specifier
export const key = (path) => `@ew/${path}`;

const README = `Emberwake
=========

To play, double-click index.html. It opens in your web browser and runs entirely
from this folder: nothing to install, no internet connection needed.

- Use a recent Edge, Chrome or Firefox (2023 or later).
- Sound starts after your first click or key press.
- Press F11 for full screen.
- Saves are kept by the browser you play in, so keep using the same one.
- Move with WASD or the arrow keys. J attacks, K uses your item, L raises your
  shield, Space dodges, E talks and interacts, M opens the map, Esc pauses.
  The full list is under Controls on the title screen.
`;

// Every module reachable from the entry, with its relative specifiers rewritten to import-map keys.
export function bundle(entry = ENTRY) {
  const mods = new Map();
  const visit = (path) => {
    if (mods.has(path)) return;
    mods.set(path, null); // claim it first so import cycles terminate
    const src = readFileSync(join(ROOT, path), 'utf8').replace(SPEC, (m, kw, q, rel) => {
      const dep = posix.normalize(posix.join(posix.dirname(path), rel));
      visit(dep);
      return `${kw}${q}${key(dep)}${q}`;
    });
    mods.set(path, src);
  };
  visit(entry);
  return mods;
}

export function build(out = join(ROOT, 'dist')) {
  const mods = bundle();
  const imports = {};
  for (const [path, src] of mods) imports[key(path)] = `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
  const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
  if (!page.includes(TAG)) throw new Error(`index.html no longer loads the game with ${TAG}`);
  const html = page.replace(TAG, [
    `<script type="importmap">${JSON.stringify({ imports })}</script>`,
    `  <script type="module">import '${key(ENTRY)}';</script>`,
    // Too old for import maps: say so rather than sitting on the loading text forever.
    `  <script>setTimeout(() => { const l = document.getElementById('loading'); if (l) l.textContent = 'Emberwake needs a recent Edge, Chrome or Firefox.'; }, 5000);</script>`,
  ].join('\n'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), html);
  writeFileSync(join(out, 'README.txt'), README.replace(/\n/g, '\r\n')); // Notepad-friendly line endings
  return { out, modules: mods.size, bytes: Buffer.byteLength(html) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = build(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`Built ${r.out}: ${r.modules} modules in one ${(r.bytes / 1024).toFixed(0)} KB index.html`);
}
