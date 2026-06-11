import type { CardDef, UltimateDef } from '../engine/types';

/** Phase 0 card pool. Cards marked (PRD) carry printed PRD §6.5 values.
 * The rest are [P0-DESIGN] placeholders — PRD Open Item #6 — kept inside the
 * locked cost bands and keyword set. */
export const CARDS: readonly CardDef[] = [
  // ── Vesper — Human Ranger, Dual Daggers, Void ────────────────────────────
  {
    id: 'quick_slash',
    name: 'Quick Slash',
    unitId: 'vesper',
    tag: 'weapon',
    cost: 1,
    dmg: 55,
    shd: 10,
    text: '+20 DMG if another card was played on this unit this turn. (PRD)',
    effects: [{ kind: 'comboDmg', bonus: 20 }],
  },
  {
    id: 'phantom_slash',
    name: 'Phantom Slash',
    unitId: 'vesper',
    tag: 'weapon',
    cost: 2,
    dmg: 100,
    shd: 15,
    text: 'KO refund: +1⚡. (PRD)',
    effects: [{ kind: 'koRefund', energy: 1 }],
  },
  {
    id: 'hunters_mark',
    name: "Hunter's Mark",
    unitId: 'vesper',
    tag: 'class',
    cost: 1,
    dmg: 45,
    shd: 5,
    text: 'Snipe — hits the backmost enemy.',
    effects: [{ kind: 'snipe' }],
  },
  {
    id: 'ink_siphon',
    name: 'Ink Siphon',
    unitId: 'vesper',
    tag: 'element',
    cost: 1,
    dmg: 40,
    shd: 5,
    text: 'Drain 1 Energy from the enemy bank. (PRD)',
    effects: [{ kind: 'drainEnergy', amount: 1 }],
  },

  // ── Mawgrim — Beast Armored, Crushing Maw, Doom ──────────────────────────
  {
    id: 'bone_crunch',
    name: 'Bone Crunch',
    unitId: 'mawgrim',
    tag: 'weapon',
    cost: 1,
    dmg: 50,
    shd: 20,
    text: 'A grinding bite that braces for impact.',
    effects: [],
  },
  {
    id: 'devouring_bite',
    name: 'Devouring Bite',
    unitId: 'mawgrim',
    tag: 'weapon',
    cost: 2,
    dmg: 95,
    shd: 20,
    text: 'The maw closes. Few things reopen it.',
    effects: [],
  },
  {
    id: 'iron_stance',
    name: 'Iron Stance',
    unitId: 'mawgrim',
    tag: 'class',
    cost: 1,
    dmg: 0,
    shd: 80,
    text: 'Taunt — enemies must attack this unit this turn. (PRD)',
    effects: [{ kind: 'taunt' }],
  },
  {
    id: 'withering_curse',
    name: 'Withering Curse',
    unitId: 'mawgrim',
    tag: 'element',
    cost: 2,
    dmg: 30,
    shd: 10,
    text: 'Curse: 25 + SKILL damage at the end of the next 2 turns. (PRD)',
    effects: [{ kind: 'curse', base: 25, turns: 2 }],
  },

  // ── Pyra — Demon Brawler, Flame Gauntlets, Blaze ─────────────────────────
  {
    id: 'cinder_jab',
    name: 'Cinder Jab',
    unitId: 'pyra',
    tag: 'weapon',
    cost: 1,
    dmg: 60,
    shd: 5,
    text: 'Fast knuckles, hot ash.',
    effects: [],
  },
  {
    id: 'meteor_hook',
    name: 'Meteor Hook',
    unitId: 'pyra',
    tag: 'weapon',
    cost: 2,
    dmg: 105,
    shd: 10,
    text: 'A falling-star haymaker.',
    effects: [],
  },
  {
    id: 'scrap',
    name: 'Scrap',
    unitId: 'pyra',
    tag: 'class',
    cost: 0,
    dmg: 25,
    shd: 5,
    text: 'Free swing. Nothing meaningful is free — this is not meaningful.',
    effects: [],
  },
  {
    id: 'ignite',
    name: 'Ignite',
    unitId: 'pyra',
    tag: 'element',
    cost: 1,
    dmg: 35,
    shd: 5,
    text: 'Burn: 20 + SKILL damage at the end of this turn and the next.',
    effects: [{ kind: 'burn', base: 20, turns: 2 }],
  },
];

/** Ultimates (Inkwell) — outside the deck, playable when team Ink ≥ cost.
 * VOIDREND is PRD §9; the other two are [P0-DESIGN] (PRD Open Item #2). */
export const ULTIMATES: readonly UltimateDef[] = [
  {
    id: 'voidrend',
    name: 'VOIDREND',
    unitId: 'vesper',
    inkCost: 10,
    dmg: 220,
    shd: 0,
    text: 'Massive single-target damage. Drain 2 Ink. (PRD)',
    effects: [{ kind: 'drainInk', amount: 2 }],
  },
  {
    id: 'doomfall',
    name: 'DOOMFALL',
    unitId: 'mawgrim',
    inkCost: 9,
    dmg: 25,
    shd: 0,
    text: 'Sweep: hits all enemies. Curse each: 30 + SKILL at the end of the next 2 turns.',
    effects: [{ kind: 'sweep' }, { kind: 'curse', base: 30, turns: 2 }],
  },
  {
    id: 'inferno_breaker',
    name: 'INFERNO BREAKER',
    unitId: 'pyra',
    inkCost: 7,
    dmg: 150,
    shd: 0,
    text: 'Burn: 25 + SKILL at the end of this turn and the next.',
    effects: [{ kind: 'burn', base: 25, turns: 2 }],
  },
];

const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
const ULT_BY_UNIT = new Map(ULTIMATES.map((u) => [u.unitId, u]));

export function cardDef(id: string): CardDef {
  const def = CARD_BY_ID.get(id);
  if (!def) throw new Error(`Unknown card: ${id}`);
  return def;
}

export function cardsForUnit(unitId: string): CardDef[] {
  return CARDS.filter((c) => c.unitId === unitId);
}

export function ultimateForUnit(unitId: string): UltimateDef {
  const ult = ULT_BY_UNIT.get(unitId);
  if (!ult) throw new Error(`No ultimate for unit: ${unitId}`);
  return ult;
}
