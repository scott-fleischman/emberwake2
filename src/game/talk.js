// Conversations, shops and reward handling. Builds Dialog pages from world + quest state.
import { reveal, sideStatus, grantReward, dirWord } from './quests.js';
import { elderShots, stonesRead } from '../data/story.js';
import { RIDDLES } from '../data/sidequests.js';
import { FAMILIES } from '../data/enemies.js';
import { CAVE_REWARDS } from '../data/items.js';
import { TALENTS, talentCost } from '../data/talents.js';
import { CLASSES } from '../data/classes.js';
import { Menu } from '../gfx/ui.js';
import { makeRng } from '../core/rng.js';
import { BIOME_NAMES } from '../world/tiles.js';


const CLASS_TIP = {
  swordsman: 'trust that buckler of yours. Hold L to raise it, and let them break on it',
  mage: 'mind your mana. A firebolt (K) at the right moment is worth ten wild ones',
  ranger: 'keep your distance. Arrows (K) do their best work before teeth reach you',
  rogue: 'keep those sharp eyes open. You notice glints the rest of us walk past',
};

export function conversation(game, npc) {
  const W = game.world, s = game.state, d = npc.data;
  const S = (id) => W.settlements.find((q) => q.id === id);
  const N = (sid, role) => W.npcs.find((q) => q.settlementId === sid && q.role === role);
  const home = S('home'), out = S('outpost');
  const me = d.name;
  const page = (text, options) => ({ speaker: me, text, options });
  const cls = CLASSES[s.classId].name;
  const stage = s.quest.main;
  const event = () => game.questEvent({ type: 'talk', role: d.role, settlementId: d.settlementId });

  // Rescued wanderer in a cave
  if (d.lost) {
    const q = game.sideQuests.find((x) => x.id === d.lost);
    if (q && s.quest.side[q.id] === 'active') {
      s.quest.side[q.id] = 'ready';
      npc.leaving = true;
      return [page('You found me! I got turned around in the dark and every passage looked the same. I can see the way out now — thank you. Tell them I\'m coming home!')];
    }
    return [page('I\'ll be right behind you.')];
  }

  // Letter carriers: the recipient writes back.
  const letters = game.sideQuests.find((q) => q.type === 'letters' && q.targetNpc === d.id && sideStatus(s, q) === 'active');
  if (letters) {
    s.quest.side[letters.id] = 'ready';
    game.audio.sfx('levelup');
    const giver = W.npcs.find((n) => n.id === letters.giverId);
    return [page(`A letter? From ${giver.name}? ${letters.reply}`), page(`(Received a reply for ${giver.name}.)`)];
  }

  // Delivery targets
  const delivery = game.sideQuests.find((q) => q.type === 'deliver' && q.targetNpc === d.id && sideStatus(s, q) === 'active');
  if (delivery) {
    const giver = W.npcs.find((n) => n.id === delivery.giverId);
    s.quest.side[delivery.id] = 'done';
    const got = grantReward(s, delivery.reward);
    game.audio.sfx('coin');
    return [page(`${delivery.parcel[0].toUpperCase()}${delivery.parcel.slice(1)} from ${giver.name}? Oh, at last. Here — for your trouble. (Received ${got}.)`)];
  }

  // Main quest voices
  const mainPages = mainLines(game, npc, { S, N, home, out, cls, stage, page, event });
  if (mainPages) return mainPages;

  // Side quests
  const sq = game.sideQuests.find((q) => q.giverId === d.id);
  if (sq) {
    const pages = sideQuestLines(game, sq, page);
    if (pages) return pages;
  }
  return roleLines(game, npc, { S, N, home, out, page, stage });
}

function mainLines(game, npc, c) {
  const W = game.world, s = game.state, d = npc.data, { S, N, home, out, cls, stage, page, event } = c;
  const scout = N('outpost', 'scout');
  const vol = S('volcanic'), snw = S('snow'), fen = S('swamp');
  if (d.role === 'elder' && d.settlementId === 'home') {
    if (stage === 'wake') {
      event();
      return { cutscene: elderShots({ cls, elder: d.name, scout: scout.name, outpost: out.name, dir: dirWord(home.center, out.center), tip: CLASS_TIP[s.classId] }) };
    }
    if (stage === 'hearth') {
      event();
      return [page('You did it. Three shards! Look how the Hearth leans toward them, like a cat toward a warm lap. Come. Let us give them back to the flame.')];
    }
    if (stage === 'kindle') {
      event();
      return [page('The Tidewarden\'s shard. Four... all four. I never thought I would live to see them together. Come, child. The Hearth has waited long enough.')];
    }
    const hint = {
      scout: `Scout ${scout.name} waits at ${out.name}. Follow the road ${dirWord(home.center, out.center)}.`,
      lookout: `${scout.name} sent you up the old watchtower? Good. You can't fight what you haven't seen.`,
      camp: `${scout.name} needs that camp cleared before they'll trust anyone near the Vault.`,
      sigil: `Go back to ${scout.name}. If the camp is gone, they'll keep their word.`,
      leaves: 'Three leaves of green bronze. The Kindlers made the Sigil so that no single thief could carry the forest\'s door away. Clever. Inconvenient, but clever.',
      thornwall: 'Take the leaves to the thornwall. The Sigil remembers what it is, even in pieces. So do you.',
      vault: 'The Verdant Vault waits in the deep woods. The warden there charges like a bull: let it break itself against the walls, then strike.',
      smith: `A shard! Feel how warm it is... and it does not burn you, does it? Take it to ${N('home', 'smith').name} at the forge. Ember-fire is a smith's business.`,
      ashpass: `The ash wastes lie past the cracked ridge beyond ${S('desert').name}. The captain there knows the way.`,
      ridge: 'Break the ridge. Bombs, child. That is what they are for.',
      cinderwatch: `Past the ridge there is an outpost, ${vol.name}, that never once let its fires go out. Ask them how to reach the Reliquary.`,
      vents: 'The earth itself is feeding that firewall. Starve it.',
      slagheart: 'Something lives in that fire. Be quick on your feet.',
      reliquary: 'The Reliquary\'s warden is all fire and fury. It must stop to breathe sometime.',
      frostpass: `With gloves like those you could move mountains, or the boulders choking the northern pass. Ask the keeper of ${S('mountain').name}.`,
      boulder: 'Lift that boulder and climb.',
      rimewatch: `High in the snows there is an outpost called ${snw.name}. Hardy folk. They'll know what the Sovereign has done.`,
      windcrest: 'The Windcrest! I climbed it once, when I was young and foolish. You can see the whole north from up there.',
      beacons: 'The old beacons. We lit them for festivals, before the frost. Light them for us again.',
      frostfang: 'Wolves follow the strongest. Show them who that is.',
      sanctuary: 'The Rime Sovereign is quick as a blizzard. Make it miss, and make it pay.',
      fenkeep: `The keeper of ${fen.name} has watched the western water rise longer than anyone. Start there.`,
      belfry: 'A drowned bell tower? Then climb it. High places have served you well so far.',
      bells: 'Bells, sunk in the fens. The Sovereign\'s charm should make short work of the water. Cold is only cruel when it forgets what it is for.',
      bogking: 'Something lives under that wall of water. Keep moving; a still target is a drowned one.',
      fane: 'The Fane is open. The Tidewarden sang for the whole coast once. Listen for the song under the noise.',
      spire: 'Four shards, and the Spire door stands open. Rest a while first. Whatever waits below has waited a thousand years; it can wait for you to eat.',
      end: 'The Hearth burns, and the cold has gone out of the north wind. Whatever he was at the end, I hope he is warm now. You should rest, child. You have earned it.',
    }[stage];
    return [page(hint)];
  }
  if (d.role === 'scout' && d.settlementId === 'outpost') {
    const camp = W.pois.camps.find((q) => q.quest);
    const where = camp ? dirWord(out.center, camp) : 'out';
    const tower = W.pois.lookouts.find((l) => l.id === 'lookout');
    if (stage === 'scout') {
      event();
      return [
        page(`From ${home.name}? The elder sent word you'd come. Good. The forest has gone wrong: thorns grow across the trails overnight, and the wolves run in packs too big to feed.`),
        page('And the Vault... the Vault is choked. A wall of living thorns grew around it in a single night. Nothing gets in. Nothing gets out.'),
        page(`Don't take my word for it. Climb the old watchtower ${tower ? dirWord(out.center, tower) : 'down the road'} of here and look for yourself. I've marked it on your map.`),
      ];
    }
    if (stage === 'lookout') return [page('The watchtower. Go on, climb it. You need to see what we\'re up against.')];
    if (stage === 'camp') return [page(`The warband camp is ${where} of the outpost, right on the way. Their warchief, Gorrak, is twice the size of the rest. Watch the archers; they hang back.`)];
    if (stage === 'sigil') {
      event();
      game.audio.sfx('levelup');
      return [
        page('You beat Gorrak? Then the road is quiet for the first time in a month. Now, listen.'),
        page('The thornwall has a key. The Verdant Sigil. My order kept it for three hundred years, split into three bronze leaves in three leaf-shrines, so no thief could carry it off whole.'),
        page('The warband raided the shrines. The leaves are still out there, but the thorn-beasts nest around them now. Bring all three back together at the thornwall and the Sigil will remember what it is. I\'ve marked the shrines on your map.'),
      ];
    }
    if (stage === 'leaves') return [page('Three leaves, three shrines. Each one guarded. Come back alive, will you? I hate paperwork.')];
    if (stage === 'thornwall') return [page('You have them all? Then go to the thornwall. Hold them up. The forest knows its own.')];
    if (stage === 'vault') return [page('The thorns are gone? Then the Vault is open. Use the shrine outside to rest before you go in.')];
    return [page('The forest breathes easier since Thornmaw fell. I can hear birds again.')];
  }
  if (d.role === 'smith' && d.settlementId === 'home' && stage === 'smith') {
    event();
    return [
      page('Is that... an Ember shard? It\'s humming. My grandmother swore the Kindlers could hear the shards sing. Hold it still. Yes. With heat like this I can finally pack proper blasting powder.'),
      page('There. A Bomb Satchel, with eight to start. Select bombs with Q and throw with K. Cracked rock won\'t stand a chance.'),
      page(`They say the ridge past ${S('desert').name} cracked when the ash vents woke. Ask the captain there.`),
    ];
  }
  if (d.role === 'keeper') {
    if (d.settlementId === 'desert' && stage === 'ashpass') {
      event();
      return [
        page('Ash falls in our wells, and at night the eastern ridge glows like a coal. It split the same night your Hearth guttered.'),
        page(`Too sheer to climb, but it rings hollow. Blast it and the wastes are yours, Ember help you. Find ${vol.name} beyond it, if anyone's still alive there. I\'ve marked the weak spot on your map.`),
      ];
    }
    if (d.settlementId === 'volcanic') {
      if (stage === 'cinderwatch') {
        event();
        return [
          page('Someone came through the ridge? From the green country? Sit, sit. Don\'t touch the walls, they\'re hot.'),
          page('You want the Reliquary. Everyone who comes here wants the Reliquary. It\'s behind a wall of fire now, taller than a house, and it doesn\'t burn down. It burns up.'),
          page('Three magma vents feed it from below. We\'ve watched them for weeks. Cap them, and the wall starves. Bombs would do it, if you had any. ...You have bombs. Of course you have bombs. I\'ve marked the vents on your map.'),
        ];
      }
      if (stage === 'vents') return [page('Three vents. Throw the bomb right into the throat of each one. And mind the hounds; they like the warmth as much as we don\'t.')];
      if (stage === 'slagheart') return [page('The wall is guttering, and something is crawling out of it. The old songs called it Slagheart. Hit it hard, and don\'t stand in the drips.')];
    }
    if (d.settlementId === 'mountain' && stage === 'frostpass') {
      event();
      return [
        page('The frost came down from the Sanctuary the same night your Hearth guttered. Since then, boulders have choked the northern pass. No team of oxen can shift them.'),
        page(`Gloves, you say? Titan-forged? Then go. ${snw.name} lies beyond the pass; they'll know more. I\'ve marked the pass on your map. And if you meet the Sovereign... it was gentle, once.`),
      ];
    }
    if (d.settlementId === 'snow') {
      const crest = W.pois.lookouts.find((l) => l.id === 'windcrest');
      if (stage === 'rimewatch') {
        event();
        return [
          page('A visitor! Up here! Get by the fire before your nose falls off.'),
          page('The Sanctuary is sealed in a wall of ice as thick as this hall is long. The Sovereign raised it the night the cold came. Nothing we have even scratches it.'),
          page(`But there's an old way. Three signal beacons stand on the heights. Their fire was Kindler fire, and Kindler fire could melt it. They're frozen solid now. Climb the Windcrest ${crest ? dirWord(snw.center, crest) : 'nearby'} of here and you'll spot them.`),
        ];
      }
      if (stage === 'windcrest') return [page('The Windcrest. Up, up, always up. You\'ll see the beacons from the top.')];
      if (stage === 'beacons') return [page('Those beacons are capped with old ice, heavy as a cart. You\'d need hands like a giant\'s. ...Huh. You do have hands like a giant\'s.')];
      if (stage === 'frostfang') return [page('The wolves are howling at the ice wall. Frostfang leads them. Pale as the snow and twice as cold. Go carefully.')];
    }
    if (d.settlementId === 'swamp') {
      const belfry = W.pois.lookouts.find((l) => l.id === 'belfry');
      if (stage === 'fenkeep') {
        event();
        return [
          page('The elder sent you? Then the Hearth must be burning again. Good. Sit, and mind the puddle; there\'s always a puddle now.'),
          page('The water rises a hand\'s breadth every week, and it never falls back. Out west the Fane is ringed by the Tidewall: floodwater standing on end, churning round and round. Boats that go near it don\'t come back.'),
          page('The Tidewarden\'s song once commanded the tides. Three bronze Tide Bells along the fens echoed it, so the whole coast could hear. When the waters rose, the bells were sunk where they stood.'),
          page(`Climb the Drowned Belfry ${belfry ? dirWord(fen.center, belfry) : 'out in the fens'} of here and you'll see them glinting. And that charm at your neck is breathing frost. Hold it over the deep water and see what it does.`),
        ];
      }
      if (stage === 'belfry') return [page('The Belfry leans, but the stair holds. Climb above the water line and look west.')];
      if (stage === 'bells') return [page('Each bell sits in a pool far too deep to wade. Stand at the edge with that charm of yours. And mind what nests round them; the fen beasts guard the bells like their own spawn.')];
      if (stage === 'bogking') return [page('The bells woke something under the Tidewall. The old folk called it Bogmaw, the Drowned King. It spits, so keep moving.')];
      if (stage === 'fane') return [page('The Tidewall is gone! I can see the Fane\'s steps from the roof. Go, before the water changes its mind.')];
    }
  }
  return null;
}

// ---------------------------------------------------------------- side quest conversations
const ACCEPT = {
  fetch: 'Thank you! It glints when the light catches it.',
  hunt: 'Good. Come back when it\'s done.',
  deliver: 'Here it is. Mind you don\'t drop it.',
  rescue: 'Please hurry. Caves are no place to be lost.',
  pet: 'Thank you! Don\'t chase too hard, they spook easily. Just keep after them.',
  gather: 'Wonderful. I\'ve marked the patch on your map.',
  letters: 'Here. Don\'t read it! ...You can read it a little. No. Don\'t.',
  treasure: 'Here\'s the map. Stand on the X and press E to dig.',
  scholar: 'Bless you. Your journal (Esc › Lore journal) will keep every word.',
};
const WRONG = ['Ha! No, no, no. Think on it and come back.', 'Close! Well. Not close. Come back when you\'ve had a think.', 'Hee hee. No. But I admire the confidence.'];
const CORRECT = ['Not bad! Here\'s the next one.', 'Two for two! Last one, and it\'s a stinker.'];

function sideQuestLines(game, q, page) {
  const s = game.state, W = game.world;
  const st = sideStatus(s, q);
  const finish = (lead) => {
    s.quest.side[q.id] = 'done';
    const got = grantReward(s, q.reward);
    game.refreshDerived();
    game.audio.sfx('levelup');
    return [page(`${lead} Please, take this. (Received ${got}.)`)];
  };
  if (st === 'available') {
    return [page(q.text, [
      {
        label: q.type === 'riddle' ? 'I love riddles.' : 'I\'ll do it.',
        onSelect: () => {
          s.quest.side[q.id] = 'active';
          game.onSideQuestAccepted(q);
          if (q.type === 'riddle') return { pages: [riddlePage(game, q, page)] };
          if (q.type === 'scholar' && stonesRead(s) >= q.need) { s.quest.side[q.id] = 'ready'; return { pages: [page('You\'ve read them already? Then tell me everything!'), ...finish(q.thanks)] }; }
          return { pages: [page(ACCEPT[q.type])] };
        },
      },
      { label: 'Not right now.', onSelect: () => ({ pages: [page('I understand. If you change your mind, I\'ll be here.')] }) },
    ])];
  }
  if (st === 'active' && q.type === 'riddle') return [riddlePage(game, q, page)];
  if (st === 'active' && q.type === 'scholar' && stonesRead(s) >= q.need) s.quest.side[q.id] = 'ready';
  if (sideStatus(s, q) === 'ready') return finish(q.thanks || 'Thank you.');
  if (st === 'active') return [page(reminderLine(q, game))];
  if (st === 'done' && q.after) {
    const rng = makeRng(`${W.seed}/${q.id}/${Math.floor(game.time / 20)}`);
    if (rng.chance(0.7)) return [page(q.after)];
  }
  return null;
}

function riddlePage(game, q, page) {
  const s = game.state;
  const k = Math.min(2, s.quest.kills[q.id] || 0);
  const [question, answer, ...wrong] = RIDDLES[q.riddles[k]];
  const rng = makeRng(`${q.id}/riddle/${k}`);
  return page(`Riddle ${k + 1} of 3: ${question}`, rng.shuffle([answer, ...wrong]).map((label) => ({
    label,
    onSelect: () => {
      if (label !== answer) { game.audio.sfx('deny'); return { pages: [page(rng.pick(WRONG))] }; }
      s.quest.kills[q.id] = k + 1;
      game.audio.sfx('puzzle');
      if (k + 1 >= 3) {
        s.quest.side[q.id] = 'done';
        const got = grantReward(s, q.reward);
        game.refreshDerived();
        game.audio.sfx('levelup');
        return { pages: [page(`${answer}! ${q.thanks} (Received ${got}.)`)] };
      }
      return { pages: [page(`${answer}! ${CORRECT[k]}`), riddlePage(game, q, page)] };
    },
  })));
}

function reminderLine(q, game) {
  const s = game.state, n = s.quest.kills[q.id] || 0;
  switch (q.type) {
    case 'hunt': return `${n} of ${q.count} so far. Keep at it.`;
    case 'fetch': return `My ${q.item} should be out past the roads. I marked where I think it fell.`;
    case 'deliver': return 'Did you deliver the parcel yet?';
    case 'letters': return 'Did they read it? Did they... no. Don\'t tell me. Go. Go!';
    case 'pet': return `Any sign of ${q.pet.name}? Last I saw, they were headed ${dirWord(game.world.settlements.find((x) => x.id === q.settlementId).center, q.spot)}.`;
    case 'gather': return `${n} of ${q.count}? Keep going, the patch is just off the road.`;
    case 'treasure': return 'The X is marked on your map. Stand right on it and press E to dig.';
    case 'scholar': return `You've read ${stonesRead(s)} of the ${q.need} stones I need. They stand near the old roads, carved with blue runes.`;
    default: return `Please, find ${q.kin}. The cave is marked on your map.`;
  }
}

const RUMORS = [
  (W, s) => `They say ${W.regions[s.biome].name} hides caves with old steel inside. Worth a look, if you've got a light heart.`,
  () => 'Shrines remember you. Rest at one and you\'ll wake there if the worst happens — lighter in the purse, mind.',
  () => 'If you see a glint where there shouldn\'t be one, dig. Folk used to hide supplies from tax collectors.',
  () => 'Hungry? Press F to eat a ration. It heals slow, but it heals.',
  () => 'Enemies telegraph. Brutes rear back, wolves crouch, archers take aim. Watch, then move.',
  () => 'Lock on with R and you\'ll keep your eyes on the worst of them while you circle.',
  () => 'Sprint with Shift. Dodge with Space. You can slip right through an attack if you time it.',
  () => 'Hold your attack and let go for a spinning strike. My uncle swore by it. Then he got dizzy and fell in the river.',
  () => 'The Hearth looked dim last night. My grandmother says that has never happened. Not once.',
  () => 'They say the elder found a baby in the Hearth ashes once. Not a scratch on them. Imagine that.',
  () => 'Old folks say the Kindlers left standing stones by the roads. Blue runes. Read one sometime.',
];

// After the end: the Hearth burns bright, and everyone has something to say about it.
const HEARTH_LINES = [
  'Have you seen the Hearth? You can read by it from the far end of the village. My grandmother would have wept.',
  'The Hearth burned all night and never once guttered. I sat up to watch. I wasn\'t the only one.',
  'Folk walked in from every town to light a lamp at the Hearth and carry it home. The roads glowed like rivers.',
  'The Hearth sang last night. I swear it. Low and sweet, like a kettle that knows a tune.',
  'My little one asked if the Hearth will ever go out again. I told her: not while we keep sharing it.',
  'Even the wind off the north is warm now. The Hearth reaches farther than it ever did.',
];

// What the keepers and the seer say of the realm: its troubles, then (after the end) the world at peace.
const KEEPER_LINES = {
  swamp: 'The water rises a hand\'s breadth every week. Our grandparents said a ward slept beneath the western fane. Now it dreams of drowning us. When you\'re ready, we\'ll need you.',
  desert: 'Ash falls in our wells now. Whatever burns beyond the ridge, its anger reaches even here.',
  mountain: 'Stone remembers. The frost on the high roads isn\'t natural — it comes from the Sanctuary.',
  volcanic: 'The Cinder Warden flits between pillars, they say. Wait for it to vent its heat; that\'s when it\'s soft.',
  snow: 'The Rime Sovereign dashes like the blizzard itself. Dodge aside and let it hit the walls.',
};
const KEEPER_PEACE = {
  swamp: 'The flood drew back the night the Hearth flared, and the tide comes in gentle now. Some evenings I\'d swear I hear singing out past the Fane.',
  desert: 'Clean water in every well, and not a fleck of ash. The eastern ridge is just a ridge again, and I\'d forgotten how blue the sky gets out here.',
  mountain: 'The frost let go of the high roads. Meltwater runs down every pass, and the oxen have grown fat and lazy.',
  volcanic: 'The wall of fire is long gone, and the vents only smoke now, like a pipe after supper. Somewhere out there the Ash Spirit is counting flames again, and none too many.',
  snow: 'Warm enough up here to hear yourself think. The high snows are still again, but gently: still and safe, the way the Sovereign always meant them to be.',
};
const SEER_REALM = [
  'Four wards, four wardens, one flame between them. When the flame gutters, the wardens forget they were guardians. Remind them, gently or otherwise.',
  'And far beneath the Spire, a cold one who would have the whole fire to himself. Lately the smoke shows him smiling. At you.',
];
const SEER_PEACE = [
  'Nothing, for the first time in my life. Four wardens keep their wards again, guardians as they were made to be, and the flame between them burns bright.',
  'And beneath the Spire, nothing waits in the dark any more. The smoke showed him to me once, at the very end: an old man opening his hands. Then only warm air, rising.',
];

function roleLines(game, npc, c) {
  const W = game.world, s = game.state, d = npc.data, { S, page, stage } = c;
  const here = S(d.settlementId);
  const rng = makeRng(`${W.seed}/${d.id}/${Math.floor(game.time / 30)}`);
  const rumor = () => (stage === 'end' ? rng.pick(HEARTH_LINES) : rng.pick(RUMORS)(W, here)); // old worries would ring false
  switch (d.role) {
    case 'merchant':
      return [page('Supplies for the road? Good prices, fair weights.', [
        { label: 'Browse wares', onSelect: () => { game.openShop('merchant', d); } },
        { label: 'Leave', onSelect: () => {} },
      ])];
    case 'smith':
      return [page('Steel and leather — that\'s my trade. What do you need?', [
        { label: 'See upgrades', onSelect: () => { game.openShop('smith', d); } },
        { label: 'Leave', onSelect: () => {} },
      ])];
    case 'innkeeper':
      return [page('Welcome, traveler. A warm bed or a hot meal?', [
        { label: 'Rest (8 coins)', onSelect: () => game.buy(8, () => { const dd = game.derived; Object.assign(s.player, { hp: dd.maxHp, mana: dd.maxMana, stamina: dd.maxStamina }); game.audio.sfx('shrine'); }, 'You sleep soundly and wake restored.') },
        { label: 'Hot meal to go (12 coins, +2 rations)', onSelect: () => game.buy(12, () => { s.player.food += 2; }, 'Two rations wrapped in cloth.') },
        { label: 'Leave', onSelect: () => {} },
      ])];
    case 'seer':
      return [page('The Ember speaks in smoke and sparks. For a few coins, I will listen on your behalf.', [
        { label: 'A reading (15 coins)', onSelect: () => game.buy(15, () => {}, game.seerReading()) },
        { label: 'What troubles the realm?', onSelect: () => ({ pages: (stage === 'end' ? SEER_PEACE : SEER_REALM).map((t) => page(t)) }) },
        { label: 'Leave', onSelect: () => {} },
      ])];
    case 'informant': {
      const caves = W.pois.caves.filter((q) => q.biome === here.biome && !(s.progress.revealed || []).includes(`cave:${q.id}`));
      if (caves.length) {
        const cv = rng.pick(caves);
        reveal(s, `cave:${cv.id}`);
        return [page(`Psst. There's a cave ${dirWord(here.center, cv)} of here. Folk say something shiny sits at the back of it. I've marked it on your map — you didn't hear it from me.`)];
      }
      return [page(rumor())];
    }
    case 'keeper':
      return [page((stage === 'end' ? KEEPER_PEACE : KEEPER_LINES)[d.settlementId] || 'Keep the roads safe, traveler.')];
    case 'ranger':
      return [page('The scout\'s been out on that ridge for days. Stubborn as an old oak.')];
    case 'elder':
      return [page('Mind the Ember. Mind each other.')];
    default: {
      const love = game.sideQuests.find((q) => q.type === 'letters' && q.targetNpc === d.id && sideStatus(s, q) === 'done');
      if (love && rng.chance(0.6)) return [page(`Tell ${W.npcs.find((n) => n.id === love.giverId).name} the blue flowers are blooming. And... thank you, traveler.`)];
      return [page(rumor())];
    }
  }
}

// ---------------------------------------------------------------- shops
export function shopItems(game, kind) {
  const s = game.state, d = game.derived, p = s.player;
  const add = (label, cost, can, apply, detail) => ({ label, cost, can, apply, detail });
  if (kind === 'merchant') {
    return [
      add('Ration', 10, () => true, () => { p.food++; }, 'Heals over time when eaten (F).'),
      add('Arrows ×10', 15, () => s.gear.items.includes('bow') && p.arrows < d.maxArrows, () => { p.arrows = Math.min(d.maxArrows, p.arrows + 10); }, 'Requires a bow.'),
      add('Throwing knives ×5', 15, () => s.gear.items.includes('knives') && p.knives < d.maxKnives, () => { p.knives = Math.min(d.maxKnives, p.knives + 5); }, 'Requires knives.'),
      add('Bombs ×4', 20, () => s.tools.bombs && p.bombs < d.maxBombs, () => { p.bombs = Math.min(d.maxBombs, p.bombs + 4); }, 'Requires the Bomb Satchel.'),
      add('Mana tonic', 15, () => p.mana < d.maxMana, () => { p.mana = Math.min(d.maxMana, p.mana + 25); }, 'Restores 25 mana at once.'),
      add('Heart piece', 120, () => !s.upgrades.boughtPiece, () => { s.upgrades.boughtPiece = true; grantReward(s, { heartPiece: 1 }); game.refreshDerived(); }, 'Two pieces make a new heart. Only one for sale.'),
    ];
  }
  return [
    add('Kite Shield', 90, () => s.gear.shield !== 'kite', () => { s.gear.shield = 'kite'; }, 'Blocks a wider arc for less stamina. Hold L.'),
    add('Steel Sword', 120, () => !s.gear.owned.includes('steelsword'), () => { s.gear.owned.push('steelsword'); s.gear.weapon = 'steelsword'; }, 'Hits harder. Swap weapons in the pause menu.'),
    add('Deep Quiver', 60, () => s.upgrades.quiver < 2, () => { s.upgrades.quiver++; game.refreshDerived(); }, '+10 arrows and +5 knives carried.'),
    add('Bomb Bag', 80, () => s.tools.bombs && s.upgrades.bombBag < 2, () => { s.upgrades.bombBag++; game.refreshDerived(); }, '+4 bombs carried.'),
  ];
}

export function shopMenu(game, kind) {
  const s = game.state;
  const items = shopItems(game, kind);
  return new Menu(kind === 'merchant' ? 'General Goods' : 'Smithy', items.map((it) => ({
    label: it.label,
    value: () => `${it.cost}c`,
    detail: () => (it.can() ? it.detail : 'Unavailable — ' + it.detail),
    disabled: () => !it.can() || s.player.coins < it.cost,
    onSelect: () => { s.player.coins -= it.cost; it.apply(); game.audio.sfx('coin'); game.toast(`Bought ${it.label}.`); },
  })), { width: 260, footer: () => `Coins: ${s.player.coins}` });
}

// ---------------------------------------------------------------- shrine & talents
export function talentMenu(game, atShrine) {
  const s = game.state;
  const list = TALENTS.filter((t) => !t.cls || t.cls === s.classId);
  const m = new Menu(`Talents — ${s.talents.points} point${s.talents.points === 1 ? '' : 's'}`, list.map((t) => ({
    label: t.name,
    value: () => `${s.talents.ranks[t.id] || 0}/${t.max}`,
    detail: t.desc,
    disabled: () => !atShrine || s.talents.points <= 0 || (s.talents.ranks[t.id] || 0) >= t.max,
    onSelect: () => {
      s.talents.points--;
      s.talents.ranks[t.id] = (s.talents.ranks[t.id] || 0) + 1;
      game.refreshDerived();
      game.audio.sfx('levelup');
      m.title = `Talents — ${s.talents.points} point${s.talents.points === 1 ? '' : 's'}`;
    },
  })), { width: 280, footer: atShrine ? 'Spend points to grow stronger.' : 'Talents can only be learned at a shrine.' });
  return m;
}

export function shrineMenu(game, shrine) {
  const s = game.state;
  return new Menu('Ember Shrine', [
    { label: 'Rest and save', detail: 'Restore health and set this shrine as your return point.', onSelect: () => game.shrineRest(shrine) },
    { label: 'Learn talents', value: () => `${s.talents.points} pts`, onSelect: () => game.pushUI(talentMenu(game, true)) },
    {
      label: 'Offer coins', value: () => `${talentCost(s)}c`, detail: 'Trade coins for a talent point.',
      disabled: () => s.player.coins < talentCost(s),
      onSelect: () => { s.player.coins -= talentCost(s); s.talents.bought++; s.talents.points++; game.audio.sfx('levelup'); game.toast('The shrine accepts your offering. +1 talent point.'); },
    },
  ], { width: 240 });
}

// ---------------------------------------------------------------- rewards
export function chestReward(game, contents) {
  const s = game.state, p = s.player, d = game.derived;
  switch (contents) {
    case 'home': p.coins += 10; p.food += 1; if (s.classId === 'ranger') p.arrows += 5; if (s.classId === 'rogue') p.knives += 5; return 'Your old travel chest: 10 coins and a ration. A note on top reads: "The Elder asked for you. Don\'t dawdle."';
    case 'camp': { const c = 15 + Math.floor(Math.random() * 16); p.coins += c; p.food += 1; refillAmmo(game, 0.5); return `The warband's stash: ${c} coins, a ration, and some ammunition.`; }
    case 'key': s.progress.keys[game.area.id] = (s.progress.keys[game.area.id] || 0) + 1; game.audio.sfx('key'); return 'You found a small key! It will open one locked door in this place.';
    case 'map': if (!s.progress.dungeonMaps.includes(game.area.id)) s.progress.dungeonMaps.push(game.area.id); return 'You found the vault map! Every room now appears on your minimap. (Press M for a larger view.)';
    case 'heart': return `A heart piece! ${grantReward(s, { heartPiece: 1 }).includes('new heart') ? 'Two pieces fuse into a new heart!' : 'Find another to form a full heart.'}`;
    case 'coins': p.coins += 30; return 'A pouch of 30 coins.';
    case 'bombs': if (s.tools.bombs) { p.bombs = Math.min(d.maxBombs, p.bombs + 5); return 'Five bombs!'; } p.coins += 20; return 'A pouch of 20 coins.';
    case 'arrows': refillAmmo(game, 1); return 'A bundle of ammunition.';
    case 'shard': return `An Ember Shard pulses in your hands, warm as a heartbeat. (${s.progress.shards} of 4)`;
    default: {
      const r = CAVE_REWARDS[contents];
      if (!r) { p.coins += 20; return '20 coins.'; }
      switch (contents) {
        case 'sword': if (!s.gear.owned.includes('steelsword')) s.gear.owned.push('steelsword'); s.gear.weapon = 'steelsword'; break;
        case 'bow': if (!s.gear.items.includes('bow')) s.gear.items.push('bow'); else s.upgrades.quiver++; p.arrows += 15; break;
        case 'tome': if (!s.gear.items.includes('firebolt')) s.gear.items.push('firebolt'); else s.upgrades.tomeMastery = true; break;
        case 'shield': s.gear.shield = 'kite'; break;
        case 'quiver': s.upgrades.quiver++; refillAmmo(game, 1); break;
        case 'heart': s.upgrades.hearts++; break;
        case 'coins': p.coins += 60; break;
      }
      game.refreshDerived();
      if (contents === 'heart') p.hp = game.derived.maxHp;
      return `${r.name}! ${r.text}`;
    }
  }
}

function refillAmmo(game, frac) {
  const s = game.state, p = s.player, d = game.derived;
  if (s.gear.items.includes('bow')) p.arrows = Math.min(d.maxArrows, p.arrows + Math.ceil(10 * frac));
  if (s.gear.items.includes('knives')) p.knives = Math.min(d.maxKnives, p.knives + Math.ceil(6 * frac));
  if (s.tools.bombs) p.bombs = Math.min(d.maxBombs, p.bombs + Math.ceil(3 * frac));
  p.mana = Math.min(d.maxMana, p.mana + 15 * frac);
}

export function cacheReward(game, cache) {
  const s = game.state, p = s.player;
  const rng = makeRng(`${game.world.seed}/${cache.data.id}`);
  const roll = rng.next();
  if (roll < 0.15) return `A heart piece wrapped in oilcloth! ${grantReward(s, { heartPiece: 1 })}.`;
  if (roll < 0.45) { const c = rng.int(15, 35); p.coins += c; return `A buried purse: ${c} coins.`; }
  if (roll < 0.7) { p.food += 2; return 'Two well-wrapped rations.'; }
  refillAmmo(game, 1.5);
  p.coins += 10;
  return `A forgotten supply bundle in the ${BIOME_NAMES[cache.data.biome].toLowerCase()}: ammunition and 10 coins.`;
}
