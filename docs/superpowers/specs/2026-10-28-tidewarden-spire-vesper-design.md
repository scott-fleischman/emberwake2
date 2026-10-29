# The fourth ward, the Spire and Vesper; two-phase wardens; regional monster moves

## Why

The game stops at three dungeons. The story promises four wardens and Vesper, the Unkindled, beneath
the Spire, but the Drowned Fane and the Spire are locked landmarks. The bosses look good but only
ever face left or right, change little between phases, and die wherever they happen to be standing.
Regional monsters are recolors of the same four archetypes: only the shooters differ, by projectile.
Sounds are shared generic effects.

## Goals

1. **Five dungeons.** The **Drowned Fane** (fourth ward, the Tidewarden) gets a full quest chain and
   seal like the first three. The **Emberwake Spire** becomes the fifth dungeon: about twice the
   size of the others, the hardest place in the game, with new puzzles. Vesper waits at the bottom.
2. **Every warden has a real second phase** (user). Each warden has about **double its current HP**.
   The first half plays as the fight does today. At half HP it transforms: a **new look and new
   attacks**, not just faster versions of the old ones.
3. **Vesper has three phases** (user).
   - Phase 1: his own attacks.
   - Phase 2, at half HP: a new look and new attacks.
   - Phase 3: knocked to zero, his HP bar **refills**. He then cycles through **all four wardens**:
     his body reshapes into something reminiscent of a warden, in his own colors, and he uses that
     warden's attacks. **Two or three hits** break the borrowed form. He snaps back to his own shape
     and attacks as himself for a while, then borrows the next warden. Examples from the user:
     - As the Rime Sovereign he rains dark magic from the sky and fires bolts outward.
     - As Thornmaw he turns beast-like and charges.
4. **Bosses face four ways** (user). Every boss form has a side view (mirrored for left and right),
   a **front view** for moving down the screen, and a **back view** for moving up it.
5. **Boss deaths are centered** (user).
   - When HP hits 0, the screen fades out.
   - It fades back in with the boss standing at the **centre of the arena, where it spawned**.
   - The boss dematerializes there, and its spirit appears in the same spot. The whole outro happens
     at the centre.
6. **The Cinder Warden's casting pose is redone** (user). Today, during the ember volley its hands
   slide inward toward its body (`cinderHands`, `volley`: `x: s * (23 - q * 10)`). That looks wrong.
   It should instead draw back and thrust outward toward the player, and the embers should leave
   from the palms in the throw direction.
7. **Regional monster moves** (user approved the table). Each region has an effect, and each of the
   24 monsters gets a signature move built on that region's effect (table below). Effects last
   **about 5 seconds** (user), each shows an icon over the player, and each has a clear way to shake
   it off.
8. **Better, more unique sounds** (user). Each boss gets its own synthesized voice: roar, attack
   cues, phase change and death. Each monster move and each status effect gets its own sound.

## Non-goals

- A bigger world. The user said the size is right.
- Save compatibility. Saves are pre-release.
- Bundled audio files. Sounds stay synthesized with WebAudio, as today.
- New classes or a new combat system.

## Anti-goals

- **Damage sponges.** Double HP is there to make room for the second phase's patterns. Punish
  windows stay generous, and the second half of a fight should feel new, not long.
- **Stun-lock.** No chain of effects should take control away for long:
  - After any control-taking effect (snare or freeze) ends, the player is immune to control-taking
    effects for 3 seconds.
  - Freeze can be mashed out of in about 1.5 seconds.
  - On Story difficulty, effects last half as long and freeze breaks in one press.
- **Busywork.** As in the first three chains, every quest step has a story beat and changes
  something you can see in the world.
- **Breaking autoplay.** Any% and 100% must still finish every seed in the sweep (4 classes × 8
  seeds), now through the Fane, the Spire and Vesper, to the true ending.

## Main quest after the Sanctuary

Today, `sanctuary → drowned → end`, where `drowned` means "return to the elder with three shards".
The new tail:

`sanctuary → hearth → fenkeep → belfry → bells → bogking → fane → kindle → spire → end`

- **sanctuary.** Beating the Rime Sovereign gives the **Rime Charm**, the same way the Cinder Warden
  gives the Titan Gloves (`tools.charm`, an artifact, a "Received" banner). With it you can freeze a
  flooded pool into an ice path by using it at the pool's edge.
- **hearth.** Return to the elder with three shards. Most of today's `endingShots` plays here, but
  without the "Chapter I complete" card: three sockets glow on the Spire door, and Vesper taunts you
  about the fourth shard. The elder sends you to the keeper of the swamp town.
- **fenkeep.** The swamp keeper explains:
  - The Fane is ringed by the **Tidewall**, a churning wall of floodwater.
  - The Tidewarden's song once commanded the tides.
  - Three bronze **Tide Bells** that echoed the song were sunk when the waters rose.
- **belfry.** Reach the **Drowned Belfry**, a half-sunk bell tower that serves as the lookout. A
  vista cutscene pans to the Fane inside its Tidewall, then to each of the three bells glinting in
  flooded pools.
- **bells.** Each bell stands on an island in a flooded pool. Freeze a path with the Rime Charm and
  ring the bell (interact). Each bell is guarded, as relics are today.
- **bogking.** When the third bell rings, **Bogmaw, the Drowned King** surfaces at the Tidewall.
  Bogmaw is a giant Spitter Toad elite (the ranged archetype, swamp family). Beat it, and a cutscene
  plays: the bells sing the old song, and the Tidewall drains away.
- **fane.** Beat the Tidewarden in the Drowned Fane. Its spirit (a great **whale**) speaks.
- **kindle.** Return to the elder with four shards. In a cutscene the Hearth roars, all four sockets
  blaze, and the Spire door grinds open. Vesper: "Come down, little ember."
- **spire.** Clear the Spire and defeat Vesper. Then the true ending plays. It replaces today's
  three-shard ending and its "Chapter I complete" card.

Out-of-order catch-ups follow the existing pattern in `advanceMain`. The objective text and markers
cover every new stage.

## The Tidewarden (Drowned Fane boss)

- **Look.** A coral-crowned sea serpent. Its body arcs out of the water in segments. It has
  barnacled scales, tide-blue glowing fins, and a throat sac that glows when it sings.
- **Arena.** The Fane boss room has pools it can dive into.
- **Phase 1:**
  - **Dive and resurface.** It sinks into a pool and bursts up near you. A ripple marks the spot
    first.
  - **Water-jet volley.**
  - **Tail sweep.** It sweeps across the arena along a telegraphed line.
- **Phase 2, "the Wail."** It sheds its coral into a pale, drowned, ghostly form, and the edges of
  the arena flood:
  - A **tidal wave** crosses the arena with a gap to find or roll through.
  - A **whirlpool** drags you toward it.
  - **Song rings** expand outward; roll through them.
  - It summons Mire Leeches.
- The Fane uses the swamp family and swamp hazards (mud and poison pools), and the Tide Bells' bronze
  shows up in its décor.

## Warden second phases (new look, new attacks)

| Warden | Phase 2 look | New attacks |
|---|---|---|
| Thornmaw | **Bloom.** The bark splits and a huge carnivorous flower bursts open on its back; vines thrash | Root lines that race along the ground toward you; a spore cloud that snares; a vine-lash sweep |
| Cinder Warden | **Unbound.** Armor plates blast off, the molten core blazes, the crown becomes a pillar of fire, and it draws a flame greatsword | Meteor rain on marked spots; a greatsword sweep that sends a fire wave; spreading lava pools that burn |
| Rime Sovereign | **Shatter.** It bursts into shards and reforms larger, with frost wings and an icicle crown | A blizzard gust that pushes you; ice-pillar prisons that freeze if they catch you; two ice decoys that fire bolts and break in one hit |
| Tidewarden | **The Wail** (above) | Tidal wave, whirlpool, song rings, leeches |

- The phase change happens where the boss stands. It roars, the art transforms over about 1.5
  seconds while it can't be hurt, and its theme music swells.
- Today's extra steps fold into the two-phase structure: the Cinder Warden's 25% step, and the
  phase 2 and 3 summons and walls. The builder decides which of those moves to keep in phase 2.
- HP doubles from today's values: Thornmaw 120, Cinder 144, Rime 168. The Tidewarden gets 180.

## Vesper, the Unkindled

- **Look.** A tall, gaunt Kindler in tattered robes of cold violet flame (the Gloam). He wears a
  hollow crown, and a cracked, dark ember sits in his chest. Palette: violet `#c8a0ff`, deep black
  and cold white.
- **Arena.** The bottom of the Spire: a round chamber with four empty sockets around its rim, one for
  each warden.
- **Phase 1 (his own attacks):**
  - Slow homing **gloam bolts**.
  - A **shadow step**: he vanishes and reappears behind you, with a telegraph.
  - **Gloam pillars** that erupt from marked spots.
  - A sweeping **cold-flame scythe**.
- **Phase 2, at half HP.** His robes burn away into a towering smoke-winged shadow, and the stolen
  fire shows through the cracks. New attacks:
  - A **gloam ring** with gaps.
  - A sweeping **drain beam**.
  - **Eclipse**: the screen dims and bolts come in from the edges.
  - Shadow-tinted regional monsters as summons.
- **Down to zero.** This plays as the centered death flow (below), but instead of dying he laughs,
  pulls the light out of the four sockets, and his HP bar refills on screen. Phase 3 begins.
- **Phase 3 (cycles):**
  1. **Own form:** a few of his phase 1 and 2 attacks.
  2. **Borrowed form:** he picks a warden he hasn't borrowed this cycle (random order, all four per
     cycle). He reshapes over about 1 second and uses that warden's moves in his palette:
     - Thornmaw: a charge and thorn bursts.
     - Cinder Warden: ember volleys and a vent.
     - Rime Sovereign: dark rain from the sky, orbiting shots and a dash.
     - Tidewarden: dive and resurface, and a tidal wave.
  3. **Break:** two or three hits while he's borrowing (three on Hard, two otherwise) knock him back
     into his own form, briefly stunned. That stun is a punish window. Then back to step 1.
  - **Phase 3 is exactly one cycle, and all four wardens always appear.**
    - His HP has four floors: 80%, 60%, 40% and 20%. Each one holds until he has borrowed and lost
      one more form. The first broken form lifts the 80% floor, the second the 60% floor, and so on.
    - After the fourth form breaks, the last fifth is his own final stand, and the fight can end.
    - If you don't land the breaking hits within about 12 seconds, the borrowed form wears off on
      its own and he borrows again. It doesn't count as a break.
    - So damage can't skip the warden forms, and a weak player isn't stuck in repeat cycles.
- **Art reuse.** The borrowed forms reuse the warden painters with a Vesper palette and his hollow
  crown and face added. So painters must take a palette parameter.
- **HP.** The first bar (phases 1 and 2) is about 220; the refilled bar (phase 3) is about 180.
- **Death.** This uses the centered death flow. When he dematerializes, what's left is the frail
  ghost of the man he was, and that ghost lets go. There is no animal spirit; the ending plays next.

## The true ending

Painted scenes in `cinema.js`, the same style as the prologue:

1. Vesper's ghost lets go, and the stolen fire pours out of the Spire.
2. The four warden spirits (stag, phoenix, owl, whale) circle the Spire, guardians again.
3. The fire returns to the Hearth. The elder finally says what the lore hints at: the child found in
   the Hearth was the Firstflame's last spark.
4. Each region heals in turn: the forest, the ash, the frost, and the tide coming back in.
5. A short credits card, then a choice between **Continue exploring** and **Title**, as today.

After the ending, the world is at peace.
- Vesper's chamber is empty, but the Spire can be walked again.
- The objective reads "The Hearth burns bright. Explore freely."
- Villagers get a line about the Hearth.

The 100% bot finishes every other job before it enters Vesper's chamber, so its run ends at full
completion.

## Centered boss death flow (all wardens and Vesper)

1. HP hits 0. Hit-stop and a white flash. Minions and enemy projectiles vanish in poofs, and the
   player can't act.
2. Fade to black over about 0.6 seconds.
3. While the screen is black, the boss is moved to its spawn point at the centre of the arena (today
   `x: 12, y: 7` in the boss room). The player is placed a few tiles south of it, facing it, and the
   camera centres there.
4. Fade in over about 0.6 seconds.
5. The boss dematerializes at the centre over about 1.6 seconds, using today's death rays and
   shudder.
6. The spirit appears at the same point. The outro shots (`bossOutroShots`) focus there.

Elites keep their current in-place defeat.

## Facing

- Each boss form gets three views:
  - **side**, mirrored for left and right;
  - **front**, moving or aiming down the screen;
  - **back**, moving or aiming up the screen.
- The view comes from the movement direction, or the aim direction while telegraphing an attack. Use
  hysteresis so the boss doesn't flicker between views on a diagonal.
- Intro shots and portraits keep their current poses.

## Regional monster moves

Every move must telegraph before it lands. Effects last about 5 seconds (user). Each effect shows an
icon over the player and a matching status chip on the HUD, and has its own sound.

| Effect | What it does | Shake it off |
|---|---|---|
| **Snare** | Rooted in place: you can still attack and guard, but can't move or roll | Attack 3 times to tear free |
| **Poison** | Lose ½ heart every 1.5 seconds; can't drop you below ½ heart | Eat a ration, or wait it out |
| **Mud** | Move at half speed | Roll out of the mud, or wait it out |
| **Blind** | A dark vignette closes in until only a small circle around you shows | Wait it out; it fades for the last second |
| **Chill** | Move at 70% speed; a second chill while chilled becomes **freeze** | Wait it out |
| **Freeze** | Frozen solid: no input | Mash any button (about 1.5 seconds); it breaks by itself at 5 seconds |
| **Burn** | Lose ½ heart every second | Roll to put it out |

Mountain monsters cause **rockfall** and **heavy knockback**. Both are instant, with no lasting
effect.

**How often.** A signature move is a **separate, telegraphed special** on a per-monster cooldown of
about 8–12 seconds, with a random first delay so a group doesn't fire all at once.
- Normal attacks stay as they are today and carry no effect.
- Where the table says an existing attack carries the effect ("its lunge bite snares", "ice arrows"),
  that means a distinct special version of the attack. It has a longer windup and a clear glow in the
  effect's color, and only that version applies the effect.
- So effects are occasional, readable moments, not a constant tax. Two Frost Archers can't chain
  chill into freeze over and over.

| Region | Brute | Lunger | Flier | Shooter |
|---|---|---|---|---|
| Forest | **Thornback:** its slam raises a ring of thorns at the impact; caught = snared | **Briar Wolf:** its lunge bite snares | **Wisp Sprite:** drops seed pods that sprout root patches; step in = snared | **Goblin Archer:** vine-tipped arrows snare on hit |
| Swamp | **Bog Hulk:** lobs a mud ball that lands as a mud puddle | **Mire Leech:** latches on and poisons until you roll (or a hit knocks it off) | **Marsh Fly:** a swarming dive that poisons | **Spitter Toad:** a poison glob that leaves a poison puddle |
| Desert | **Sand Golem:** a ground pound sends out a sand shockwave ring; caught = blind | **Dune Scorpion:** burrows (a moving sand ripple), bursts up under you; blinds | **Dust Imp:** spins up a dust devil that drifts toward you; inside = blind | **Nomad Slinger:** a sand pouch bursts into a blinding cloud |
| Mountain | **Stone Ogre:** its stomp drops rocks on marked spots around it | **Crag Wolf:** a headbutt charge with heavy knockback | **Harpy:** dive-bombs from above (a shadow marks the spot) with heavy knockback | **Rock Thrower:** lobbed boulders that roll on after landing |
| Snow | **Yeti:** hurls a big rolling snowball; hit = freeze | **Frost Wolf:** frost breath cone; hit = chill | **Ice Wisp:** freezing touch; contact = freeze | **Frost Archer:** ice arrows; hit = chill |
| Volcanic | **Ash Golem:** its slam cracks the ground into lava fissure lines; touch = burn | **Magma Hound:** leaves burning paw prints; its lunge sets you burning | **Cinder Imp:** leaves a fire trail as it darts | **Fire Spitter:** a lobbed fireball that splashes a fire patch; touch = burn |

- Elites use their archetype's move, scaled up.
- Spire monsters are **Gloam-touched** versions of the four ward regions' families: violet-tinged,
  keeping their moves.
- **Toughness.**
  - The Fane's monsters use at least the snow tier (`BIOME_TIER` 1.9), even though the swamp is
    tier 1.25 in the overworld.
  - Gloam-touched monsters use a tier above every region (about 2.2).
  - So the Fane is at least as hard as the Sanctuary, and the Spire is clearly the hardest place in
    the game.
- Bosses don't apply effects except where an attack above says so: the Rime decoys and pillars, the
  Thornmaw spores, the Cinder lava, and the Tidewarden whirlpool's mud.

## The Drowned Fane (dungeon)

- A template sized like the Frostbound Sanctuary: about 17 rooms.
- Swamp family and theme: hazards are mud and poison pools; deep water is the obstacle.
- **New puzzle: the tide lever.** A room has two sets of floor tiles, A and B. A lever floods one set
  and drains the other.
  - You cross by switching the tide at the right moments.
  - Generation builds the solution first, then lays out the tiles, so every layout can be solved.
  - Blocks float on high water. The builder may use that or leave it out.

## The Emberwake Spire (dungeon)

- About **twice the Sanctuary**: around 32 rooms.
- **A hub and four wings**, one per ward:
  - Each wing uses its ward's tiles, hazards and Gloam-touched family, and mixes its ward's puzzle
    types.
  - Each wing ends in a fight with a **Gloam echo of that ward's elite** (Gorrak, Slagheart,
    Frostfang, Bogmaw), using the existing `Elite` class with a Gloam palette.
  - Beating an echo lights one of four **inner seals** in the hub.
  - With all four lit, the hub's descent opens: a few hard rooms (every puzzle type, the toughest
    combat rooms), then the fountain antechamber, then Vesper.
- **New puzzles** (as well as all the existing types and the tide lever):
  - **Ember beam.** A brazier throws a beam of light. You strike mirror pedestals to turn them 90°,
    and the beam must reach a receiver, which opens the sealed door. Generation lays a solved path,
    then scrambles the mirrors.
  - **Ember carry.** Take flame from a lit brazier. It burns on you for a few seconds, and you must
    light every dark brazier in the room before it gutters. You can relight at the source as often
    as you like. Rolling puts the flame out.
- Locked doors, small keys, the minimap and the findable map work as they do today. The minimap and
  map must fit a much larger grid.
- `solveDungeon` must model the inner-seal door, so every seed is checked to be solvable.

## How (decided)

- **Stages** extend `MAIN_STAGES` as above. `drowned` goes away. The bot's `SPLITS` and the autoplay
  test follow `MAIN_STAGES`.
- **The Tidewall seal** reuses `stageSeals` / `openSeal` with a new key `tide`, plus seal art in
  `src/gfx/wards.js`.
- **The Belfry, Tide Bells and Bogmaw** reuse the lookout, relic and elite machinery:
  `stageWardFeatures`, `stageRelics`, `ELITES`, `lookoutShots` / `sealShots`.
- **Flooded pools** are a new solid tile, passable only with `tools.charm`. Using the charm at a pool
  freezes it, the frozen pools are recorded in `progress`, and they draw as ice. Like seals, pools
  are placed through `tryPlace`, and reachability assumes the charm.
- **Danger zones are data.** New boss and monster attacks publish their telegraphed hazards as
  generic shapes on the entity (circle, segment, ring, cone), each with a time until it hits. One
  shape list drives the telegraph drawing, the hit check and the bot's `danger()`, so the bot learns
  new attacks without special cases.
- **Status effects** live in one module, with one entry per effect: duration, tick, what it blocks,
  how to shake it off, its icon and its sound. The player, HUD, enemies and bot all read from it.
- **The bot** learns:
  - every new quest step;
  - the tide-lever, ember-beam and ember-carry puzzles;
  - the inner-seal structure of the Spire;
  - how to break out of status effects (mash out of freeze, roll to put out burn and shake leeches,
    attack out of snare, eat when poisoned and low);
  - how to fight Vesper's phase 3.
- **The Theater** adds, in story order:
  - the hearth beat;
  - the Belfry vista;
  - the Tidewall breaking;
  - the Tidewarden's arrival and fall;
  - the kindle beat;
  - the Spire entrance;
  - Vesper's arrival, his phase 3 rising and his fall;
  - the true ending.
- **Autoplay's skip** also covers the Fane and the Spire.
- **Tests:**
  - reachability, with the Tidewall and the flooded pools;
  - dungeon solvability for `drowned` and `spire` over many seeds;
  - a status-effect unit test, including the immunity window;
  - the full quest chain;
  - the autoplay test, through to the true ending.

## Builder's calls (mine, not the user's)

- I named and designed the fourth chain and its story beats: the Rime Charm, the Belfry, the Tide
  Bells, Bogmaw, and the Tidewall.
- The Tidewarden is a sea serpent, and its spirit is a whale.
- I designed every new attack, each warden's second-phase look, and Vesper's own attacks and look.
- The Spire is a hub with four wings and Gloam-echo elites. Its new puzzles are the ember beam and
  the ember carry. The Fane's new puzzle is the tide lever.
- The HP numbers for the Tidewarden and Vesper, and the 2-or-3-hit rule by difficulty.
- The effect rules: how each one is shaken off, the 3-second immunity, the poison floor, and the
  Story-difficulty scaling.
- Elites keep their in-place defeat. Only bosses get the centered death flow.
- The death flow's timings (0.6 s fades, 1.6 s dematerialize).
- Vesper's phase 3 is one guaranteed cycle: HP floors at 80%, 60%, 40% and 20%, and a borrowed form
  wears off after 12 seconds.
- Signature moves are separate specials on an 8–12 second cooldown; normal attacks carry no effect.
- The Fane uses at least the snow tier, and Gloam-touched monsters use about tier 2.2.
- The true ending's scenes and the peaceful post-game.
