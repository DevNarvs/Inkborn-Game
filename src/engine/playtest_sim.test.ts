import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { cardDef, ultimateForUnit } from '../data/cards';
import { FORMATION } from '../data/units';
import { botPickWords, botPlanCards } from './bot';
import { Match } from './match';
import { mulberry32 } from './rng';
import { aggregate, MatchRecorder } from './stats';
import type { MatchRecord, Outcome } from './stats';
import { Trie } from './trie';

/** One-off headless playtest: runs bot-vs-bot matches through the pure engine
 * and rolls them up against the PRD §15 targets. Gated behind PLAYTEST so it
 * never runs in the normal suite. Run with: PLAYTEST=300 npx vitest run playtest_sim */
const N = Number(process.env.PLAYTEST ?? 0);
/** Engaged-player time estimate per turn (word thinking + card + resolution). */
const SEC_PER_TURN = 45;

function runMatch(trie: Trie, seed: number): MatchRecord {
  const match = new Match(seed, trie);
  const rec = new MatchRecorder(seed);
  const rng = [mulberry32(seed ^ 0xa53f), mulberry32(seed ^ 0xb721)] as const;
  match.startTurn();

  let guard = 0;
  while (match.state.phase !== 'ended' && guard++ < 80) {
    const s = match.state;
    const turn = s.turn;
    const isRumble = s.isRumble;
    const grid = s.grid;
    const eBefore = [s.combat.energy[0], s.combat.energy[1]];
    const iBefore = [s.combat.ink[0], s.combat.ink[1]];

    const outA = match.submitWords(0, botPickWords(grid, trie, isRumble, rng[0]));
    const outB = match.submitWords(1, botPickWords(grid, trie, isRumble, rng[1])); // applies earnings

    rec.recordWords(turn, isRumble, [
      { words: outA.accepted, energyGained: s.combat.energy[0] - eBefore[0], inkGained: s.combat.ink[0] - iBefore[0] },
      { words: outB.accepted, energyGained: s.combat.energy[1] - eBefore[1], inkGained: s.combat.ink[1] - iBefore[1] },
    ]);

    const planA = botPlanCards(s.zones[0].hand, s.combat, 0, rng[0]);
    const planB = botPlanCards(s.zones[1].hand, s.combat, 1, rng[1]);
    const inkSpent = (ults: number[]): number =>
      ults.reduce((sum, slot) => sum + ultimateForUnit(FORMATION[slot]).inkCost, 0);
    rec.recordInkSpent(turn, [inkSpent(planA.ultimates), inkSpent(planB.ultimates)]);

    match.submitPlan(0, planA);
    match.submitPlan(1, planB);
    match.resolve(); // advances turn or ends
  }

  const winner: Outcome = match.state.winner ?? 'draw';
  return rec.finish(winner, match.state.turn * SEC_PER_TURN * 1000);
}

describe.skipIf(N <= 0)('playtest simulation', () => {
  it(`runs ${N} bot-vs-bot matches and reports §15 metrics`, () => {
    const words = readFileSync('public/enable1.txt', 'utf8').split(/\r?\n/).filter(Boolean);
    const trie = Trie.fromWords(words);

    const records: MatchRecord[] = [];
    for (let i = 0; i < N; i++) records.push(runMatch(trie, 1000 + i * 7));

    const agg = aggregate(records, 0);
    const wins = { 0: 0, 1: 0, draw: 0 } as Record<string, number>;
    let ko = 0;
    let tide = 0;
    for (const r of records) {
      wins[String(r.winner)]++;
      if (r.turns >= 13) tide++;
    }
    const cardUsage = records.flatMap((r) => r.turnsLog).length;
    void cardDef;
    void ko;

    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const mark = (p: boolean) => (p ? 'PASS' : 'FAIL');
    /* eslint-disable no-console */
    console.log('\n================ PHASE 0 PLAYTEST (bot vs bot) ================');
    console.log(`matches: ${agg.matches}   player word-phases: ${agg.playerWordPhases}`);
    console.log(`outcomes: P1 ${wins['0']} / P2 ${wins['1']} / draw ${wins.draw}`);
    console.log(`median turns/match: ${agg.medianTurns}   reached Ink Tide (turn 13+): ${tide} (${pct(tide / agg.matches)})`);
    console.log(`est. match length @${SEC_PER_TURN}s/turn: ${agg.medianMinutes.toFixed(1)} min  (target ${TARGETS_MIN}-${TARGETS_MAX})`);
    console.log('---------------------------------------------------------------');
    console.log(`median word length : ${agg.medianWordLength.value}  (target ≥${agg.medianWordLength.target})  ${mark(agg.medianWordLength.pass)}  [n=${agg.medianWordLength.sampleSize}]`);
    console.log(`whiff rate         : ${pct(agg.whiffRate.value)}  (target <${pct(agg.whiffRate.target)})  ${mark(agg.whiffRate.pass)}  [n=${agg.whiffRate.sampleSize}]`);
    console.log(`lower-⚡ win rate   : ${pct(agg.lowerEnergyWinRate.value)}  (target ≥${pct(agg.lowerEnergyWinRate.target)})  ${mark(agg.lowerEnergyWinRate.pass)}  [n=${agg.lowerEnergyWinRate.sampleSize} decisive]`);
    console.log(`rumble ink-response: ${pct(agg.rumbleInkResponseRate.value)}  (target ≥${pct(agg.rumbleInkResponseRate.target)})  ${mark(agg.rumbleInkResponseRate.pass)}  [n=${agg.rumbleInkResponseRate.sampleSize} rumbles]`);
    console.log(`total turns simulated: ${cardUsage}`);
    console.log('===============================================================\n');
    /* eslint-enable no-console */
  }, 600000);
});

const TARGETS_MIN = 5;
const TARGETS_MAX = 8;
