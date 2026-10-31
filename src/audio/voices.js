// Voices, creature cries and ambience beds for the audio engine (audio.js). Recipes here only call the
// engine's primitives (tone, noise, notes, syllable), so they stay plain data and logic, no WebAudio.

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Whether a creature cries out, and how: sounds roll their own dice, so the game's randomness
// (seeded in tests and autoplay) runs the same with sound or without.
let dice = 0x9e3779b9;
export function roll() {
  dice = (dice + 0x6d2b79f5) >>> 0;
  let t = dice;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- people
// A spoken voice is babble: one syllable per few letters typed, a buzzy source through two vowel
// formants. f: pitch (Hz); form: formant scale (smaller is bigger, darker); slow: letters per
// syllable, relative; breath, growl: noise mixed in; sub: an octave below underneath; kind: a
// recipe other than talk (the spirits, the Ember).
export const VOICES = {
  man: { f: 118, form: 0.96 },
  woman: { f: 205, form: 1.12, gain: 1.3 },
  kid: { f: 285, form: 1.25, type: 'triangle' },
  elder: { f: 104, form: 0.92, slow: 1.25, breath: 0.25, wobble: 0.05 },
  crone: { f: 178, form: 1.05, slow: 1.2, breath: 0.3, wobble: 0.06 },
  ember: { kind: 'chime', f: 523 },
  unkindled: { f: 64, form: 0.82, slow: 1.4, growl: 0.45, breath: 0.35, sub: true },
  ghost: { f: 160, form: 1.02, slow: 1.3, breath: 0.9, type: 'triangle', gain: 2.6 },
  spirit_stag: { kind: 'hum', f: 98, slow: 1.3 },
  spirit_phoenix: { kind: 'chirp', f: 1500 },
  spirit_owl: { kind: 'hoot', f: 392, slow: 1.4 },
  spirit_whale: { kind: 'song', f: 196, slow: 2 },
  warden_thornmaw: { f: 74, form: 0.78, growl: 0.9, slow: 1.4, sub: true, gain: 1.8 },
  warden_cinder: { f: 88, form: 0.84, growl: 0.7, breath: 0.5, slow: 1.3, sub: true, gain: 1.8 },
  warden_rime: { f: 330, form: 1.2, growl: 0.25, breath: 0.6, slow: 1.3, type: 'triangle', gain: 2 },
  warden_tide: { f: 66, form: 0.76, growl: 0.5, slow: 1.6, sub: true, wobble: 0.08, gain: 1.8 },
};

// Feminine given names (see data/names.js); everyone else speaks lower.
const HER = new Set(['Maren', 'Ilsa', 'Petra', 'Sela', 'Odile', 'Rhea', 'Nessa', 'Isolde', 'Marta', 'Tamsin', 'Edda', 'Liesl', 'Runa', 'Vesna', 'Yara', 'Bette', 'Delia', 'Faye', 'Inga']);

// A villager's own voice: their role and name pick it, the same every time they speak.
export function voiceFor(name, role) {
  const first = String(name || '').split(' ')[0], h = hash(name);
  const base = role === 'elder' ? VOICES.elder : role === 'keeper' || role === 'seer' ? (HER.has(first) ? VOICES.crone : VOICES.elder)
    : HER.has(first) ? VOICES.woman : VOICES.man;
  return { ...base, f: base.f * (0.88 + h * 0.24), form: base.form * (0.96 + hash(first + '/') * 0.08) };
}

const VOWEL = ['a', 'e', 'i', 'o', 'u', 'a', 'o', 'e'];

// Voices a line as it types from letter `from` to `to`: a syllable every few letters at the voice's
// own pace, none on spaces or stops, so the babble pauses where the words do. One at most per call,
// so a line filled in at a keypress doesn't come out all at once.
export function babble(audio, v, text, from, to, every = 4) {
  const n = Math.max(2, Math.round(every * ((typeof v === 'string' ? VOICES[v]?.slow : v?.slow) || 1)));
  const i = Math.ceil(from / n) * n;
  if (!v || i >= to || to - from > n * 2 || !/[A-Za-z]/.test(text[i] || '')) return;
  audio.sfx('voice', { v, q: i / text.length, ask: /\?["']?\s*$/.test(text) });
}

// One syllable of a voice. o.q: how far through the line it is (0..1), so a line falls at its end
// and a question rises; o.greet: a little "hm-hm?" as a conversation starts; o.phrase: a few quick
// syllables, someone calling out in passing.
export function speak(a, t, v, o = {}) {
  if (typeof v === 'string') v = VOICES[v] || VOICES.man;
  const q = o.q ?? 0.5, ask = !!o.ask;
  const contour = 1 + 0.06 * Math.sin(q * Math.PI) - (ask ? -0.12 * q : 0.08 * q * q);
  const f = v.f * contour * (0.9 + Math.random() * 0.2);
  if (o.phrase && !v.kind) {
    for (let k = 0; k < o.phrase; k++) a.syllable(t + k * 0.12, { ...v, f: f * (1.06 - k * 0.04), vowel: pick(VOWEL), dur: 0.08, vol: 0.9 });
    return;
  }
  if (o.greet) {
    if (v.kind) return CALLS[v.kind](a, t, v, 1.4);
    a.syllable(t, { ...v, f: f * 0.95, f2: f * 1.0, vowel: 'u', dur: 0.1, vol: 0.9 });
    a.syllable(t + 0.15, { ...v, f: f * 1.05, f2: f * 1.22, vowel: 'a', dur: 0.14, vol: 1 });
    return;
  }
  if (v.kind) return CALLS[v.kind](a, t, v, 1);
  a.syllable(t, { ...v, f, f2: f * (0.93 + Math.random() * 0.1), vowel: pick(VOWEL), dur: 0.07 + Math.random() * 0.05 * (v.slow || 1), vol: 0.8 + Math.random() * 0.3 });
}

// The voices that aren't talk: the spirits and the Ember.
const CALLS = {
  chime: (a, t, v, k) => { // the Ember: a warm, glassy murmur
    const f = v.f * pick([1, 1.122, 1.26, 1.5]);
    a.tone(t, { f, dur: 0.22 * k, vol: 0.05, attack: 0.01 });
    a.tone(t, { type: 'triangle', f: f * 2, dur: 0.16 * k, vol: 0.02, attack: 0.01 });
  },
  hum: (a, t, v, k) => { // the stag of the Grove: a low, warm hum like a cello string
    const f = v.f * pick([1, 1.125, 1.25, 0.89]);
    a.tone(t, { type: 'sawtooth', f, f2: f * 1.02, dur: 0.3 * k, vol: 0.07, attack: 0.06, lp: 500, lp2: 380 });
    a.tone(t, { f: f / 2, dur: 0.3 * k, vol: 0.06, attack: 0.06 });
  },
  chirp: (a, t, v, k) => { // the phoenix: a bright, bird-like trill
    const f = v.f * (0.85 + Math.random() * 0.4);
    a.tone(t, { f, f2: f * 1.5, dur: 0.06 * k, vol: 0.05, attack: 0.005 });
    a.tone(t + 0.07, { f: f * 1.35, f2: f * 1.1, dur: 0.07 * k, vol: 0.045, attack: 0.005 });
    a.tone(t, { type: 'triangle', f: f * 2, f2: f * 2.6, dur: 0.05, vol: 0.015 });
  },
  hoot: (a, t, v, k) => { // the owl: a soft, round "hoo"
    const f = v.f * pick([1, 0.94, 1.06]);
    a.tone(t, { f, f2: f * 0.96, dur: 0.24 * k, vol: 0.08, attack: 0.05 });
    a.noise(t, { dur: 0.2 * k, vol: 0.02, type: 'bandpass', f: f * 2, q: 3, attack: 0.05 });
  },
  song: (a, t, v, k) => { // the whale: a long sung glide
    const f = v.f * pick([1, 1.2, 0.84, 1.33]), up = Math.random() < 0.5;
    a.tone(t, { f, f2: f * (up ? 1.3 : 0.78), dur: 0.55 * k, vol: 0.06, attack: 0.12 });
    a.tone(t, { type: 'triangle', f: f * 2, f2: f * (up ? 2.6 : 1.56), dur: 0.45 * k, vol: 0.015, attack: 0.15 });
  },
};

// ---------------------------------------------------------------- creatures
// Every monster family member has a cry: a voice type and a pitch. mood: alert (it has seen you),
// attack (the windup), hurt, die, idle (minding its own business).
const CRIES = {
  beast: { // a big, throaty animal: grunts and a roar
    alert: (a, t) => { a.tone(t, { type: 'sawtooth', f: 88, f2: 118, dur: 0.5, vol: 0.13, lp: 520, lp2: 1000, attack: 0.05 }); a.noise(t, { dur: 0.45, vol: 0.07, type: 'lowpass', f: 600, f2: 1100, attack: 0.06 }); },
    attack: (a, t) => { a.tone(t, { type: 'sawtooth', f: 112, f2: 82, dur: 0.2, vol: 0.12, lp: 650, attack: 0.02 }); a.noise(t, { dur: 0.12, vol: 0.05, type: 'lowpass', f: 500 }); },
    hurt: (a, t) => { a.tone(t, { type: 'sawtooth', f: 150, f2: 98, dur: 0.16, vol: 0.12, lp: 950, attack: 0.01 }); },
    die: (a, t) => { a.tone(t, { type: 'sawtooth', f: 125, f2: 52, dur: 0.85, vol: 0.13, lp: 800, lp2: 200, attack: 0.03 }); a.noise(t, { dur: 0.7, vol: 0.05, type: 'lowpass', f: 700, f2: 200 }); },
    idle: (a, t) => { a.tone(t, { type: 'sawtooth', f: 70, f2: 76, dur: 0.5, vol: 0.06, lp: 320, attack: 0.15 }); },
  },
  wolf: { // a hound: barks, a snarl, a yelp
    alert: (a, t) => { for (const d of [0, 0.17]) { a.tone(t + d, { type: 'sawtooth', f: 400, f2: 260, dur: 0.09, vol: 0.09, lp: 2200, attack: 0.005 }); a.noise(t + d, { dur: 0.06, vol: 0.06, f: 900, q: 2 }); } },
    attack: (a, t) => { a.tone(t, { type: 'sawtooth', f: 150, f2: 128, dur: 0.32, vol: 0.08, lp: 700, q: 4, attack: 0.03 }); a.noise(t, { dur: 0.3, vol: 0.06, f: 420, q: 3, attack: 0.03 }); },
    hurt: (a, t) => { a.tone(t, { type: 'triangle', f: 950, f2: 520, dur: 0.12, vol: 0.09, attack: 0.004 }); a.tone(t, { type: 'sawtooth', f: 720, f2: 460, dur: 0.1, vol: 0.04, lp: 2600 }); },
    die: (a, t) => { a.tone(t, { type: 'triangle', f: 820, f2: 300, dur: 0.5, vol: 0.08, attack: 0.01 }); a.tone(t, { type: 'sawtooth', f: 600, f2: 240, dur: 0.45, vol: 0.03, lp: 1800 }); },
    idle: (a, t) => { for (const d of [0, 0.11]) a.noise(t + d, { dur: 0.05, vol: 0.05, f: 1500, q: 2 }); },
  },
  bug: { // flies and scorpions: a buzz, clicks
    alert: (a, t) => { a.tone(t, { type: 'sawtooth', f: 190, f2: 260, dur: 0.4, vol: 0.05, lp: 2200, attack: 0.05 }); a.tone(t, { type: 'sawtooth', f: 203, f2: 274, dur: 0.4, vol: 0.04, lp: 2200, attack: 0.05 }); },
    attack: (a, t) => { [0, 0.04, 0.08, 0.13].forEach((d) => a.noise(t + d, { dur: 0.012, vol: 0.12, type: 'highpass', f: 3500 })); },
    hurt: (a, t) => { a.tone(t, { type: 'triangle', f: 1900, f2: 1200, dur: 0.06, vol: 0.06 }); a.noise(t + 0.03, { dur: 0.012, vol: 0.1, type: 'highpass', f: 4000 }); },
    die: (a, t) => { a.tone(t, { type: 'sawtooth', f: 230, f2: 70, dur: 0.45, vol: 0.06, lp: 1800 }); [0.1, 0.22].forEach((d) => a.noise(t + d, { dur: 0.012, vol: 0.1, type: 'highpass', f: 3000 })); },
    idle: (a, t) => { a.tone(t, { type: 'sawtooth', f: 210, f2: 230, dur: 0.25, vol: 0.025, lp: 1800, attack: 0.05 }); },
  },
  goblin: { // a little person with a bow: a shout, a grunt, an "ow"
    alert: (a, t) => { a.syllable(t, { f: 250, f2: 330, vowel: 'e', dur: 0.16, vol: 1.1, form: 1.15 }); },
    attack: (a, t) => { a.syllable(t, { f: 230, f2: 200, vowel: 'u', dur: 0.08, vol: 0.9, form: 1.1 }); },
    hurt: (a, t) => { a.syllable(t, { f: 340, f2: 250, vowel: 'a', dur: 0.14, vol: 1, form: 1.15 }); },
    die: (a, t) => { a.syllable(t, { f: 320, f2: 140, vowel: 'a', dur: 0.5, vol: 1, form: 1.1 }); },
    idle: (a, t) => { a.syllable(t, { f: 200, vowel: 'o', dur: 0.08, vol: 0.5 }); a.syllable(t + 0.12, { f: 185, vowel: 'e', dur: 0.08, vol: 0.45 }); },
  },
  wisp: { // a will-o'-the-wisp: chimes
    alert: (a, t) => a.notes(t, [88, 92, 95], 0.05, { type: 'triangle', dur: 0.25, vol: 0.05 }),
    attack: (a, t) => { a.noise(t, { dur: 0.25, vol: 0.05, type: 'highpass', f: 5000, attack: 0.08 }); a.tone(t, { f: 1500, f2: 2600, dur: 0.25, vol: 0.03, attack: 0.08 }); },
    hurt: (a, t) => { a.tone(t, { f: 1800, dur: 0.18, vol: 0.05 }); a.tone(t, { f: 2650, dur: 0.14, vol: 0.03 }); },
    die: (a, t) => { a.notes(t, [95, 91, 88, 84], 0.06, { type: 'triangle', dur: 0.3, vol: 0.05 }); a.noise(t, { dur: 0.4, vol: 0.04, type: 'highpass', f: 6000 }); },
    idle: (a, t) => a.tone(t, { type: 'triangle', f: 2100, dur: 0.3, vol: 0.02 }),
  },
  toad: { // a croaker
    alert: (a, t) => { [0, 0.07, 0.14].forEach((d) => a.tone(t + d, { type: 'sawtooth', f: 112, f2: 100, dur: 0.06, vol: 0.12, lp: 700, q: 3 })); },
    attack: (a, t) => a.tone(t, { f: 320, f2: 120, dur: 0.1, vol: 0.12 }),
    hurt: (a, t) => { [0, 0.06].forEach((d) => a.tone(t + d, { type: 'sawtooth', f: 190, f2: 150, dur: 0.05, vol: 0.12, lp: 1100, q: 3 })); },
    die: (a, t) => a.tone(t, { type: 'sawtooth', f: 130, f2: 55, dur: 0.55, vol: 0.12, lp: 700, q: 3 }),
    idle: (a, t) => { [0, 0.09].forEach((d) => a.tone(t + d, { type: 'sawtooth', f: 105, f2: 96, dur: 0.06, vol: 0.06, lp: 600, q: 3 })); },
  },
  golem: { // stone that walks: grinding and cracking
    alert: (a, t) => { a.noise(t, { dur: 0.6, vol: 0.12, type: 'lowpass', f: 200, f2: 520, q: 2, attack: 0.08 }); a.tone(t, { type: 'sawtooth', f: 46, f2: 52, dur: 0.6, vol: 0.07, lp: 220, attack: 0.08 }); },
    attack: (a, t) => { a.tone(t, { f: 82, f2: 42, dur: 0.25, vol: 0.2 }); a.noise(t, { dur: 0.2, vol: 0.08, type: 'lowpass', f: 400 }); },
    hurt: (a, t) => { a.noise(t, { dur: 0.05, vol: 0.12, type: 'highpass', f: 2500 }); a.tone(t, { type: 'triangle', f: 300, f2: 120, dur: 0.1, vol: 0.1 }); },
    die: (a, t) => { [0, 0.08, 0.17, 0.27, 0.36].forEach((d, i) => a.noise(t + d, { dur: 0.15, vol: 0.12 - i * 0.015, type: 'lowpass', f: 900 - i * 120 })); a.tone(t, { f: 70, f2: 30, dur: 0.6, vol: 0.18 }); },
    idle: (a, t) => a.noise(t, { dur: 0.5, vol: 0.05, type: 'lowpass', f: 180, f2: 300, q: 2, attack: 0.15 }),
  },
  imp: { // a giggling little devil
    alert: (a, t) => { [0, 0.08, 0.16, 0.24].forEach((d, i) => a.syllable(t + d, { f: 620 + i * 30, f2: 560, vowel: 'i', dur: 0.06, vol: 0.8, form: 1.3, type: 'triangle' })); },
    attack: (a, t) => a.syllable(t, { f: 800, f2: 1000, vowel: 'i', dur: 0.1, vol: 0.9, form: 1.3, type: 'triangle' }),
    hurt: (a, t) => a.syllable(t, { f: 900, f2: 600, vowel: 'e', dur: 0.1, vol: 0.9, form: 1.3, type: 'triangle' }),
    die: (a, t) => a.syllable(t, { f: 900, f2: 300, vowel: 'i', dur: 0.45, vol: 0.9, form: 1.3, type: 'triangle' }),
    idle: (a, t) => { [0, 0.08].forEach((d) => a.syllable(t + d, { f: 640, vowel: 'i', dur: 0.05, vol: 0.4, form: 1.3, type: 'triangle' })); },
  },
  bird: { // a harpy: screech and caw
    alert: (a, t) => { a.tone(t, { type: 'sawtooth', f: 1350, f2: 900, dur: 0.32, vol: 0.05, lp: 3000, q: 3 }); a.noise(t, { dur: 0.3, vol: 0.04, type: 'highpass', f: 3000 }); },
    attack: (a, t) => a.tone(t, { type: 'sawtooth', f: 720, f2: 600, dur: 0.15, vol: 0.06, lp: 2400, q: 2 }),
    hurt: (a, t) => a.tone(t, { type: 'sawtooth', f: 1150, f2: 700, dur: 0.12, vol: 0.06, lp: 2800, q: 2 }),
    die: (a, t) => a.tone(t, { type: 'sawtooth', f: 1250, f2: 380, dur: 0.6, vol: 0.06, lp: 2800, q: 2 }),
    idle: (a, t) => { [0, 0.14].forEach((d) => a.noise(t + d, { dur: 0.07, vol: 0.05, type: 'lowpass', f: 600 })); },
  },
  leech: { // a mire leech: slurps and squelches
    alert: (a, t) => { a.tone(t, { f: 280, f2: 880, dur: 0.18, vol: 0.1, attack: 0.02 }); a.noise(t + 0.1, { dur: 0.2, vol: 0.08, type: 'lowpass', f: 1200, f2: 300, q: 4 }); },
    attack: (a, t) => a.noise(t, { dur: 0.18, vol: 0.12, type: 'lowpass', f: 900, f2: 200, q: 4 }),
    hurt: (a, t) => { a.noise(t, { dur: 0.12, vol: 0.12, type: 'lowpass', f: 700, f2: 250, q: 5 }); a.tone(t, { f: 210, f2: 120, dur: 0.1, vol: 0.1 }); },
    die: (a, t) => { [0, 0.07, 0.15, 0.24].forEach((d, i) => a.tone(t + d, { f: 220 + i * 60, f2: 420 + i * 80, dur: 0.06, vol: 0.07 })); a.noise(t, { dur: 0.45, vol: 0.08, type: 'lowpass', f: 800, f2: 150 }); },
    idle: (a, t) => a.tone(t, { f: 300, f2: 520, dur: 0.06, vol: 0.04 }),
  },
};

// [voice type, pitch] for each family's brute, lunger, skirmisher, ranged (biome order: forest,
// swamp, desert, mountain, snow, volcanic; see data/enemies.js).
const FAMILY_CRIES = [
  [['beast', 1], ['wolf', 1], ['wisp', 1], ['goblin', 1]],
  [['beast', 0.82], ['leech', 1], ['bug', 1], ['toad', 1]],
  [['golem', 1], ['bug', 0.7], ['imp', 1], ['goblin', 0.88]],
  [['beast', 0.72], ['wolf', 0.88], ['bird', 1], ['goblin', 0.74]],
  [['beast', 1.12], ['wolf', 1.15], ['wisp', 1.3], ['goblin', 1.06]],
  [['golem', 0.82], ['wolf', 0.78], ['imp', 0.85], ['toad', 0.8]],
];
const ARCH = ['brute', 'lunger', 'skirmisher', 'ranged'];
export function cryOf(archetype, biome) {
  const row = FAMILY_CRIES[biome] || FAMILY_CRIES[0], i = ARCH.indexOf(archetype);
  return i < 0 ? null : row[i];
}

// How much each kind of cry is lifted to sit level with the rest.
const CRY_GAIN = { beast: 1.3, wolf: 2, bug: 2.5, goblin: 1, wisp: 2, toad: 1.3, golem: 1.8, imp: 1.8, bird: 1.8, leech: 1.8 };
export function cry(a, t, kind, mood) {
  const v = a._v;
  a._v = v * (CRY_GAIN[kind] || 1);
  try { CRIES[kind]?.[mood]?.(a, t); } finally { a._v = v; }
}

// ---------------------------------------------------------------- ambience
// A bed of sound under a scene, scheduled ahead like the music: tick(a, t, st) lays down what falls
// in [t, t + step). Long grains (hold) overlap into a steady bed; pops and calls land at random.
const crackle = (a, t, step, rate, vol) => {
  for (let k = 0; k < 3; k++) {
    if (Math.random() > rate * step / 3) continue;
    const at = t + Math.random() * step, big = Math.random() < 0.25;
    a.noise(at, { dur: big ? 0.03 : 0.012, vol: vol * (big ? 1.4 : 0.7 + Math.random() * 0.6), type: big ? 'bandpass' : 'highpass', f: big ? 1400 + Math.random() * 1200 : 2600 + Math.random() * 3000, q: big ? 3 : 1 });
  }
};
const bed = (a, t, st, every, o) => {
  if (t < (st.bed ?? 0)) return;
  st.bed = t + every;
  a.noise(t, { dur: every * 1.6, hold: every * 0.6, attack: every * 0.5, ...o });
};

export const AMBIENCE = {
  fire: { gain: 1.8, step: 0.1, tick(a, t, st) { crackle(a, t, 0.1, 9, 0.07); bed(a, t, st, 1.2, { vol: 0.07, type: 'lowpass', f: 380 + Math.random() * 160, q: 0.7 }); } },
  hearth: { gain: 1.8, step: 0.1, tick(a, t, st) { crackle(a, t, 0.1, 4, 0.045); bed(a, t, st, 1.4, { vol: 0.035, type: 'lowpass', f: 300 + Math.random() * 120, q: 0.7 }); } },
  blaze: { gain: 1.3, step: 0.1, tick(a, t, st) { crackle(a, t, 0.1, 16, 0.08); bed(a, t, st, 1, { vol: 0.12, type: 'lowpass', f: 520 + Math.random() * 300, q: 0.6 }); } },
  village: {
    gain: 2.5, step: 0.25,
    tick(a, t, st) {
      crackle(a, t, 0.25, 3, 0.03);
      bed(a, t, st, 1.6, { vol: 0.025, type: 'bandpass', f: 500 + Math.random() * 300, q: 0.8 });
      if (t >= (st.chat ?? 0)) { // someone talking across the green, now and then a laugh
        const v = { f: pick([110, 125, 190, 215, 270]), form: 1, type: 'sawtooth' }, laugh = Math.random() < 0.25, n = laugh ? 5 : 3 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) a.syllable(t + k * (laugh ? 0.13 : 0.11 + Math.random() * 0.06), { ...v, f: v.f * (laugh ? 1.25 - k * 0.04 : 0.9 + Math.random() * 0.2), vowel: laugh ? 'a' : pick(VOWEL), dur: laugh ? 0.08 : 0.07, vol: 0.28 });
        st.chat = t + 0.9 + Math.random() * 2;
      }
    },
  },
  wind: {
    gain: 2, step: 0.25,
    tick(a, t, st) {
      bed(a, t, st, 1.8, { vol: 0.07, type: 'bandpass', f: 280 + Math.random() * 500, q: 1.4 });
      if (Math.random() < 0.04) a.tone(t, { f: 700 + Math.random() * 500, f2: 600 + Math.random() * 500, dur: 2.5, hold: 0.8, attack: 0.9, vol: 0.008 });
    },
  },
  dark: {
    step: 0.25,
    tick(a, t, st) {
      if (t >= (st.drone ?? 0)) { st.drone = t + 2; a.tone(t, { type: 'sawtooth', f: 49, dur: 3.4, hold: 1.4, attack: 1, vol: 0.03, lp: 180 }); a.tone(t, { f: 73.5, dur: 3.4, hold: 1.4, attack: 1, vol: 0.02 }); }
      if (Math.random() < 0.05) a.noise(t, { dur: 1.4, vol: 0.03, type: 'bandpass', f: 900 + Math.random() * 1200, f2: 500, q: 4, attack: 0.6 }); // a whisper in the dark
    },
  },
  birds: {
    gain: 2.5, step: 0.25,
    tick(a, t, st) {
      bed(a, t, st, 2, { vol: 0.02, type: 'bandpass', f: 600, q: 0.8 });
      if (Math.random() < 0.18) {
        const f = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) a.tone(t + k * 0.09, { f: f * (1 + (k % 2) * 0.12), f2: f * (1.25 - (k % 2) * 0.3), dur: 0.06, vol: 0.025 });
      }
    },
  },
  water: {
    gain: 1.3, step: 0.1,
    tick(a, t, st) {
      bed(a, t, st, 1.4, { vol: 0.03, type: 'highpass', f: 2500, q: 0.7 });
      for (let k = 0; k < 2; k++) if (Math.random() < 0.35) { const f = 800 + Math.random() * 1400; a.tone(t + Math.random() * 0.1, { f, f2: f * 1.6, dur: 0.05, vol: 0.02 }); }
    },
  },
  sea: {
    gain: 1.5, step: 0.25,
    tick(a, t, st) {
      if (t >= (st.wave ?? 0)) { st.wave = t + 3.6 + Math.random() * 1.6; a.noise(t, { dur: 4.2, hold: 0.8, attack: 1.8, vol: 0.12, type: 'lowpass', f: 300, f2: 1100, q: 0.6 }); a.noise(t + 1.6, { dur: 2.4, attack: 0.3, vol: 0.04, type: 'highpass', f: 3500 }); }
    },
  },
};
