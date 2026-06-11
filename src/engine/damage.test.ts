import { describe, expect, it } from 'vitest';
import { computeDamage, triangleModifier } from './damage';

describe('triangleModifier', () => {
  it('elemental triangle: Blaze ▶ Wild ▶ Frost ▶ Blaze', () => {
    expect(triangleModifier('blaze', 'wild')).toBe(1.15);
    expect(triangleModifier('wild', 'frost')).toBe(1.15);
    expect(triangleModifier('frost', 'blaze')).toBe(1.15);
    // reverse = disadvantage
    expect(triangleModifier('wild', 'blaze')).toBe(0.85);
    expect(triangleModifier('frost', 'wild')).toBe(0.85);
    expect(triangleModifier('blaze', 'frost')).toBe(0.85);
  });

  it('dark cosmic triangle: Void ▶ Radiant ▶ Doom ▶ Void', () => {
    expect(triangleModifier('void', 'radiant')).toBe(1.15);
    expect(triangleModifier('radiant', 'doom')).toBe(1.15);
    expect(triangleModifier('doom', 'void')).toBe(1.15);
    expect(triangleModifier('radiant', 'void')).toBe(0.85);
    expect(triangleModifier('doom', 'radiant')).toBe(0.85);
    expect(triangleModifier('void', 'doom')).toBe(0.85);
  });

  it('same element and cross-triangle are neutral', () => {
    expect(triangleModifier('blaze', 'blaze')).toBe(1);
    expect(triangleModifier('blaze', 'void')).toBe(1); // cross-triangle
    expect(triangleModifier('doom', 'wild')).toBe(1);
  });
});

describe('computeDamage', () => {
  it('matches the PRD canon example: (100+18) × 1.15 − 10 = 126', () => {
    const dmg = computeDamage({
      cardDmg: 100,
      attackerAtk: 18,
      attackerElement: 'void',
      defenderElement: 'radiant',
      defenderDef: 10,
    });
    expect(dmg).toBe(126);
  });

  it('floors at 10% of pre-DEF damage', () => {
    const dmg = computeDamage({
      cardDmg: 10,
      attackerAtk: 0,
      attackerElement: 'blaze',
      defenderElement: 'blaze',
      defenderDef: 100,
    });
    expect(dmg).toBe(1); // 10% of 10, not 10−100
  });

  it('applies extra multipliers (e.g. Predator) before DEF', () => {
    // (50+10) × 1.0 × 1.2 = 72 → −20 DEF = 52
    const dmg = computeDamage({
      cardDmg: 50,
      attackerAtk: 10,
      attackerElement: 'doom',
      defenderElement: 'wild',
      defenderDef: 20,
      multiplier: 1.2,
    });
    expect(dmg).toBe(52);
  });

  it('disadvantage case rounds the final result', () => {
    // (55+18) × 0.85 = 62.05 → −27 = 35.05 → 35
    const dmg = computeDamage({
      cardDmg: 55,
      attackerAtk: 18,
      attackerElement: 'void',
      defenderElement: 'doom',
      defenderDef: 27,
    });
    expect(dmg).toBe(35);
  });
});
