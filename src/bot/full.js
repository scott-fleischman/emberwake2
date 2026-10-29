// The 100% route: repeatedly take the nearest unfinished job the bot can reach right now — side
// quests, standing stones, books, caves, caches, camps, and main-quest steps (which unlock bombs,
// gloves and the charm). Dungeons are cleared of every chest. The kindling and the Spire wait until
// everything else is done: beating Vesper ends the run.
import { generateDungeon } from '../world/dungeons.js';
import { BOOKS, LORE_ENTRIES, bookFor } from '../data/story.js';
import { sideStatus } from '../game/quests.js';
import { WARDS } from '../world/wards.js';
import { reachMap, tileOf, standableNear } from './nav.js';

const SHELF_TYPES = ['home', 'house', 'shop', 'seer'];

export const fullMethods = {
  // What counts toward 100%, and how much of it is done.
  progress() {
    const g = this.g, s = g.state, W = g.world, pr = s.progress;
    const dungeonChests = this.dungeonChestIds();
    const parts = [
      [g.sideQuests.length, g.sideQuests.filter((q) => sideStatus(s, q) === 'done').length],
      [LORE_ENTRIES.length, (pr.lore || []).length],
      [W.pois.caves.length, W.pois.caves.filter((c) => pr.opened.includes(`cave:${c.id}`)).length],
      [W.pois.caches.length, W.pois.caches.filter((c) => pr.caches.includes(c.id)).length],
      [W.pois.camps.length, W.pois.camps.filter((c) => pr.cleared.includes(c.id)).length],
      [dungeonChests.length, dungeonChests.filter((id) => pr.opened.includes(id)).length],
      [WARDS.length + 1, pr.bosses.length], // and Vesper
    ];
    return { total: parts.reduce((a, p) => a + p[0], 0), done: parts.reduce((a, p) => a + p[1], 0) };
  },

  // What is still missing, for diagnostics.
  missing() {
    const g = this.g, s = g.state, W = g.world, pr = s.progress;
    return [
      ...g.sideQuests.filter((q) => sideStatus(s, q) !== 'done').map((q) => `quest ${q.type} (${sideStatus(s, q)}) ${q.settlementId}`),
      ...W.pois.lore.filter((l) => !(pr.lore || []).includes(l.id)).map((l) => `stone ${l.id} @${l.x},${l.y}`),
      ...BOOKS.map((b, k) => `book${k}`).filter((id) => !(pr.lore || []).includes(id)),
      ...W.pois.caves.filter((c) => !pr.opened.includes(`cave:${c.id}`)).map((c) => `cave ${c.id}`),
      ...W.pois.caches.filter((c) => !pr.caches.includes(c.id)).map((c) => `cache ${c.id} ${c.kind} @${c.x},${c.y}`),
      ...W.pois.camps.filter((c) => !pr.cleared.includes(c.id)).map((c) => `camp ${c.id}`),
      ...this.dungeonChestIds().filter((id) => !pr.opened.includes(id)),
    ];
  },

  dungeonChestIds() {
    if (!this.chestIds) {
      this.chestIds = [];
      for (const id of WARDS) {
        const area = this.g.area.kind === 'dungeon' && this.g.area.id === id ? this.g.area : null;
        const rooms = (area ? area.dungeon : this.dungeonData(id)).rooms;
        for (const r of rooms) if (r.objects.some((o) => o.type === 'chest')) this.chestIds.push(`d:${id}:${r.id}:chest`);
      }
    }
    return this.chestIds;
  },

  dungeonData(id) {
    this.dungeonCache = this.dungeonCache || {};
    if (!this.dungeonCache[id]) this.dungeonCache[id] = generateDungeon(id, this.g.world.seed);
    return this.dungeonCache[id];
  },

  // Every job that is unfinished and reachable now, each with an overworld site tile.
  jobs() {
    const g = this.g, s = g.state, W = g.world, pr = s.progress;
    const out = [];
    const npcSite = (id) => { const n = W.npcs.find((x) => x.id === id); if (!n) return null; if (n.x !== null) return { x: n.x, y: n.y }; const b = W.props.find((p) => p.id === n.buildingId); return b ? { x: b.door.x, y: b.door.y + 1 } : null; };
    for (const q of g.sideQuests) {
      const st = sideStatus(s, q);
      if (st === 'done') continue;
      if (st === 'available' || st === 'ready') { out.push({ label: st === 'ready' ? 'Turning in a quest' : 'Taking a side quest', site: npcSite(q.giverId), run: () => this.talkTo(q.giverId) }); continue; }
      switch (q.type) {
        case 'fetch': out.push({ label: `Finding the ${q.item}`, site: q.target, run: () => this.collectAt(q.target, () => sideStatus(s, q) !== 'active') }); break;
        case 'deliver': case 'letters': out.push({ label: q.type === 'letters' ? 'Carrying a love letter' : `Delivering ${q.parcel}`, site: npcSite(q.targetNpc), run: () => this.talkTo(q.targetNpc) }); break;
        case 'rescue': { const c = W.pois.caves.find((x) => x.id === q.caveId); out.push({ label: `Searching a cave for ${q.kin}`, site: c.front, run: () => this.doCave(c) }); break; }
        case 'pet': out.push({ label: `Chasing ${q.pet.name}`, site: q.spot, run: () => this.catchPet(q) }); break;
        case 'gather': out.push({ label: 'Gathering herbs', site: q.center, run: () => this.gatherHerbs(q) }); break;
        case 'treasure': out.push({ label: 'Digging up treasure', site: q.spot, run: () => this.digAt(q) }); break;
        case 'riddle': case 'scholar': out.push({ label: q.type === 'riddle' ? 'Answering riddles' : 'Reporting to the scholar', site: npcSite(q.giverId), run: () => this.talkTo(q.giverId), later: q.type === 'scholar' }); break;
        case 'hunt': out.push({ label: 'Hunting', site: W.settlements.find((x) => x.id === q.settlementId).center, run: () => this.hunt(q) }); break;
      }
    }
    for (const l of W.pois.lore) if (!(pr.lore || []).includes(l.id)) out.push({ label: 'Reading a standing stone', site: { x: l.x, y: l.y }, run: () => this.readStone(l) });
    const shelves = W.props.filter((p) => p.kind === 'building' && SHELF_TYPES.includes(p.type));
    BOOKS.forEach((b, k) => {
      if ((pr.lore || []).includes(`book${k}`)) return;
      for (const sh of shelves.filter((x) => bookFor(W, x) === k)) out.push({ label: `Reading “${b.title}”`, site: { x: sh.door.x, y: sh.door.y + 1 }, run: () => this.readShelf(sh) });
    });
    for (const c of W.pois.caves) if (!pr.opened.includes(`cave:${c.id}`)) out.push({ label: 'Exploring a cave', site: c.front, run: () => this.doCave(c) });
    for (const c of W.pois.caches) {
      if (pr.caches.includes(c.id)) continue;
      if (c.kind === 'cracked' && !s.tools.bombs) continue;
      if (c.kind === 'boulder' && !s.tools.gloves) continue;
      out.push({ label: 'Digging up a hidden cache', site: c.kind === 'glint' ? { x: c.x, y: c.y } : { x: c.x, y: c.y + 2 }, run: () => this.digCache(c) });
    }
    for (const c of W.pois.camps) if (!pr.cleared.includes(c.id)) out.push({ label: 'Clearing a camp', site: { x: c.x, y: c.y }, run: () => this.clearCamp(c) });
    // A fall or a hasty exit can leave a chest behind in a cleared dungeon: go back for it.
    for (const id of WARDS) {
      if (!pr.bosses.includes(id)) continue;
      if (this.dungeonChestIds().some((cid) => cid.startsWith(`d:${id}:`) && !pr.opened.includes(cid))) out.push({ label: 'Revisiting a dungeon for its last chest', site: W.pois.dungeons[id].front, run: () => this.runDungeon(id, true) });
    }
    const st = s.quest.main;
    if (st !== 'end' && st !== 'kindle' && st !== 'spire') out.push({ label: 'Main quest', site: this.mainSite(), run: () => this.mainStep(true), main: true });
    return out;
  },

  mainSite() {
    const o = this.g.objectiveMarker;
    return o ? { x: o.x, y: o.y } : null;
  },

  *fullRoute() {
    for (let guard = 0; guard < 2000; guard++) {
      const g = this.g, s = g.state;
      if (s.quest.main === 'end') return;
      if (!g.overworldMap || g.area.kind !== 'overworld') {
        if (g.area.kind === 'dungeon') { yield* this.leaveDungeon(); continue; }
        if (g.area.kind !== 'overworld') { yield* this.walkTo(g.area.layout.exit, { feet: 3 }); yield; continue; }
      }
      let job = this.pickJob();
      // Before calling it done, give every job we gave up on another round.
      if (!job && this.tried && this.tried.size) { this.tried.clear(); this.note('Another pass over skipped jobs'); job = this.pickJob(); }
      if (!job) {
        // Only Vesper left (the four wardens and every job beaten): kindle, then down the Spire.
        const pr = this.progress(), last = pr.total - pr.done <= 1;
        if (last && s.quest.main === 'kindle') { this.status = 'Returning to the elder'; yield* this.mainStep(true); continue; }
        if (last && s.quest.main === 'spire') { this.status = 'Descending the Spire'; yield* this.mainStep(true); continue; }
        this.status = 'Nothing left in reach'; yield* this.wait(1); continue;
      }
      this.status = job.label;
      this.note(job.label);
      yield* job.run();
      yield;
    }
  },

  pickJob() {
    const g = this.g, map = g.overworldMap;
    const here = g.overworldPos() || g.world.pois.homeDoor;
    const reach = reachMap(map, here);
    let best = null, bd = Infinity;
    const tried = this.tried || (this.tried = new Map());
    for (const j of this.jobs()) {
      if (!j.site) continue;
      const spot = standableNear(map, j.site, here, 3, reach);
      const d = spot ? reach[spot.y * map.w + spot.x] : -1;
      if (d < 0) continue;
      const key = j.label + j.site.x + ',' + j.site.y;
      if ((tried.get(key) || 0) >= 5) continue;
      const penalty = (tried.get(key) || 0) * 120 + (j.later ? 60 : 0);
      const score = (j.main ? d * 0.8 : d) + penalty;
      if (score < bd) { bd = score; best = { ...j, key }; }
    }
    if (best) tried.set(best.key, (tried.get(best.key) || 0) + 1);
    return best;
  },

  *mainStep(full) {
    const g = this.g, W = g.world, st = g.state.quest.main;
    if (['vault', 'reliquary', 'sanctuary', 'vents', 'slagheart', 'frostfang', 'bells', 'bogking', 'fane', 'spire'].includes(st) && g.area.kind !== 'dungeon' && this.needsSupplies()) yield* this.resupply();
    switch (st) {
      case 'wake': case 'hearth': case 'kindle': yield* this.talkTo(this.npc('home', 'elder').id); break;
      case 'scout': case 'sigil': yield* this.talkTo(this.npc('outpost', 'scout').id); break;
      case 'lookout': case 'windcrest': case 'belfry': yield* this.climbLookout(st); break;
      case 'camp': yield* this.clearCamp(W.pois.camps.find((c) => c.quest)); break;
      case 'leaves': case 'vents': case 'beacons': case 'bells': yield* this.gatherRelics(st); break;
      case 'thornwall': yield* this.atSeal('verdant', 'Carrying the leaves to the thornwall'); break;
      case 'vault': yield* this.runDungeon('verdant', full); break;
      case 'smith': yield* this.talkTo(this.npc('home', 'smith').id); break;
      case 'ashpass': yield* this.talkTo(this.npc('desert', 'keeper').id); break;
      case 'ridge': yield* this.openGate('volcanic'); break;
      case 'cinderwatch': yield* this.talkTo(this.npc('volcanic', 'keeper').id); break;
      case 'slagheart': yield* this.atSeal('ashen', 'Facing Slagheart'); break;
      case 'reliquary': yield* this.runDungeon('ashen', full); break;
      case 'frostpass': yield* this.talkTo(this.npc('mountain', 'keeper').id); break;
      case 'boulder': yield* this.openGate('snow'); break;
      case 'rimewatch': yield* this.talkTo(this.npc('snow', 'keeper').id); break;
      case 'frostfang': yield* this.atSeal('frost', 'Facing Frostfang'); break;
      case 'sanctuary': yield* this.runDungeon('frost', full); break;
      case 'fenkeep': yield* this.talkTo(this.npc('swamp', 'keeper').id); break;
      case 'bogking': yield* this.atSeal('drowned', 'Facing Bogmaw'); break;
      case 'fane': yield* this.runDungeon('drowned', full); break;
      case 'spire': yield* this.runDungeon('spire', full); break;
    }
  },

  // ---------------------------------------------------------------- job runners
  *collectAt(t, done) {
    yield* this.goTo({ kind: 'overworld', x: t.x, y: t.y, near: 2 });
    for (let k = 0; k < 3 && !done(); k++) { yield* this.walkTo(t, { exact: true, timeout: 10 }); yield* this.wait(0.3); }
  },

  *readStone(l) {
    yield* this.goTo({ kind: 'overworld', x: l.x, y: l.y, near: 2 });
    if (this.g.area.kind === 'overworld') yield* this.useTile({ x: l.x, y: l.y });
  },

  *readShelf(b) {
    if (!(yield* this.goTo({ kind: 'interior', id: b.id }))) return;
    const shelf = this.g.area.layout.props.find((p) => p.type === 'shelf');
    if (shelf) yield* this.useTile({ x: shelf.x, y: shelf.y });
  },

  *doCave(c) {
    if (!(yield* this.goTo({ kind: 'cave', id: c.id }))) return;
    const a = this.g.area;
    const lost = a.npcs().find((n) => n.data.lost);
    if (lost) { this.status = 'Finding the lost wanderer'; yield* this.approachAndPress(() => a.npcs().find((n) => n.data.lost && !n.dead), 16); }
    const chest = a.entities.find((e) => e.contents && !e.opened);
    if (chest) { this.status = 'Opening the cave chest'; yield* this.openChest(chest); }
    for (const pk of a.entities.filter((e) => e.kind && e.id && String(e.id).startsWith('cavesupply:'))) {
      if (this.g.area !== a) break;
      yield* this.walkTo(tileOf(pk.x, pk.y), { exact: true, timeout: 12 });
    }
  },

  *catchPet(q) {
    yield* this.goTo({ kind: 'overworld', x: q.spot.x, y: q.spot.y, near: 4 });
    const s = this.g.state;
    for (let t = 0; t < 40 && sideStatus(s, q) === 'active'; t += 0.5) {
      const pet = this.g.area.entities.find((e) => e.q === q && !e.dead);
      if (!pet) { yield* this.wait(0.5); continue; }
      yield* this.walkTo(tileOf(pet.x, pet.y), { exact: true, timeout: 0.5 });
    }
  },

  *gatherHerbs(q) {
    yield* this.goTo({ kind: 'overworld', x: q.center.x, y: q.center.y, near: 3 });
    const s = this.g.state;
    for (let k = 0; k < 12 && sideStatus(s, q) === 'active'; k++) {
      const p = this.g.player;
      const herbs = this.g.area.entities.filter((e) => e.kind === 'herb' && e.questId === q.id && !e.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      if (!herbs.length) break;
      yield* this.walkTo(tileOf(herbs[0].x, herbs[0].y), { exact: true, timeout: 12 });
      yield* this.wait(0.2);
    }
  },

  *digAt(q) {
    yield* this.goTo({ kind: 'overworld', x: q.spot.x, y: q.spot.y, near: 2 });
    for (let k = 0; k < 3 && sideStatus(this.g.state, q) === 'active'; k++) {
      yield* this.walkTo(q.spot, { exact: true, timeout: 10 });
      this.tap('KeyE'); yield; yield* this.wait(0.3);
    }
  },

  *digCache(c) {
    const g = this.g;
    if (c.kind === 'glint') {
      yield* this.goTo({ kind: 'overworld', x: c.x, y: c.y, near: 2 });
    } else {
      yield* this.goTo({ kind: 'overworld', x: c.x, y: c.y + 2, near: 1 });
      const blocker = { x: c.x, y: c.y + 1 };
      if (g.area.map.isSolid(blocker.x, blocker.y)) {
        if (c.kind === 'cracked') yield* this.bombTile(blocker);
        else yield* this.useTile(blocker); // from any side we can reach: the stand below can be walled off
      }
    }
    for (let k = 0; k < 3 && !g.state.progress.caches.includes(c.id); k++) {
      yield* this.walkTo({ x: c.x, y: c.y }, { exact: true, timeout: 10 });
      this.tap('KeyE'); yield; yield* this.wait(0.3);
    }
  },

  // Wander the hunting grounds near the quest's town until enough of the right beasts fall.
  *hunt(q) {
    const g = this.g, s = g.state, W = g.world;
    const home = W.settlements.find((x) => x.id === q.settlementId).center;
    const seen = new Map();
    for (let round = 0; round < 12 && sideStatus(s, q) === 'active'; round++) {
      const here = g.overworldPos();
      const map = g.overworldMap, reach = reachMap(map, here);
      const spots = W.pois.spawns.filter((p) => p.biome === q.biome && (seen.get(p.id) || -999) < this.time - 50)
        .map((p) => ({ p, at: standableNear(map, p, here, 2) }))
        .filter((o) => o.at && reach[o.at.y * map.w + o.at.x] >= 0)
        .sort((a, b) => Math.hypot(a.p.x - home.x, a.p.y - home.y) + reach[a.at.y * map.w + a.at.x] * 0.5 - Math.hypot(b.p.x - home.x, b.p.y - home.y) - reach[b.at.y * map.w + b.at.x] * 0.5);
      if (!spots.length) { yield* this.wait(2); continue; }
      const { p } = spots[0];
      seen.set(p.id, this.time);
      this.status = `Hunting near ${W.settlements.find((x) => x.id === q.settlementId).name}`;
      yield* this.goTo({ kind: 'overworld', x: p.x, y: p.y, near: 2 });
      for (let t = 0; t < 6 && sideStatus(s, q) === 'active'; t += this.dt) {
        const near = g.area.enemyList.filter((e) => !e.dead && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 150);
        if (!near.length && t > 2) break;
        if (near.length) { const e = near[0]; this.move(Math.sign(Math.round(e.x - g.player.x)), Math.sign(Math.round(e.y - g.player.y))); }
        yield;
      }
    }
  },
};
