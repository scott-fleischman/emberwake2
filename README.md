# Emberwake

A browser prototype of the top-down 2.5D fantasy action-adventure described in [game-space.md](game-space.md). Every world is generated from a seed. It has four starting classes, three regional dungeons with bosses, caves, towns full of named NPCs, and a main quest you can follow from your home village to the third warden.

## Play it

Every push to `main` that passes the tests deploys to GitHub Pages (`.github/workflows/pages.yml`): https://scott-fleischman.github.io/emberwake2/. Pull requests run the tests without deploying.

## Run it

```bash
npm start
```

Then open http://localhost:5173. There are no dependencies to install; it is plain ES modules served by a tiny Node server. Node 18 or newer is needed.

```bash
npm test
```

The tests cover world-generation reachability over many seeds, dungeon solvability under the real door rules, caves, quests, dialog, save/load, combat rules, physics, and a full autoplay run of the game.

## Controls

| Action | Keys | | Action | Keys |
|---|---|---|---|---|
| Move | WASD / arrows | | Interact / talk | E or Enter |
| Attack | J or Z | | Pull a block | hold E and step back |
| Spin attack | hold J, then release | | Skip a cutscene | Esc twice |
| Use item | K or X | | Item menu | I or Y |
| Quick-swap item | Q or Tab | | | |
| Shield (hold) | L or C | | Lock-on | R |
| Dodge | Space | | Eat a ration | F |
| Sprint (hold) | Shift | | Map | M |
| Pause / save | Esc or P | | | |

## What's in the prototype

- **Story and cutscenes.** A painted prologue tells of the fallen Firstflame, the Kindlers, the four wardens and the Unkindled sealed beneath the Spire. The elder shows you the guttering Hearth over this seed's real map. Each warden gets a letterboxed introduction, and when it falls its freed spirit (a stag, a phoenix, an owl) tells you what it remembers before the Unkindled's voice cuts in. Returning three shards plays the ending. Replay the prologue from the pause menu.
- **Lore journal.** 18 pages to find: seven Kindler standing stones by the roads, eight books on village bookshelves (your own home holds the chronicle of the night you were found), and three warden memories. Esc › Lore journal.
- **Side quests.** Fifteen per world. Six are handwritten and appear in every world: a pet that bolts when you approach, a riddle-keeper, a two-way love-letter courier, a treasure map to dig up, an herb-gathering patch, and a scholar who wants the standing stones read. The rest are seeded fetch, hunt, deliver, rescue, pet, herb and treasure quests with varied framing. Helped villagers have epilogue lines, and townsfolk call out in speech bubbles as you pass.
- **Kind to newcomers.** A Story difficulty (foes barely scratch you) is chosen on the new-game screen alongside Gentle, Normal and Hard. The new quests are low-combat, and pickups drift to you from farther away.

- **Staged world generation.** Terrain and geology, then water, regional growth, settlements, roads, and finally encounters and quest content. There are six surface biomes plus caves. Cliffs can only be crossed at carved stairs. The volcanic and snow regions are ringed by ridges whose single road crossing needs bombs or the Titan Gloves.
- **Main quest.** Wake at home, then: elder, scout, warband camp, Verdant Sigil, Verdant Vault (Thornmaw), the smith's bomb satchel, the cracked ridge, Ashen Reliquary (Cinder Warden, which gives the gloves), the boulder pass, Frostbound Sanctuary (Rime Sovereign), and back to the elder.
- **Dungeons.** Rooms are generated from templates with seeded remixing. They include combat rooms that lock their doors, small keys and locked doors, timed gates, linked floor plates, ordered crystals, push/pull blocks, an antechamber fountain, a boss, and a return seal. Each dungeon has a minimap and a findable full map.
- **Combat.** Four enemy archetypes: brutes, lungers, skirmishers, and ranged. Each telegraphs and has a recovery window, and attack tokens keep crowds readable. There are shields, dodge invulnerability, sprinting, lock-on, knockback, and spirit-poof defeats. Each boss has phases and its own punish window.
- **Progression.** Classes differ in stats, gear, rhythm, and resources. Cave chests hold convergence items (steel sword, bow, ember tome, kite shield). Shrine talents include a class-flavored opening. Also included: food, hidden caches (the rogue spots them from farther away), shops, an inn, a seer, procedural side quests, and heart pieces.
- **Saving.** Save shrines, sleeping in your home bed, and save from anywhere via the pause menu. Death costs 20% of your coins and returns you to your last shrine.
- **Debug modes** on the title screen:
  - Cutscene Theater: every story scene back to back like a film (prologue, the elder, each warden in its real boss room, the ending). Enter advances, Esc twice skips a scene, Backspace leaves.
  - Watch Autoplay: a bot plays a fresh random world while you watch, as an **Any%** speedrun or a **100%** run, with a speedrun timer and splits. ←/→ change speed (1× to 32×), Space pauses, Esc quits. Pick the class in the menu.
  - Combat Arena: spawn archetypes or bosses, swap class or enemy family, and watch a balance log.
  - Terrain Viewer: inspect any seed layer by layer.

## Autoplay: proof the game can be beaten

The bot in `src/bot/` plays through the real input system: every frame it holds or taps the same keys you would. It never teleports and is never invincible. What it has is route knowledge, like a practiced speedrunner. It reads the map, quest markers and enemy telegraphs; blocks or sidesteps attacks; solves every puzzle type; and skips cutscenes. The 100% route keeps taking the nearest unfinished job it can reach: side quests, standing stones, books, caves, caches, camps, and full dungeon clears.

Run it headless (no browser) on any seed and class:

```bash
node tools/autoplay.mjs ember123 swordsman any
```

The last argument is `any` or `full`. The run is deterministic for a given seed, class and mode. It prints splits, the finish time and falls, or where it stalled.

## Known deviations from the spec

- **Audio** is synthesized with WebAudio: region-grouped soft-piano music and distinct SFX. The spec asks for bundled, freely licensed audio files. The `AudioEngine` interface in `src/audio/audio.js` is where such files would plug in.
- **Art** is procedural pixel art drawn in code, not selectively integrated licensed assets.
- **The fourth region** (the Drowned Fane in the swamp) and the final Spire are present as sealed landmarks, matching the spec's "establish the third regional path before expanding to the fourth."
