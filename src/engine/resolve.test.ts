import { describe, expect, it } from 'vitest';
import { FORMATION, UNITS } from '../data/units';
import { resolveTurn } from './resolve';
import { mulberry32 } from './rng';
import type { BattleEvent, CardInstance, CombatState, SidePlan } from './types';

/** Units ordered side0 slots 0-2 then side1 slots 0-2.
 * Formation (D1): slot0 Mawgrim (front), slot1 Pyra, slot2 Vesper (back). */
const S0_MAW = 0;
const S0_PYR = 1;
const S0_VES = 2;
const S1_MAW = 3;
const S1_PYR = 4;
const S1_VES = 5;

function mkCombat(): CombatState {
  const units = [0, 1].flatMap((side) =>
    FORMATION.map((defId, slot) => {
      const def = UNITS[defId];
      return {
        defId,
        side: side as 0 | 1,
        slot,
        hp: def.stats.hp,
        maxHp: def.stats.hp,
        shield: 0,
        alive: true,
        taunting: false,
        dots: [],
      };
    }),
  );
  return { units, energy: [0, 0], ink: [0, 0] };
}

function kill(combat: CombatState, index: number): void {
  combat.units[index].alive = false;
  combat.units[index].hp = 0;
}

let nextIid = 0;
function inst(defId: string): CardInstance {
  return { iid: `${defId}#t${nextIid++}`, defId };
}

function plan(plays: Array<[number, string[]]>, ultimates: number[] = []): SidePlan {
  return {
    unitPlays: plays.map(([unitIndex, defIds]) => ({
      unitIndex,
      cards: defIds.map(inst),
    })),
    ultimates,
  };
}

const NO_PLAN: SidePlan = { unitPlays: [], ultimates: [] };

function resolve(
  combat: CombatState,
  p0: SidePlan = NO_PLAN,
  p1: SidePlan = NO_PLAN,
  turn = 1,
) {
  return resolveTurn(combat, [p0, p1], turn, mulberry32(1234));
}

function cardEvents(events: BattleEvent[]): Array<{ side: number; name: string }> {
  return events
    .filter((e): e is Extract<BattleEvent, { type: 'card' }> => e.type === 'card')
    .map((e) => ({ side: e.side, name: e.name }));
}

describe('shields', () => {
  it('applies shields first; damage chews shield before HP', () => {
    const combat = mkCombat();
    // S1 Mawgrim: Iron Stance (SHD 80). S0 Pyra: Cinder Jab (60+26)×1.0−27 = 59.
    const { combat: after } = resolve(
      combat,
      plan([[1, ['cinder_jab']]]),
      plan([[0, ['iron_stance']]]),
    );
    expect(after.units[S1_MAW].hp).toBe(700);
    expect(after.units[S1_MAW].shield).toBe(21);
  });
});

describe('SPD ordering', () => {
  it('acts in descending SPD across both sides', () => {
    const combat = mkCombat();
    // Vesper 15, Pyra 14, Mawgrim 5
    const { events } = resolve(
      combat,
      plan([
        [2, ['quick_slash']],
        [0, ['bone_crunch']],
      ]),
      plan([[1, ['cinder_jab']]]),
    );
    expect(cardEvents(events).map((e) => e.name)).toEqual([
      'Quick Slash',
      'Cinder Jab',
      'Bone Crunch',
    ]);
  });

  it('breaks SPD ties by lower current HP first', () => {
    const combat = mkCombat();
    combat.units[S1_MAW].hp = 600; // both Mawgrims SPD 5; side1 is more wounded
    const { events } = resolve(
      combat,
      plan([[0, ['bone_crunch']]]),
      plan([[0, ['bone_crunch']]]),
    );
    expect(cardEvents(events).map((e) => e.side)).toEqual([1, 0]);
  });
});

describe('KO and fizzle', () => {
  it("fizzles a KO'd unit's unresolved cards", () => {
    const combat = mkCombat();
    kill(combat, S0_MAW); // expose S0 Pyra as frontmost
    combat.units[S0_PYR].hp = 50;
    // S1 Vesper (SPD 15) kills Pyra (SPD 14) before she acts: (55+18)×1.0−6 = 67 ≥ 50.
    const { combat: after, events } = resolve(
      combat,
      plan([[1, ['cinder_jab', 'scrap']]]),
      plan([[2, ['quick_slash']]]),
    );
    expect(after.units[S0_PYR].alive).toBe(false);
    expect(events).toContainEqual({ type: 'fizzle', side: 0, slot: 1, count: 2 });
    expect(after.units[S1_MAW].hp).toBe(700); // her attacks never landed
  });

  it('KO refund grants +1 energy (Phantom Slash)', () => {
    const combat = mkCombat();
    combat.units[S1_MAW].hp = 60;
    // (100+18)×0.85−27 = 73 ≥ 60 → KO.
    const { combat: after, events } = resolve(combat, plan([[2, ['phantom_slash']]]));
    expect(events).toContainEqual({ type: 'ko', side: 1, slot: 0 });
    expect(after.energy[0]).toBe(1);
    expect(events).toContainEqual({
      type: 'energyRefund',
      side: 0,
      amount: 1,
      source: 'Phantom Slash',
    });
  });

  it('Bloodthirst heals Pyra 60 on landing a KO', () => {
    const combat = mkCombat();
    kill(combat, S1_MAW);
    combat.units[S1_PYR].hp = 70;
    combat.units[S0_PYR].hp = 300;
    // Cinder Jab: (60+26)×1.0−6 = 80 ≥ 70 → KO → heal 60.
    const { combat: after, events } = resolve(combat, plan([[1, ['cinder_jab']]]));
    expect(after.units[S0_PYR].hp).toBe(360);
    expect(events).toContainEqual({
      type: 'heal',
      side: 0,
      slot: 1,
      amount: 60,
      source: 'Bloodthirst',
    });
  });
});

describe('targeting', () => {
  it('hits the frontmost living enemy by default', () => {
    const combat = mkCombat();
    kill(combat, S1_MAW);
    // Frontmost living is now S1 Pyra: (60+26)×1.0−6 = 80.
    const { combat: after } = resolve(combat, plan([[1, ['cinder_jab']]]));
    expect(after.units[S1_PYR].hp).toBe(320);
    expect(after.units[S1_VES].hp).toBe(440);
  });

  it('Snipe hits the backmost living enemy', () => {
    const combat = mkCombat();
    // Hunter's Mark: (45+18)×1.0 (void vs void) −5 = 58 on S1 Vesper.
    const { combat: after } = resolve(combat, plan([[2, ['hunters_mark']]]));
    expect(after.units[S1_VES].hp).toBe(382);
    expect(after.units[S1_MAW].hp).toBe(700);
  });

  it('Taunt overrides Snipe and drags the hit onto the taunter', () => {
    const combat = mkCombat();
    // S1 Mawgrim taunts with Iron Stance (SHD 80); Hunter's Mark (45+18)×0.85−27 = 27.
    const { combat: after } = resolve(
      combat,
      plan([[2, ['hunters_mark']]]),
      plan([[0, ['iron_stance']]]),
    );
    expect(after.units[S1_VES].hp).toBe(440);
    expect(after.units[S1_MAW].shield).toBe(53);
    expect(after.units[S1_MAW].hp).toBe(700);
  });

  it('Sweep (DOOMFALL) hits all living enemies and curses each', () => {
    const combat = mkCombat();
    const { combat: after, events } = resolve(combat, plan([], [0]));
    // (25+7): vs Maw ×1.0−27=5 · vs Pyra ×1.0−6=26 · vs Vesper ×1.15=36.8−5=31.8→32
    expect(after.units[S1_MAW].hp).toBe(695);
    expect(after.units[S1_PYR].hp).toBe(374);
    expect(after.units[S1_VES].hp).toBe(408);
    for (const i of [S1_MAW, S1_PYR, S1_VES]) {
      // delay was 1 at apply time; this turn's end phase consumed it (no tick),
      // leaving 2 full ticks for the next 2 turns.
      expect(after.units[i].dots).toEqual([
        { kind: 'curse', perTick: 34, remaining: 2, delay: 0 },
      ]);
    }
    expect(events.filter((e) => e.type === 'damage')).toHaveLength(3);
  });
});

describe('drains', () => {
  it('Ink Siphon steals 1 energy from the enemy bank', () => {
    const combat = mkCombat();
    combat.energy = [0, 3];
    const { combat: after, events } = resolve(combat, plan([[2, ['ink_siphon']]]));
    expect(after.energy).toEqual([1, 2]);
    expect(events).toContainEqual({ type: 'drain', resource: 'energy', from: 1, to: 0, amount: 1 });
  });

  it('VOIDREND deals massive damage and drains 2 ink', () => {
    const combat = mkCombat();
    combat.ink = [0, 3]; // post-payment pools
    // (220+18)×0.85−27 = 175.3 → 175.
    const { combat: after, events } = resolve(combat, plan([], [2]));
    expect(after.units[S1_MAW].hp).toBe(525);
    expect(after.ink).toEqual([2, 1]);
    expect(events).toContainEqual({ type: 'drain', resource: 'ink', from: 1, to: 0, amount: 2 });
    expect(cardEvents(events)).toContainEqual({ side: 0, name: 'VOIDREND' });
  });
});

describe('damage-over-time', () => {
  it('Burn ticks at the end of the turn it lands (D3)', () => {
    const combat = mkCombat();
    // Ignite hit: (35+26)×1.0−27 = 34. Burn perTick 20+3 = 23 → 700−34−23 = 643.
    const { combat: t1 } = resolve(combat, plan([[1, ['ignite']]]));
    expect(t1.units[S1_MAW].hp).toBe(643);
    const { combat: t2 } = resolve(t1);
    expect(t2.units[S1_MAW].hp).toBe(620);
    expect(t2.units[S1_MAW].dots).toHaveLength(0);
  });

  it('Curse skips the applied turn, then ticks the next 2 turns (D3)', () => {
    const combat = mkCombat();
    // Withering Curse hit: (30+7)×1.0−27 = 10. perTick 25+4 = 29.
    const { combat: t1 } = resolve(combat, plan([[0, ['withering_curse']]]));
    expect(t1.units[S1_MAW].hp).toBe(690); // no tick yet
    const { combat: t2 } = resolve(t1);
    expect(t2.units[S1_MAW].hp).toBe(661);
    const { combat: t3 } = resolve(t2);
    expect(t3.units[S1_MAW].hp).toBe(632);
    expect(t3.units[S1_MAW].dots).toHaveLength(0);
  });
});

describe('passives and combo', () => {
  it('Quick Slash gains +20 when comboed with another card on Vesper', () => {
    const combat = mkCombat();
    combat.energy = [0, 3];
    // Siphon: (40+18)×0.85−27 = 22.3 → 22. Quick Slash comboed:
    // (55+20+18)×0.85−27 = 52.05 → 52. Total 700−74 = 626 (635 without combo... 661? no: without combo 35).
    const { combat: after } = resolve(combat, plan([[2, ['ink_siphon', 'quick_slash']]]));
    expect(after.units[S1_MAW].hp).toBe(626);
  });

  it('Predator multiplies Mawgrim damage ×1.2 vs targets below 50% HP', () => {
    const combat = mkCombat();
    kill(combat, S1_MAW);
    combat.units[S1_PYR].hp = 150; // below 200 = 50% of 400
    // (50+7)×1.0×1.2 = 68.4 − 6 = 62.4 → 62.
    const { combat: after } = resolve(combat, plan([[0, ['bone_crunch']]]));
    expect(after.units[S1_PYR].hp).toBe(88);
  });
});

describe('Ink Tide and match end', () => {
  it('chips all living units from turn 13: 10, 20, 30…', () => {
    const a = resolve(mkCombat(), NO_PLAN, NO_PLAN, 13);
    expect(a.events).toContainEqual({ type: 'inkTide', amount: 10 });
    expect(a.combat.units[S0_MAW].hp).toBe(690);
    const b = resolve(mkCombat(), NO_PLAN, NO_PLAN, 15);
    expect(b.events).toContainEqual({ type: 'inkTide', amount: 30 });
    expect(b.combat.units[S0_VES].hp).toBe(410);
  });

  it('does not tide before turn 13', () => {
    const { events } = resolve(mkCombat(), NO_PLAN, NO_PLAN, 12);
    expect(events.some((e) => e.type === 'inkTide')).toBe(false);
  });

  it('declares a winner when one side is wiped', () => {
    const combat = mkCombat();
    kill(combat, S1_PYR);
    kill(combat, S1_VES);
    combat.units[S1_MAW].hp = 5;
    const { events } = resolve(combat, plan([[1, ['cinder_jab']]]));
    expect(events).toContainEqual({ type: 'matchEnd', winner: 0 });
  });

  it('declares a draw on a double wipe (D11)', () => {
    const combat = mkCombat();
    for (const i of [S0_PYR, S0_VES, S1_MAW, S1_VES]) kill(combat, i);
    combat.units[S0_MAW].hp = 5;
    combat.units[S1_PYR].hp = 8;
    const { events } = resolve(combat, NO_PLAN, NO_PLAN, 13); // tide 10 kills both
    expect(events).toContainEqual({ type: 'matchEnd', winner: 'draw' });
  });
});
