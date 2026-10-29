// Emberwake audio: procedural WebAudio music and SFX. No assets, no network, no dependencies.
// Music is a lookahead pattern sequencer driving a soft synthesized piano through a
// procedural convolver reverb; each region key has its own scale, tempo, register and texture.

const G = typeof globalThis !== 'undefined' ? globalThis : {};
const FADE = 1.5;          // crossfade seconds
const LOOKAHEAD = 0.15;    // seconds scheduled ahead of the audio clock
const TICK_MS = 25;        // scheduler interval
const SFX_GAP = 0.03;      // min seconds between identical SFX

// ---------- helpers ----------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (n, m) => ((n % m) + m) % m;
const degSemi = (sc, d) => sc[mod(d, sc.length)] + 12 * Math.floor(d / sc.length);

function rng32(seed) { // mulberry32
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- music theory ----------
const S = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygDom: [0, 1, 4, 5, 7, 8, 10],
  pentaMaj: [0, 2, 4, 7, 9],
  pentaMin: [0, 3, 5, 7, 10],
};

// Chord shapes as scale-degree offsets from the chord root.
const VOICINGS = {
  triad: [0, 2, 4],
  seventh: [0, 2, 4, 6],
  add9: [0, 2, 4, 8],
  fifth: [0, 4],
  open: [0, 4, 8],
};

const BASS_OFF = { R: 0, T: 2, F: 4, O: 0 }; // root, third, fifth, octave
const MOTIF = [0, 1, 0, 2, 0, 1, 3, 2];      // phrase seed order: A B A C A B D C

// Semitone offsets (from track root) for the chord on scale degree `deg`.
function chordTones(d, deg) {
  let t = VOICINGS[d.voicing].map((o) => degSemi(d.scale, deg + o));
  if (d.fold) return t.map((x) => mod(x, 12)).sort((a, b) => a - b); // close position, natural inversions
  const shift = mod(t[0], 12) > 6 ? -12 : 0;                          // keep wide spacing, stay near root
  return t.map((x) => x + shift);
}

// ---------- track definitions ----------
// Pattern strings: one char per step within a chord. Bass: R/T/F/O or '.'.
// Arp: digit = chord-tone index (wraps up by octaves). Comp: 'x' = soft chord.
const DEF = {
  bpm: 80, sub: 2, root: 60, scale: S.major, voicing: 'triad', fold: true,
  chordSteps: 8, progs: [[0]], breathe: 0.1,
  bass: null, bassOct: -1, bassVel: 0.45, bassHold: 4,
  comp: null, compOct: 0, compVel: 0.25, compHold: 2,
  arp: null, arpOct: 0, arpVel: 0.32, arpProb: 1, arpHold: 3,
  mel: null, drone: 0, droneOct: -1, drip: 0,
  voice: { bright: 0.6, decay: 1, bell: false },
  wet: 0.4, gain: 1, seed: 1,
};

const RAW = {
  title: {
    bpm: 66, root: 62, progs: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 2, 5]],
    bass: 'R.......', bassOct: -2, bassHold: 8,
    arp: '0123.21.', arpVel: 0.34, arpHold: 6, breathe: 0.04,
    mel: { density: 0.22, lo: 74, hi: 86, vel: 0.4, hold: 1.5 },
    voice: { bright: 0.55, decay: 1.2 }, wet: 0.45, seed: 11,
  },
  story: {
    bpm: 58, root: 57, scale: S.minor, progs: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 4]],
    bass: 'R.......', bassOct: -2, bassHold: 8, bassVel: 0.4,
    arp: '0.2.4.2.', arpVel: 0.26, arpProb: 0.85, arpHold: 6, breathe: 0.08,
    mel: { density: 0.16, lo: 69, hi: 81, vel: 0.36, hold: 2 },
    drone: 0.25, voice: { bright: 0.5, decay: 1.3 }, wet: 0.6, seed: 131,
  },
  forest: {
    bpm: 84, root: 55, progs: [[0, 3, 0, 4], [0, 5, 3, 4], [5, 3, 0, 4], [0, 2, 3, 4]],
    bass: 'R...F...', arp: '01230213', arpVel: 0.28, arpProb: 0.9, arpHold: 4, breathe: 0.12,
    mel: { density: 0.3, lo: 67, hi: 81, vel: 0.42, scale: S.pentaMaj },
    voice: { bright: 0.6 }, wet: 0.35, seed: 23,
  },
  town: {
    bpm: 100, root: 60, progs: [[0, 3, 4, 0], [0, 5, 1, 4], [0, 3, 1, 4], [3, 4, 2, 5]],
    bass: 'R...F...', comp: '..x...x.', compVel: 0.2, compHold: 1.5, breathe: 0,
    mel: { density: 0.5, lo: 72, hi: 84, vel: 0.44 },
    voice: { bright: 0.75, decay: 0.9 }, wet: 0.25, seed: 37,
  },
  wetland: {
    bpm: 58, root: 50, scale: S.dorian, progs: [[0, 3, 0, 6], [0, 3, 4, 0], [0, 6, 5, 3]],
    bass: 'R.......', bassHold: 8, arp: '0...2..4', arpProb: 0.55, arpVel: 0.28, arpHold: 6,
    mel: { density: 0.1, lo: 62, hi: 74, vel: 0.32, hold: 2 },
    drone: 0.5, drip: 0.025, breathe: 0.2,
    voice: { bright: 0.35, decay: 1.3 }, wet: 0.6, seed: 41,
  },
  frontier: {
    bpm: 72, root: 52, scale: S.phrygDom, voicing: 'fifth',
    progs: [[0, 0, 1, 0], [0, 6, 5, 1], [0, 1, 6, 0]],
    bass: 'R.....F.', arp: '0.1...2.', arpProb: 0.7, arpVel: 0.3, arpHold: 3, breathe: 0.15,
    mel: { density: 0.18, lo: 64, hi: 79, vel: 0.4, hold: 1.5 },
    voice: { bright: 0.5, decay: 0.9 }, wet: 0.4, seed: 53,
  },
  mountain: {
    bpm: 62, root: 50, scale: S.mixo, voicing: 'open', fold: false, chordSteps: 16,
    progs: [[0, 6, 3, 0], [0, 4, 6, 3], [3, 6, 0, 4]],
    bass: 'R...............', bassHold: 12, arp: '0...1...4...2...', arpProb: 0.85, arpVel: 0.3, arpHold: 8,
    mel: { density: 0.12, lo: 69, hi: 86, vel: 0.36, leap: 0.4, hold: 2 },
    voice: { bright: 0.5, decay: 1.3 }, wet: 0.55, seed: 67,
  },
  snow: {
    bpm: 54, root: 65, scale: S.lydian, voicing: 'add9', chordSteps: 16,
    progs: [[0, 1, 0, 4], [0, 1, 5, 4], [5, 4, 1, 0]],
    bass: 'R...............', bassVel: 0.26, bassHold: 12,
    arp: '4.....6.......5.', arpProb: 0.65, arpVel: 0.26, arpHold: 10, breathe: 0.2,
    mel: { density: 0.07, lo: 84, hi: 96, vel: 0.28, hold: 3 },
    voice: { bright: 0.9, decay: 1.4, bell: true }, wet: 0.7, gain: 1.1, seed: 79,
  },
  volcanic: {
    bpm: 56, root: 45, scale: S.minor, progs: [[0, 0, 5, 4], [0, 5, 6, 4], [0, 3, 5, 4]],
    bass: 'R...R...', bassOct: 0, bassVel: 0.5, bassHold: 3,
    arp: '....0..1', arpOct: 1, arpProb: 0.6, arpVel: 0.26, arpHold: 4, breathe: 0.15,
    mel: { density: 0.06, lo: 57, hi: 69, vel: 0.3, hold: 3 },
    drone: 0.6, voice: { bright: 0.35, decay: 1.1 }, wet: 0.5, seed: 89,
  },
  dungeon: {
    bpm: 64, root: 50, scale: S.harmMinor, chordSteps: 16,
    progs: [[0, 0, 5, 4], [0, 3, 5, 4], [0, 1, 4, 0]],
    bass: 'R...............', bassVel: 0.4, bassHold: 10,
    arp: '0..2..1.........', arpOct: 1, arpProb: 0.55, arpVel: 0.25, arpHold: 4, breathe: 0.25,
    mel: { density: 0.08, lo: 62, hi: 74, vel: 0.3, hold: 2 },
    drone: 0.55, voice: { bright: 0.4 }, wet: 0.5, seed: 97,
  },
  cave: {
    bpm: 50, root: 45, scale: S.minor, chordSteps: 16, progs: [[0, 5], [0, 3], [0, 6]],
    bass: 'R...............', bassOct: 0, bassVel: 0.3, bassHold: 10,
    arp: '........2.......', arpOct: 1, arpProb: 0.4, arpVel: 0.22, arpHold: 6, breathe: 0.3,
    mel: { density: 0.035, lo: 64, hi: 76, vel: 0.24, hold: 4, scale: S.pentaMin },
    drone: 0.4, drip: 0.09, voice: { bright: 0.35, decay: 1.3 }, wet: 0.8, seed: 101,
  },
  boss: {
    bpm: 138, root: 57, scale: S.harmMinor, progs: [[0, 0, 5, 4], [0, 5, 3, 4], [0, 1, 5, 4]],
    bass: 'RRORRFRO', bassVel: 0.45, bassHold: 1,
    arp: '..0..1.2', arpOct: 1, arpVel: 0.26, arpHold: 1, breathe: 0,
    mel: { density: 0.4, lo: 69, hi: 84, vel: 0.38, hold: 1 },
    drone: 0.35, voice: { bright: 0.65, decay: 0.55 }, wet: 0.25, gain: 0.9, seed: 113,
  },
  victory: {
    bpm: 112, length: 26, voice: { bright: 0.75 }, wet: 0.45,
    // [step, midi notes, hold steps, velocity]
    script: [
      [0, [60, 48], 2], [1, [64], 1], [2, [67], 1], [3, [72], 2],
      [4, [65, 69, 72, 41], 2, 0.42], [6, [67, 71, 74, 43], 2, 0.45],
      [8, [60, 64, 67, 72, 79, 36], 16, 0.5], [9, [84], 14, 0.32],
    ],
  },
};

// A warden's second phase: its theme driven harder, on bare fifths an octave down.
RAW.boss2 = { ...RAW.boss, bpm: 156, voicing: 'fifth', bassOct: -2, bassVel: 0.5, compOct: -1, drone: 0.5, voice: { bright: 0.45, decay: 0.5 }, seed: 127 };

const TRACKS = Object.fromEntries(Object.entries(RAW).map(([k, v]) =>
  [k, { ...DEF, ...v, voice: { ...DEF.voice, ...v.voice } }]));

// ---------- SFX definitions ----------
// Each receives the engine and a start time. Frequencies are scaled by opts.pitch
// and levels by opts.volume inside tone()/noise().
const SFX = {
  swing: (a, t) => a.noise(t, { dur: 0.14, vol: 0.2, f: 500, f2: 2800, q: 1.3, attack: 0.045 }),
  hit: (a, t) => {
    a.tone(t, { f: 180, f2: 55, dur: 0.14, vol: 0.36 });
    a.tone(t, { type: 'triangle', f: 520, f2: 260, dur: 0.05, vol: 0.09 });
    a.noise(t, { dur: 0.03, vol: 0.15, type: 'highpass', f: 2600 });
  },
  kill: (a, t) => {
    a.noise(t, { dur: 0.32, vol: 0.12, f: 700, f2: 4200, q: 0.9, attack: 0.03 });
    a.notes(t + 0.04, [84, 88, 91, 96], 0.045, { dur: 0.22, vol: 0.055 });
  },
  block: (a, t) => {
    [1, 2.76, 5.4].forEach((r, i) => a.tone(t, { f: 1250 * r, dur: 0.38 - i * 0.1, vol: 0.11 / (i + 1), attack: 0.002 }));
    a.noise(t, { dur: 0.02, vol: 0.1, type: 'highpass', f: 4000 });
  },
  dash: (a, t) => {
    a.noise(t, { dur: 0.2, vol: 0.19, f: 2600, f2: 350, q: 1.1, attack: 0.015 });
    a.tone(t, { f: 520, f2: 140, dur: 0.14, vol: 0.05 });
  },
  hurt: (a, t) => {
    a.tone(t, { type: 'sawtooth', f: 330, f2: 120, dur: 0.22, vol: 0.11, lp: 1600 });
    a.tone(t, { f: 140, f2: 60, dur: 0.15, vol: 0.28 });
  },
  pickup: (a, t) => a.notes(t, [81, 88], 0.06, { type: 'triangle', dur: 0.14, vol: 0.09 }),
  coin: (a, t) => a.notes(t, [88, 95], 0.06, { type: 'triangle', dur: 0.28, vol: 0.08 }),
  door: (a, t) => {
    a.tone(t, { f: 95, f2: 55, dur: 0.3, vol: 0.3 });
    a.noise(t, { dur: 0.4, vol: 0.12, type: 'lowpass', f: 900, f2: 200, attack: 0.05 });
  },
  unlock: (a, t) => {
    a.noise(t, { dur: 0.02, vol: 0.13, type: 'highpass', f: 3000 });
    a.noise(t + 0.07, { dur: 0.02, vol: 0.13, type: 'highpass', f: 2400 });
    a.notes(t + 0.11, [84, 91], 0.06, { type: 'triangle', dur: 0.35, vol: 0.08 });
  },
  switch: (a, t) => {
    a.tone(t, { type: 'square', f: 1400, f2: 900, dur: 0.035, vol: 0.05, lp: 3000 });
    a.tone(t + 0.04, { f: 700, dur: 0.06, vol: 0.07 });
  },
  puzzle: (a, t) => {
    a.notes(t, [67, 72, 76, 79, 84], 0.1, { type: 'triangle', dur: 0.7, vol: 0.07 });
    a.tone(t + 0.55, { f: mtof(91), dur: 0.9, vol: 0.04 });
  },
  tick: (a, t) => {
    const k = (a._tock = !a._tock) ? 1 : 0.78;
    a.tone(t, { type: 'square', f: 2200 * k, dur: 0.02, vol: 0.045, lp: 5000 });
    a.noise(t, { dur: 0.015, vol: 0.09, type: 'highpass', f: 5000 * k });
  },
  bomb: (a, t) => {
    a.tone(t, { f: 160, f2: 90, dur: 0.1, vol: 0.22 });
    a.noise(t + 0.05, { dur: 0.45, vol: 0.05, type: 'highpass', f: 5500, attack: 0.05 });
  },
  explode: (a, t) => {
    a.noise(t, { dur: 0.9, vol: 0.42, type: 'lowpass', f: 3200, f2: 90, q: 0.5, attack: 0.004 });
    a.tone(t, { f: 110, f2: 32, dur: 0.7, vol: 0.45 });
  },
  arrow: (a, t) => {
    a.tone(t, { type: 'triangle', f: 240, f2: 200, dur: 0.07, vol: 0.08 });
    a.noise(t + 0.01, { dur: 0.12, vol: 0.11, f: 3200, f2: 1400, q: 3 });
  },
  spell: (a, t) => {
    a.tone(t, { f: 520, f2: 1240, dur: 0.4, vol: 0.07, attack: 0.03 });
    a.tone(t, { type: 'triangle', f: 523, f2: 1250, dur: 0.4, vol: 0.05, attack: 0.03, detune: 12 });
    a.noise(t, { dur: 0.35, vol: 0.045, f: 2000, f2: 6000, q: 2, attack: 0.05 });
  },
  chest: (a, t) => {
    a.noise(t, { dur: 0.25, vol: 0.1, type: 'lowpass', f: 700, f2: 300, attack: 0.03 });
    a.notes(t + 0.18, [67, 71, 74, 79], 0.08, { type: 'triangle', dur: 0.5, vol: 0.075 });
  },
  talk: (a, t) => a.tone(t, { type: 'triangle', f: 560, dur: 0.035, vol: 0.035, attack: 0.003, lp: 2200 }),
  menu: (a, t) => a.notes(t, [76, 83], 0.05, { dur: 0.14, vol: 0.065 }),
  select: (a, t) => a.tone(t, { type: 'triangle', f: 1180, dur: 0.05, vol: 0.055 }),
  deny: (a, t) => a.notes(t, [57, 54], 0.09, { type: 'square', dur: 0.1, vol: 0.045, lp: 1200 }),
  boss: (a, t) => { // ominous low swell into an impact
    [33, 40, 34].forEach((m, i) => a.tone(t, {
      type: 'sawtooth', f: mtof(m), dur: 2.8, vol: 0.13 - i * 0.03, attack: 1.3, lp: 160, lp2: 900, detune: i * 6,
    }));
    a.noise(t, { dur: 2.4, vol: 0.11, type: 'lowpass', f: 120, f2: 420, attack: 1.2 });
    a.tone(t + 1.3, { f: 90, f2: 36, dur: 1.0, vol: 0.42 });
    a.notes(t + 1.3, [45, 46], 0, { type: 'triangle', dur: 1.8, vol: 0.09 });
  },
  shrine: (a, t) => {
    [72, 76, 79, 83].forEach((m, i) => a.tone(t + i * 0.03, { f: mtof(m), dur: 2.2, vol: 0.045, attack: 0.35 }));
    a.notes(t + 0.4, [91, 95, 98], 0.12, { dur: 0.5, vol: 0.03 });
  },
  death: (a, t) => {
    a.notes(t, [72, 67, 63, 60, 55], 0.16, { type: 'triangle', dur: 0.55, vol: 0.08 });
    a.tone(t, { type: 'sawtooth', f: 110, f2: 55, dur: 1.4, vol: 0.055, lp: 500, attack: 0.1 });
  },
  eat: (a, t) => {
    [0, 0.09, 0.18].forEach((d) => a.noise(t + d, { dur: 0.05, vol: 0.11, f: 1600, q: 1.5 }));
    a.tone(t + 0.28, { f: 600, f2: 900, dur: 0.12, vol: 0.05 });
  },
  splash: (a, t) => {
    a.noise(t, { dur: 0.4, vol: 0.2, f: 1400, f2: 350, q: 0.8, attack: 0.01 });
    [0.08, 0.15, 0.22].forEach((d, i) => a.tone(t + d, { f: 900 + i * 350, f2: 1700 + i * 300, dur: 0.06, vol: 0.035 }));
  },
  lever: (a, t) => { // an iron handle thrown over: a ratchet, then the sluice gates clunk home
    [0, 0.04, 0.08].forEach((d) => a.noise(t + d, { dur: 0.03, vol: 0.07, f: 2600, q: 6 }));
    a.tone(t + 0.12, { type: 'triangle', f: 170, f2: 80, dur: 0.2, vol: 0.2 });
    a.noise(t + 0.12, { dur: 0.18, vol: 0.09, type: 'lowpass', f: 700, f2: 180 });
  },
  lift: (a, t) => {
    a.tone(t, { f: 220, f2: 440, dur: 0.16, vol: 0.11 });
    a.noise(t, { dur: 0.1, vol: 0.05, type: 'lowpass', f: 1200 });
  },
  poof: (a, t) => a.noise(t, { dur: 0.35, vol: 0.17, type: 'lowpass', f: 2200, f2: 250, attack: 0.03 }),
  heart: (a, t) => a.notes(t, [88, 93], 0.09, { dur: 0.4, vol: 0.08 }),
  key: (a, t) => a.notes(t, [84, 91, 96, 103], 0.05, { type: 'triangle', dur: 0.3, vol: 0.065 }),
  gate: (a, t) => {
    a.tone(t, { type: 'sawtooth', f: 55, f2: 48, dur: 1.1, vol: 0.11, lp: 260, attack: 0.08 });
    a.noise(t, { dur: 1.0, vol: 0.16, type: 'lowpass', f: 300, f2: 140, attack: 0.1 });
    a.tone(t + 1.0, { f: 100, f2: 45, dur: 0.35, vol: 0.36 });
  },
  levelup: (a, t) => {
    a.notes(t, [72, 76, 79, 84, 88, 91], 0.065, { type: 'triangle', dur: 0.35, vol: 0.065 });
    [84, 88, 91, 96].forEach((m) => a.tone(t + 0.42, { f: mtof(m), dur: 1.4, vol: 0.035, attack: 0.02 }));
  },
  // status effects, one voice each
  fx_snare: (a, t) => { // a wooden creak ending in a snap
    a.tone(t, { type: 'sawtooth', f: 150, f2: 105, dur: 0.22, vol: 0.07, lp: 700, lp2: 420, q: 4, attack: 0.02 });
    a.tone(t + 0.12, { type: 'sawtooth', f: 120, f2: 175, dur: 0.18, vol: 0.06, lp: 600, q: 5, attack: 0.02 });
    a.noise(t, { dur: 0.12, vol: 0.05, f: 900, q: 6 });
    a.tone(t + 0.28, { type: 'triangle', f: 210, f2: 70, dur: 0.1, vol: 0.2 });
  },
  fx_poison: (a, t) => { // bubbles
    [0, 0.07, 0.17, 0.26].forEach((d, i) => a.tone(t + d, { f: 260 + i * 70, f2: 640 + i * 120, dur: 0.07, vol: 0.09, attack: 0.006 }));
    a.noise(t, { dur: 0.3, vol: 0.05, type: 'lowpass', f: 500, f2: 250 });
  },
  fx_mud: (a, t) => { // a squelch
    a.noise(t, { dur: 0.28, vol: 0.2, type: 'lowpass', f: 700, f2: 120, q: 3, attack: 0.02 });
    a.tone(t, { f: 130, f2: 55, dur: 0.22, vol: 0.2 });
    a.tone(t + 0.12, { f: 200, f2: 90, dur: 0.12, vol: 0.1 });
  },
  fx_blind: (a, t) => { // a whoosh that closes in
    a.noise(t, { dur: 0.45, vol: 0.2, f: 300, f2: 2400, q: 0.8, attack: 0.18 });
    a.noise(t + 0.2, { dur: 0.3, vol: 0.12, type: 'lowpass', f: 1800, f2: 150, attack: 0.02 });
  },
  fx_chill: (a, t) => { // a cold shimmer
    a.notes(t, [96, 93, 89], 0.07, { type: 'triangle', dur: 0.4, vol: 0.05 });
    a.noise(t, { dur: 0.35, vol: 0.06, type: 'highpass', f: 5200, f2: 3000, attack: 0.05 });
  },
  fx_freeze: (a, t) => { // glassy crackle
    [0, 0.03, 0.06, 0.11, 0.15, 0.22].forEach((d, i) => a.noise(t + d, { dur: 0.025, vol: 0.12, type: 'highpass', f: 4200 + i * 700, q: 2 }));
    [1, 2.4, 3.8].forEach((r, i) => a.tone(t, { f: 1900 * r, dur: 0.3 - i * 0.07, vol: 0.04 / (i + 1), attack: 0.002 }));
  },
  fx_burn: (a, t) => { // a sizzle
    a.noise(t, { dur: 0.5, vol: 0.12, type: 'highpass', f: 5200, f2: 3000, attack: 0.02 });
    [0.04, 0.11, 0.19, 0.3].forEach((d) => a.noise(t + d, { dur: 0.02, vol: 0.15, f: 2200, q: 3 }));
    a.noise(t, { dur: 0.3, vol: 0.1, type: 'lowpass', f: 500, f2: 1400, attack: 0.05 });
  },
  fx_break: (a, t) => { // a shatter
    a.noise(t, { dur: 0.35, vol: 0.28, type: 'highpass', f: 3000, f2: 1500, attack: 0.002 });
    [0, 0.02, 0.05, 0.09].forEach((d, i) => a.tone(t + d, { f: 2600 - i * 380, f2: 1800 - i * 300, dur: 0.18, vol: 0.06 }));
    a.tone(t, { type: 'triangle', f: 240, f2: 70, dur: 0.12, vol: 0.2 });
  },
  // wardens: their fights' own voices, a phase change (the roar of the transform) and a death (the
  // dematerialize). A sound timed to a strike schedules its crack for the moment the zone lands.
  thornmaw_roar: (a, t) => { // a throaty bellow with thorns rattling loose
    a.tone(t, { type: 'sawtooth', f: 78, f2: 104, dur: 0.6, vol: 0.13, lp: 420, lp2: 1300, attack: 0.06 });
    a.tone(t, { type: 'sawtooth', f: 80, f2: 99, dur: 0.6, vol: 0.09, lp: 380, lp2: 1000, attack: 0.06, detune: 22 });
    a.noise(t, { dur: 0.5, vol: 0.09, type: 'lowpass', f: 700, f2: 1600, attack: 0.05 });
    [0.08, 0.13, 0.19, 0.24, 0.31].forEach((d, i) => a.noise(t + d, { dur: 0.025, vol: 0.1, type: 'highpass', f: 3200 + i * 400 }));
  },
  thornmaw_charge: (a, t) => { // a hoof pawing the earth twice, a snort, then the rumble of the rush
    [0, 0.17].forEach((d) => a.noise(t + d, { dur: 0.12, vol: 0.15, f: 700, f2: 260, q: 1.6, attack: 0.01 }));
    a.noise(t + 0.3, { dur: 0.16, vol: 0.14, f: 1100, f2: 420, q: 1.2, attack: 0.01 });
    a.tone(t + 0.3, { type: 'sawtooth', f: 90, f2: 140, dur: 0.3, vol: 0.08, lp: 600, attack: 0.04 });
    a.noise(t + 0.5, { dur: 0.7, vol: 0.13, type: 'lowpass', f: 140, f2: 320, attack: 0.08 });
  },
  thornmaw_slam: (a, t) => { // a wooden crack against stone, a deep thud, splinters
    a.tone(t, { f: 100, f2: 34, dur: 0.6, vol: 0.45 });
    a.noise(t, { dur: 0.7, vol: 0.32, type: 'lowpass', f: 2400, f2: 110, q: 0.6, attack: 0.003 });
    a.tone(t, { type: 'triangle', f: 320, f2: 110, dur: 0.09, vol: 0.2 });
    [0.03, 0.08, 0.14, 0.21].forEach((d, i) => a.noise(t + d, { dur: 0.03, vol: 0.12 - i * 0.02, type: 'highpass', f: 2600 + i * 300 }));
  },
  thornmaw_roots: (a, t) => { // something burrowing toward you, then three roots snapping up out of the ground
    a.noise(t, { dur: 1.1, vol: 0.13, type: 'lowpass', f: 110, f2: 420, attack: 0.4 });
    a.tone(t, { type: 'sawtooth', f: 44, f2: 70, dur: 1.1, vol: 0.06, lp: 220, attack: 0.3 });
    [0.7, 0.9, 1.1].forEach((d, i) => {
      a.tone(t + d, { f: 170 - i * 15, f2: 55, dur: 0.18, vol: 0.28 });
      a.noise(t + d, { dur: 0.1, vol: 0.13, f: 1300 - i * 150, q: 4 });
      a.noise(t + d, { dur: 0.05, vol: 0.1, type: 'highpass', f: 3000 });
    });
  },
  thornmaw_spores: (a, t) => { // the flower's wet gasp and puff, then spores hissing down
    a.noise(t, { dur: 0.3, vol: 0.13, type: 'lowpass', f: 300, f2: 2200, attack: 0.18 });
    a.tone(t + 0.28, { f: 230, f2: 85, dur: 0.12, vol: 0.18 });
    a.noise(t + 0.28, { dur: 0.25, vol: 0.12, type: 'lowpass', f: 1800, f2: 300, attack: 0.01 });
    a.noise(t + 0.35, { dur: 0.75, vol: 0.05, type: 'highpass', f: 6000, f2: 3600, attack: 0.25 });
    a.notes(t + 0.4, [88, 84, 91], 0.12, { type: 'triangle', dur: 0.3, vol: 0.02 });
  },
  thornmaw_lash: (a, t) => { // vines creaking back, a swish, and the crack of the whip
    a.tone(t, { type: 'sawtooth', f: 140, f2: 200, dur: 0.45, vol: 0.06, lp: 700, q: 5, attack: 0.2 });
    a.noise(t, { dur: 0.45, vol: 0.06, f: 2000, f2: 1200, q: 3, attack: 0.15 });
    a.noise(t + 0.45, { dur: 0.15, vol: 0.12, f: 500, f2: 3200, q: 1.5, attack: 0.1 });
    a.noise(t + 0.6, { dur: 0.03, vol: 0.32, type: 'highpass', f: 3000 });
    a.noise(t + 0.6, { dur: 0.14, vol: 0.13, f: 4200, f2: 800, q: 2 });
  },
  thornmaw_phase: (a, t) => { // a deep woody groan, bark splitting open, and the flower bursting out with a roar
    a.tone(t, { type: 'sawtooth', f: 62, f2: 96, dur: 1.2, vol: 0.14, lp: 300, lp2: 1100, attack: 0.25 });
    a.tone(t, { type: 'sawtooth', f: 64, f2: 99, dur: 1.2, vol: 0.1, lp: 300, lp2: 900, attack: 0.25, detune: 18 });
    [0.2, 0.38, 0.52, 0.62, 0.69].forEach((d, i) => a.noise(t + d, { dur: 0.05, vol: 0.12 + i * 0.02, type: 'highpass', f: 1800 + i * 200 }));
    a.noise(t + 0.75, { dur: 0.45, vol: 0.24, f: 3000, f2: 400, q: 0.7, attack: 0.01 });
    a.tone(t + 0.75, { f: 120, f2: 45, dur: 0.5, vol: 0.32 });
    [50, 57, 61, 64].forEach((m, i) => a.tone(t + 0.8 + i * 0.04, { type: 'triangle', f: mtof(m), dur: 0.9, vol: 0.04, attack: 0.15 }));
    a.noise(t + 0.3, { dur: 1.2, vol: 0.1, f: 2400, f2: 900, q: 0.8, attack: 0.2 });
  },
  cinder_roar: (a, t) => { // a bellow ringing through the iron helm, a gout of flame, the plates rattling
    a.tone(t, { type: 'sawtooth', f: 64, f2: 92, dur: 0.8, vol: 0.13, lp: 480, lp2: 1500, attack: 0.08 });
    a.tone(t, { type: 'sawtooth', f: 66, f2: 88, dur: 0.8, vol: 0.09, lp: 420, lp2: 1200, attack: 0.08, detune: 25 });
    a.tone(t + 0.05, { type: 'triangle', f: 215, f2: 262, dur: 0.6, vol: 0.04, attack: 0.1 });
    a.noise(t, { dur: 0.8, vol: 0.14, type: 'lowpass', f: 400, f2: 2200, attack: 0.15 });
    [0.12, 0.2, 0.27, 0.36].forEach((d, i) => a.noise(t + d, { dur: 0.03, vol: 0.08, type: 'highpass', f: 2400 + i * 300 }));
  },
  cinder_cast: (a, t) => { // the palms flare and throw: a whoomph of fire, a thump, embers crackling away
    a.noise(t, { dur: 0.18, vol: 0.16, f: 600, f2: 3000, q: 1.2, attack: 0.02 });
    a.tone(t, { f: 180, f2: 90, dur: 0.12, vol: 0.15 });
    [0.05, 0.1, 0.16].forEach((d) => a.noise(t + d, { dur: 0.015, vol: 0.09, type: 'highpass', f: 4200 }));
    a.noise(t + 0.06, { dur: 0.3, vol: 0.05, type: 'highpass', f: 5000, f2: 3000, attack: 0.03 });
  },
  cinder_blink: (a, t) => { // embers sucked inward as it fades, then the whump of it burning back in elsewhere
    a.noise(t, { dur: 0.36, vol: 0.12, f: 3500, f2: 500, q: 2, attack: 0.26 });
    a.tone(t, { type: 'triangle', f: 900, f2: 300, dur: 0.32, vol: 0.03, attack: 0.22 });
    a.noise(t + 0.4, { dur: 0.25, vol: 0.14, type: 'lowpass', f: 2000, f2: 400 });
    a.tone(t + 0.4, { f: 140, f2: 260, dur: 0.15, vol: 0.08 });
  },
  cinder_vent: (a, t) => { // the plates grind open, steam screams out, the bare core roars low
    a.tone(t, { type: 'sawtooth', f: 70, f2: 58, dur: 0.4, vol: 0.08, lp: 420 });
    a.noise(t, { dur: 0.35, vol: 0.1, f: 300, q: 6 });
    a.tone(t + 0.3, { type: 'triangle', f: 420, f2: 200, dur: 0.1, vol: 0.08 });
    a.noise(t + 0.2, { dur: 1.5, vol: 0.14, type: 'highpass', f: 4500, f2: 2500, attack: 0.05 });
    a.noise(t + 0.2, { dur: 1.6, vol: 0.12, type: 'lowpass', f: 250, f2: 500, attack: 0.2 });
  },
  cinder_meteor: (a, t) => { // the sky rumbles open, five shrieks falling, then their impacts as each zone lands
    a.noise(t, { dur: 0.6, vol: 0.1, type: 'lowpass', f: 200, f2: 1200, attack: 0.2 });
    a.tone(t, { type: 'sawtooth', f: 50, f2: 75, dur: 0.6, vol: 0.06, lp: 300, attack: 0.15 });
    [0, 1, 2, 3, 4].forEach((i) => {
      a.tone(t + 0.35 + i * 0.15, { f: 1800 - i * 120, f2: 300, dur: 0.65, vol: 0.025, attack: 0.2 });
      a.tone(t + 1 + i * 0.15, { f: 110, f2: 34, dur: 0.4, vol: 0.3 });
      a.noise(t + 1 + i * 0.15, { dur: 0.45, vol: 0.2, type: 'lowpass', f: 2500, f2: 150 });
      a.noise(t + 1 + i * 0.15, { dur: 0.05, vol: 0.09, type: 'highpass', f: 3200 });
    });
  },
  cinder_sweep: (a, t) => { // the blade's fire swelling as it rises, the whoosh and crack of the swing, the wave rolling off
    a.noise(t, { dur: 0.7, vol: 0.1, f: 400, f2: 1800, q: 1.2, attack: 0.5 });
    a.tone(t, { type: 'sawtooth', f: 110, f2: 220, dur: 0.7, vol: 0.05, lp: 900, attack: 0.4 });
    a.noise(t + 0.6, { dur: 0.12, vol: 0.2, f: 600, f2: 4000, q: 1, attack: 0.05 });
    a.noise(t + 0.7, { dur: 0.04, vol: 0.3, type: 'highpass', f: 2500 });
    a.tone(t + 0.7, { f: 160, f2: 50, dur: 0.3, vol: 0.3 });
    a.noise(t + 0.72, { dur: 1.1, vol: 0.16, type: 'lowpass', f: 1200, f2: 300, attack: 0.05 });
    a.noise(t + 0.72, { dur: 1, vol: 0.05, type: 'highpass', f: 5000, f2: 3500, attack: 0.1 });
  },
  cinder_pools: (a, t) => { // a gurgling heave from the core, three wet spits, the lava hissing where it lands
    a.tone(t, { type: 'sawtooth', f: 55, f2: 80, dur: 0.35, vol: 0.08, lp: 300, q: 6 });
    [0.04, 0.12, 0.2, 0.27].forEach((d, i) => a.tone(t + d, { f: 200 + i * 60, f2: 420 + i * 80, dur: 0.06, vol: 0.06 }));
    [0, 0.08, 0.16].forEach((d) => { a.noise(t + 0.3 + d, { dur: 0.15, vol: 0.16, type: 'lowpass', f: 1400, f2: 300 }); a.tone(t + 0.3 + d, { f: 300, f2: 120, dur: 0.08, vol: 0.1 }); });
    [0.9, 1, 1.1].forEach((d) => { a.noise(t + d, { dur: 0.5, vol: 0.1, type: 'highpass', f: 4000, f2: 2200 }); a.tone(t + d, { f: 120, f2: 60, dur: 0.15, vol: 0.18 }); });
  },
  cinder_phase: (a, t) => { // a furnace drawing breath, plates pinging as they crack, the blast that throws them off, the greatsword catching fire
    a.noise(t, { dur: 1.3, vol: 0.12, type: 'lowpass', f: 300, f2: 2600, attack: 1 });
    a.tone(t, { type: 'sawtooth', f: 80, f2: 170, dur: 1.35, vol: 0.06, lp: 600, attack: 0.9 });
    [0.3, 0.55, 0.75, 0.9, 1.03, 1.14, 1.23, 1.31, 1.38].forEach((d, i) => a.tone(t + d, { type: 'triangle', f: 1800 + (i % 3) * 400, dur: 0.06, vol: 0.035 + i * 0.004 }));
    a.noise(t + 1.45, { dur: 0.9, vol: 0.3, type: 'lowpass', f: 3500, f2: 200 });
    a.tone(t + 1.45, { f: 120, f2: 38, dur: 0.9, vol: 0.4 });
    [[1.5, 520], [1.58, 760], [1.7, 940], [1.84, 610]].forEach(([d, f]) => a.tone(t + d, { type: 'triangle', f, f2: f * 0.8, dur: 0.18, vol: 0.06 }));
    a.noise(t + 1.6, { dur: 0.5, vol: 0.12, f: 500, f2: 3500, q: 1, attack: 0.3 });
    a.tone(t + 1.6, { f: 300, f2: 900, dur: 0.5, vol: 0.03, attack: 0.3 });
  },
  rime_roar: (a, t) => { // an owl's shriek, ice grinding under it, frost ringing off the end
    a.tone(t, { type: 'sawtooth', f: 1100, f2: 1500, dur: 0.18, vol: 0.05, lp: 3000, attack: 0.03 });
    a.tone(t + 0.12, { type: 'sawtooth', f: 1500, f2: 900, dur: 0.5, vol: 0.06, lp: 2800, lp2: 1200, attack: 0.02 });
    a.tone(t + 0.12, { type: 'triangle', f: 1510, f2: 905, dur: 0.5, vol: 0.04, detune: 14 });
    a.noise(t, { dur: 0.7, vol: 0.12, type: 'highpass', f: 3200, f2: 1800, attack: 0.1 });
    a.tone(t, { type: 'sawtooth', f: 110, f2: 150, dur: 0.6, vol: 0.06, lp: 700, q: 4, attack: 0.08 });
    a.notes(t + 0.5, [91, 96, 100], 0.07, { type: 'triangle', dur: 0.45, vol: 0.03 });
  },
  rime_dash: (a, t) => { // a wingbeat, then frost hissing past and a sharp crystal ring
    a.noise(t, { dur: 0.1, vol: 0.12, type: 'lowpass', f: 900, f2: 300 });
    a.noise(t + 0.05, { dur: 0.45, vol: 0.14, f: 1200, f2: 5000, q: 1.2, attack: 0.08 });
    a.tone(t + 0.05, { type: 'triangle', f: 1800, f2: 2600, dur: 0.25, vol: 0.04, attack: 0.05 });
    a.notes(t + 0.1, [96, 103], 0.05, { type: 'triangle', dur: 0.4, vol: 0.035 });
  },
  rime_shard: (a, t) => { // ice cracking on stone, splinters tinkling away
    a.noise(t, { dur: 0.06, vol: 0.2, type: 'highpass', f: 2600 });
    a.tone(t, { type: 'triangle', f: 340, f2: 120, dur: 0.08, vol: 0.14 });
    [0.02, 0.05, 0.09, 0.14].forEach((d, i) => a.tone(t + d, { type: 'triangle', f: 3000 - i * 350, f2: 2400 - i * 300, dur: 0.12, vol: 0.035 }));
  },
  rime_gust: (a, t) => { // air sucked in as her wings draw back, then a howling blizzard for as long as the gust blows
    a.noise(t, { dur: 0.6, vol: 0.1, f: 3000, f2: 800, q: 1.5, attack: 0.45 });
    a.tone(t, { type: 'sawtooth', f: 300, f2: 180, dur: 0.6, vol: 0.025, lp: 900, attack: 0.4 });
    a.noise(t + 0.6, { dur: 2, vol: 0.18, f: 700, f2: 1300, q: 0.8, attack: 0.12 });
    a.noise(t + 0.6, { dur: 2, vol: 0.08, type: 'highpass', f: 4500, f2: 3000, attack: 0.2 });
    a.tone(t + 0.6, { type: 'sawtooth', f: 220, f2: 330, dur: 2, vol: 0.03, lp: 800, q: 6, attack: 0.3 });
    a.tone(t + 0.7, { type: 'triangle', f: 640, f2: 520, dur: 1.8, vol: 0.02, attack: 0.4 });
  },
  rime_pillar: (a, t) => { // frost creeping and crackling round the player, then the pillars bursting up as their zones strike
    a.noise(t, { dur: 1.1, vol: 0.07, type: 'highpass', f: 5000, f2: 2500, attack: 0.6 });
    [0.25, 0.45, 0.6, 0.75, 0.86, 0.95, 1.02].forEach((d, i) => a.noise(t + d, { dur: 0.02, vol: 0.05 + i * 0.01, type: 'highpass', f: 3800 }));
    a.noise(t + 1.1, { dur: 0.4, vol: 0.26, type: 'lowpass', f: 3000, f2: 300, attack: 0.003 });
    a.tone(t + 1.1, { f: 150, f2: 50, dur: 0.35, vol: 0.32 });
    a.notes(t + 1.12, [86, 93, 98], 0.04, { type: 'triangle', dur: 0.6, vol: 0.05 });
  },
  rime_decoy: (a, t) => { // a cold shimmer that splits in two, each half chiming as a copy of her forms
    a.tone(t, { type: 'triangle', f: 1200, f2: 1700, dur: 0.35, vol: 0.05, attack: 0.15 });
    a.noise(t, { dur: 0.35, vol: 0.06, type: 'highpass', f: 5000, attack: 0.15 });
    a.notes(t + 0.3, [93, 100, 105], 0.06, { type: 'triangle', dur: 0.5, vol: 0.04 });
    a.notes(t + 0.33, [88, 95, 100], 0.06, { type: 'triangle', dur: 0.5, vol: 0.04, detune: 12 });
  },
  rime_phase: (a, t) => { // ice groaning as light cracks through her, the burst into ringing shards, then the shards rushing back together
    a.tone(t, { type: 'sawtooth', f: 90, f2: 140, dur: 1.4, vol: 0.06, lp: 500, lp2: 1400, attack: 0.5 });
    [0.2, 0.42, 0.6, 0.76, 0.9, 1.02, 1.12, 1.21, 1.29, 1.36].forEach((d, i) => a.noise(t + d, { dur: 0.03, vol: 0.06 + i * 0.012, type: 'highpass', f: 2600 + (i % 3) * 600 }));
    a.tone(t + 0.3, { f: 700, f2: 2100, dur: 1.15, vol: 0.04, attack: 0.8 });
    a.noise(t + 1.45, { dur: 0.6, vol: 0.3, type: 'highpass', f: 3500, f2: 1500, attack: 0.002 });
    a.tone(t + 1.45, { f: 130, f2: 45, dur: 0.5, vol: 0.3 });
    a.notes(t + 1.47, [96, 91, 100, 93, 98, 103], 0.04, { type: 'triangle', dur: 0.6, vol: 0.05 });
    a.noise(t + 1.6, { dur: 0.6, vol: 0.1, f: 5000, f2: 900, q: 1.5, attack: 0.4 });
    a.tone(t + 1.7, { type: 'triangle', f: 500, f2: 1500, dur: 0.6, vol: 0.04, attack: 0.3 });
  },
  tide_roar: (a, t) => { // a deep bellow rolling up out of the water, bubbling through it, a long moan off the end
    a.tone(t, { type: 'sawtooth', f: 58, f2: 84, dur: 0.9, vol: 0.13, lp: 380, lp2: 1100, attack: 0.1 });
    a.tone(t, { type: 'sawtooth', f: 60, f2: 80, dur: 0.9, vol: 0.08, lp: 340, lp2: 900, attack: 0.1, detune: 22 });
    a.noise(t, { dur: 0.8, vol: 0.12, type: 'lowpass', f: 300, f2: 1400, attack: 0.12 });
    [0.1, 0.22, 0.31, 0.45, 0.58].forEach((d, i) => a.tone(t + d, { f: 300 + i * 70, f2: 520 + i * 90, dur: 0.05, vol: 0.05 }));
    a.tone(t + 0.45, { type: 'triangle', f: 190, f2: 140, dur: 0.8, vol: 0.05, attack: 0.2 });
  },
  tide_dive: (a, t) => { // a heavy plunge, the water closing over it, bubbles boiling up after
    a.noise(t, { dur: 0.35, vol: 0.22, type: 'lowpass', f: 1800, f2: 200, attack: 0.01 });
    a.tone(t, { f: 160, f2: 50, dur: 0.35, vol: 0.25 });
    a.tone(t + 0.2, { type: 'triangle', f: 420, f2: 160, dur: 0.25, vol: 0.05 });
    [0.3, 0.38, 0.47, 0.55, 0.66, 0.74].forEach((d, i) => a.tone(t + d, { f: 600 + (i % 3) * 180, f2: 900 + (i % 3) * 200, dur: 0.04, vol: 0.04 }));
  },
  tide_surface: (a, t) => { // bursting up through the water: the roar of the spout, a thud, the spray raining back
    a.noise(t, { dur: 0.5, vol: 0.3, f: 500, f2: 2600, q: 0.6, attack: 0.01 });
    a.tone(t, { f: 120, f2: 40, dur: 0.45, vol: 0.35 });
    a.tone(t + 0.02, { type: 'sawtooth', f: 90, f2: 130, dur: 0.4, vol: 0.07, lp: 700 });
    a.noise(t + 0.25, { dur: 0.9, vol: 0.12, type: 'highpass', f: 4000, f2: 2200, attack: 0.05 });
  },
  tide_jet: (a, t) => { // a gout of water spat under pressure, a wet slap, a gurgle in the throat
    a.noise(t, { dur: 0.16, vol: 0.18, f: 900, f2: 3200, q: 1.4, attack: 0.01 });
    a.tone(t, { f: 260, f2: 120, dur: 0.1, vol: 0.12 });
    a.tone(t + 0.05, { f: 340, f2: 480, dur: 0.08, vol: 0.04 });
  },
  tide_sweep: (a, t) => { // the tail coiling, water churning round it as it rises, then the lash cracking down the room
    a.noise(t, { dur: 1, vol: 0.09, type: 'lowpass', f: 250, f2: 900, attack: 0.7 });
    a.tone(t, { type: 'sawtooth', f: 70, f2: 110, dur: 1, vol: 0.04, lp: 400, attack: 0.6 });
    a.noise(t + 0.9, { dur: 0.12, vol: 0.18, f: 700, f2: 4000, q: 1, attack: 0.05 });
    a.noise(t + 1, { dur: 0.05, vol: 0.32, type: 'highpass', f: 2200 });
    a.tone(t + 1, { f: 150, f2: 45, dur: 0.3, vol: 0.3 });
    a.noise(t + 1.02, { dur: 0.6, vol: 0.14, type: 'lowpass', f: 2400, f2: 500 });
  },
  tide_wave: (a, t) => { // the sea drawing back and swelling, then the wave breaking and rolling the length of the room
    a.noise(t, { dur: 1, vol: 0.14, type: 'lowpass', f: 160, f2: 900, attack: 0.85 });
    a.tone(t, { type: 'sawtooth', f: 45, f2: 70, dur: 1, vol: 0.06, lp: 260, attack: 0.7 });
    a.noise(t + 1, { dur: 0.35, vol: 0.3, f: 600, f2: 2800, q: 0.5, attack: 0.02 });
    a.tone(t + 1, { f: 110, f2: 38, dur: 0.5, vol: 0.32 });
    a.noise(t + 1.1, { dur: 2.2, vol: 0.16, type: 'lowpass', f: 1500, f2: 500, attack: 0.1 });
    a.noise(t + 1.1, { dur: 2, vol: 0.06, type: 'highpass', f: 4500, f2: 3000, attack: 0.2 });
  },
  tide_whirl: (a, t) => { // water starting to wheel, a low hum under it, the rush rising and falling as it turns
    a.tone(t, { type: 'sawtooth', f: 55, f2: 62, dur: 3.6, vol: 0.05, lp: 240, attack: 0.5 });
    [0, 0.6, 1.2, 1.8, 2.4, 3].forEach((d, i) => a.noise(t + d, { dur: 0.8, vol: 0.1, f: i % 2 ? 1100 : 500, f2: i % 2 ? 500 : 1100, q: 2, attack: 0.3 }));
    a.noise(t + 0.6, { dur: 3, vol: 0.05, type: 'lowpass', f: 400, f2: 300, attack: 0.4 });
  },
  tide_song: (a, t) => { // a breath drawn into the throat sac, then three sung notes, one for each ring as it leaves
    a.noise(t, { dur: 0.6, vol: 0.06, type: 'lowpass', f: 300, f2: 1200, attack: 0.4 });
    [[0.7, 69], [1.2, 74], [1.7, 66]].forEach(([d, m]) => {
      a.tone(t + d, { type: 'triangle', f: mtof(m), f2: mtof(m) * 0.98, dur: 0.7, vol: 0.07, attack: 0.04 });
      a.tone(t + d, { f: mtof(m + 12), dur: 0.5, vol: 0.025, attack: 0.04, detune: 8 });
      a.noise(t + d, { dur: 0.08, vol: 0.06, type: 'highpass', f: 3000 });
    });
  },
  tide_phase: (a, t) => { // the coral cracking away piece by piece, then its wail rising, drowned and hollow
    [0.15, 0.32, 0.46, 0.6, 0.72, 0.82, 0.9, 0.97].forEach((d, i) => a.tone(t + d, { type: 'triangle', f: 1500 + (i % 3) * 350, f2: 900, dur: 0.05, vol: 0.04 + i * 0.004 }));
    a.noise(t, { dur: 1.2, vol: 0.08, type: 'lowpass', f: 300, f2: 1500, attack: 0.9 });
    a.tone(t + 1, { type: 'sawtooth', f: 220, f2: 520, dur: 1, vol: 0.06, lp: 1400, attack: 0.25 });
    a.tone(t + 1, { type: 'sawtooth', f: 226, f2: 530, dur: 1, vol: 0.05, lp: 1300, attack: 0.25, detune: 30 });
    a.noise(t + 1.45, { dur: 0.7, vol: 0.24, f: 500, f2: 2200, q: 0.6, attack: 0.02 });
    a.tone(t + 1.45, { f: 130, f2: 45, dur: 0.5, vol: 0.3 });
  },
  tide_death: (a, t) => { // a long whale's song falling away, the water draining out of the room, one last low note
    a.tone(t, { type: 'triangle', f: 330, f2: 220, dur: 0.9, vol: 0.07, attack: 0.15 });
    a.tone(t + 0.7, { type: 'triangle', f: 260, f2: 340, dur: 0.6, vol: 0.06, attack: 0.1 });
    a.tone(t + 1.2, { type: 'triangle', f: 300, f2: 150, dur: 1.2, vol: 0.06, attack: 0.1 });
    a.noise(t, { dur: 1.8, vol: 0.1, type: 'lowpass', f: 900, f2: 160, attack: 0.2 });
    [0.4, 0.75, 1.1, 1.5].forEach((d, i) => a.tone(t + d, { f: 500 - i * 60, f2: 700 - i * 70, dur: 0.05, vol: 0.035 }));
    a.tone(t + 1.6, { f: mtof(45), dur: 1.4, vol: 0.06, attack: 0.1 });
  },
  thornmaw_death: (a, t) => { // a long creak sinking into the earth, the roots letting go, the flower wilting
    a.tone(t, { type: 'sawtooth', f: 140, f2: 40, dur: 1.6, vol: 0.12, lp: 700, lp2: 150, attack: 0.05 });
    a.noise(t, { dur: 1.5, vol: 0.12, f: 900, f2: 160, q: 1.4, attack: 0.1 });
    [0.3, 0.7, 1.1].forEach((d, i) => a.noise(t + d, { dur: 0.05, vol: 0.14 - i * 0.03, type: 'highpass', f: 1500 }));
    a.tone(t + 0.4, { type: 'triangle', f: 660, f2: 220, dur: 1.1, vol: 0.04, attack: 0.1 });
    a.noise(t + 0.5, { dur: 1.0, vol: 0.05, type: 'highpass', f: 3500, f2: 2200, attack: 0.3 });
    a.notes(t + 0.9, [62, 69], 0.2, { type: 'triangle', dur: 1.2, vol: 0.05 });
    a.tone(t + 1.45, { f: 80, f2: 38, dur: 0.4, vol: 0.25 });
  },
  cinder_death: (a, t) => { // the fire gutters out in puffs and a long hiss, the armor sighs empty and clatters, a last ember chimes
    a.noise(t, { dur: 1.6, vol: 0.18, type: 'highpass', f: 5000, f2: 1200, attack: 0.05 });
    a.tone(t, { type: 'sawtooth', f: 110, f2: 30, dur: 1.5, vol: 0.1, lp: 900, lp2: 120 });
    [0.2, 0.5, 0.85].forEach((d, i) => a.noise(t + d, { dur: 0.18, vol: 0.12 - i * 0.03, type: 'lowpass', f: 900, f2: 200 }));
    a.notes(t + 0.6, [57, 52, 45], 0.25, { type: 'triangle', dur: 0.9, vol: 0.06 });
    [[0.95, 640], [1.08, 480], [1.18, 820], [1.32, 560]].forEach(([d, f]) => a.tone(t + d, { type: 'triangle', f, f2: f * 0.85, dur: 0.12, vol: 0.05 }));
    a.tone(t + 1.5, { f: mtof(81), dur: 1, vol: 0.03, attack: 0.02 });
  },
  rime_death: (a, t) => { // her crown and wings coming apart in a long cascade of falling icicles, chiming away to one cold note
    a.noise(t, { dur: 0.5, vol: 0.2, type: 'highpass', f: 4200, f2: 2000, attack: 0.002 });
    a.tone(t, { type: 'sawtooth', f: 160, f2: 60, dur: 1.2, vol: 0.06, lp: 900, lp2: 200 });
    a.notes(t + 0.05, [103, 98, 100, 96, 91, 93, 89, 84, 86, 79], 0.1, { type: 'triangle', dur: 0.5, vol: 0.045 });
    [0.3, 0.55, 0.85, 1.1].forEach((d, i) => a.noise(t + d, { dur: 0.15, vol: 0.12 - i * 0.02, type: 'highpass', f: 3000 - i * 300 }));
    a.noise(t + 0.4, { dur: 1.2, vol: 0.05, type: 'highpass', f: 6000, f2: 3500, attack: 0.3 });
    a.tone(t + 1.1, { f: mtof(72), dur: 1.6, vol: 0.05, attack: 0.1 });
    a.tone(t + 1.1, { type: 'triangle', f: mtof(84), dur: 1.2, vol: 0.02, attack: 0.2 });
  },
  // monster signature moves, mv_<region>_<archetype>, played as the move is unleashed
  mv_forest_brute: (a, t) => { // a slam, then thorns scraping up
    a.tone(t, { f: 95, f2: 40, dur: 0.3, vol: 0.35 });
    a.noise(t + 0.05, { dur: 0.45, vol: 0.12, f: 500, f2: 2400, q: 3, attack: 0.12 });
    a.tone(t + 0.1, { type: 'sawtooth', f: 170, f2: 250, dur: 0.3, vol: 0.05, lp: 900, q: 4 });
  },
  mv_forest_lunger: (a, t) => { // a growl that ends in a snap of jaws
    a.tone(t, { type: 'sawtooth', f: 105, f2: 85, dur: 0.26, vol: 0.09, lp: 520, q: 3 });
    a.noise(t + 0.24, { dur: 0.05, vol: 0.2, type: 'highpass', f: 2500 });
    a.tone(t + 0.24, { type: 'triangle', f: 620, f2: 190, dur: 0.06, vol: 0.12 });
  },
  mv_forest_skirmisher: (a, t) => { // three pods popping loose in a rustle of leaves
    [0, 0.08, 0.16].forEach((d, i) => a.tone(t + d, { type: 'triangle', f: 480 + i * 150, f2: 900 + i * 200, dur: 0.06, vol: 0.1 }));
    a.noise(t, { dur: 0.3, vol: 0.06, type: 'highpass', f: 3200, f2: 2000, attack: 0.04 });
  },
  mv_forest_ranged: (a, t) => { // a creaking draw and a woody twang
    a.noise(t, { dur: 0.22, vol: 0.06, f: 1300, f2: 900, q: 6, attack: 0.12 });
    a.tone(t + 0.22, { type: 'sawtooth', f: 330, f2: 290, dur: 0.18, vol: 0.06, lp: 1500 });
    a.tone(t + 0.22, { f: 165, f2: 110, dur: 0.12, vol: 0.14 });
  },
  mv_swamp_brute: (a, t) => { // a wet heave
    a.noise(t, { dur: 0.32, vol: 0.18, type: 'lowpass', f: 380, f2: 950, attack: 0.08 });
    a.tone(t, { f: 70, f2: 115, dur: 0.3, vol: 0.25 });
  },
  mv_swamp_lunger: (a, t) => { // a slurping suck
    a.tone(t, { f: 290, f2: 920, dur: 0.18, vol: 0.12, attack: 0.02 });
    a.noise(t + 0.1, { dur: 0.22, vol: 0.12, type: 'lowpass', f: 1200, f2: 300, q: 4 });
  },
  mv_swamp_skirmisher: (a, t) => { // a swelling buzz, two wings beating against each other
    a.tone(t, { type: 'sawtooth', f: 220, f2: 330, dur: 0.45, vol: 0.06, lp: 1800, attack: 0.08 });
    a.tone(t, { type: 'sawtooth', f: 233, f2: 347, dur: 0.45, vol: 0.05, lp: 1800, attack: 0.08 });
  },
  mv_swamp_ranged: (a, t) => { // a gurgle, then a spit
    [0, 0.05, 0.1].forEach((d, i) => a.tone(t + d, { f: 180 + i * 45, f2: 120, dur: 0.06, vol: 0.12 }));
    a.noise(t + 0.15, { dur: 0.12, vol: 0.15, f: 1800, f2: 600, q: 2 });
  },
  mv_desert_brute: (a, t) => { // a deep boom and a rush of sand
    a.tone(t, { f: 62, f2: 30, dur: 0.5, vol: 0.4 });
    a.noise(t, { dur: 0.6, vol: 0.15, f: 3000, f2: 400, q: 0.7, attack: 0.02 });
  },
  mv_desert_lunger: (a, t) => { // claws digging down
    [0, 0.06, 0.12, 0.18, 0.24].forEach((d, i) => a.noise(t + d, { dur: 0.05, vol: 0.12, f: 1600 - i * 200, q: 2 }));
    a.tone(t, { f: 140, f2: 60, dur: 0.35, vol: 0.12 });
  },
  mv_desert_skirmisher: (a, t) => { // a whirlwind winding up, with a thin whistle
    a.noise(t, { dur: 0.8, vol: 0.16, f: 400, f2: 2200, q: 2.5, attack: 0.3 });
    a.tone(t, { f: 700, f2: 1400, dur: 0.6, vol: 0.03, attack: 0.2 });
  },
  mv_desert_ranged: (a, t) => { // a sling whirling, then the release
    [0, 0.1, 0.2].forEach((d) => a.noise(t + d, { dur: 0.08, vol: 0.1, f: 900, f2: 1500, q: 3 }));
    a.tone(t + 0.28, { type: 'triangle', f: 500, f2: 250, dur: 0.08, vol: 0.1 });
  },
  mv_mountain_brute: (a, t) => { // a stomp, then rocks rattling loose overhead
    a.tone(t, { f: 80, f2: 32, dur: 0.4, vol: 0.4 });
    [0.15, 0.27, 0.36, 0.48].forEach((d, i) => a.noise(t + d, { dur: 0.07, vol: 0.13, type: 'lowpass', f: 900 - i * 120 }));
  },
  mv_mountain_lunger: (a, t) => { // a snort, then claws scraping stone
    a.noise(t, { dur: 0.12, vol: 0.14, f: 700, f2: 300, q: 1.5 });
    a.tone(t + 0.12, { type: 'sawtooth', f: 90, f2: 70, dur: 0.25, vol: 0.08, lp: 400 });
    a.noise(t + 0.14, { dur: 0.2, vol: 0.1, type: 'highpass', f: 2800, f2: 1800 });
  },
  mv_mountain_skirmisher: (a, t) => { // a shriek, then wingbeats climbing away
    a.tone(t, { type: 'sawtooth', f: 1300, f2: 900, dur: 0.22, vol: 0.05, lp: 3000, q: 3 });
    [0.2, 0.32, 0.44].forEach((d) => a.noise(t + d, { dur: 0.06, vol: 0.1, type: 'lowpass', f: 600 }));
  },
  mv_mountain_ranged: (a, t) => { // a grunt and the grind of a boulder hefted
    a.tone(t, { type: 'sawtooth', f: 120, f2: 95, dur: 0.18, vol: 0.08, lp: 500 });
    a.noise(t + 0.08, { dur: 0.3, vol: 0.12, type: 'lowpass', f: 300, f2: 500, q: 2 });
  },
  mv_snow_brute: (a, t) => { // a roar, and snow packed with a crunch
    a.tone(t, { type: 'sawtooth', f: 140, f2: 90, dur: 0.4, vol: 0.1, lp: 600, attack: 0.05 });
    [0.32, 0.38].forEach((d) => a.noise(t + d, { dur: 0.06, vol: 0.14, f: 1800, q: 1.2 }));
  },
  mv_snow_lunger: (a, t) => { // a long icy exhale
    a.noise(t, { dur: 0.7, vol: 0.15, type: 'highpass', f: 1800, f2: 4200, attack: 0.15 });
    a.tone(t, { f: 2600, f2: 2100, dur: 0.6, vol: 0.02, attack: 0.2 });
  },
  mv_snow_skirmisher: (a, t) => { // a falling glassy chime
    a.notes(t, [100, 96, 91, 88], 0.05, { dur: 0.3, vol: 0.05 });
  },
  mv_snow_ranged: (a, t) => { // a crystalline draw and a ringing release
    a.tone(t, { f: 1500, f2: 2400, dur: 0.25, vol: 0.03, attack: 0.15 });
    a.tone(t + 0.25, { type: 'triangle', f: 1800, f2: 900, dur: 0.12, vol: 0.08 });
  },
  mv_volcanic_brute: (a, t) => { // a slam, then a hiss as the ground splits
    a.tone(t, { f: 70, f2: 28, dur: 0.45, vol: 0.4 });
    a.noise(t + 0.08, { dur: 0.6, vol: 0.12, type: 'highpass', f: 3000, f2: 1500, attack: 0.1 });
  },
  mv_volcanic_lunger: (a, t) => { // a snarl over crackling embers
    a.tone(t, { type: 'sawtooth', f: 130, f2: 100, dur: 0.3, vol: 0.09, lp: 650, q: 4 });
    [0.02, 0.09, 0.15, 0.24].forEach((d) => a.noise(t + d, { dur: 0.02, vol: 0.12, f: 3000, q: 4 }));
  },
  mv_volcanic_skirmisher: (a, t) => { // a whoosh of flame
    a.noise(t, { dur: 0.45, vol: 0.18, type: 'lowpass', f: 300, f2: 2600, attack: 0.08 });
    a.tone(t, { f: 180, f2: 360, dur: 0.35, vol: 0.06 });
  },
  mv_volcanic_ranged: (a, t) => { // a hacking cough, then a fiery whomp
    [0, 0.08].forEach((d) => a.noise(t + d, { dur: 0.06, vol: 0.12, f: 900, q: 2 }));
    a.noise(t + 0.18, { dur: 0.3, vol: 0.18, type: 'lowpass', f: 1500, f2: 200 });
    a.tone(t + 0.18, { f: 120, f2: 60, dur: 0.2, vol: 0.2 });
  },
};

// Small random pitch drift so repeated combat sounds don't machine-gun.
const VARY = new Set(['swing', 'hit', 'block', 'dash', 'arrow', 'talk', 'eat', 'splash', 'hurt', 'rime_shard']);

// ---------- engine ----------
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.cur = null;          // active music track state
    this._pending = null;     // music key requested before init()
    this._mv = 0.5;
    this._sv = 0.7;
    this._last = Object.create(null);
    this._timer = null;
    this._plays = 0;
    this._p = 1;              // current sfx pitch multiplier
    this._v = 1;              // current sfx volume multiplier
    this._tock = false;
  }

  get musicVolume() { return this._mv; }
  get sfxVolume() { return this._sv; }

  init() {
    try {
      if (!this.ctx) {
        const AC = G.AudioContext || G.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        this._build(ctx);
        this.ctx = ctx;
        this._timer = setInterval(() => this._schedule(), TICK_MS);
      }
      if (this.ctx.state !== 'running' && this.ctx.resume) {
        const r = this.ctx.resume();
        if (r && r.catch) r.catch(() => {});
      }
      if (this._pending) {
        const k = this._pending;
        this._pending = null;
        this.playMusic(k);
      }
    } catch (e) { /* audio unavailable: stay silent */ }
  }

  // Mixer: music/sfx buses -> master -> highpass -> compressor -> out, with a shared reverb.
  _build(c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.3;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 32;
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(hp); hp.connect(comp); comp.connect(c.destination);

    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(c, 2.8);
    this.verb.connect(this.master);

    this.musicDry = c.createGain();
    this.musicWet = c.createGain();
    this.musicDry.gain.value = this.musicWet.gain.value = this._mv;
    this.musicDry.connect(this.master);
    this.musicWet.connect(this.verb);

    this.sfxIn = c.createGain();
    this.sfxIn.gain.value = this._sv;
    this.sfxIn.connect(this.master);
    const sfxSend = c.createGain();
    sfxSend.gain.value = 0.15;
    this.sfxIn.connect(sfxSend); sfxSend.connect(this.verb);

    const n = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  // Procedural impulse response: decaying stereo noise that darkens over its tail.
  _impulse(c, sec) {
    const sr = c.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.015);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = i / len;
        lp += (0.85 - 0.7 * x) * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - x, 3) * Math.min(1, (i - pre) / (sr * 0.004));
      }
    }
    return buf;
  }

  // ---------- music control ----------
  playMusic(key) {
    const def = Object.prototype.hasOwnProperty.call(TRACKS, key) ? TRACKS[key] : null;
    if (!def) return this.stopMusic();
    if (!this.ctx) { this._pending = key; return; }
    if (this.cur && this.cur.key === key) return;
    this._pending = null;
    this._fadeOut(this.cur);

    const c = this.ctx, now = c.currentTime;
    const out = c.createGain(), send = c.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(def.gain, now + FADE);
    send.gain.value = def.wet;
    out.connect(this.musicDry); out.connect(send); send.connect(this.musicWet);

    const ms = def.mel && (def.mel.scale || def.scale);
    const salt = this._plays++ * 7919;
    this.cur = {
      key, def, out, send, salt, done: false,
      step: 0, next: now + 0.1, stepDur: 60 / def.bpm / def.sub,
      rng: rng32(def.seed * 1013 + salt), mrng: rng32(def.seed),
      prog: def.progs[0], pi: 0, deg: 0, tones: [0, 4, 7],
      arpOn: true, arpUp: 0, arpRev: false,
      melDeg: ms ? Math.round(((def.mel.lo + def.mel.hi) / 2 - def.root) / 12 * ms.length) : 0,
      melBusy: 0,
    };
    this._schedule();
  }

  stopMusic() {
    this._pending = null;
    if (this.cur) { this._fadeOut(this.cur); this.cur = null; }
  }

  _fadeOut(tr) {
    if (!tr || !this.ctx) return;
    tr.done = true;
    const g = tr.out.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    setTimeout(() => { try { tr.out.disconnect(); tr.send.disconnect(); } catch (e) { /* already gone */ } },
      (FADE + 0.3) * 1000);
  }

  setMusicVolume(v) {
    this._mv = clamp(+v || 0, 0, 1);
    if (this.ctx) for (const n of [this.musicDry, this.musicWet]) n.gain.setTargetAtTime(this._mv, this.ctx.currentTime, 0.05);
  }

  setSfxVolume(v) {
    this._sv = clamp(+v || 0, 0, 1);
    if (this.ctx) this.sfxIn.gain.setTargetAtTime(this._sv, this.ctx.currentTime, 0.05);
  }

  update() { this._schedule(); } // scheduling is timer-driven; this is a harmless extra pump

  // ---------- sequencer ----------
  _schedule() {
    const c = this.ctx, tr = this.cur;
    if (!c || !tr || tr.done) return;
    const now = c.currentTime;
    const ahead = G.document && G.document.hidden ? 1.2 : LOOKAHEAD; // timers throttle in hidden tabs
    if (tr.next < now - 0.2) tr.next = now + 0.05;                    // recover after a stall
    while (!tr.done && tr.next < now + ahead) {
      this._step(tr, tr.next);
      tr.step++;
      tr.next += tr.stepDur;
    }
  }

  _step(tr, t) {
    const d = tr.def, s = tr.step, rng = tr.rng, sd = tr.stepDur, out = tr.out;
    const play = (midi, vel, steps) =>
      this._piano(out, t + (rng() - 0.5) * 0.012, midi, vel * (0.88 + rng() * 0.24), d.voice, steps * sd);

    // Scripted (non-looping) cue
    if (d.script) {
      for (const [at, notes, hold, vel = 0.5] of d.script) if (at === s) for (const n of notes) play(n, vel, hold);
      if (s >= d.length) tr.done = true;
      return;
    }

    const cs = d.chordSteps, pos = s % cs, ci = (s / cs) | 0;

    // Chord change: advance progression, pick a new one at cycle end, roll per-chord variation
    if (pos === 0) {
      if (tr.pi >= tr.prog.length) {
        tr.prog = rng() < 0.4 ? d.progs[0] : d.progs[(rng() * d.progs.length) | 0];
        tr.pi = 0;
      }
      tr.deg = tr.prog[tr.pi++];
      tr.tones = chordTones(d, tr.deg);
      tr.arpOn = rng() >= d.breathe;
      tr.arpUp = rng() < 0.15 ? (d.root >= 62 ? -12 : 12) : 0;
      tr.arpRev = rng() < 0.2;
      if (ci % 2 === 0) { // new phrase: reseed melody so motifs recur (A B A C ...) without a fixed loop
        tr.mrng = rng32(d.seed * 7919 + MOTIF[(ci >> 1) % MOTIF.length] * 131 + ((ci / 16) | 0) * 977 + tr.salt);
        if (d.drone) this._pad(out, t, d.root + 12 * d.droneOct, cs * 2 * sd + 1.2, d.drone);
      }
    }

    // Bass
    if (d.bass) {
      const ch = d.bass[pos % d.bass.length], off = BASS_OFF[ch];
      if (off !== undefined) {
        const r = degSemi(d.scale, tr.deg), b = mod(r, 12) > 6 ? mod(r, 12) - 12 : mod(r, 12);
        const semi = b + degSemi(d.scale, tr.deg + off) - r + (ch === 'O' ? 12 : 0);
        play(d.root + 12 * d.bassOct + semi, d.bassVel, d.bassHold);
      }
    }

    // Soft chord comping
    if (d.comp && d.comp[pos % d.comp.length] === 'x') {
      for (const x of tr.tones) play(d.root + 12 * d.compOct + x, d.compVel, d.compHold);
    }

    // Arpeggio
    if (d.arp && tr.arpOn) {
      const p = d.arp, i = pos % p.length, ch = p[tr.arpRev ? p.length - 1 - i : i];
      if (ch >= '0' && ch <= '9' && rng() < d.arpProb) {
        const k = +ch, n = tr.tones.length;
        play(d.root + 12 * d.arpOct + tr.arpUp + tr.tones[k % n] + 12 * ((k / n) | 0), d.arpVel, d.arpHold);
      }
    }

    // Melody: seeded random walk, monophonic, snapped toward chord tones
    const m = d.mel;
    if (m && s >= tr.melBusy) {
      const mr = tr.mrng, ms = m.scale || d.scale, onBeat = pos % d.sub === 0;
      if (mr() < m.density * (onBeat ? 1.4 : 0.6)) {
        const mm = (x) => d.root + degSemi(ms, x);
        const mv = mr() < (m.leap || 0)
          ? (mr() < 0.5 ? -1 : 1) * (3 + ((mr() * 3) | 0))
          : [-2, -1, -1, 0, 1, 1, 2][(mr() * 7) | 0];
        let deg = tr.melDeg + mv;
        while (mm(deg) > m.hi) deg--;
        while (mm(deg) < m.lo) deg++;
        if (pos === 0 || mr() < 0.5) {
          const pcs = tr.tones.map((x) => mod(x, 12));
          for (const o of [0, 1, -1, 2, -2]) {
            if (pcs.includes(mod(degSemi(ms, deg + o), 12))) { deg += o; break; }
          }
        }
        tr.melDeg = deg;
        const hold = Math.max(1, Math.round((1 + ((mr() * 3) | 0)) * (m.hold || 1)));
        play(mm(deg), m.vel, hold + 1);
        tr.melBusy = s + hold;
      }
    }

    // Water drips (cave/wetland ambience)
    if (d.drip && rng() < d.drip) this._drip(out, t + rng() * sd, 0.5 + rng() * 0.5, 1000 + rng() * 1600);
  }

  // ---------- music voices ----------
  // Soft piano: sine fundamental + detuned triangle + decaying upper partial, through a
  // closing low-pass. Percussive attack, long exponential tail (longer for low notes).
  _piano(dest, t, midi, vel, v, hold) {
    const c = this.ctx;
    t = Math.max(t, c.currentTime);
    const f = mtof(midi), bright = v.bright;
    const decay = clamp(5.5 - (midi - 36) * 0.07, 0.7, 6) * v.decay;
    const peak = 0.2 * vel * (midi < 48 ? 0.85 : 1);
    const end = t + Math.max(0.06, Math.min(hold, decay * 1.2));
    const amp = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Math.min(15000, f * (2 + 6 * bright) + 600 * vel), t);
    lp.frequency.setTargetAtTime(Math.max(200, f * 1.3), t + 0.01, decay * 0.3);
    const g = amp.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + 0.005);
    g.setTargetAtTime(peak * 0.4, t + 0.005, 0.12);
    if (end > t + 0.3) g.setTargetAtTime(0, t + 0.3, decay / 3);
    g.setTargetAtTime(0, end, 0.1); // damper
    lp.connect(amp); amp.connect(dest);
    const stop = end + 0.7;
    const partial = (type, ratio, level, tc) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type; o.frequency.value = f * ratio;
      og.gain.setValueAtTime(level, t);
      if (tc) og.gain.setTargetAtTime(0, t, tc);
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(stop);
      return o;
    };
    partial('sine', 1, 1);
    partial('triangle', 1.0025, 0.12 + 0.3 * bright);
    const top = partial('sine', v.bell ? 4 : 2, (v.bell ? 0.5 : 0.25) * bright, v.bell ? 0.5 : 0.35 * v.decay);
    top.onended = () => amp.disconnect();
  }

  // Sustained low drone with slow swell.
  _pad(dest, t, midi, dur, vel) {
    const c = this.ctx, f = mtof(midi), a = Math.min(1.5, dur / 3), peak = 0.1 * vel;
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(1200, f * 4); lp.Q.value = 0.3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + dur - a);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(dest);
    let last;
    for (const [r, type, lvl] of [[1, 'sine', 1], [1.004, 'sine', 0.7], [2, 'triangle', 0.25]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type; o.frequency.value = f * r; og.gain.value = lvl;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + dur + 0.05);
      last = o;
    }
    last.onended = () => g.disconnect();
  }

  // Short upward-chirping sine: a water drip.
  _drip(dest, t, vel, f) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.7, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, 0.04);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.35);
    o.onended = () => g.disconnect();
  }

  // ---------- SFX ----------
  sfx(name, opts = {}) {
    const c = this.ctx;
    if (!c || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
    const now = c.currentTime;
    if (now - (this._last[name] ?? -1) < SFX_GAP) return;
    const vol = clamp(opts.volume ?? 1, 0, 1);
    if (!(vol > 0)) return;
    this._last[name] = now;
    this._p = (opts.pitch > 0 ? opts.pitch : 1) * (VARY.has(name) ? 0.96 + Math.random() * 0.08 : 1);
    this._v = vol;
    try { SFX[name](this, now + 0.005); } catch (e) { /* never let a sound break the game */ }
  }

  _env(g, t, vol, attack, dur) {
    const v = Math.max(0.0002, vol * this._v);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  }

  tone(t, { type = 'sine', f, f2 = f, dur = 0.15, vol = 0.2, attack = 0.004, lp = 0, lp2 = lp, q = 0.7, detune = 0 }) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), p = this._p;
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f * p, t);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2 * p, t + dur);
    let src = o;
    if (lp) {
      const b = c.createBiquadFilter();
      b.type = 'lowpass'; b.Q.value = q;
      b.frequency.setValueAtTime(lp, t);
      if (lp2 !== lp) b.frequency.exponentialRampToValueAtTime(lp2, t + dur);
      o.connect(b); src = b;
    }
    this._env(g, t, vol, attack, dur);
    src.connect(g); g.connect(this.sfxIn);
    o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => g.disconnect();
  }

  noise(t, { dur = 0.2, vol = 0.2, type = 'bandpass', f = 1000, f2 = f, q = 1, attack = 0.005 }) {
    const c = this.ctx, s = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain(), p = this._p;
    s.buffer = this.noiseBuf; s.loop = true;
    b.type = type; b.Q.value = q;
    b.frequency.setValueAtTime(f * p, t);
    if (f2 !== f) b.frequency.exponentialRampToValueAtTime(f2 * p, t + dur);
    this._env(g, t, vol, attack, dur);
    s.connect(b); b.connect(g); g.connect(this.sfxIn);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    s.onended = () => g.disconnect();
  }

  notes(t, midis, gap, o) {
    midis.forEach((m, i) => this.tone(t + i * gap, { ...o, f: mtof(m) }));
  }
}

export const MUSIC_KEYS = Object.keys(TRACKS);
export const SFX_NAMES = Object.keys(SFX);
