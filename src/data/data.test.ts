import { describe, expect, it } from 'vitest';
import { CARDS, ULTIMATES, cardsForUnit, ultimateForUnit } from './cards';
import { UNITS, makeStats } from './units';

describe('unit stats (Type base + Class modifier, PRD §5.3)', () => {
  it('derives Vesper = Human Ranger: 440 HP, 15 SPD, 18 ATK, 5 DEF, 10 SKILL', () => {
    expect(UNITS.vesper.stats).toEqual({ hp: 440, spd: 15, atk: 18, def: 5, skill: 10 });
  });

  it('derives Mawgrim = Beast Armored: 700 HP, 5 SPD, 7 ATK, 27 DEF, 4 SKILL', () => {
    expect(UNITS.mawgrim.stats).toEqual({ hp: 700, spd: 5, atk: 7, def: 27, skill: 4 });
  });

  it('derives Pyra = Demon Brawler: 400 HP, 14 SPD, 26 ATK, 6 DEF, 3 SKILL', () => {
    expect(UNITS.pyra.stats).toEqual({ hp: 400, spd: 14, atk: 26, def: 6, skill: 3 });
  });

  it('makeStats composes any type+class pair', () => {
    expect(makeStats('angel', 'caster')).toEqual({ hp: 440, spd: 9, atk: 0, def: 9, skill: 28 });
  });
});

describe('card pool integrity', () => {
  it('every unit has exactly 4 cards: 2 weapon, 1 class, 1 element', () => {
    for (const unitId of Object.keys(UNITS)) {
      const kit = cardsForUnit(unitId);
      expect(kit).toHaveLength(4);
      expect(kit.filter((c) => c.tag === 'weapon')).toHaveLength(2);
      expect(kit.filter((c) => c.tag === 'class')).toHaveLength(1);
      expect(kit.filter((c) => c.tag === 'element')).toHaveLength(1);
    }
  });

  it('every unit has exactly one ultimate', () => {
    for (const unitId of Object.keys(UNITS)) {
      expect(ultimateForUnit(unitId).unitId).toBe(unitId);
    }
  });

  it('costs stay in the locked bands (0/1/2) with 0⚡ rare', () => {
    const zeroCost = CARDS.filter((c) => c.cost === 0);
    for (const card of CARDS) expect([0, 1, 2]).toContain(card.cost);
    expect(zeroCost.length).toBeLessThanOrEqual(3);
    expect(zeroCost.length).toBeGreaterThanOrEqual(1);
  });

  it('every card carries both DMG and SHD values (Axie dual-stat rule)', () => {
    for (const card of CARDS) {
      expect(card.dmg).toBeGreaterThanOrEqual(0);
      expect(card.shd).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(card.dmg)).toBe(true);
      expect(Number.isInteger(card.shd)).toBe(true);
    }
  });

  it('PRD-specified cards keep their printed values', () => {
    const quickSlash = CARDS.find((c) => c.id === 'quick_slash')!;
    expect(quickSlash).toMatchObject({ cost: 1, dmg: 55, shd: 10 });
    const phantomSlash = CARDS.find((c) => c.id === 'phantom_slash')!;
    expect(phantomSlash).toMatchObject({ cost: 2, dmg: 100, shd: 15 });
    const ironStance = CARDS.find((c) => c.id === 'iron_stance')!;
    expect(ironStance).toMatchObject({ cost: 1, dmg: 0, shd: 80 });
    expect(ironStance.effects).toContainEqual({ kind: 'taunt' });
    const inkSiphon = CARDS.find((c) => c.id === 'ink_siphon')!;
    expect(inkSiphon).toMatchObject({ cost: 1, dmg: 40 });
    expect(inkSiphon.effects).toContainEqual({ kind: 'drainEnergy', amount: 1 });
    const witheringCurse = CARDS.find((c) => c.id === 'withering_curse')!;
    expect(witheringCurse).toMatchObject({ cost: 2, dmg: 30 });
    expect(witheringCurse.effects).toContainEqual({ kind: 'curse', base: 25, turns: 2 });
  });

  it('ultimates stay in the 6–12 ink cost band', () => {
    for (const ult of ULTIMATES) {
      expect(ult.inkCost).toBeGreaterThanOrEqual(6);
      expect(ult.inkCost).toBeLessThanOrEqual(12);
    }
    expect(ultimateForUnit('vesper').inkCost).toBe(10); // VOIDREND per PRD §9
  });
});
