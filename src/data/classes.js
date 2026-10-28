// Starting classes. They shape the first hours (stats, gear, rhythm, resources) without locking content.
export const CLASSES = {
  swordsman: {
    id: 'swordsman', name: 'Swordsman',
    blurb: 'Sturdy and steady. Sword and buckler, deep stamina, blocks cheaply.',
    maxHp: 12, maxMana: 10, maxStamina: 100, speed: 78, manaRegen: 0.6,
    weapon: 'sword', shield: 'buckler', items: [], ammo: { arrows: 0, knives: 0 },
    coins: 20, food: 2, dodgeCost: 25, opening: 'bulwark',
  },
  mage: {
    id: 'mage', name: 'Mage',
    blurb: 'Fragile but far-reaching. Firebolts from a deep mana well; a heavy staff.',
    maxHp: 8, maxMana: 40, maxStamina: 70, speed: 76, manaRegen: 2.4,
    weapon: 'staff', shield: null, items: ['firebolt'], ammo: { arrows: 0, knives: 0 },
    coins: 30, food: 2, dodgeCost: 25, opening: 'arcane',
  },
  ranger: {
    id: 'ranger', name: 'Ranger',
    blurb: 'Keeps distance. A bow with a full quiver, a quick knife, extra rations.',
    maxHp: 10, maxMana: 10, maxStamina: 110, speed: 82, manaRegen: 0.6,
    weapon: 'dagger', shield: null, items: ['bow'], ammo: { arrows: 30, knives: 0 },
    coins: 20, food: 4, dodgeCost: 22, opening: 'eagle',
  },
  rogue: {
    id: 'rogue', name: 'Rogue',
    blurb: 'Fast and slippery. Twin daggers, throwing knives, cheap dodges, a nose for caches.',
    maxHp: 8, maxMana: 15, maxStamina: 100, speed: 88, manaRegen: 0.8,
    weapon: 'twinblades', shield: null, items: ['knives'], ammo: { arrows: 0, knives: 15 },
    coins: 50, food: 2, dodgeCost: 15, opening: 'shadow',
  },
};

export const CLASS_ORDER = ['swordsman', 'mage', 'ranger', 'rogue'];
