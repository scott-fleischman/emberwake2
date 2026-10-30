import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, key } from '../tools/build.mjs';

test('the dist build is one self-contained page that runs from disk', () => {
  const out = mkdtempSync(join(tmpdir(), 'ew-dist-'));
  try {
    const r = build(out);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.ok(!html.includes('src="src/'), 'still loads module files from disk');
    assert.match(html, new RegExp(`<script type="module">import '${key('src/main.js')}';</script>`));
    const { imports } = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]);
    assert.equal(Object.keys(imports).length, r.modules);
    for (const path of ['src/main.js', 'src/game/vesper.js', 'src/scenes/theater.js']) assert.ok(imports[key(path)], path);
    // Every import in every embedded module resolves through the map; none is left relative.
    for (const [k, url] of Object.entries(imports)) {
      const src = Buffer.from(url.replace('data:text/javascript;base64,', ''), 'base64').toString('utf8');
      assert.doesNotMatch(src, /\b(?:from|import)\s*['"]\.{1,2}\//, `${k} has a relative import`);
      for (const [, spec] of src.matchAll(/\b(?:from|import)\s*['"](@ew\/[^'"]+)['"]/g)) assert.ok(imports[spec], `${k} imports unmapped ${spec}`);
    }
    const readme = readFileSync(join(out, 'README.txt'), 'utf8');
    assert.match(readme, /double-click index\.html/);
    assert.doesNotMatch(readme, /[^\r]\n/, 'README.txt needs Windows line endings');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
