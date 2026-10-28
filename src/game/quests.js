// Main quest template (authored shape, seeded places) and procedural side quests. Pure.
import { makeRng } from '../core/rng.js';
import { FAMILIES } from '../data/enemies.js';
import { BIOME_NAMES } from '../world/tiles.js';
import { isPassable } from '../world/overworld.js';
import { PETS, HERBS, RIDDLES, FETCH_TEXT, HUNT_TEXT, DELIVER_TEXT, RESCUE_TEXT, fill, cap } from '../data/sidequests.js';

export const MAIN_STAGES = ['wake', 'scout', 'camp', 'sigil', 'vault', 'smith', 'ashpass', 'ridge', 'reliquary', 'frostpass', 'boulder', 'sanctuary', 'drowned', 'end'];

const settlement = (W, id) => W.settlements.find((s) => s.id === id);
const npcBy = (W, settlementId, role) => W.npcs.find((n) => n.settlementId === settlementId && n.role === role);

// Applies an event to the main quest. Mutates state. Returns {advanced, stage, notes[]}.
export function advanceMain(state, W, ev) {
  const q = state.quest;
  const before = q.main;
  const notes = [];
  const go = (stage, note) => { q.main = stage; if (note) notes.push(note); };
  const talk = (role, sid) => ev.type === 'talk' && ev.role === role && (!sid || ev.settlementId === sid);
  switch (q.main) {
    case 'wake': if (talk('elder', 'home')) go('scout'); break;
    case 'scout': if (talk('scout', 'outpost')) go('camp'); break;
    case 'camp': if (ev.type === 'cleared' && ev.quest) go('sigil'); break;
    case 'sigil':
      if (talk('scout', 'outpost')) {
        if (!state.artifacts.includes('verdantSigil')) state.artifacts.push('verdantSigil');
        reveal(state, 'dungeon:verdant');
        go('vault', 'Received the Verdant Sigil.');
      }
      break;
    case 'vault': if (ev.type === 'boss' && ev.kind === 'thornmaw') go('smith'); break;
    case 'smith':
      if (talk('smith', 'home')) {
        state.tools.bombs = true;
        if (!state.artifacts.includes('satchel')) state.artifacts.push('satchel');
        if (!state.gear.items.includes('bombs')) state.gear.items.push('bombs');
        state.player.bombs = Math.max(state.player.bombs, 8);
        go('ashpass', 'Received the Bomb Satchel!');
      }
      break;
    case 'ashpass': if (talk('keeper', 'desert')) { reveal(state, 'gate:volcanic'); go('ridge'); } break;
    case 'ridge': if (ev.type === 'gate' && ev.region === 'volcanic') { reveal(state, 'dungeon:ashen'); go('reliquary'); } break;
    case 'reliquary':
      if (ev.type === 'boss' && ev.kind === 'cinder') {
        state.tools.gloves = true;
        if (!state.artifacts.includes('gloves')) state.artifacts.push('gloves');
        go('frostpass', 'Received the Titan Gloves!');
      }
      break;
    case 'frostpass': if (talk('keeper', 'mountain')) { reveal(state, 'gate:snow'); go('boulder'); } break;
    case 'boulder': if (ev.type === 'gate' && ev.region === 'snow') { reveal(state, 'dungeon:frost'); go('sanctuary'); } break;
    case 'sanctuary': if (ev.type === 'boss' && ev.kind === 'rime') go('drowned'); break;
    case 'drowned': if (talk('elder', 'home')) go('end'); break;
  }
  // Things done out of order (a camp cleared before the scout asked, gates opened early)
  // should not strand the quest.
  const questCamp = W.pois.camps.find((c) => c.quest);
  if (q.main === 'camp' && questCamp && state.progress.cleared.includes(questCamp.id)) q.main = 'sigil';
  if (q.main === 'ridge' && state.progress.gates.includes('volcanic')) { reveal(state, 'dungeon:ashen'); q.main = 'reliquary'; }
  if (q.main === 'boulder' && state.progress.gates.includes('snow')) { reveal(state, 'dungeon:frost'); q.main = 'sanctuary'; }
  return { advanced: q.main !== before, stage: q.main, notes };
}

export function reveal(state, id) {
  if (!state.progress.revealed) state.progress.revealed = [];
  if (!state.progress.revealed.includes(id)) state.progress.revealed.push(id);
}

// Current objective text plus an overworld tile marker when one applies.
export function mainObjective(state, W) {
  const s = (id) => settlement(W, id);
  const n = (sid, role) => npcBy(W, sid, role);
  const home = s('home'), out = s('outpost');
  const D = W.pois.dungeons;
  const gate = (region) => W.pois.gates.find((g) => g.region === region);
  const camp = W.pois.camps.find((c) => c.quest);
  switch (state.quest.main) {
    case 'wake': return { text: `Speak with ${n('home', 'elder').name} in ${home.name}'s great hall.`, marker: hallDoor(home) };
    case 'scout': return { text: `Find Scout ${n('outpost', 'scout').name} at ${out.name}.`, marker: out.center };
    case 'camp': return { text: `Clear the ${FAMILIES[0].names.brute} camp the scout spotted.`, marker: camp ? { x: camp.x, y: camp.y } : null };
    case 'sigil': return { text: `Return to Scout ${n('outpost', 'scout').name} at ${out.name}.`, marker: out.center };
    case 'vault': return { text: 'Enter the Verdant Vault and defeat its warden.', marker: D.verdant.front };
    case 'smith': return { text: `Bring the Ember Shard to ${n('home', 'smith').name}, the smith of ${home.name}.`, marker: doorOf(home, 'smith') };
    case 'ashpass': return { text: `Ask the captain of ${s('desert').name} about the ash ridge.`, marker: hallDoor(s('desert')) };
    case 'ridge': return { text: 'Blast through the cracked ridge into the volcanic wastes.', marker: gate('volcanic') };
    case 'reliquary': return { text: 'Find the Ashen Reliquary and defeat the Cinder Warden.', marker: D.ashen.front };
    case 'frostpass': return { text: `Ask the keeper of ${s('mountain').name} about the frozen pass.`, marker: hallDoor(s('mountain')) };
    case 'boulder': return { text: 'Lift the boulder that seals the northern pass.', marker: gate('snow') };
    case 'sanctuary': return { text: 'Reach the Frostbound Sanctuary and face the Rime Sovereign.', marker: D.frost.front };
    case 'drowned': return { text: `Return to ${n('home', 'elder').name} with three shards.`, marker: hallDoor(home) };
    default: return { text: 'The fourth ward sleeps beneath the drowned west. Explore freely.', marker: D.drowned.front };
  }
}

const hallDoor = (s) => doorOf(s, 'hall');
function doorOf(s, type) {
  const b = s.buildings.find((x) => x.type === type);
  return b ? { x: b.door.x, y: b.door.y + 1 } : s.center;
}

// ---------------------------------------------------------------- side quests
const ITEMS = ['grandmother\'s locket', 'brass compass', 'bundle of letters', 'carved flute', 'lucky river stone', 'silver thimble', 'field journal', 'painted charm'];
const KIN = ['my brother', 'my apprentice', 'our shepherd', 'my daughter', 'my oldest friend', 'the miller\'s boy', 'my cousin'];
const PARCELS = ['a sealed letter', 'a jar of honey', 'mended boots', 'a pouch of seeds', 'a wrapped whetstone', 'dried herbs'];
const PROCEDURAL = ['fetch', 'hunt', 'deliver', 'rescue', 'gather', 'treasure', 'pet'];
const EARLY = ['home', 'outpost', 'swamp', 'desert', 'mountain'];
// One of each handwritten quest per world, placed where it reads best.
const UNIQUE = [['scholar', ['home']], ['letters', ['home', 'outpost']], ['pet', ['home', 'outpost', 'swamp', 'desert', 'mountain']], ['treasure', ['outpost', 'home', 'swamp']], ['riddle', ['swamp', 'desert', 'mountain']], ['gather', ['desert', 'mountain', 'swamp', 'outpost']]];
export const SCHOLAR_NEED = 3;

export const dirWord = (from, to) => {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ns = dy < -Math.abs(dx) * 0.4 ? 'north' : dy > Math.abs(dx) * 0.4 ? 'south' : '';
  const ew = dx < -Math.abs(dy) * 0.4 ? 'west' : dx > Math.abs(dy) * 0.4 ? 'east' : '';
  return ns && ew ? `${ns}${ew}` : ns || ew || 'nearby';
};

const freeGround = (W, x, y) => { const i = y * W.w + x; return isPassable(W, x, y) && W.tiles[i] === W.ground[i] && !W.deco[i]; };

// A walkable spot a short stroll off a road, minD..maxD tiles from a settlement.
function roadsideSpot(W, s, rng, minD, maxD, taken = []) {
  const c = s.center;
  const roads = [];
  for (const path of W.roads) for (const p of path) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d >= minD && d <= maxD && !taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 6)) roads.push(p);
  }
  if (!roads.length) return null;
  const r = rng.pick(roads);
  // A few steps off the road over passable ground, so the spot is always reachable.
  const options = walkableAround(W, r, 3);
  return options.length ? rng.pick(options) : { x: r.x, y: r.y };
}

// Free ground tiles reachable from `from` within `depth` steps, nearest first.
function walkableAround(W, from, depth) {
  const seen = new Set([`${from.x},${from.y}`]);
  let frontier = [from];
  const out = [];
  for (let step = 0; step < depth; step++) {
    const next = [];
    for (const p of frontier) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = `${x},${y}`;
      if (seen.has(k) || !isPassable(W, x, y)) continue;
      seen.add(k);
      next.push({ x, y });
      if (freeGround(W, x, y)) out.push({ x, y });
    }
    frontier = next;
  }
  return out;
}

function rewardFor(type, rng) {
  switch (type) {
    case 'pet': return { coins: 30, food: 2 };
    case 'gather': return { coins: 25, food: 3 };
    case 'letters': return { coins: 30, heartPiece: 1 };
    case 'treasure': return { coins: 70 };
    case 'riddle': return { coins: 25, talent: 1 };
    case 'scholar': return { coins: 20, talent: 1 };
    default: return rng.weighted([[{ coins: rng.int(25, 60) }, 4], [{ coins: 20, talent: 1 }, 2], [{ coins: 15, heartPiece: 1 }, 2], [{ coins: 20, food: 3 }, 2]]);
  }
}

export function generateSideQuests(W) {
  const rng = makeRng(W.seed).fork('sidequests');
  const givers = W.npcs.filter((n) => n.questGiver);
  const types = new Map();
  for (const [type, where] of UNIQUE) {
    const cand = givers.filter((g) => where.includes(g.settlementId) && !types.has(g.id));
    if (cand.length) types.set(rng.pick(cand.sort((a, b) => where.indexOf(a.settlementId) - where.indexOf(b.settlementId)).slice(0, 2)).id, type);
  }
  let rot = rng.int(0, 3);
  const quests = [];
  const taken = [];
  for (const giver of givers) {
    let type = types.get(giver.id) || PROCEDURAL[rot++ % PROCEDURAL.length];
    const s = settlement(W, giver.settlementId);
    const q = { id: `sq:${giver.id}`, giverId: giver.id, settlementId: s.id, type };
    if (!buildQuest(q, W, s, rng, taken)) { q.type = type = 'hunt'; buildQuest(q, W, s, rng, taken); }
    q.reward = rewardFor(q.type, rng);
    quests.push(q);
  }
  return quests;
}

function buildQuest(q, W, s, rng, taken) {
  const biomeName = (b) => BIOME_NAMES[b].toLowerCase();
  switch (q.type) {
    case 'fetch': {
      const spots = W.pois.spawns.filter((p) => p.biome === s.biome);
      const spot = rng.pick(spots.length ? spots : W.pois.spawns);
      const v = rng.pick(FETCH_TEXT);
      q.item = rng.pick(ITEMS);
      q.target = { x: spot.x, y: spot.y };
      const vars = { item: q.item, biome: biomeName(spot.biome), enemy: FAMILIES[spot.biome].names.lunger };
      Object.assign(q, { text: fill(v.ask, vars), thanks: fill(v.thanks, vars), after: fill(v.after, vars) });
      return true;
    }
    case 'hunt': {
      const v = rng.pick(HUNT_TEXT);
      q.biome = s.biome;
      q.archetype = rng.pick(['brute', 'lunger', 'skirmisher', 'ranged']);
      q.count = rng.int(2, 4);
      const vars = { enemy: FAMILIES[s.biome].names[q.archetype], town: s.name, count: q.count };
      Object.assign(q, { text: fill(v.ask, vars), thanks: fill(v.thanks, vars), after: fill(v.after, vars) });
      return true;
    }
    case 'deliver': {
      const others = W.npcs.filter((n) => n.settlementId !== s.id && !n.questGiver && !['elder', 'scout'].includes(n.role) && !['volcanic', 'snow'].includes(n.settlementId));
      if (!others.length) return false;
      const target = rng.pick(others);
      q.parcel = rng.pick(PARCELS);
      q.targetNpc = target.id;
      q.text = fill(rng.pick(DELIVER_TEXT).ask, { parcel: q.parcel, target: target.name, town: settlement(W, target.settlementId).name });
      return true;
    }
    case 'rescue': {
      const caves = W.pois.caves.filter((c) => ![4, 5].includes(c.biome));
      const cave = rng.pick(caves.length ? caves : W.pois.caves);
      const v = rng.pick(RESCUE_TEXT);
      q.caveId = cave.id;
      q.kin = rng.pick(KIN);
      const vars = { Kin: cap(q.kin), biome: biomeName(cave.biome) };
      Object.assign(q, { text: fill(v.ask, vars), thanks: fill(v.thanks, vars), after: fill(v.after, vars) });
      return true;
    }
    case 'pet': {
      const spot = roadsideSpot(W, s, rng, 9, 18, taken);
      if (!spot) return false;
      taken.push(spot);
      const kind = rng.pick(PETS);
      q.pet = { kind: kind.kind, name: rng.pick(kind.names) };
      q.spot = spot;
      const where = dirWord(s.center, spot);
      q.text = `${q.pet.name} has run off again! My ${kind.kind} chased a butterfly out past ${s.name} and won't come back. Head ${where} and you'll find them. ${q.pet.name} is quick, but tires fast. Keep after them and they'll let you scoop them up.`;
      q.thanks = `${q.pet.name}! You little menace, come here. Oh, thank you. They'd have been out there all night.`;
      q.after = `${q.pet.name} hasn't left my side since you brought them home. Well, except to steal sausages.`;
      return true;
    }
    case 'gather': {
      const center = roadsideSpot(W, s, rng, 8, 16, taken);
      if (!center) return false;
      taken.push(center);
      const herbIdx = rng.int(0, HERBS.length - 1), herb = HERBS[herbIdx];
      q.herb = herbIdx;
      q.count = rng.int(4, 5);
      q.center = center;
      q.spots = [];
      for (const p of rng.shuffle(walkableAround(W, center, 6))) {
        if (q.spots.length >= q.count) break;
        if (!q.spots.some((o) => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) < 3)) q.spots.push(p);
      }
      if (q.spots.length < 3) return false;
      q.count = q.spots.length;
      q.text = `I need ${q.count} ${herb.plural} for ${herb.why}. They grow in a patch ${dirWord(s.center, center)} of here, just off the road. They glow a little, so you can't miss them.`;
      q.thanks = `${cap(herb.plural)}, and fresh too! You have a gatherer's eye.`;
      q.after = herb.after;
      return true;
    }
    case 'letters': {
      const far = W.npcs.filter((n) => ['swamp', 'desert', 'mountain'].includes(n.settlementId) && n.role === 'villager' && !n.questGiver);
      const pool = far.length ? far : W.npcs.filter((n) => n.settlementId !== s.id && ['villager', 'innkeeper', 'merchant'].includes(n.role) && !['volcanic', 'snow'].includes(n.settlementId));
      if (!pool.length) return false;
      const target = rng.pick(pool);
      q.targetNpc = target.id;
      const town = settlement(W, target.settlementId).name;
      q.text = `There's someone in ${town}. ${target.name}. We quarreled years ago over something so foolish I can't even remember what it was. I've written a letter... a dozen letters, really. This is the one. Would you carry it? I can't bear to send it myself.`;
      q.reply = `From... from them? After all these years? Hold on. Let me read it twice. ...Wait here. No, take this. My answer. Hurry, before I lose my nerve.`;
      q.thanks = `A reply? Let me see. They... they still plant the blue flowers I gave them, every spring. They want me to visit. I'm going to visit!`;
      q.after = `I'm packing for ${town}. Don't you dare tell anyone I'm nervous.`;
      return true;
    }
    case 'treasure': {
      const spot = roadsideSpot(W, s, rng, 12, 24, taken);
      if (!spot) return false;
      taken.push(spot);
      q.spot = spot;
      const [rel, they] = rng.pick([['grandfather', 'he'], ['grandmother', 'she'], ['great-aunt', 'she'], ['old uncle', 'he']]);
      q.relative = rel;
      q.text = `My ${rel} was a treasure hunter. Mostly ${they} found mud. But ${they} left me this map, and the X is ${dirWord(s.center, spot)} of here, near the road. I'm too old for digging. Find what ${they} buried and you can keep whatever's worth keeping.`;
      q.thanks = `Ha! My ${rel} really did bury something. Look: an old compass, and a note. "For whoever is stubborn enough." That's you. Keep the coins.`;
      q.after = 'I hung that old compass over the hearth. It points north, at the Spire, no matter how I turn it. Strange, isn\'t it?';
      return true;
    }
    case 'riddle': {
      const order = rng.shuffle([...RIDDLES.keys()]);
      q.riddles = order.slice(0, 3);
      q.text = `Ah, a traveler! I am the riddle-keeper of ${s.name}. Answer three of my riddles and I'll make it worth your while. Get one wrong and... well, nothing terrible. I'll just laugh at you a little.`;
      q.thanks = 'Three for three! A sharp mind in a sharp world. Here, you\'ve earned this.';
      q.after = 'I\'ve been working on a new riddle. "What has four wardens and one flame?" ...I\'m still working on the answer.';
      return true;
    }
    case 'scholar': {
      q.need = SCHOLAR_NEED;
      q.text = `I study the Kindlers, the old fire-keepers. Their standing stones are scattered across the realm, but my knees aren't what they were. Would you read ${q.need} of them for me? Your journal will keep the words.`;
      q.thanks = '"No hand may hold them all"... So the old tales were true. Thank you. Keep reading, will you? The stones remember more than people do.';
      q.after = 'I keep reading your notes. Someone chiseled the end off the Sealing Stone on purpose. Who would want to hide a warning?';
      return true;
    }
  }
  return false;
}

export function sideStatus(state, q) { return state.quest.side[q.id] || 'available'; }

export function sideObjective(state, q, W) {
  const giver = W.npcs.find((n) => n.id === q.giverId);
  const st = sideStatus(state, q);
  const home = settlement(W, q.settlementId);
  if (st === 'ready') {
    if (q.type === 'letters') return { text: `Bring the reply back to ${giver.name} in ${home.name}.`, marker: npcMarker(W, giver.id) };
    return { text: `Return to ${giver.name} in ${home.name}.`, marker: npcMarker(W, giver.id) };
  }
  const n = state.quest.kills[q.id] || 0;
  switch (q.type) {
    case 'fetch': return { text: `Find ${giver.name}'s ${q.item}.`, marker: q.target };
    case 'hunt': return { text: `Defeat ${FAMILIES[q.biome].names[q.archetype]}s near ${home.name} (${n}/${q.count}).`, marker: home.center };
    case 'deliver': case 'letters': {
      const t = W.npcs.find((x) => x.id === q.targetNpc);
      return { text: `${q.type === 'letters' ? `Carry ${giver.name}'s letter` : `Deliver ${q.parcel}`} to ${t.name} in ${settlement(W, t.settlementId).name}.`, marker: npcMarker(W, t.id) };
    }
    case 'pet': return { text: `Catch ${q.pet.name} the ${q.pet.kind}, who ran off near ${home.name}.`, marker: q.spot };
    case 'gather': return { text: `Gather ${HERBS[q.herb].plural} for ${giver.name} (${n}/${q.count}).`, marker: q.center };
    case 'treasure': return { text: 'Dig where the treasure map\'s X is marked (E).', marker: q.spot };
    case 'riddle': return { text: `Answer the riddle-keeper's riddles (${n}/3).`, marker: npcMarker(W, giver.id) };
    case 'scholar': {
      const read = state.progress.lore || [];
      const unread = W.pois.lore.filter((l) => !read.includes(l.id)).sort((a, b) => Math.hypot(a.x - home.center.x, a.y - home.center.y) - Math.hypot(b.x - home.center.x, b.y - home.center.y));
      const got = read.filter((id) => id.startsWith('lore')).length;
      return { text: `Read the Kindlers' standing stones (${Math.min(got, q.need)}/${q.need}).`, marker: unread[0] ? { x: unread[0].x, y: unread[0].y + 1 } : npcMarker(W, giver.id) };
    }
    default: { const c = W.pois.caves.find((x) => x.id === q.caveId); return { text: `Find ${q.kin} in the cave.`, marker: c.front }; }
  }
}

// Where to find a person on the overworld: where they stand, or the door of their building.
export function npcMarker(W, npcId) {
  const n = W.npcs.find((x) => x.id === npcId);
  if (!n) return null;
  if (n.x !== null) return { x: n.x, y: n.y };
  const b = W.props.find((p) => p.id === n.buildingId);
  return b ? { x: b.door.x, y: b.door.y + 1 } : settlement(W, n.settlementId).center;
}

export function questTitle(q, W) {
  if (!q) return 'The Waning Ember';
  const npc = (id) => W.npcs.find((n) => n.id === id);
  switch (q.type) {
    case 'fetch': return `The lost ${q.item}`;
    case 'hunt': return `Thinning the ${FAMILIES[q.biome].names[q.archetype]}s`;
    case 'deliver': return `A parcel for ${npc(q.targetNpc).name}`;
    case 'pet': return `${q.pet.name}'s great escape`;
    case 'gather': return `${cap(HERBS[q.herb].plural)} for ${npc(q.giverId).name}`;
    case 'letters': return `Letters to ${npc(q.targetNpc).name}`;
    case 'treasure': return `${cap(q.relative || 'grandfather')}'s treasure map`;
    case 'riddle': return 'The riddle-keeper';
    case 'scholar': return 'Stones that remember';
    default: return `Lost in the dark: ${q.kin}`;
  }
}

// ---------------------------------------------------------------- tracking
const MAIN_DUNGEON = { vault: 'verdant', reliquary: 'ashen', sanctuary: 'frost' };

// Quests the player can track: the main quest plus every accepted, unfinished side quest.
export function trackableQuests(state, sideQuests) {
  return ['main', ...sideQuests.filter((q) => ['active', 'ready'].includes(sideStatus(state, q))).map((q) => q.id)];
}

// The tracked quest's objective; falls back to the main quest when the tracked one is gone.
export function trackedObjective(state, W, sideQuests) {
  const id = state.quest.tracked || 'main';
  if (id !== 'main') {
    const q = sideQuests.find((x) => x.id === id);
    if (q && trackableQuests(state, sideQuests).includes(id)) return { id, title: questTitle(q, W), ...sideObjective(state, q, W), dungeon: null };
  }
  return { id: 'main', title: questTitle(null, W), ...mainObjective(state, W), dungeon: MAIN_DUNGEON[state.quest.main] || null };
}

export function cycleTracked(state, sideQuests) {
  const ids = trackableQuests(state, sideQuests);
  const i = ids.indexOf(state.quest.tracked || 'main');
  state.quest.tracked = ids[(i + 1) % ids.length];
  return state.quest.tracked;
}

// Kill counter for hunt quests. Returns quests that just became ready.
export function recordKill(state, quests, enemy) {
  const ready = [];
  for (const q of quests) {
    if (q.type !== 'hunt' || sideStatus(state, q) !== 'active') continue;
    if (enemy.biome !== q.biome || enemy.archetype !== q.archetype) continue;
    state.quest.kills[q.id] = (state.quest.kills[q.id] || 0) + 1;
    if (state.quest.kills[q.id] >= q.count) { state.quest.side[q.id] = 'ready'; ready.push(q); }
  }
  return ready;
}

export function grantReward(state, reward) {
  const parts = [];
  if (reward.coins) { state.player.coins += reward.coins; parts.push(`${reward.coins} coins`); }
  if (reward.food) { state.player.food += reward.food; parts.push(`${reward.food} rations`); }
  if (reward.talent) { state.talents.points += reward.talent; parts.push('a talent point'); }
  if (reward.heartPiece) {
    state.upgrades.heartPieces += reward.heartPiece;
    parts.push('a heart piece');
    if (state.upgrades.heartPieces >= 2) { state.upgrades.heartPieces -= 2; state.upgrades.hearts++; parts.push('(a new heart!)'); }
  }
  return parts.join(', ');
}
