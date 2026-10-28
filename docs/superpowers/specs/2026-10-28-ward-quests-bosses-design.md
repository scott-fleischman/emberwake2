# Ward quests, boss overhaul, living characters, shop signs

## Why

In the autoplay runs you could walk straight from one ward to the next. Each ward needed one talk,
one task, then the dungeon, so nothing built up to it. The bosses fight well but look plainer than
the player. NPCs stand frozen. Buildings all look alike, so you can't tell the shop from the inn.

## Goals

1. **Every ward is physically sealed.** A living barrier rings each dungeon entrance: a thornwall
   at the Verdant Vault, a firewall at the Ashen Reliquary, an ice wall at the Frostbound Sanctuary.
   You cannot get near the door until you finish a multi-step quest chain that breaks the seal.
   The seal is the finale of that chain and gets its own cutscene.
2. **Each chain mixes kinds of steps:** talking, reaching a vantage point (with a camera-pan vista
   cutscene), clearing a camp, collecting guarded relics, using the new tool on world objects, and
   beating a named elite guardian. The chain also introduces the tool you just earned.
3. **Bosses are bigger, animated and distinct.** They are drawn about 2–2.5× their current size,
   with idle and movement cycles, a pose for each attack state, and visual changes between phases.
4. **Boss cutscenes are intense:** a quake, the boss's entrance, a close-up portrait, a title that
   slams onto the screen, a roar, and more dramatic deaths and phase changes.
5. **Characters animate:** they breathe, blink, perform an idle action for their role, gesture while
   talking, and the player idles too.
6. **Shops carry signs:** a hanging board beside the door with a pixel icon for each trade, gently
   swinging.

## Non-goals

- A bigger world. The user said the size is right.
- Save compatibility. Saves are pre-release.
- The Drowned Fane, which stays sealed for a later chapter.

## Anti-goals

- Too hard. Elites and guards are fair, and nothing new is a damage sponge.
- Busywork. Every step has a story beat and changes something you can see in the world.
- Breaking autoplay. Any% and 100% must still finish every seed in the sweep.

## The chains (stage ids in order)

**Verdant Vault: "The Withering Woods"**
`wake → scout → lookout → camp → sigil → leaves → thornwall → vault`
- scout: the scout says the Vault is choked by a living thornwall and sends you up the old
  watchtower.
- lookout: reach the watchtower on the outpost–Vault road. A vista pans to the Vault in its thorns
  and the warband smoke.
- camp: clear the quest camp. It now holds a Warchief elite.
- sigil: back at the scout, you learn the warband raided the leaf-shrines and scattered the three
  leaves of the Verdant Sigil.
- leaves: collect three leaves at guarded leaf-shrines in the forest.
- thornwall: carry them to the thornwall. The leaves bind into the Sigil (cutscene), the thorns
  wither, and the Sigil also opens the Vault door.

**Ashen Reliquary: "Ash and Ember"**
`smith → ashpass → ridge → cinderwatch → vents → slagheart → reliquary`
- cinderwatch: the keeper of the volcanic outpost explains that three magma vents feed the
  Reliquary's firewall.
- vents: cap three vents with bombs. Each is guarded.
- slagheart: the firewall gutters and Slagheart, a molten elite, crawls out. Beat it and the
  firewall collapses (cutscene).

**Frostbound Sanctuary: "The Silent Peaks"**
`frostpass → boulder → rimewatch → windcrest → beacons → frostfang → sanctuary`
- rimewatch: the keeper of the snow outpost says the Sanctuary is sealed in ice, and the old signal
  beacons on the heights could melt it.
- windcrest: reach the Windcrest lookout. A vista reveals the three beacons.
- beacons: use the Titan Gloves to heave the frozen cap off each beacon and light it. Each is
  guarded.
- frostfang: Frostfang, the Pale Alpha, emerges at the ice wall. Beat it and the wall shatters
  (cutscene).

## How (decided)

- The seal ring is the set of passable tiles at BFS distance R (5) from the dungeon front. Every
  path to the door must cross it. Those tiles become `T.SEAL` (solid), and the original tiles are
  stored so they can be restored. `progress.seals` lists the broken seals.
- New world features are placed in `stageContent` through `tryPlace`, so reachability holds:
  lookout towers, leaf-shrines, `T.VENT` tiles (bombable), beacons, and an elite arena spot outside
  each seal.
- Elites are `Enemy` instances with an `elite` option. They get roughly 4–5× HP, are drawn larger
  with an aura, and show their name and a health bar. Killing one fires a quest event.
- Vista cutscenes add a shot field that steers the camera to a world tile.
- All new world art lives in `src/gfx/wards.js`, so it stays clear of the sprite and boss work.
- The bot learns every new step type, and the splits cover every new stage.

## Builder's calls (mine, not the user's)

- I named the chains, the elites, and every story beat.
- The seal radius is 5 tiles.
- There are three relics, vents and beacons per ward.
- Guard groups spawn as you approach a relic, like camps do.
- The boss hitboxes and attack timings are unchanged, so fights play the same and autoplay stays
  valid. Only the visuals change.
