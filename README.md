# Emberwake

A browser prototype of the top-down 2.5D fantasy action-adventure described in [game-space.md](game-space.md). Every world is generated from a seed. It has four starting classes, five dungeons with bosses (four regional wards and the Emberwake Spire), caves, towns full of named NPCs, and a main quest you can follow from your home village to Vesper, the Unkindled, at the bottom of the Spire.

## Play it

Every push to `main` that passes the tests deploys to GitHub Pages (`.github/workflows/pages.yml`): https://scott-fleischman.github.io/emberwake2/. Pull requests run the tests without deploying.

It plays on iPhone and iPad too. Touch the screen and on-screen controls appear: a floating stick on the left (push it to the rim to sprint), HIT, ITEM, GUARD, ROLL and USE on the right, and Menu, Map, Bag, Swap, Eat and Lock buttons. Tap menus, dialogs and cutscenes to choose or read on. Sideways gives the biggest view; held upright, the game sits at the top with the controls below like a handheld. On a phone the view zooms in so you can see what you're looking at: about 17 tiles across instead of 30 (Options › View zoom sets it by hand, on any screen). Add it to the home screen to play full screen.

## Run it

```bash
npm start
```

Then open http://localhost:5173. There are no dependencies to install; it is plain ES modules served by a tiny Node server. Node 18 or newer is needed.

To play without a server, on Windows or anywhere else:

```bash
npm run build
```

This writes `dist/`: a single `index.html` with every module embedded, plus a short `README.txt`. Copy the folder anywhere and double-click `index.html` to play in a recent Edge, Chrome or Firefox. No install or internet connection is needed.

```bash
npm test
```

The tests cover world-generation reachability over many seeds, dungeon solvability under the real door rules, caves, quests, dialog, save/load, combat rules, status effects, monster moves, every boss's phases, physics, voices and sound, the zoomed view, and full autoplay runs of the game (Any% and 100%) through to the true ending.

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

- **Story and cutscenes.** A painted prologue tells of the fallen Firstflame, the Kindlers, the four wardens and the Unkindled sealed beneath the Spire. The elder shows you the guttering Hearth over this seed's real map. Each warden gets a letterboxed introduction, and when it falls its freed spirit (a stag, a phoenix, an owl, a whale) tells you what it remembers before the Unkindled's voice cuts in. Three shards brought home rekindle the Hearth and light three sockets on the Spire's door; the fourth lights them all, and the door opens. When Vesper falls, the ghost of the man he was lets go, and the true ending plays: the four spirits circle the Spire, the elder tells you what you are, and each region heals in turn. Afterwards the world is at peace: townsfolk talk of the bright Hearth, and Vesper's chamber stands empty. Replay the prologue from the pause menu.
- **Lore journal.** 19 pages to find: seven Kindler standing stones by the roads, eight books on village bookshelves (your own home holds the chronicle of the night you were found), and four warden memories. Esc › Lore journal.
- **Side quests.** Fifteen per world. Six are handwritten and appear in every world: a pet that bolts when you approach, a riddle-keeper, a two-way love-letter courier, a treasure map to dig up, an herb-gathering patch, and a scholar who wants the standing stones read. The rest are seeded fetch, hunt, deliver, rescue, pet, herb and treasure quests with varied framing. Helped villagers have epilogue lines, and townsfolk call out in speech bubbles as you pass.
- **Kind to newcomers.** A Story difficulty (foes barely scratch you) is chosen on the new-game screen alongside Gentle, Normal and Hard. The new quests are low-combat, and pickups drift to you from farther away.

- **Staged world generation.** Terrain and geology, then water, regional growth, settlements, roads, and finally encounters and quest content. There are six surface biomes plus caves. Cliffs can only be crossed at carved stairs. The volcanic and snow regions are ringed by ridges whose single road crossing needs bombs or the Titan Gloves.
- **Main quest, and the seals on every ward.** You can't walk up to any ward. A living seal rings its door until the quest chain before it breaks it, and each chain mixes different kinds of steps:
  - **Verdant Vault (the thornwall).** Climb the old watchtower for a camera-pan vista, beat Gorrak the Warchief at the warband camp, then recover the three bronze leaves of the Verdant Sigil from guarded leaf-shrines. Raise them at the thornwall and it withers.
  - **Ashen Reliquary (the firewall).** Get the bomb satchel from the smith, blast the cracked ridge, and find the captain of the last outpost in the wastes. Cap three magma vents with bombs to starve the wall, then beat Slagheart when it crawls out.
  - **Frostbound Sanctuary (the ice wall).** The Cinder Warden gives you the Titan Gloves. Use them to lift the boulder pass, climb the Windcrest to spot the old signal beacons, and heave the ice off each beacon to light it. Then beat Frostfang, the Pale Alpha, and the wall shatters.
  - **Drowned Fane (the Tidewall).** The Rime Sovereign gives you the Rime Charm. Take the three shards home first: the Hearth roars back, and the elder sends you to the keeper of the swamp town. Climb the Drowned Belfry for a vista, then freeze each flooded pool with the charm and ring the sunken Tide Bell in it. When the third bell rings, Bogmaw, the Drowned King, surfaces; beat him and the Tidewall drains away.

  Each seal breaks in its own cutscene, and then you face the warden. Bring the fourth shard home for the kindling: the Hearth blazes, all four sockets on the Spire's door light, and the Spire opens. Vesper waits at the bottom.
- **Bosses.** Thornmaw (a root-and-bark boar with a flytrap maw), the Cinder Warden (a floating obsidian knight with a living-flame crown), the Rime Sovereign (a crystalline owl-queen) and the Tidewarden (a coral-crowned sea serpent that dives into its pool and bursts up under you) are big, animated, and have a pose for every attack. Each enters with a quake, a burst from the earth (or fire, or blizzard, or flood), a roaring close-up and a title slam. Each has its own synthesized roar, attack cues, phase change and death, and in the fight it growls as it starts a move and grunts when you land a blow.
  - **Health.** Thornmaw has 64, then 84, 104 and 124 for the Cinder Warden, the Rime Sovereign and the Tidewarden, and Vesper 150 (and 100 on his second bar). No warden fights with a crowd: at most one minion comes at the start of its second phase, so the patterns stay readable.
  - **Two phases.** At half health each warden transforms, untouchable for a moment, into a new look with new attacks, and the music drives harder. Thornmaw blooms (racing root lines, a snaring spore cloud, a vine lash). The Cinder Warden is Unbound and draws a flame greatsword (meteor rain, a sweep that sends a fire wave, spreading lava). The Rime Sovereign shatters and reforms on frost wings (a blizzard gust, ice-pillar prisons, an ice decoy). The Tidewarden turns pale and drowned for the Wail (a tidal wave with one gap, a whirlpool, song rings, a leech).
  - **Four-way facing.** Every boss form has a side view (mirrored for left and right), a front view and a back view, chosen from the way it is heading.
  - **Centered deaths.** At zero the screen fades out and back in on the boss standing at the centre of its arena. It dematerializes there, and its spirit appears on the same spot.
  - **Vesper, the Unkindled,** fights in three phases on two bars. His own form throws homing gloam bolts, shadow-steps behind you into a cold-flame scythe and raises gloam pillars. At half health he becomes a smoke-winged shadow (a gloam ring with gaps, a drain beam, an eclipse, and one Gloam-touched kin as it begins). Knocked to zero, he pulls the light out of the four sockets around his chamber and gets back up with a full bar. Then he borrows each of the four wardens in turn, in his own colours; two hits (three on Hard) break a borrowed form and leave him stunned.
- **Living villages.** People breathe, blink and go about their trades. The smith hammers, the merchant beckons, the elder leans on a staff, and captains thump their spears. Every shop hangs a swinging sign with its trade's icon (anvil, potion, mug, crystal ball, crowned shield, arrows), and the same icons mark the doors on the map.
- **Dungeons.** Five: the four wards and the Emberwake Spire. Rooms are generated from templates with seeded remixing. They include combat rooms that lock their doors, small keys and locked doors, timed gates, linked floor plates, ordered crystals, push/pull blocks, an antechamber fountain, a boss, and a return seal. Each dungeon has a minimap and a findable full map.
  - **Tide levers** (the Drowned Fane). A lever floods one set of floor tiles and drains the other; cross by switching the tide at the right moments. The Fane's bog and mire slow and poison you unless you roll over them.
  - **The Emberwake Spire** is about twice the size of the others and the hardest place in the game. Its hubs open on four wings, one per ward, each with its ward's tiles and puzzles and Gloam-touched monsters (violet versions of that ward's family). Each wing ends in a Gloam echo of its ward's guardian (Gorrak, Slagheart, Frostfang, Bogmaw), and each echo beaten lights an inner seal in the hub. With all four lit, the descent opens: the hardest fights, then Vesper.
  - **Ember beams** (the Spire). A brazier throws a beam of light. Strike a mirror (or shoot it) to turn it a quarter, and steer the beam into the receiver to open the door.
  - **Ember carries** (the Spire). Take flame from the lit brazier and carry it to every dark one before it gutters. Rolling puts it out, and when it goes out, the braziers it lit go dark again.
- **Combat.** Four enemy archetypes: brutes, lungers, skirmishers, and ranged. Each telegraphs and has a recovery window, and attack tokens keep crowds readable. There are shields, dodge invulnerability, sprinting, lock-on, knockback, and spirit-poof defeats. Each boss has its own punish windows.
- **Regional monster moves and status effects.** Each of the 24 regional monsters has a signature move: a separate special on its own 8–12 second cooldown, with a long windup that glows in its effect's colour. Each region has its own effect:
  - Forest: **snare** (rooted in place; attack 3 times to tear free).
  - Swamp: **poison** (half a heart every 1.5 seconds, but never below half a heart; eat a ration to cure it) and **mud** (half speed; roll to shake it off).
  - Desert: **blind** (darkness closes in to a small circle around you).
  - Snow: **chill** (70% speed). A second chill becomes a **freeze**: mash any button to break out.
  - Volcanic: **burn** (half a heart a second; roll to put it out).
  - Mountain monsters bring rockfall and heavy knockback instead.

  Effects last about 5 seconds, show an icon over you and a chip on the HUD, and have their own sounds, as does every monster move. After a snare or freeze ends, you can't be snared or frozen again for 3 seconds. On Story difficulty effects last half as long and a freeze breaks in one press.
- **Progression.** Classes differ in stats, gear, rhythm, and resources. Cave chests hold convergence items (steel sword, bow, ember tome, kite shield). Shrine talents include a class-flavored opening. Also included: food, hidden caches (the rogue spots them from farther away), shops, an inn, a seer, procedural side quests, and heart pieces.
- **Sound.** Everything is synthesized in the browser; there are no audio files.
  - **Music.** The title has its own theme, an adventure march with horns, strings and drums, which also comes in as the prologue's title card appears. Each region, town, cave and dungeon has its own generated piano score, and the true ending gets the Hearth's lullaby.
  - **Voices.** People talk in babble as their lines type out, each in a voice of their own (the elder old and slow, the Unkindled deep and rasping, the spirits a hum, a trill, a hoot and a whale's song), and greet you with a little "hm-hm?" when you speak to them. The wardens speak in growls.
  - **Creatures.** Every monster has a cry: it calls out when it sees you, grunts into its attacks, yelps when hit and cries out as it falls, and mutters to itself when left alone.
  - **Scenes.** Story scenes have sound under them: the falling star whistles down and lands with a boom, then the fire crackles; the village murmurs and laughs; the dark beneath the Spire drones; wind on the lookouts, birdsong as the land heals, the sea coming back.
- **Saving.** Save shrines, sleeping in your home bed, and save from anywhere via the pause menu. Death costs 20% of your coins and returns you to your last shrine.
- **Debug modes** on the title screen:
  - **Cutscene Theater.** Every story scene back to back like a film, in story order: the prologue and the elder; for each ward its chapter card, lookout vista, seal breaking, and its warden's arrival and fall (the Hearth rekindling comes before the fourth); then the kindling, the way into the Spire, Vesper's arrival, his rise and his fall, and the true ending.
    - A bar of buttons steps to the previous or next scene, pauses, and sets the speed from 0.25× to 4×.
    - Keys: ←/→ change scene, −/+ change speed, P pauses, Enter reads on, Backspace leaves.
  - **Watch Autoplay.** A bot plays a fresh random world while you watch, as an **Any%** speedrun or a **100%** run, with a speedrun timer and splits.
    - The buttons set the speed (0.5× to 32×) and pause the run.
    - **Skip** fast-forwards to the next dungeon (the four wards, then the Spire), then to its warden (in the Spire, Vesper). **To the end** fast-forwards to the win.
    - Keys: ←/→ speed, Space pause, N skip, End finish, Esc quit.
    - Pick the class in the menu.
  - Combat Arena: spawn archetypes or bosses, swap class or enemy family, and watch a balance log.
  - Terrain Viewer: inspect any seed layer by layer.

## Autoplay: proof the game can be beaten

The bot in `src/bot/` plays through the real input system: every frame it holds or taps the same keys you would. It never teleports and is never invincible. What it has is route knowledge, like a practiced speedrunner. It reads the map, quest markers and enemy telegraphs; blocks or sidesteps attacks; shakes off status effects (mashing out of a freeze, swinging out of a snare, rolling out of a burn or from under a leech, eating when poisoned and low); solves every puzzle type. Any% skips cutscenes; 100% watches every scene through and lets every line type out and stay up long enough to read, so a 100% run shows the whole game (about 85 minutes on the test seed, against about 62 skipping). The 100% route keeps taking the nearest unfinished job it can reach: side quests, standing stones, books, caves, caches, camps, and full dungeon clears. It leaves Vesper for last, so a 100% run ends with everything done.

Run it headless (no browser) on any seed and class:

```bash
node tools/autoplay.mjs ember123 swordsman any
```

The last argument is `any` or `full`. The run is deterministic for a given seed, class and mode. It prints splits, the finish time and falls, or where it stalled. `node tools/sweep.mjs any` (or `full`) runs every class on eight seeds in parallel and fails if any run stalls.

### Movies

`tools/record.mjs` films a run to an MP4: the prologue, then the bot's run, drawn frame by frame in a headless browser with the sound rendered offline on the same clock, so it never drops a frame or drifts out of sync. It plays the same run `tools/autoplay.mjs` does for that seed.

```bash
node tools/record.mjs --mode full --out movies/emberwake-100.mp4
```

```bash
node tools/record.mjs --phone --minutes 5 --out movies/emberwake-phone.mp4
```

`--phone` films an iPhone held sideways (844×390 at 2×), zoomed in as a phone plays, with the touch controls on screen following the bot's thumbs. `--minutes` stops early; `--seed` and `--class` pick the run. It needs ffmpeg and Playwright (`npm i -D playwright`, or point `PLAYWRIGHT` at an installed copy's `index.mjs`). `movies/` is ignored by git.

## Known deviations from the spec

- **Audio** is synthesized with WebAudio: region-grouped soft-piano music, and distinct sounds for every boss, monster move and status effect. The spec asks for bundled, freely licensed audio files. The `AudioEngine` interface in `src/audio/audio.js` is where such files would plug in.
- **Art** is procedural pixel art drawn in code, not selectively integrated licensed assets.
