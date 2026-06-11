import { describe, expect, it } from 'vitest';
import { botPickWords, botPlanCards } from './bot';
import { Match } from './match';
import { isWordTraceable } from './path';
import { mulberry32 } from './rng';
import { Trie } from './trie';
import { wordEnergyValue } from './scoring';

/** Same planted grid as path.test.ts. Traceable dictionary words and their
 * energy values: CAT/EAT/NIT/DOE = 2 · CATS/DEAR = 3 · CRATE = 4. */
const GRID = ['C', 'A', 'T', 'S', 'R', 'E', 'I', 'N', 'L', 'O', 'D', 'K', 'Q', 'U', 'X', 'Z'];
const DICT = Trie.fromWords(['CAT', 'EAT', 'NIT', 'DOE', 'CATS', 'DEAR', 'CRATE', 'ZZZ']);

describe('botPickWords', () => {
  it('always returns a real, traceable dictionary word', () => {
    for (let seed = 0; seed < 25; seed++) {
      const picks = botPickWords(GRID, DICT, false, mulberry32(seed));
      expect(picks).toHaveLength(1);
      expect(DICT.has(picks[0].word)).toBe(true);
      expect(isWordTraceable(GRID, picks[0].word)).toBe(true);
    }
  });

  it('picks from the average band — never the top-scoring word', () => {
    for (let seed = 0; seed < 25; seed++) {
      const [pick] = botPickWords(GRID, DICT, false, mulberry32(seed));
      expect(wordEnergyValue(pick.word)).toBeLessThanOrEqual(3);
      expect(pick.word).not.toBe('CRATE');
    }
  });

  it('returns nothing when the grid has no words (engine whiffs it)', () => {
    const empty = Trie.fromWords(['QQQQ']);
    expect(botPickWords(GRID, empty, false, mulberry32(1))).toEqual([]);
  });

  it('submits 2–4 distinct words on rumble rounds', () => {
    for (let seed = 0; seed < 25; seed++) {
      const picks = botPickWords(GRID, DICT, true, mulberry32(seed));
      expect(picks.length).toBeGreaterThanOrEqual(2);
      expect(picks.length).toBeLessThanOrEqual(4);
      const words = picks.map((p) => p.word);
      expect(new Set(words).size).toBe(words.length);
      for (const word of words) expect(isWordTraceable(GRID, word)).toBe(true);
    }
  });
});

describe('botPlanCards', () => {
  /** Validity oracle: a real Match accepts the bot's plan without throwing. */
  function acceptedByMatch(seed: number, energy: number, ink: number): boolean {
    const match = new Match(seed, Trie.fromWords([]));
    match.startTurn();
    match.submitWords(0, []);
    match.submitWords(1, []);
    match.state.combat.energy[1] = energy;
    match.state.combat.ink[1] = ink;
    const plan = botPlanCards(
      match.state.zones[1].hand,
      match.state.combat,
      1,
      mulberry32(seed * 31),
    );
    match.submitPlan(1, plan);
    return true;
  }

  it('produces plans a real match always accepts (50 seeds, varied banks)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(acceptedByMatch(seed, seed % 11, seed % 16)).toBe(true);
    }
  });

  it('spends nothing it does not have: zero energy means only 0-cost plays', () => {
    const match = new Match(77, Trie.fromWords([]));
    match.startTurn();
    for (let seed = 0; seed < 20; seed++) {
      const plan = botPlanCards(match.state.zones[1].hand, match.state.combat, 1, mulberry32(seed));
      const cost = plan.unitPlays
        .flatMap((p) => p.cards)
        .reduce((sum, c) => sum + (c.defId === 'scrap' ? 0 : 1), 0);
      // with 0 energy, any non-scrap card would have cost ≥ 1
      expect(cost).toBe(0);
      expect(plan.ultimates).toEqual([]);
    }
  });

  it('eventually fires an ultimate when ink is full', () => {
    const match = new Match(78, Trie.fromWords([]));
    match.startTurn();
    match.state.combat.ink[1] = 15;
    let fired = 0;
    for (let seed = 0; seed < 20; seed++) {
      const plan = botPlanCards(match.state.zones[1].hand, match.state.combat, 1, mulberry32(seed));
      fired += plan.ultimates.length;
    }
    expect(fired).toBeGreaterThan(0);
  });
});
