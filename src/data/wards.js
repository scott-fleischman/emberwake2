// Cutscenes for the ward quest chains: lookout vistas and the breaking of each seal. Shots steer the
// camera with `look` (world pixels) and can act on the world with `run(game)` when they begin.
const px = (p) => ({ x: p.x * 16 + 8, y: p.y * 16 + 8 });
const center = (seal) => {
  const n = seal.tiles.length;
  return { x: seal.tiles.reduce((a, t) => a + t.x, 0) / n, y: seal.tiles.reduce((a, t) => a + t.y, 0) / n };
};

export function lookoutShots(W, id) {
  const l = W.pois.lookouts.find((x) => x.id === id);
  if (!l) return [];
  const me = px(l);
  if (id === 'lookout') {
    const camp = W.pois.camps.find((c) => c.quest);
    return [
      { look: me, text: 'You climb the creaking watchtower. The whole forest rolls out below you, green and gold and far too quiet.', hold: 2.6, sfx: 'menu' },
      { look: px(center(W.pois.seals.verdant)), text: 'There: the Verdant Vault, strangled in a wall of black thorns that swell and shrink like something breathing.', hold: 3.2, sfx: 'boss' },
      camp && { look: px(camp), text: 'And between here and there, the smoke of a warband camp, squatting right across the road.', hold: 2.8 },
      { look: me, text: 'Thorns you cannot cut. A warband in the way. The scout was not exaggerating.', hold: 2.4 },
    ].filter(Boolean);
  }
  const beacons = W.pois.relics.beacons;
  const lines = ['A beacon on a far ridge, buried to its brim in old blue ice.', 'Another, crusted white, high above the road.', 'And a third, a black shape against the snow.'];
  return [
    { look: me, text: 'Wind howls across the Windcrest. The whole north lies white and silent beneath you.', hold: 2.6, sfx: 'menu' },
    { look: px(center(W.pois.seals.frost)), text: 'The Frostbound Sanctuary, sealed inside a dome of ice so thick the light bends going through it.', hold: 3, sfx: 'boss' },
    ...beacons.map((b, k) => ({ look: px(b), text: lines[k] || lines[0], hold: 2.2 })),
    { look: me, text: 'Three beacons. Light them, and Kindler fire might yet melt that wall.', hold: 2.4 },
  ];
}

// open(game): lifts the seal off the map with its effects, mid-scene.
export function sealShots(W, key, open) {
  const seal = W.pois.seals[key];
  const c = px(center(seal)), a = px(seal.arena);
  switch (key) {
    case 'verdant': return [
      { look: a, text: 'You raise the three bronze leaves toward the thornwall. They tug at your fingers like birds on a string.', hold: 2.6 },
      { look: a, text: 'They spin, fuse, and blaze with green fire. The Verdant Sigil is whole again.', hold: 2.4, sfx: 'puzzle', glow: '140,255,110' },
      { look: c, text: 'The thorns shudder. Shrivel. Crumble into dry brown dust.', hold: 2.8, sfx: 'gate', run: open, shake: 4 },
      { look: c, speaker: 'A voice in the leaves', color: '#a8f08a', text: '...the door remembers you, little ember. Come down. Come and wake me.', hold: 3.2 },
    ];
    case 'ashen': return [
      { look: a, text: 'Slagheart slumps, and its molten heart cools to black glass.', hold: 2.4, sfx: 'explode' },
      { look: c, text: 'Starved of its vents and its guardian, the firewall gutters, sputters... and goes out.', hold: 3, sfx: 'gate', run: open, shake: 5 },
      { look: c, text: 'Ash drifts down like snow over the open road to the Ashen Reliquary.', hold: 2.4 },
    ];
    default: return [
      { look: a, text: 'Frostfang\'s last howl rolls away across the snow. High above, the three beacons flare as one.', hold: 2.8, sfx: 'shrine' },
      { look: c, text: 'Their light falls on the ice wall. It groans. Cracks. And shatters into a storm of glittering shards!', hold: 3, sfx: 'gate', run: open, shake: 5 },
      { look: c, text: 'The way to the Frostbound Sanctuary lies open.', hold: 2.2 },
    ];
  }
}
