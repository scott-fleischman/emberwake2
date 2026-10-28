# Emberwake

A browser prototype of the top-down 2.5D fantasy action-adventure described in [game-space.md](game-space.md). Every world is generated from a seed. It has four starting classes, three regional dungeons with bosses, caves, towns full of named NPCs, and a main quest you can follow from your home village to the third warden.

## Play it

Every push to `main` that passes the tests deploys to GitHub Pages (`.github/workflows/pages.yml`): https://scott-fleischman.github.io/emberwake2/. Pull requests run the tests without deploying.

It plays on iPhone and iPad too. Touch the screen and on-screen controls appear: a floating stick on the left (push it to the rim to sprint), HIT, ITEM, GUARD, ROLL and USE on the right, and Menu, Map, Bag, Swap, Eat and Lock buttons. Tap menus, dialogs and cutscenes to choose or read on. Sideways gives the biggest view; held upright, the game sits at the top with the controls below like a handheld. Add it to the home screen to play full screen.

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
- **Main quest, and the seals on every ward.** You can't walk up to any ward. A living seal rings its door until the quest chain before it breaks it, and each chain mixes different kinds of steps:
  - **Verdant Vault (the thornwall).** Climb the old watchtower for a camera-pan vista, beat Gorrak the Warchief at the warband camp, then recover the three bronze leaves of the Verdant Sigil from guarded leaf-shrines. Raise them at the thornwall and it withers.
  - **Ashen Reliquary (the firewall).** Get the bomb satchel from the smith, blast the cracked ridge, and find the captain of the last outpost in the wastes. Cap three magma vents with bombs to starve the wall, then beat Slagheart when it crawls out.
  - **Frostbound Sanctuary (the ice wall).** The Cinder Warden gives you the Titan Gloves. Use them to lift the boulder pass, climb the Windcrest to spot the old signal beacons, and heave the ice off each beacon to light it. Then beat Frostfang, the Pale Alpha, and the wall shatters.

  Each seal breaks in its own cutscene. Then you face the warden and return the shards to the elder.
- **Bosses.** Thornmaw (a root-and-bark boar with a flytrap maw), the Cinder Warden (a floating obsidian knight with a living-flame crown) and the Rime Sovereign (a crystalline owl-queen) are big, animated, and have a pose for every attack. Each enters with a quake, a burst from the earth (or fire, or blizzard), a roaring close-up and a title slam. Phase changes flash and shockwave, and deaths crack apart in light.
- **Living villages.** People breathe, blink and go about their trades. The smith hammers, the merchant beckons, the elder leans on a staff, and captains thump their spears. Every shop hangs a swinging sign with its trade's icon (anvil, potion, mug, crystal ball, crowned shield, arrows), and the same icons mark the doors on the map.
- **Dungeons.** Rooms are generated from templates with seeded remixing. They include combat rooms that lock their doors, small keys and locked doors, timed gates, linked floor plates, ordered crystals, push/pull blocks, an antechamber fountain, a boss, and a return seal. Each dungeon has a minimap and a findable full map.
- **Combat.** Four enemy archetypes: brutes, lungers, skirmishers, and ranged. Each telegraphs and has a recovery window, and attack tokens keep crowds readable. There are shields, dodge invulnerability, sprinting, lock-on, knockback, and spirit-poof defeats. Each boss has phases and its own punish window.
- **Progression.** Classes differ in stats, gear, rhythm, and resources. Cave chests hold convergence items (steel sword, bow, ember tome, kite shield). Shrine talents include a class-flavored opening. Also included: food, hidden caches (the rogue spots them from farther away), shops, an inn, a seer, procedural side quests, and heart pieces.
- **Saving.** Save shrines, sleeping in your home bed, and save from anywhere via the pause menu. Death costs 20% of your coins and returns you to your last shrine.
- **Debug modes** on the title screen:
  - **Cutscene Theater.** Every story scene back to back like a film: the prologue, the elder, then for each ward its lookout vista, its seal breaking, and its warden's arrival and fall, then the ending.
    - A bar of buttons steps to the previous or next scene, pauses, and sets the speed from 0.25× to 4×.
    - Keys: ←/→ change scene, −/+ change speed, P pauses, Enter reads on, Backspace leaves.
  - **Watch Autoplay.** A bot plays a fresh random world while you watch, as an **Any%** speedrun or a **100%** run, with a speedrun timer and splits.
    - The buttons set the speed (0.5× to 32×) and pause the run.
    - **Skip** fast-forwards to the next dungeon, then to its warden. **To the end** fast-forwards to the win.
    - Keys: ←/→ speed, Space pause, N skip, End finish, Esc quit.
    - Pick the class in the menu.
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
