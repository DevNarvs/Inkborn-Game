import type { Side } from './types';

/** Phase 0 playtest instrumentation (pure, framework-free — ports to Convex in
 * Phase 1). The recorder captures one match; `aggregate` rolls a batch of
 * recorded matches up against the PRD §15 success metrics so a 50-match
 * playtest produces signal instead of vibes. */

export type Outcome = Side | 'draw';

export interface SideTurnStat {
  /** Letter-counts of the words this side banked this turn (empty = whiff). */
  words: number[];
  energyGained: number; // applied (post-cap) ⚡ this turn
  inkGained: number; // applied (post-cap) ✒ this turn
  inkSpent: number; // ✒ burned on ultimates this turn
}

export interface TurnStat {
  turn: number;
  isRumble: boolean;
  sides: [SideTurnStat, SideTurnStat];
}

export interface MatchRecord {
  seed: number;
  turns: number;
  winner: Outcome;
  durationMs: number;
  turnsLog: TurnStat[];
  totalEnergy: [number, number]; // sum of energyGained per side
}

export interface WordPhaseInput {
  words: readonly string[]; // accepted words this side banked
  energyGained: number;
  inkGained: number;
}

/** PRD §15 success-metric targets. THIS is the dial you own: tune the bar a
 * playtest must clear, not the formulas above. (medianWordLength ≥, whiffRate <,
 * matchMinutes within range, the two win/rumble rates ≥.) */
export const TARGETS = {
  medianWordLength: 4,
  maxWhiffRate: 0.15,
  matchMinutes: [5, 8] as const,
  lowerEnergyWinRate: 0.3,
  rumbleInkResponse: 0.6,
} as const;

/** Accumulates one match's per-turn data, then freezes it into a MatchRecord. */
export class MatchRecorder {
  private readonly byTurn = new Map<number, TurnStat>();
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /** Call once per word phase with both sides' banked outcome. */
  recordWords(turn: number, isRumble: boolean, sides: [WordPhaseInput, WordPhaseInput]): void {
    this.byTurn.set(turn, {
      turn,
      isRumble,
      sides: [toSideStat(sides[0]), toSideStat(sides[1])],
    });
  }

  /** Call once per card phase with each side's ink spent on ultimates. */
  recordInkSpent(turn: number, spent: [number, number]): void {
    const t = this.byTurn.get(turn);
    if (!t) return; // ink phase without a recorded word phase — ignore defensively
    t.sides[0].inkSpent = spent[0];
    t.sides[1].inkSpent = spent[1];
  }

  finish(winner: Outcome, durationMs: number): MatchRecord {
    const turnsLog = [...this.byTurn.values()].sort((a, b) => a.turn - b.turn);
    const totalEnergy: [number, number] = [0, 0];
    for (const t of turnsLog) {
      totalEnergy[0] += t.sides[0].energyGained;
      totalEnergy[1] += t.sides[1].energyGained;
    }
    return { seed: this.seed, turns: turnsLog.length, winner, durationMs, turnsLog, totalEnergy };
  }
}

function toSideStat(input: WordPhaseInput): SideTurnStat {
  return {
    words: input.words.map((w) => w.length),
    energyGained: input.energyGained,
    inkGained: input.inkGained,
    inkSpent: 0, // filled in later by recordInkSpent for this turn
  };
}

export interface MetricVerdict {
  value: number;
  target: number;
  pass: boolean;
  sampleSize: number;
}

export interface Aggregate {
  matches: number;
  playerWordPhases: number;
  medianWordLength: MetricVerdict; // target: ≥ 4 letters
  whiffRate: MetricVerdict; // target: < 15%
  medianMinutes: number; // informational; target 5–8
  medianTurns: number;
  lowerEnergyWinRate: MetricVerdict; // target: ≥ 30% (skill, not just ⚡, wins)
  rumbleInkResponseRate: MetricVerdict; // target: ≥ 60% (the rumble rhythm is played)
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Roll a batch of matches up into the §15 metrics from one player's seat. */
export function aggregate(records: readonly MatchRecord[], player: Side = 0): Aggregate {
  const wordLengths: number[] = [];
  let wordPhases = 0;
  let whiffs = 0;
  let rumblePhases = 0;
  let rumbleResponded = 0;

  for (const rec of records) {
    rec.turnsLog.forEach((t, i) => {
      const me = t.sides[player];
      wordPhases++;
      if (me.words.length === 0) whiffs++;
      else wordLengths.push(...me.words);

      if (t.isRumble) {
        rumblePhases++;
        // "Ink spent within 2 turns of a Rumble Round": this turn or the next two.
        const window = rec.turnsLog.slice(i, i + 3);
        if (window.some((w) => w.sides[player].inkSpent > 0)) rumbleResponded++;
      }
    });
  }

  // Skill check: among decisive matches with an energy gap, how often did the
  // LOWER-energy side still win?
  let decisive = 0;
  let lowerEnergyWins = 0;
  for (const rec of records) {
    if (rec.winner === 'draw') continue;
    const [a, b] = rec.totalEnergy;
    if (a === b) continue;
    decisive++;
    const lowerSide = a < b ? 0 : 1;
    if (rec.winner === lowerSide) lowerEnergyWins++;
  }

  const whiffRate = wordPhases ? whiffs / wordPhases : 0;
  const lowerRate = decisive ? lowerEnergyWins / decisive : 0;
  const rumbleRate = rumblePhases ? rumbleResponded / rumblePhases : 0;
  const medWord = median(wordLengths);

  return {
    matches: records.length,
    playerWordPhases: wordPhases,
    medianWordLength: {
      value: medWord,
      target: TARGETS.medianWordLength,
      pass: medWord >= TARGETS.medianWordLength,
      sampleSize: wordLengths.length,
    },
    whiffRate: {
      value: whiffRate,
      target: TARGETS.maxWhiffRate,
      pass: whiffRate < TARGETS.maxWhiffRate,
      sampleSize: wordPhases,
    },
    medianMinutes: median(records.map((r) => r.durationMs / 60000)),
    medianTurns: median(records.map((r) => r.turns)),
    lowerEnergyWinRate: {
      value: lowerRate,
      target: TARGETS.lowerEnergyWinRate,
      pass: lowerRate >= TARGETS.lowerEnergyWinRate,
      sampleSize: decisive,
    },
    rumbleInkResponseRate: {
      value: rumbleRate,
      target: TARGETS.rumbleInkResponse,
      pass: rumbleRate >= TARGETS.rumbleInkResponse,
      sampleSize: rumblePhases,
    },
  };
}
