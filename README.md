# Emberwake

A browser prototype of the top-down 2.5D fantasy action-adventure described in [game-space.md](game-space.md). Every world is generated from a seed. It has four starting classes, three regional dungeons with bosses, caves, towns full of named NPCs, and a main quest you can follow from your home village to the third warden.

## Run it

```bash
npm start
```

Then open http://localhost:5173. There are no dependencies to install; it is plain ES modules served by a tiny Node server. Node 18 or newer is needed.

```bash
npm test
```

The tests cover world-generation reachability over many seeds, dungeon solvability, caves, quests, dialog, save/load, combat rules, and physics.

## Controls

| Action | Keys | | Action | Keys |
|---|---|---|---|---|
| Move | WASD / arrows | | Interact / talk | E or Enter |
| Attack | J or Z | | Pull a block | hold E and step back |
| Use item | K or X | | Cycle item | Q or Tab |
| Shield (hold) | L or C | | Lock-on | R |
| Dodge | Space | | Eat a ration | F |
| Sprint (hold) | Shift | | Map | M |
| Pause / save | Esc or P | | | |

## What's in the prototype

- **Staged world generation.** Terrain and geology, then water, regional growth, settlements, roads, and finally encounters and quest content. There are six surface biomes plus caves. Cliffs can only be crossed at carved stairs. The volcanic and snow regions are ringed by ridges whose single road crossing needs bombs or the Titan Gloves.
- **Main quest.** Wake at home, then: elder, scout, warband camp, Verdant Sigil, Verdant Vault (Thornmaw), the smith's bomb satchel, the cracked ridge, Ashen Reliquary (Cinder Warden, which gives the gloves), the boulder pass, Frostbound Sanctuary (Rime Sovereign), and back to the elder.
- **Dungeons.** Rooms are generated from templates with seeded remixing. They include combat rooms that lock their doors, small keys and locked doors, timed gates, linked floor plates, ordered crystals, push/pull blocks, an antechamber fountain, a boss, and a return seal. Each dungeon has a minimap and a findable full map.
- **Combat.** Four enemy archetypes: brutes, lungers, skirmishers, and ranged. Each telegraphs and has a recovery window, and attack tokens keep crowds readable. There are shields, dodge invulnerability, sprinting, lock-on, knockback, and spirit-poof defeats. Each boss has phases and its own punish window.
- **Progression.** Classes differ in stats, gear, rhythm, and resources. Cave chests hold convergence items (steel sword, bow, ember tome, kite shield). Shrine talents include a class-flavored opening. Also included: food, hidden caches (the rogue spots them from farther away), shops, an inn, a seer, procedural side quests, and heart pieces.
- **Saving.** Save shrines, sleeping in your home bed, and save from anywhere via the pause menu. Death costs 20% of your coins and returns you to your last shrine.
- **Debug modes** on the title screen:
  - Combat Arena: spawn archetypes or bosses, swap class or enemy family, and watch a balance log.
  - Terrain Viewer: inspect any seed layer by layer.

## Known deviations from the spec

- **Audio** is synthesized with WebAudio: region-grouped soft-piano music and distinct SFX. The spec asks for bundled, freely licensed audio files. The `AudioEngine` interface in `src/audio/audio.js` is where such files would plug in.
- **Art** is procedural pixel art drawn in code, not selectively integrated licensed assets.
- **The fourth region** (the Drowned Fane in the swamp) and the final Spire are present as sealed landmarks, matching the spec's "establish the third regional path before expanding to the fourth."
