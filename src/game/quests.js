// Main quest template (authored shape, seeded places) and procedural side quests. Pure.
import { makeRng } from '../core/rng.js';
import { FAMILIES } from '../data/enemies.js';
import { BIOME_NAMES } from '../world/tiles.js';

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
  // Tools gained out of order (e.g., gates opened early) should not strand the quest.
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

export function generateSideQuests(W) {
  const rng = makeRng(W.seed).fork('sidequests');
  const quests = [];
  const givers = W.npcs.filter((n) => n.questGiver);
  const types = ['fetch', 'hunt', 'deliver', 'rescue'];
  givers.forEach((giver, k) => {
    const s = settlement(W, giver.settlementId);
    const type = types[(k + rng.int(0, 3)) % 4];
    const id = `sq:${giver.id}`;
    const reward = rng.weighted([[{ coins: rng.int(25, 60) }, 4], [{ coins: 20, talent: 1 }, 2], [{ coins: 15, heartPiece: 1 }, 2], [{ coins: 20, food: 3 }, 2]]);
    const q = { id, giverId: giver.id, settlementId: s.id, type, reward };
    if (type === 'fetch') {
      const spots = W.pois.spawns.filter((p) => p.biome === s.biome);
      const spot = rng.pick(spots.length ? spots : W.pois.spawns);
      q.item = rng.pick(ITEMS);
      q.target = { x: spot.x, y: spot.y };
      q.text = `I lost my ${q.item} out in the ${BIOME_NAMES[spot.biome].toLowerCase()} past the roads. Would you look for it? It should glint in the light.`;
    } else if (type === 'hunt') {
      const archetype = rng.pick(['brute', 'lunger', 'skirmisher', 'ranged']);
      q.biome = s.biome;
      q.archetype = archetype;
      q.count = rng.int(3, 5);
      q.text = `${FAMILIES[s.biome].names[archetype]}s have been harrying travelers near ${s.name}. Thin them out — ${q.count} should teach them.`;
    } else if (type === 'deliver') {
      const others = W.npcs.filter((n) => n.settlementId !== s.id && !n.questGiver && !['elder', 'scout'].includes(n.role) && !['volcanic', 'snow'].includes(n.settlementId));
      const target = rng.pick(others);
      q.parcel = rng.pick(PARCELS);
      q.targetNpc = target.id;
      q.text = `Could you carry ${q.parcel} to ${target.name} in ${settlement(W, target.settlementId).name}? They'll pay you on my behalf.`;
    } else {
      const caves = W.pois.caves.filter((c) => !['volcanic', 'snow'].includes(['forest', 'swamp', 'desert', 'mountain', 'snow', 'volcanic'][c.biome]));
      const cave = rng.pick(caves.length ? caves : W.pois.caves);
      q.caveId = cave.id;
      q.kin = rng.pick(KIN);
      q.text = `${cap(q.kin)} went exploring a cave in the ${BIOME_NAMES[cave.biome].toLowerCase()} and hasn't come back. Please, bring them home.`;
    }
    quests.push(q);
  });
  return quests;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function sideStatus(state, q) { return state.quest.side[q.id] || 'available'; }

export function sideObjective(state, q, W) {
  const giver = W.npcs.find((n) => n.id === q.giverId);
  const st = sideStatus(state, q);
  if (st === 'ready') return { text: `Return to ${giver.name} in ${settlement(W, q.settlementId).name}.`, marker: npcMarker(W, giver.id) };
  switch (q.type) {
    case 'fetch': return { text: `Find ${giver.name}'s ${q.item}.`, marker: q.target };
    case 'hunt': return { text: `Defeat ${FAMILIES[q.biome].names[q.archetype]}s near ${settlement(W, q.settlementId).name} (${state.quest.kills[q.id] || 0}/${q.count}).`, marker: settlement(W, q.settlementId).center };
    case 'deliver': { const t = W.npcs.find((n) => n.id === q.targetNpc); return { text: `Deliver ${q.parcel} to ${t.name} in ${settlement(W, t.settlementId).name}.`, marker: npcMarker(W, t.id) }; }
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
  switch (q.type) {
    case 'fetch': return `The lost ${q.item}`;
    case 'hunt': return `Thinning the ${FAMILIES[q.biome].names[q.archetype]}s`;
    case 'deliver': return `A parcel for ${W.npcs.find((n) => n.id === q.targetNpc).name}`;
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
