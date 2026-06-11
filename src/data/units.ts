import type { ClassId, Stats, TypeId, UnitDef } from '../engine/types';

/** PRD §5.3 type base stats (illustrative tier — tuning is a PRD change). */
export const TYPE_BASES: Readonly<Record<TypeId, Stats>> = {
  human: { hp: 500, spd: 10, atk: 10, def: 10, skill: 10 },
  humanoid: { hp: 480, spd: 12, atk: 11, def: 9, skill: 10 },
  beast: { hp: 620, spd: 8, atk: 12, def: 12, skill: 4 },
  demon: { hp: 440, spd: 12, atk: 16, def: 6, skill: 8 },
  angel: { hp: 460, spd: 9, atk: 6, def: 12, skill: 16 },
  undead: { hp: 560, spd: 6, atk: 9, def: 14, skill: 8 },
};

/** PRD §5.3 class modifiers (net-zero-ish by design). */
export const CLASS_MODS: Readonly<Record<ClassId, Stats>> = {
  ranger: { hp: -60, spd: 5, atk: 8, def: -5, skill: 0 },
  brawler: { hp: -40, spd: 2, atk: 10, def: 0, skill: -5 },
  armored: { hp: 80, spd: -3, atk: -5, def: 15, skill: 0 },
  caster: { hp: -20, spd: 0, atk: -6, def: -3, skill: 12 },
  trickster: { hp: -60, spd: 6, atk: 0, def: -4, skill: 5 },
};

/** Deterministic, fully transparent: `Type base + Class modifier`. */
export function makeStats(type: TypeId, klass: ClassId): Stats {
  const base = TYPE_BASES[type];
  const mod = CLASS_MODS[klass];
  return {
    hp: base.hp + mod.hp,
    spd: base.spd + mod.spd,
    atk: base.atk + mod.atk,
    def: base.def + mod.def,
    skill: base.skill + mod.skill,
  };
}

/** Phase 0 roster: the three hardcoded units (CLAUDE.md item 5, PRD §10). */
export const UNITS: Readonly<Record<string, UnitDef>> = {
  vesper: {
    id: 'vesper',
    name: 'Vesper',
    type: 'human',
    class: 'ranger',
    element: 'void',
    weaponName: 'Dual Daggers',
    stats: makeStats('human', 'ranger'),
    passive: 'versatile',
    passiveText: 'Versatile — +1 card draw every 3rd turn',
  },
  mawgrim: {
    id: 'mawgrim',
    name: 'Mawgrim',
    type: 'beast',
    class: 'armored',
    element: 'doom',
    weaponName: 'Crushing Maw',
    stats: makeStats('beast', 'armored'),
    passive: 'predator',
    passiveText: 'Predator — +20% DMG vs targets below 50% HP',
  },
  pyra: {
    id: 'pyra',
    name: 'Pyra',
    type: 'demon',
    class: 'brawler',
    element: 'blaze',
    weaponName: 'Flame Gauntlets',
    stats: makeStats('demon', 'brawler'),
    passive: 'bloodthirst',
    passiveText: 'Bloodthirst — heal 60 HP on landing a KO',
  },
};

/** Phase 0 formation (D1): Mawgrim fronts, Pyra mid, Vesper back. */
export const FORMATION: readonly string[] = ['mawgrim', 'pyra', 'vesper'];
