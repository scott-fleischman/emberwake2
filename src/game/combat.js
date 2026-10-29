// Pure combat rules: hit arcs, shields, knockback, resource checks, lock-on.
import { angleDiff } from '../core/math.js';
import { USE_ITEMS } from '../data/items.js';

export const FACING_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

export function shieldBlocks(defender, fromX, fromY, arc) {
  if (!defender.shielding) return false;
  const toward = Math.atan2(fromY - defender.y, fromX - defender.x);
  return Math.abs(angleDiff(defender.aim, toward)) <= arc / 2;
}

export function knockbackVector(fromX, fromY, toX, toY, force) {
  let dx = toX - fromX, dy = toY - fromY;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) { dx = 0; dy = 1; } else { dx /= l; dy /= l; }
  return [dx * force, dy * force];
}

// Targets whose hitbox center lies within reach (plus their radius) and inside the swing arc.
export function meleeTargets(ox, oy, angle, reach, arc, targets) {
  return targets.filter((t) => {
    if (t.dead || t.hp <= 0 || t.untargetable) return false;
    const r = Math.max(t.w, t.h) / 2;
    const d = Math.hypot(t.x - ox, t.y - oy);
    if (d > reach + r) return false;
    if (d < r + 4) return true;
    return Math.abs(angleDiff(angle, Math.atan2(t.y - oy, t.x - ox))) <= arc / 2 + Math.atan2(r, d);
  });
}

export function canUseItem(player, itemId, derived) {
  const item = USE_ITEMS[itemId];
  if (!item) return { ok: false, reason: 'none' };
  if (item.mana) {
    const cost = itemId === 'firebolt' ? derived.fireboltCost : item.mana;
    return player.mana >= cost ? { ok: true, cost, kind: 'mana' } : { ok: false, reason: 'mana' };
  }
  if (item.ammo) return player[item.ammo] > 0 ? { ok: true, cost: 1, kind: item.ammo } : { ok: false, reason: 'ammo' };
  return { ok: true, cost: 0 };
}

export function lockOnTarget(px, py, enemies, range = 140, exclude = null) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    if (e === exclude || e.dead || e.hp <= 0 || e.untargetable) continue;
    const d = Math.hypot(e.x - px, e.y - py);
    if (d <= range && d < bd) { bd = d; best = e; }
  }
  return best;
}

// Backstab: attacker is behind the target's facing.
export function isBehind(target, ax, ay) {
  if (target.aim === undefined) return false;
  const toward = Math.atan2(ay - target.y, ax - target.x);
  return Math.abs(angleDiff(target.aim, toward)) > (Math.PI * 2) / 3;
}
