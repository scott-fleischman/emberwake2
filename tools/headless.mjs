// Runs the real game simulation in Node with no browser: canvas calls become no-ops and audio is
// silent. Used by the autoplay runner and tests to prove a seed can be beaten.

function fakeContext() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 4 });
      if (k === 'getImageData' || k === 'createImageData') return (a, b, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, (typeof a === 'number' && b === undefined ? a : w) * h) * 4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export function installHeadless() {
  if (globalThis.document) return;
  const canvas = () => ({ width: 1, height: 1, style: {}, getContext: () => fakeContext() });
  globalThis.document = { createElement: () => canvas(), addEventListener() {}, getElementById: () => null, hidden: false };
  globalThis.window = globalThis;
}

export const silentAudio = { sfx() {}, playMusic(k) { this.cur = { key: k }; }, stopMusic() {}, update() {}, init() {}, setMusicVolume() {}, setSfxVolume() {} };

// A minimal App stand-in that GameScene accepts.
export async function makeApp(options = {}) {
  installHeadless();
  const { Input } = await import('../src/core/input.js');
  const { SaveStore } = await import('../src/game/state.js');
  const app = {
    input: new Input(),
    audio: silentAudio,
    store: new SaveStore(undefined),
    options: { music: 0, sfx: 0, difficulty: 'normal', screenShake: false, ...options },
    optionsMenu() { return { update() {}, draw() {}, done: true }; },
    toTitle() { this.titled = true; },
  };
  return app;
}
