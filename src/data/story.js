// The story bible: lore entries, cutscene scripts and warden scenes. Pure data + builders.
//
// The shape of the tale:
//   An age ago the Firstflame fell. The Kindlers split it five ways: four sparks to the wardens
//   of Grove, Ash, Rime and Tide, and the fifth, the Hearth Ember, to a small village.
//   Vesper, a Kindler who would not share, was sealed beneath the Emberwake Spire as the
//   Unkindled. His cold Gloam is smothering the Hearth, and the starving wardens forget
//   themselves. The hero was found as a baby in the Hearth's ashes and can carry shards
//   unburned. Vesper wants the shards returned, because four lit sockets open the Spire.

// ---------------------------------------------------------------- lore entries
// Standing stones placed on the overworld (index k becomes poi id `lore${k}`). Keep the count
// at seven: world generation places one stone per entry.
export const STONE_LORE = [
  { title: 'The First Stone', text: 'Carved in old script: "Here fell the Firstflame. Here the Kindlers knelt. Here began the long keeping."' },
  { title: 'Stone of the Five', text: '"One flame, five sparks. Four to the wardens, one to the hearth. No hand may hold them all."' },
  { title: 'The Gardener\'s Stone', text: 'Scratched beneath moss: "The warden of thorns was a gardener once. It tends something still, even now."' },
  { title: 'Stone of Counted Flames', text: 'Etched in soot: "Ash falls upward near the Reliquary. Its warden counts every flame, lest a single one go out."' },
  { title: 'The Frozen Stone', text: 'Frost-rimed runes: "The Sovereign of rime keeps the high places still. It never learned the difference between still and safe."' },
  { title: 'The Drowned Stone', text: 'Half sunk in mud: "The fourth warden sang the tides in and out. The water remembers the song, even if no one else does."' },
  { title: 'The Sealing Stone', text: 'A cracked obelisk, its warning half chiseled away: "Beneath the Spire sleeps the one who would not share. When four sockets glow, the door will open for the one who carries..." The rest has been scraped off.' },
];

// Books found on bookshelves in houses and halls.
export const BOOKS = [
  { title: 'A Primer of the Ember', text: 'A child\'s rhyme, the pages soft with use: "The Ember is warm, the Ember is bright, it keeps the wardens sleeping at night. Feed it with kindness, never with greed, and it will give you all that you need."' },
  { title: 'The Kindler Vows', text: 'Copied out by hand: "I will tend the flame and never hold it. I will carry its warmth to others. I will not be warmed alone."' },
  { title: 'On the Wardens', text: 'A scholar\'s essay: "The Kindlers did not make the wardens from nothing. They chose beasts and spirits that already loved their lands, and gave each a spark to keep that love burning."' },
  { title: 'The Night of Two Fires', text: 'A village chronicle: "The Hearth flared so bright that night you could read by it in the next valley. In the morning the elder found a babe asleep in its ashes, unburned and smiling. We argued for a week about what it meant."' },
  { title: 'A Trader\'s Ledger', text: '"Ash in the desert wells again. Clean water up three coins. The captain swears the eastern ridge is hollow, and that something behind it is burning."' },
  { title: 'Field Notes of a Scout', text: '"Wolves moving in packs too large for the forest. They are not hunting. They are fleeing. From what?"' },
  { title: 'The Drowned Fane', text: 'A water-stained fragment: "The Tidewarden sang the waters in and out, a lullaby for the whole coast. When the singing stopped, the sea forgot where to go."' },
  { title: 'A Scorched Letter', text: 'Most of it is burned away: "...they say the fire must be shared. But shared fire is weak fire. Kept fire is forever. I will keep it, and I will never be cold again. —V."' },
];

// What each freed warden remembers. Recorded in the journal when its spirit speaks.
export const MEMORIES = {
  thornmaw: { title: 'Memory of the Grove', text: 'The Grove Spirit was a gardener before it was a warden. When the Hearth dimmed, a cold voice from the north told it to grow, and grow, and choke everything. The voice has a name: Vesper, the Unkindled.' },
  cinder: { title: 'Memory of the Ash', text: 'Vesper was the brightest of the Kindlers. He tried to swallow the Firstflame whole to live forever. The others split the fire five ways so no hand could ever hold it all, and sealed him beneath the Spire.' },
  rime: { title: 'Memory of the Rime', text: 'Some say a spark of the Firstflame itself fell into the Hearth the night it flared, and woke as a child. When all four shards return, the Spire door will open. The Rime Spirit begged you to be the one who walks through it.' },
};

// Every journal entry in reading order: id → {title, text, kind}.
export const LORE_ENTRIES = [
  ...STONE_LORE.map((e, k) => ({ id: `lore${k}`, kind: 'Standing stone', ...e })),
  ...BOOKS.map((e, k) => ({ id: `book${k}`, kind: 'Book', ...e })),
  ...Object.entries(MEMORIES).map(([k, e]) => ({ id: `memory:${k}`, kind: 'Warden\'s memory', ...e })),
];

// Records a lore entry. Returns true when it is new.
export function learnLore(state, id) {
  if (!state.progress.lore) state.progress.lore = [];
  if (!LORE_ENTRIES.some((e) => e.id === id) || state.progress.lore.includes(id)) return false;
  state.progress.lore.push(id);
  return true;
}

export const stonesRead = (state) => (state.progress.lore || []).filter((id) => id.startsWith('lore')).length;

// Which book sits on a building's shelf. Your own home keeps the chronicle of the night you
// were found; the other shelves share out the remaining books so every one can be found.
const SHELF_TYPES = ['home', 'house', 'shop', 'seer'];
const HOME_BOOK = 3;
export function bookFor(W, building) {
  if (building.type === 'home' && building.settlementId === 'home') return HOME_BOOK;
  const ids = W.props.filter((p) => p.kind === 'building' && SHELF_TYPES.includes(p.type) && !(p.type === 'home' && p.settlementId === 'home')).map((p) => p.id).sort();
  const others = BOOKS.map((_, k) => k).filter((k) => k !== HOME_BOOK);
  let h = 2166136261;
  for (const ch of String(W.seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return others[(Math.max(0, ids.indexOf(building.id)) + ((h >>> 0) % others.length)) % others.length];
}

// ---------------------------------------------------------------- voices
export const VOICE = {
  unkindled: { name: 'The Unkindled', color: '#c8a0ff' },
  unknown: { name: '???', color: '#c8a0ff' },
  narrator: { name: null, color: '#f4ead8' },
};

// ---------------------------------------------------------------- cutscenes
// Shot fields: art (panel art id), text, speaker, color, title/sub (big card), hold (seconds
// after typing finishes before auto-advance), wait (needs a key press), sfx (a name or a list of
// names / [name, opts]), cues ([[seconds, name, opts]] fired mid-shot), shake (panel shake).
// Warden scenes add: spotlight, hideBoss, omen/entrance (boss kind: what stirs, then its in-engine
// entrance), quake (screen shake + falling grit), roar ("r,g,b" vignette pulse; the boss roars),
// flash (seconds of white-out), slam (the title slams down), burst (outro light burst at focus).

export function introShots(className) {
  return [
    { art: 'stars', text: 'An age ago, a star fell burning out of the sky.', sfx: null, hold: 2.6 },
    { art: 'spire', text: 'Where it landed, the first Kindlers raised a Spire around its fire, and learned to keep it.' },
    { art: 'sparks', text: 'They split the Firstflame five ways. Four sparks went to the wardens of Grove, Ash, Rime and Tide, to keep the wild world in balance.', hold: 3 },
    { art: 'village', text: 'The fifth, the Hearth Ember, went to a little village to keep it warm. For a thousand years, it never once went out.' },
    { art: 'unkindled', text: 'But one Kindler wanted the whole fire for himself. The others sealed him in the dark beneath the Spire, and gave him a new name: the Unkindled.', hold: 3 },
    { art: 'gloam', text: 'Last night, the Hearth Ember guttered. Across the realm, the wardens stirred and forgot themselves... and deep beneath the Spire, something laughed.', shake: 1.5, hold: 3 },
    { art: 'bedroom', text: 'Wake up...', color: '#ffd8a0', hold: 1.6 },
    { art: 'bedroom', text: '...Emberwake.', color: '#ffd8a0', hold: 1.4, glow: true },
    { art: 'titlecard', title: 'Emberwake', sub: `A ${className} rises.`, hold: 2.8, sfx: 'levelup' },
  ];
}

// The elder shows you the guttering Hearth. ctx: {cls, elder, scout, outpost, dir, tip}
export function elderShots(c) {
  const E = { speaker: c.elder, color: '#f0c850', wait: true };
  return [
    { art: 'hearth', ...E, text: `${c.cls}, there you are. Come, look at the Hearth.` },
    { art: 'hearth', ...E, text: 'It guttered in the night. Forty years I have tended this flame, and I have never seen it so small. Something is smothering it.' },
    { art: 'realm', ...E, text: 'The Hearth is one of five sparks of the Firstflame. The other four are held by the wardens: Grove, Ash, Rime and Tide. When the Hearth weakens, the wardens forget what they were made to protect.' },
    { art: 'realm', ...E, text: 'Already the woods are choking. Ash falls in the desert wells, frost creeps down the high roads, and the western fane is drowning.' },
    { art: 'hearth', ...E, text: 'Bring their shards home and the Hearth can be rekindled. And you... the flame has always known you. You were found in its ashes, the night it burned brightest. If anyone can carry a shard without burning, it is you.' },
    { art: 'hearth', ...E, text: `Begin with the forest. Scout ${c.scout} keeps watch at ${c.outpost}, ${c.dir} of here. I've marked it on your map (M).` },
    { art: 'hearth', ...E, text: `One more thing: ${c.tip}. And hold your attack button to charge a spinning strike. It has saved many a wanderer.` },
  ];
}

// Shown when a warden is first met. Spotlight on the boss; letterboxed.
export const WARDENS = {
  thornmaw: {
    title: 'Thornmaw', sub: 'Warden of the Grove', color: '#9ae070',
    narration: 'Once it tended the forest. Now the forest tends its hunger.',
    omen: 'The floor heaves. Roots writhe beneath the stones...',
    rise: 'The warden of the Grove tears itself free of the earth!',
    rgb: '255,70,60',
    voice: 'GROW... GROW... THE COLD VOICE SAYS GROW OVER EVERYTHING...',
    hint: 'Let it charge into the walls, then strike while it is stunned.',
    spirit: { kind: 'stag', name: 'The Grove Spirit', color: '#a8f08a' },
    lines: [
      'The thorns are gone... I can see the sky again.',
      'I was a gardener once, small one. The Kindlers gave me a spark and asked me to keep the forest green. I kept it green, until the cold came up from the north and whispered: grow, grow, choke them all.',
      'That whisper has a name. Vesper, the one they called the Unkindled. He is starving the Hearth so the wardens forget themselves.',
      'Take my shard home. Let it warm the Hearth. And beware the voice in the cold.',
    ],
    taunt: { voice: 'unknown', lines: ['How touching. One spark, carried home by a child who does not even know what they are.', 'Go on, little ember. Gather them all... for me.'] },
  },
  cinder: {
    title: 'The Cinder Warden', sub: 'Keeper of the Ash', color: '#ffa060',
    narration: 'It guarded every fire in the wastes, until guarding became burning.',
    omen: 'The ash on the floor stirs... and begins to glow.',
    rise: 'Fire gathers into a shape, and the shape opens its eyes.',
    rgb: '255,150,40',
    voice: 'COUNT THE FLAMES. ONE GOES OUT, ALL GO OUT. YOU ARE A FLAME. HOLD STILL.',
    hint: 'When it stops to vent its heat, it is soft. Strike then.',
    spirit: { kind: 'phoenix', name: 'The Ash Spirit', color: '#ffb070' },
    lines: [
      'Ahh... I can breathe without burning. How long was I raging?',
      'I counted every flame in the wastes so none would go out. The cold one made me count faster, hotter, until the counting was all there was.',
      'Listen. Vesper was the brightest of the Kindlers. He tried to swallow the Firstflame whole to live forever. The others split the fire five ways so no hand could hold it all, and sealed him beneath the Spire.',
      'Take my shard, and the gloves I forged for the giants who once walked here. Lift what bars your way.',
    ],
    taunt: { voice: 'unkindled', lines: ['Two. You are faster than I hoped.', 'Do you dream of fire, little ember? I do. I dream of the night you were born.'] },
  },
  rime: {
    title: 'Rime Sovereign', sub: 'Warden of the High Snows', color: '#b8ecff',
    narration: 'It froze the world to keep it safe, and forgot what safe meant.',
    omen: 'Frost races across the stones. Your breath turns to ice.',
    rise: 'Out of the blizzard, something regal descends.',
    rgb: '120,200,255',
    voice: 'STILL. STAY STILL. NOTHING MOVES IN MY SANCTUARY. NOTHING WILL EVER BE HURT AGAIN.',
    hint: 'Dodge its dash and let it skid into the walls.',
    spirit: { kind: 'owl', name: 'The Rime Spirit', color: '#d0f4ff' },
    lines: [
      'Warmth... I had forgotten warmth.',
      'I kept the high places still and silent, so the mountains could sleep. When the Hearth dimmed, I froze everything that moved, to keep it safe. Safe, and still, forever.',
      'You carry three shards now, and they do not burn you. Do you know why? Some say a spark of the Firstflame itself fell into the Hearth the night it flared, and woke as a child.',
      'When all four shards return, the Spire door will open. Make sure it is you who walks through it, and not him.',
    ],
    taunt: { voice: 'unkindled', lines: ['Three. The last shard sleeps beneath the drowning water.', 'We are the same fire, you and I. Come home to the Spire.'] },
  },
};

// A quake with the arena empty, the warden's entrance, a roaring close-up, its name slamming
// down, then its voice and a tip. About twelve seconds; Esc twice skips.
const IMPACT = { thornmaw: 0.62, cinder: 0.98, rime: 1.58 }; // when each entrance lands (s)
export function bossIntroShots(kind) {
  const w = WARDENS[kind];
  if (!w) return [];
  return [
    { text: w.omen, color: '#c8b898', small: true, hideBoss: true, omen: kind, spotlight: true, quake: 1.5, hold: 0.4, sfx: [['gate', { pitch: 0.4 }], ['boss', { pitch: 0.5, volume: 0.6 }]] },
    { text: w.rise, color: w.color, entrance: kind, spotlight: true, quake: 4, hold: Math.max(0.6, 2.1 - w.rise.length / 42), cues: [[IMPACT[kind], 'explode', { pitch: 0.45 }], [IMPACT[kind] + 0.05, 'boss', { pitch: 0.8, volume: 0.7 }]] },
    { art: `portrait_${kind}`, text: w.narration, roar: w.rgb, shake: 5, flash: 0.3, hold: 0.5, sfx: [['boss', { pitch: 1.2 }], ['explode', { pitch: 0.6, volume: 0.5 }]] },
    { title: w.title, sub: w.sub, color: w.color, slam: true, spotlight: true, roar: w.rgb, quake: 1.5, hold: 1.8, sfx: [['explode', { pitch: 0.8 }], ['hit', { pitch: 0.4 }]] },
    { speaker: w.title, text: w.voice, color: '#ff8070', shakeText: true, spotlight: true, roar: w.rgb, quake: 1, hold: 1 },
    { text: `Tip: ${w.hint}`, color: '#b8a888', hold: 1.3, small: true },
  ];
}

export function bossOutroShots(kind, focus) {
  const w = WARDENS[kind];
  if (!w) return [];
  const S = { speaker: w.spirit.name, color: w.spirit.color, spirit: w.spirit.kind, focus, wait: true };
  const v = VOICE[w.taunt.voice];
  return [
    { text: 'As the warden falls, the cold burns out of it...', spirit: w.spirit.kind, focus, burst: true, hold: 1.8, sfx: [['explode', { pitch: 0.5, volume: 0.6 }], 'shrine'] },
    ...w.lines.map((text) => ({ ...S, text })),
    { text: 'The spirit melts into a warm, golden light.', spirit: w.spirit.kind, focus, fadeSpirit: true, hold: 1.6 },
    ...w.taunt.lines.map((text) => ({ speaker: v.name, color: v.color, text, gloam: true, wait: true, shakeText: true })),
  ];
}

// The Hearth is rekindled with three shards. ctx: {elder}
export function endingShots(c) {
  const v = VOICE.unkindled;
  return [
    { art: 'hearth', speaker: c.elder, color: '#f0c850', text: 'Three shards... Set them in the coals, child. Gently.', wait: true, shards: 3 },
    { art: 'rekindle', text: 'The Hearth Ember roared back to life, and its warmth ran out along every road.', sfx: 'levelup', hold: 2.6 },
    { art: 'healing', text: 'In the forest, the thorns drew back. The ash stopped falling. The frost let go of the high passes.', hold: 2.8 },
    { art: 'spiredoor', text: 'But far to the north, three sockets glowed on the Spire\'s great door... and the fourth stayed dark.', hold: 2.8 },
    { art: 'eyes', speaker: v.name, color: v.color, text: 'Three, little ember. The last shard sleeps beneath the drowning water of the western fane.', wait: true, shakeText: true },
    { art: 'eyes', speaker: v.name, color: v.color, text: 'Bring it to me. I will leave the door open.', wait: true, shakeText: true },
    { art: 'titlecard', title: 'Emberwake', sub: 'Chapter I complete. The Drowned Fane awaits.', hold: 3 },
  ];
}
