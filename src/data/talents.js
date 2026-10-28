// Shrine talent scaffold: shared ranks plus one class-flavored opening per class.
export const TALENTS = [
  { id: 'vigor', name: 'Vigor', max: 3, desc: '+2 maximum health per rank.' },
  { id: 'focus', name: 'Focus', max: 3, desc: '+10 maximum mana and faster regeneration.' },
  { id: 'endurance', name: 'Endurance', max: 3, desc: '+20 maximum stamina per rank.' },
  { id: 'might', name: 'Might', max: 2, desc: '+1 melee damage per rank.' },
  { id: 'precision', name: 'Precision', max: 2, desc: '+1 ranged and spell damage per rank.' },
  { id: 'fleet', name: 'Fleetfoot', max: 2, desc: '+6% move speed and cheaper dodges.' },
  { id: 'scavenger', name: 'Scavenger', max: 2, desc: 'Enemies and bushes drop supplies more often.' },
  { id: 'bulwark', name: 'Bulwark', max: 1, cls: 'swordsman', desc: 'Blocking costs 40% less stamina.' },
  { id: 'arcane', name: 'Arcane Flow', max: 1, cls: 'mage', desc: 'Mana regenerates 50% faster.' },
  { id: 'eagle', name: 'Eagle Eye', max: 1, cls: 'ranger', desc: 'Arrows pierce through one enemy.' },
  { id: 'shadow', name: 'Shadowstep', max: 1, cls: 'rogue', desc: 'Longer dodge invulnerability; strikes from behind always crit.' },
];

export function talentCost(state) {
  // Shrines also accept coin offerings for a point, growing pricier each time.
  return 40 + 30 * (state.talents.bought || 0);
}
