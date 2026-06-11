import type { ElementId } from './types';

export const TRIANGLE_ADVANTAGE = 1.15;
export const TRIANGLE_DISADVANTAGE = 0.85;
export const DAMAGE_FLOOR_RATIO = 0.1;

/** X beats Y: Blaze▶Wild▶Frost▶Blaze · Void▶Radiant▶Doom▶Void (PRD §5.2).
 * Cross-triangle and same element are neutral. */
const BEATS: Readonly<Record<ElementId, ElementId>> = {
  blaze: 'wild',
  wild: 'frost',
  frost: 'blaze',
  void: 'radiant',
  radiant: 'doom',
  doom: 'void',
};

export function triangleModifier(attacker: ElementId, defender: ElementId): number {
  if (BEATS[attacker] === defender) return TRIANGLE_ADVANTAGE;
  if (BEATS[defender] === attacker) return TRIANGLE_DISADVANTAGE;
  return 1;
}

export interface DamageInput {
  cardDmg: number;
  attackerAtk: number;
  attackerElement: ElementId;
  defenderElement: ElementId;
  defenderDef: number;
  /** Passive/situational multiplier (Predator etc.), applied pre-DEF. */
  multiplier?: number;
}

/** PRD §6.3: final = (card DMG + ATK) × triangle − DEF,
 * floored at 10% of the pre-DEF product. Rounded once at the end. */
export function computeDamage(input: DamageInput): number {
  const { cardDmg, attackerAtk, attackerElement, defenderElement, defenderDef } = input;
  const preDef =
    (cardDmg + attackerAtk) *
    triangleModifier(attackerElement, defenderElement) *
    (input.multiplier ?? 1);
  return Math.round(Math.max(preDef - defenderDef, preDef * DAMAGE_FLOOR_RATIO));
}
