import { describe, expect, it } from 'vitest';
import { MatchRecorder, aggregate } from './stats';
import type { MatchRecord } from './stats';

describe('MatchRecorder', () => {
  it('captures per-turn words, merges ink spent, and totals energy', () => {
    const rec = new MatchRecorder(42);
    rec.recordWords(1, false, [
      { words: ['ARENAS'], energyGained: 5, inkGained: 0 },
      { words: ['RID'], energyGained: 2, inkGained: 0 },
    ]);
    rec.recordWords(2, false, [
      { words: [], energyGained: 1, inkGained: 0 }, // whiff -> pity energy
      { words: ['NIT'], energyGained: 2, inkGained: 0 },
    ]);
    rec.recordInkSpent(1, [3, 0]);
    const out = rec.finish(0, 90_000);

    expect(out.turns).toBe(2);
    expect(out.winner).toBe(0);
    expect(out.totalEnergy).toEqual([6, 4]);
    expect(out.turnsLog[0].sides[0].words).toEqual([6]); // 'ARENAS' -> length 6
    expect(out.turnsLog[0].sides[0].inkSpent).toBe(3);
    expect(out.turnsLog[1].sides[0].words).toEqual([]); // whiff recorded as no words
  });

  it('ignores ink-spent for a turn that has no recorded word phase', () => {
    const rec = new MatchRecorder(1);
    rec.recordInkSpent(5, [9, 9]); // no throw, no effect
    expect(rec.finish('draw', 0).turns).toBe(0);
  });
});

/** Minimal record builder for aggregate tests. */
function match(opts: {
  winner: MatchRecord['winner'];
  totalEnergy: [number, number];
  durationMs?: number;
  turnsLog: MatchRecord['turnsLog'];
}): MatchRecord {
  return {
    seed: 0,
    turns: opts.turnsLog.length,
    winner: opts.winner,
    durationMs: opts.durationMs ?? 360_000,
    turnsLog: opts.turnsLog,
    totalEnergy: opts.totalEnergy,
  };
}

const side = (words: number[], inkSpent = 0) => ({
  words,
  energyGained: 0,
  inkGained: 0,
  inkSpent,
});

describe('aggregate — §15 metrics', () => {
  it('reports median word length and whiff rate for the player seat', () => {
    const rec = match({
      winner: 0,
      totalEnergy: [10, 8],
      turnsLog: [
        { turn: 1, isRumble: false, sides: [side([4, 6]), side([3])] },
        { turn: 2, isRumble: false, sides: [side([]), side([5])] }, // player whiff
        { turn: 3, isRumble: true, sides: [side([4]), side([4])] },
      ],
    });
    const agg = aggregate([rec], 0);

    expect(agg.matches).toBe(1);
    expect(agg.playerWordPhases).toBe(3);
    // player word lengths: [4,6,4] -> median 4
    expect(agg.medianWordLength.value).toBe(4);
    expect(agg.medianWordLength.pass).toBe(true);
    // 1 whiff / 3 phases
    expect(agg.whiffRate.value).toBeCloseTo(1 / 3);
    expect(agg.whiffRate.pass).toBe(false); // > 15%
  });

  it('measures lower-energy win rate over decisive matches only', () => {
    const lowerWins = match({ winner: 0, totalEnergy: [5, 9], turnsLog: [] }); // 0 has less ⚡, 0 wins
    const higherWins = match({ winner: 1, totalEnergy: [5, 9], turnsLog: [] }); // 1 has more ⚡, 1 wins
    const tie = match({ winner: 0, totalEnergy: [7, 7], turnsLog: [] }); // equal ⚡ -> excluded
    const draw = match({ winner: 'draw', totalEnergy: [3, 9], turnsLog: [] }); // draw -> excluded

    const agg = aggregate([lowerWins, higherWins, tie, draw], 0);
    expect(agg.lowerEnergyWinRate.sampleSize).toBe(2); // only the 2 decisive, unequal matches
    expect(agg.lowerEnergyWinRate.value).toBe(0.5);
    expect(agg.lowerEnergyWinRate.pass).toBe(true); // ≥ 30%
  });

  it('counts a rumble as answered when ink is spent within the next 2 turns', () => {
    const answered = match({
      winner: 0,
      totalEnergy: [0, 0],
      turnsLog: [
        { turn: 3, isRumble: true, sides: [side([4]), side([4])] }, // rumble, no spend yet
        { turn: 4, isRumble: false, sides: [side([4], 7), side([4])] }, // player spends ink (within 2)
      ],
    });
    const ignored = match({
      winner: 0,
      totalEnergy: [0, 0],
      turnsLog: [
        { turn: 3, isRumble: true, sides: [side([4]), side([4])] },
        { turn: 4, isRumble: false, sides: [side([4]), side([4])] },
        { turn: 5, isRumble: false, sides: [side([4]), side([4])] },
        { turn: 6, isRumble: false, sides: [side([4], 7), side([4])] }, // too late (3 turns later)
      ],
    });
    const agg = aggregate([answered, ignored], 0);
    expect(agg.rumbleInkResponseRate.sampleSize).toBe(2);
    expect(agg.rumbleInkResponseRate.value).toBe(0.5);
  });

  it('returns safe zeros for an empty batch', () => {
    const agg = aggregate([], 0);
    expect(agg.matches).toBe(0);
    expect(agg.medianWordLength.value).toBe(0);
    expect(agg.whiffRate.pass).toBe(true); // 0 < 15%
    expect(agg.rumbleInkResponseRate.sampleSize).toBe(0);
  });
});
