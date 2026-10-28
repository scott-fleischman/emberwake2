// Weapons, shields, usable items and artifacts.
export const WEAPONS = {
  sword: { name: 'Iron Sword', dmg: 2, reach: 20, arc: 1.9, cooldown: 0.34, swing: 0.16, knock: 150, kind: 'slash' },
  steelsword: { name: 'Steel Sword', dmg: 3, reach: 22, arc: 2.0, cooldown: 0.32, swing: 0.16, knock: 160, kind: 'slash' },
  staff: { name: 'Oak Staff', dmg: 1, reach: 21, arc: 1.7, cooldown: 0.42, swing: 0.2, knock: 220, kind: 'bash' },
  dagger: { name: 'Hunting Knife', dmg: 1, reach: 16, arc: 1.3, cooldown: 0.22, swing: 0.11, knock: 110, kind: 'stab' },
  twinblades: { name: 'Twin Daggers', dmg: 1, reach: 16, arc: 1.5, cooldown: 0.17, swing: 0.1, knock: 90, kind: 'stab', crit: 0.2 },
};

export const SHIELDS = {
  buckler: { name: 'Buckler', arc: 2.1, cost: 10 },
  kite: { name: 'Kite Shield', arc: 2.7, cost: 6 },
};

export const USE_ITEMS = {
  bow: { name: 'Bow', ammo: 'arrows', dmg: 2, speed: 240, cooldown: 0.45, projectile: 'arrow' },
  knives: { name: 'Throwing Knives', ammo: 'knives', dmg: 1, speed: 270, cooldown: 0.24, projectile: 'knife' },
  firebolt: { name: 'Firebolt', mana: 6, dmg: 3, speed: 185, cooldown: 0.5, projectile: 'firebolt' },
  bombs: { name: 'Bombs', ammo: 'bombs', fuse: 1.5, radius: 30, dmg: 4, cooldown: 0.5 },
};

export const ARTIFACTS = {
  verdantSigil: { name: 'Verdant Sigil', desc: 'A leaf of green bronze. The Verdant Vault answers to it.' },
  emberShard: { name: 'Ember Shard', desc: 'A splinter of the Hearth Ember, still warm.' },
  gloves: { name: 'Titan Gloves', desc: 'Gauntlets that make boulders feel like baskets of wool.' },
  satchel: { name: 'Bomb Satchel', desc: 'Forged by the village smith around a warm ember shard.' },
};

// Cave chest contents → what the player gains (class convergence items).
export const CAVE_REWARDS = {
  sword: { name: 'Steel Sword', text: 'A balanced steel blade. Your melee strikes hit harder.' },
  bow: { name: 'Hunter\'s Bow', text: 'A sturdy bow and 15 arrows. (Rangers: +10 quiver)' },
  tome: { name: 'Ember Tome', text: 'You learned Firebolt. (Mages: firebolts cost less)' },
  shield: { name: 'Kite Shield', text: 'A broad shield that blocks a wider arc for less stamina.' },
  quiver: { name: 'Deep Quiver', text: 'Carry 10 more arrows and 5 more knives.' },
  heart: { name: 'Heart Vessel', text: 'Your maximum health rises by one heart.' },
  coins: { name: 'Coin Hoard', text: 'A forgotten purse of 60 coins.' },
};
