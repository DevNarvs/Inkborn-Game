import { beforeEach, describe, expect, it } from 'vitest';
import { Match } from './match';
import { wordFromPath } from './path';
import { Trie } from './trie';
import { wordEnergyValue } from './scoring';

/** The trie is injected, so tests build one that contains whatever word the
 * generated grid happens to spell at tiles 0→1→2 — always a legal trace. */
function matchWithTraceableWord(seed = 7): { match: Match; word: string; path: number[] } {
  const probe = new Match(seed, Trie.fromWords([]));
  probe.startTurn();
  const path = [0, 1, 2];
  const word = wordFromPath(probe.state.grid, path);
  const match = new Match(seed, Trie.fromWords([word]));
  match.startTurn();
  return { match, word, path };
}

/** Both sides whiff and pass — advances one full turn. */
function passTurn(match: Match): void {
  match.submitWords(0, []);
  match.submitWords(1, []);
  match.submitPlan(0, { unitPlays: [], ultimates: [] });
  match.submitPlan(1, { unitPlays: [], ultimates: [] });
  match.resolve();
}

describe('match setup', () => {
  it('starts at turn 1 in the word phase with mirror teams and 6-card hands', () => {
    const match = new Match(1, Trie.fromWords(['CAT']));
    const { turn, isRumble, grid } = match.startTurn();
    expect(turn).toBe(1);
    expect(isRumble).toBe(false);
    expect(grid).toHaveLength(16);
    expect(match.state.phase).toBe('word');
    expect(match.state.zones[0].hand).toHaveLength(6);
    expect(match.state.zones[1].hand).toHaveLength(6);
    expect(match.state.combat.units).toHaveLength(6);
    expect(match.state.combat.energy).toEqual([0, 0]);
    expect(match.state.combat.ink).toEqual([0, 0]);
  });

  it('flags every 3rd turn as a Rumble Round', () => {
    const match = new Match(2, Trie.fromWords([]));
    match.startTurn();
    passTurn(match); // ends turn 1, starts turn 2
    passTurn(match);
    expect(match.state.turn).toBe(3);
    expect(match.state.isRumble).toBe(true);
  });
});

describe('word phase', () => {
  it('accepts a traced dictionary word and banks its energy', () => {
    const { match, word, path } = matchWithTraceableWord();
    const result = match.submitWords(0, [{ word, path }]);
    expect(result.accepted).toEqual([word]);
    expect(match.state.combat.energy[0]).toBe(wordEnergyValue(word));
  });

  it('treats an off-dictionary submission as a whiff: pity 1 energy', () => {
    const match = new Match(3, Trie.fromWords(['CAT']));
    match.startTurn();
    const result = match.submitWords(0, [{ word: 'ZZZZ', path: [0, 1, 2, 3] }]);
    expect(result.accepted).toEqual([]);
    expect(match.state.combat.energy[0]).toBe(1);
  });

  it('rejects a word whose path does not spell it', () => {
    const { match, word } = matchWithTraceableWord();
    const badPath = [15, 14, 13];
    const result = match.submitWords(0, [{ word, path: badPath }]);
    expect(result.accepted.includes(word)).toBe(word === wordFromPath(match.state.grid, badPath));
    // and a non-adjacent path is always rejected
    const result2 = match.submitWords(1, [{ word, path: [0, 5, 15] }]);
    expect(result2.accepted).toEqual([]);
  });

  it('moves to the card phase once both sides submit, drawing 0 on turn 1', () => {
    const { match, word, path } = matchWithTraceableWord();
    match.submitWords(0, [{ word, path }]);
    expect(match.state.phase).toBe('word'); // waiting on side 1
    match.submitWords(1, []);
    expect(match.state.phase).toBe('card');
    expect(match.state.zones[0].hand).toHaveLength(6); // no draw on turn 1
  });

  it('draws 3 per turn from turn 2', () => {
    const match = new Match(5, Trie.fromWords([]));
    match.startTurn();
    passTurn(match);
    match.submitWords(0, []);
    match.submitWords(1, []);
    expect(match.state.turn).toBe(2);
    expect(match.state.zones[0].hand).toHaveLength(9); // 6 + 3
  });
});

describe('card phase', () => {
  let match: Match;

  beforeEach(() => {
    match = new Match(8, Trie.fromWords([]));
    match.startTurn();
    match.submitWords(0, []); // pity 1 energy
    match.submitWords(1, []);
    // Known hand for side 0: tests shape state directly (engine objects are POJOs).
    match.state.zones[0].hand = [
      { iid: 'scrap#1', defId: 'scrap' },
      { iid: 'quick_slash#1', defId: 'quick_slash' },
      { iid: 'phantom_slash#1', defId: 'phantom_slash' },
    ];
  });

  it('accepts an affordable plan and deducts energy', () => {
    // scrap (0⚡) + quick_slash (1⚡) with 1 energy banked.
    match.submitPlan(0, {
      unitPlays: [
        { unitIndex: 1, cards: [{ iid: 'scrap#1', defId: 'scrap' }] },
        { unitIndex: 2, cards: [{ iid: 'quick_slash#1', defId: 'quick_slash' }] },
      ],
      ultimates: [],
    });
    expect(match.state.combat.energy[0]).toBe(0);
  });

  it('rejects a plan that overspends energy', () => {
    expect(() =>
      match.submitPlan(0, {
        unitPlays: [{ unitIndex: 2, cards: [{ iid: 'phantom_slash#1', defId: 'phantom_slash' }] }],
        ultimates: [],
      }),
    ).toThrow(/energy/i);
  });

  it('rejects cards not in hand', () => {
    expect(() =>
      match.submitPlan(0, {
        unitPlays: [{ unitIndex: 2, cards: [{ iid: 'ink_siphon#9', defId: 'ink_siphon' }] }],
        ultimates: [],
      }),
    ).toThrow(/hand/i);
  });

  it("rejects assigning a card to another unit's slot", () => {
    expect(() =>
      match.submitPlan(0, {
        unitPlays: [{ unitIndex: 0, cards: [{ iid: 'quick_slash#1', defId: 'quick_slash' }] }],
        ultimates: [],
      }),
    ).toThrow(/unit/i);
  });

  it('gates ultimates on team ink and deducts it', () => {
    expect(() =>
      match.submitPlan(0, { unitPlays: [], ultimates: [2] }),
    ).toThrow(/ink/i);
    match.state.combat.ink[0] = 12;
    match.submitPlan(0, { unitPlays: [], ultimates: [2] }); // VOIDREND costs 10
    expect(match.state.combat.ink[0]).toBe(2);
  });
});

describe('resolution and match end', () => {
  it('resolves both plans, discards played cards, and starts the next turn', () => {
    const match = new Match(9, Trie.fromWords([]));
    match.startTurn();
    match.submitWords(0, []);
    match.submitWords(1, []);
    match.state.zones[0].hand = [{ iid: 'scrap#1', defId: 'scrap' }];
    match.submitPlan(0, {
      unitPlays: [{ unitIndex: 1, cards: [{ iid: 'scrap#1', defId: 'scrap' }] }],
      ultimates: [],
    });
    match.submitPlan(1, { unitPlays: [], ultimates: [] });
    const events = match.resolve();
    expect(events.some((e) => e.type === 'damage')).toBe(true);
    // Hand had 1 card, it was played → empty. Turn 2 draws arrive only after
    // the next word phase completes.
    expect(match.state.zones[0].hand).toHaveLength(0);
    expect(match.state.turn).toBe(2);
    expect(match.state.phase).toBe('word');
    expect(match.state.zones[0].discard).toContainEqual({ iid: 'scrap#1', defId: 'scrap' });
  });

  it('ends the match when a side is wiped', () => {
    const match = new Match(10, Trie.fromWords([]));
    match.startTurn();
    match.submitWords(0, []);
    match.submitWords(1, []);
    for (const i of [3, 4, 5]) {
      match.state.combat.units[i].hp = 1;
      match.state.combat.units[i].dots = [
        { kind: 'burn', perTick: 5, remaining: 1, delay: 0 },
      ];
    }
    match.submitPlan(0, { unitPlays: [], ultimates: [] });
    match.submitPlan(1, { unitPlays: [], ultimates: [] });
    const events = match.resolve();
    expect(events.at(-1)).toEqual({ type: 'matchEnd', winner: 0 });
    expect(match.state.phase).toBe('ended');
    expect(match.state.winner).toBe(0);
  });
});
