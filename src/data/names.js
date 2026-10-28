// Seeded name generation so each world remixes its settlements and people.

const PLACE_PARTS = {
  0: { a: ['Elm', 'Fern', 'Briar', 'Moss', 'Oak', 'Hazel', 'Thorn', 'Wren', 'Alder', 'Bramble'], b: ['hollow', 'ford', 'wick', 'stead', 'glen', 'mere', 'brook', 'dale'] },
  1: { a: ['Reed', 'Mire', 'Fen', 'Silt', 'Heron', 'Murk', 'Willow', 'Peat'], b: ['water', 'marsh', 'moor', 'bank', 'pool', 'stilts', 'fen'] },
  2: { a: ['Sun', 'Dune', 'Amber', 'Mirage', 'Ochre', 'Saffron', 'Dust', 'Cinnabar'], b: ['well', 'spring', 'rest', 'reach', 'oasis', 'post', 'gate'] },
  3: { a: ['Crag', 'Stone', 'High', 'Grey', 'Granite', 'Eagle', 'Iron', 'Slate'], b: ['hold', 'watch', 'keep', 'perch', 'step', 'pass', 'crest'] },
  4: { a: ['Frost', 'Rime', 'Winter', 'Pale', 'Hoar', 'Glacier', 'White', 'Sleet'], b: ['lodge', 'haven', 'hearth', 'peak', 'fell', 'cairn'] },
  5: { a: ['Ash', 'Cinder', 'Ember', 'Soot', 'Char', 'Slag', 'Brand', 'Smolder'], b: ['camp', 'forge', 'rest', 'scar', 'vent', 'hold'] },
};

const GIVEN = ['Maren', 'Tobin', 'Ilsa', 'Corwin', 'Petra', 'Aldric', 'Wynn', 'Sela', 'Bram', 'Odile', 'Fenn', 'Rhea', 'Garrick', 'Lio', 'Nessa', 'Hale', 'Isolde', 'Dov', 'Marta', 'Quill', 'Tamsin', 'Edda', 'Joss', 'Kael', 'Liesl', 'Orrin', 'Pell', 'Runa', 'Sorrel', 'Tib', 'Vesna', 'Yara', 'Arlo', 'Bette', 'Cato', 'Delia', 'Emrys', 'Faye', 'Gideon', 'Hollis', 'Inga', 'Jory'];
const EPITHET = ['the Elder', 'Ashhand', 'Quickstep', 'of the Ford', 'Greycloak', 'the Lame', 'Brighteye', 'the Patient', 'Salt', 'Two-Rivers', 'Underhill', 'Lanternjaw'];

export function placeName(rng, biome, used = new Set()) {
  const parts = PLACE_PARTS[biome] || PLACE_PARTS[0];
  for (let i = 0; i < 40; i++) {
    const n = rng.pick(parts.a) + rng.pick(parts.b);
    if (!used.has(n)) { used.add(n); return n; }
  }
  const n = rng.pick(parts.a) + rng.pick(parts.b) + ' ' + rng.int(2, 9);
  used.add(n);
  return n;
}

export function personName(rng, used = new Set(), withEpithet = false) {
  for (let i = 0; i < 60; i++) {
    const n = rng.pick(GIVEN);
    if (!used.has(n)) { used.add(n); return withEpithet ? `${n} ${rng.pick(EPITHET)}` : n; }
  }
  const n = rng.pick(GIVEN) + ' ' + rng.pick(EPITHET);
  used.add(n);
  return n;
}
