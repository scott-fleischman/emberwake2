# Emberwake Design Spec

## Vision

Emberwake is a replayable top-down 2.5D fantasy action-adventure game inspired by the immediacy and readability of classic console adventure games, but built around procedural world generation, regional progression, NPC-guided discovery, and repeatable runs with class-based early-game variety.

The target feeling is:

- heroic and mysterious
- adventurous rather than aimless
- somewhat dangerous without becoming punishing
- readable in motion
- broad enough to invite repeat runs with different seeds and class starts

## Core pillars

### 1. Exploration and discovery

- A medium-large procedural overworld drives most of the play time.
- The world should reward movement, landmark recognition, and region-to-region curiosity.
- The player should rarely feel totally lost, but should also not feel linearly railroaded.

### 2. NPCs and quests

- NPCs provide guidance, gating, rumors, and world flavor.
- Main quest steps should come from authored progression templates.
- Side quests should mix practical errands, character moments, and world hints.

### 3. Dungeon-centered progression

- Dungeons are mandatory progression, not optional flavor.
- Every major region is ultimately about discovering, unlocking, and clearing its dungeon.
- Bosses are the clearest proof of regional progress.

### 4. Action combat

- Combat is real-time and loadout-driven.
- The player should read spacing, timing, and enemy roles.
- Encounters should be legible and varied rather than collapsing into bodies stacking on top of one another.

### 5. Gradual character growth

- The player expands through tools, artifacts, equipment, stats, skills, and spells.
- Classes matter strongly in the early and mid game.
- Long-term progression should allow build convergence without erasing class identity.

## World structure

### Layout

- Procedurally generated overworld with hard cliff borders at the edge.
- Flat readable navigation plane with selective 2.5D presentation through cliffs, walls, and building mass.
- Not fully open at the start.
- World scale should feel larger than the current prototype’s initial pass and support longer travel distances between key landmarks.
- World generation should happen in stages: terrain and geology, water placement, regional growth, settlement placement, road routing, then encounters and quest content.
- Settlements should cluster around survivable anchors such as rivers, ponds, oases, or protected passes instead of feeling randomly scattered.
- Terrain should communicate height with cliffs, ledges, carved steps, and winding switchbacks instead of reading as flat blocked squares.

### Regions and biome targets

The full game world should include at least:

- forest
- desert
- swamp / water region
- caves
- mountain region
- snowy mountain region
- volcanic region

Biomes should mix:

- clear regional identity
- some sharp transitions
- some soft natural blending

### Points of interest

- villages and safe hubs
- player home base
- a town or meaningful outpost in each major region
- multiple buildings and multiple named NPCs in each regional town
- regional dungeon entrances
- enemy camps and patrol spaces tied to roads, ruins, and resource-rich terrain
- cave mouths and traversal landmarks
- save shrines and shops
- bridges, cracked walls, deep water, cliffs, rubble, or similar traversal blockers

## Progression structure

### Full game arc

- Four regional bosses exist in the full game.
- Each boss is tied to a biome-region and a dungeon.
- All four regional bosses must be defeated.
- Doing so unlocks access to the final boss.

### Gating

The player should not simply walk into every dungeon. Progress should combine:

- artifacts
- traversal tools such as bombs, hookshot-style items, lifting gloves, and later traversal upgrades
- NPC permission, clues, and quest completion
- discovered landmarks and rumors

### Objective discovery

Objectives should be surfaced through a mix of:

- NPC clues
- map markers
- rumors
- visible landmarks
- direct exploration

## Story structure

- The story should be clear enough to follow without exhausting the mystery.
- Dialogue should carry explicit plot steps and character perspective.
- Exploration should carry indirect storytelling through ruins, region state, and landmark placement.

The player should understand:

- why the world is unstable
- why each region matters
- what defeating each boss changes

without the game explaining every detail immediately.

## Classes

Starting classes:

- Swordsman
- Mage
- Ranger
- Rogue / Thief

Class differences should appear primarily through:

- starting stats
- starting gear
- default combat rhythm
- early survivability and resource profile

Long-term design:

- all classes can eventually access most tools and capabilities
- classes shape the run’s first hours rather than permanently hard-locking content

## Combat spec

### Player resources

- health
- mana
- stamina
- ammo or ranged-resource equivalent
- food as a sustain / recovery resource without a mandatory hunger meter

### Input philosophy

Generic actions:

- interact
- push / pull
- activate
- use item

Loadout or progression actions:

- primary weapon attack
- shield
- run / sprint
- dodge
- spell use
- ranged attack
- bombs
- traversal tools

### Desired combat qualities

- fast response
- moderate depth, not combo-heavy complexity
- a clear Zelda-like lock-on and knockback rhythm instead of fully loose contact swarms
- readable enemy spacing
- enemies with distinct roles
- shields, dodges, and ranged pressure all matter
- bosses should have learnable patterns, punish windows, and distinct room pressure rather than feeling like faster recolors
- death and enemy defeat should read clearly through short poof / spirit / return animations instead of instant disappearance

### Enemy archetypes

The game should support a mix of:

- brutes that pressure forward but do not simply glue themselves to the player
- lungers that close gaps in bursts
- skirmishers that circle and dart
- ranged enemies that maintain distance and kite
- boss enemies that shift between phases and pressure styles

## Dungeon spec

### Dungeon composition

Each major dungeon should contain:

- combat rooms
- key-and-lock progression
- timing puzzles
- at least one additional logic puzzle family such as linked switches or ordered activations
- themed room art and hazards
- a boss encounter
- a clear route back out, ideally through a boss-room return seal or equally legible shortcut

### Prototype dungeon requirements

The prototype must demonstrate:

- a guarded entrance
- at least one small key
- a locked door
- a timed gate sequence
- enemy encounters
- a boss
- a dungeon minimap that makes room progress and exit routes legible

### Cave layer

- Regional cave entrances should exist outside the main dungeon path.
- Caves can be smaller than dungeons, but should still feel like authored spaces with enemies, loot, and a visible way out.
- Caves are a good place for hidden weapons, supplies, and class-convergence items.

### Procedural generation approach

- Layouts can begin as room-graph templates with controlled remixing.
- Over time, room kits and rules should expand per biome.
- Biome theming should change tile kits, enemies, hazards, and puzzle emphasis.

## NPC and quest structure

### Main quest

- Authored progression patterns.
- Clear enough to reliably lead the player from home base to region boss.
- Reusable template structure so different seeds can place locations differently without losing narrative shape.

### Side quests

- More variable and procedural.
- Should change target location, requested item, involved enemy family, or reward.
- Should feel small but worthwhile.
- Seeds should remix settlement names, hand-off locations, and some quest framing so new worlds do not feel like the same town pasted elsewhere.

### NPC roles

- elder / story guide
- blacksmith or tool enabler
- merchants
- hint-giver / seer
- scouts / regional informants
- memorable villagers with side quests
- regional elders, captains, or keepers who act as each biome’s local story voice

## Economy and saving

### Currency uses

- consumables
- food
- refills
- hints
- upgrades
- some equipment progression

### Skill growth

- Early prototype skill growth can begin as a shrine-based talent scaffold.
- Long-term progression should become fuller branch-based skill trees with class-flavored openings and shared late-game convergence.

### Death and saving

- Death should cost money and reset the player to a village or shrine.
- Save points should exist in the world.
- Save and exit should also work from anywhere.

## Audio direction

Prototype target:

- light reflective background music with a soft piano character
- freely licensable bundled audio assets instead of synth placeholders
- understated but distinct swing, hit, kill, block, and dash feedback
- region-grouped music so forests, wetlands, frontier regions, snow, and volcanic/dungeon spaces no longer share a single mood

Long-term target:

- region-aware ambient layers
- dungeon-specific textures
- stronger boss cues
- town ambience and more tactile UI sounds

## Visual direction

Prototype target:

- simplified pixel-art readability
- clearer differentiation than the first pass
- stronger weapon silhouettes and simple hand-held attack animation
- improved depth through shadows, cliff faces, roofs, and actor silhouettes
- selectively integrated licensed environment art to push the look toward smoother stylized readability instead of pure placeholder blocks
- vault interiors can stay hand-drawn if that reads better than imported tiles

Long-term target:

- stronger biome palettes
- more distinct enemy silhouettes
- richer prop dressing
- better environmental storytelling at a glance

## Current prototype status

The current browser prototype focuses on the first regional arc:

- home interior start
- village hub
- overworld exploration
- NPC quest chain
- bomb unlock
- a much larger overworld with multiple named settlements, roads, water anchors, and enemy camps
- caves, stair-step passes, clearer cliff language, and more substantial regional towns
- a complete Verdant Vault dungeon path
- an unlockable Ashen Reliquary second-dungeon prototype
- a Frostbound Sanctuary third-dungeon hook with a larger room graph and dungeon minimap
- three regional bosses
- running, food, hidden supply caches, and a first-pass shrine talent system
- combat arena and terrain viewer debug modes
- local save/load

## Current follow-up direction

This iteration prioritizes:

- growing the overworld toward staged terrain and settlement generation
- making navigation clearer through roads, camps, and dungeon minimaps
- adding food, sprinting, and skill scaffolding without overcomplicating the prototype
- differentiating boss patterns and region audio more aggressively
- using selectively integrated licensed visual assets to raise clarity and atmosphere
- keeping vault interiors hand-drawn while using licensed assets more selectively for characters, weapons, and overworld props
- establishing the third regional path before expanding to the final fourth region

## Near-term next steps

- deepen all current dungeons with more puzzle templates and stronger room identity
- expand settlement-specific quests so regions feel socially distinct
- add hidden equipment chests and more traversal-gated secrets inside the new cave layer
- build a proper options panel for audio and difficulty tuning
- broaden the combat arena log into richer balance summaries and session review tools