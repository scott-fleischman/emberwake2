// Enemy archetypes (behaviour) and families (biome dressing). Families recolor and rename archetypes.
export const ARCHETYPES = {
  brute: { hp: 6, dmg: 2, speed: 36, mass: 2.4, w: 16, h: 11, sight: 150, coins: [2, 6] },
  lunger: { hp: 3, dmg: 1, speed: 58, mass: 1, w: 12, h: 9, sight: 140, coins: [1, 4] },
  skirmisher: { hp: 2, dmg: 1, speed: 74, mass: 0.7, w: 10, h: 8, sight: 140, coins: [1, 3], flying: true },
  ranged: { hp: 2, dmg: 1, speed: 50, mass: 1, w: 10, h: 9, sight: 170, coins: [1, 4] },
};

// Per-biome difficulty tier: forest, swamp, desert, mountain, snow, volcanic
export const BIOME_TIER = [1, 1.25, 1.35, 1.45, 1.9, 1.7];

const fam = (brute, lunger, skirmisher, ranged, pal) => ({ names: { brute, lunger, skirmisher, ranged }, pal });
export const FAMILIES = [
  fam('Thornback', 'Briar Wolf', 'Wisp Sprite', 'Goblin Archer', {
    brute: ['#5f7d3a', '#3d5424', '#c9a04a'], lunger: ['#7a6248', '#4d3c2a', '#e0d0a0'], skirmisher: ['#9be07a', '#4f9a3a', '#ffffff'], ranged: ['#6f8f3a', '#3f5a22', '#b08050'],
  }),
  fam('Bog Hulk', 'Mire Leech', 'Marsh Fly', 'Spitter Toad', {
    brute: ['#55654a', '#343f2c', '#a0b070'], lunger: ['#5a3f50', '#352434', '#d090a0'], skirmisher: ['#8aa070', '#4a5a3a', '#f0f0a0'], ranged: ['#6a8a4a', '#3a5a2a', '#e0c060'],
  }),
  fam('Sand Golem', 'Dune Scorpion', 'Dust Imp', 'Nomad Slinger', {
    brute: ['#c9a060', '#8a6a3a', '#5a4020'], lunger: ['#b07a3a', '#6a4a22', '#f0d080'], skirmisher: ['#e0c090', '#a08050', '#ff8040'], ranged: ['#a0583a', '#6a3422', '#e8d0a0'],
  }),
  fam('Stone Ogre', 'Crag Wolf', 'Harpy', 'Rock Thrower', {
    brute: ['#8a8a90', '#55555c', '#c0a080'], lunger: ['#7a7570', '#4a4642', '#e0e0e0'], skirmisher: ['#a07a5a', '#6a4a34', '#f0e0c0'], ranged: ['#7a6a5a', '#4a3e34', '#c0c0c0'],
  }),
  fam('Yeti', 'Frost Wolf', 'Ice Wisp', 'Frost Archer', {
    brute: ['#e8eef4', '#a8b8c8', '#5a7aa0'], lunger: ['#b8c8d8', '#7888a0', '#ffffff'], skirmisher: ['#a8e0ff', '#5aa0d0', '#ffffff'], ranged: ['#7aa0c0', '#4a6a8a', '#e0f0ff'],
  }),
  fam('Ash Golem', 'Magma Hound', 'Cinder Imp', 'Fire Spitter', {
    brute: ['#4a4040', '#2a2222', '#ff7030'], lunger: ['#8a3a22', '#4a1e12', '#ffb040'], skirmisher: ['#ff8040', '#a03a1a', '#ffe080'], ranged: ['#6a3030', '#3a1a1a', '#ff9040'],
  }),
];

export const DUNGEON_FAMILY = { verdant: 0, ashen: 5, frost: 4 };

export function enemyStats(archetype, biome) {
  const a = ARCHETYPES[archetype];
  const tier = BIOME_TIER[biome] ?? 1;
  return {
    ...a,
    hp: Math.round(a.hp * tier),
    dmg: a.dmg + (tier >= 1.7 ? 1 : 0),
    speed: a.speed * (1 + (tier - 1) * 0.15),
    name: FAMILIES[biome].names[archetype],
    pal: FAMILIES[biome].pal[archetype],
  };
}
