// Flavor for side quests: pets, herbs, riddles and the little stories around each quest type.

export const PETS = [
  { kind: 'cat', names: ['Biscuit', 'Pudding', 'Sir Whiskers', 'Mittens', 'Turnip', 'Smudge'] },
  { kind: 'dog', names: ['Pepper', 'Waffles', 'Captain', 'Bramble', 'Noodle'] },
  { kind: 'goat', names: ['Clover', 'Butterbean', 'Old Grumble', 'Duchess'] },
  { kind: 'hen', names: ['Nugget', 'Lady Cluck', 'Henrietta', 'Admiral Peck'] },
];

export const HERBS = [
  { item: 'moonpetal', plural: 'moonpetals', why: 'a tea that helps my grandmother sleep', after: 'Grandmother slept like a stone for the first time in months. She says you have kind eyes.', color: '#c8b0ff' },
  { item: 'sunburst cap', plural: 'sunburst caps', why: 'my famous stew. It could wake the dead, they say', after: 'The whole street came for stew last night. I saved you a bowl, in spirit.', color: '#ffb040' },
  { item: 'frostmint sprig', plural: 'frostmint sprigs', why: 'a salve for the blacksmith\'s burned hands', after: 'The smith\'s hands are healing nicely. He grumbled a thank-you, which for him is practically a song.', color: '#a0f0e0' },
  { item: 'emberroot', plural: 'emberroots', why: 'a tonic to keep the cold out of my bones', after: 'That tonic works wonders. I danced last night. Badly, but I danced.', color: '#ff7050' },
];

// Riddles: [question, answer, ...wrong answers]. Wrong answers carry no penalty.
export const RIDDLES = [
  ['The more you feed me, the hungrier I grow. Give me a drink, and I die.', 'Fire', 'A wolf', 'A river', 'A shadow'],
  ['I copy every move you make but never make a sound. Sunlight makes me; darkness takes me.', 'Your shadow', 'An echo', 'A ghost', 'The moon'],
  ['I have a bed but never sleep, a mouth but never eat, and I am always running.', 'A river', 'A fox', 'The wind', 'A road'],
  ['What gets wetter the more it dries?', 'A towel', 'A sponge', 'The rain', 'A fish'],
  ['The Kindlers kept me, the wardens guard my pieces, and one little village keeps me warm.', 'The Ember', 'A cat', 'The Spire', 'A blanket'],
  ['I am lighter than a feather, yet the strongest warrior cannot hold me for long.', 'Your breath', 'A secret', 'A cloud', 'A promise'],
  ['Say my name and I am gone.', 'Silence', 'A ghost', 'A dream', 'Tomorrow'],
];

// Text variants for the procedural quest types. {item}, {biome}, {enemy}, {count}, {town},
// {parcel}, {target}, {kin} are filled in by the generator.
export const FETCH_TEXT = [
  { ask: 'I lost my {item} out in the {biome} past the roads. Would you look for it? It should glint in the light.', thanks: 'My {item}! I thought it was gone for good.', after: 'I keep my {item} on a string around my neck now. Never again.' },
  { ask: 'A crow stole my {item}! Snatched it right off the windowsill and flew off toward the {biome}. Crows drop things eventually. Would you look?', thanks: 'You found it! That crow owes me an apology.', after: 'The crow came back yesterday. I think it was apologizing. I gave it a crust.' },
  { ask: 'My {item} fell out of my pack while I was running from a {enemy} in the {biome}. I\'m not going back out there. Would you?', thanks: 'My {item}! And you didn\'t get eaten. Wonderful.', after: 'I bought a bigger pack. With buttons. Nothing is falling out of this one.' },
];

export const HUNT_TEXT = [
  { ask: '{enemy}s have been harrying travelers near {town}. Thin them out. {count} should teach them.', thanks: 'The roads feel safer already.', after: 'Travelers are coming through again. Business is good, thanks to you.' },
  { ask: 'The {enemy}s keep eating my turnips. Every. Single. Turnip. Could you drive off {count} of them?', thanks: 'My turnips are safe! I could kiss you. I won\'t. But I could.', after: 'Best turnip harvest in years. Want one? No? Your loss.' },
];

export const DELIVER_TEXT = [
  { ask: 'Could you carry {parcel} to {target} in {town}? They\'ll pay you on my behalf.' },
  { ask: 'I promised {target} in {town} I\'d send {parcel} before the frost, and look at the sky. Would you take it? They\'ll pay you.' },
];

export const RESCUE_TEXT = [
  { ask: '{Kin} went exploring a cave in the {biome} and hasn\'t come back. Please, bring them home.', thanks: '{Kin} came stumbling home, filthy and grinning. Thank you.', after: '{Kin} has sworn off caves. For at least a week.' },
  { ask: '{Kin} heard there was treasure in a cave out in the {biome}. That was two days ago. Please find them.', thanks: '{Kin} is home! No treasure, but a great many stories. Thank you.', after: '{Kin} tells the cave story every night now. The bats get bigger every time.' },
];

export const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
